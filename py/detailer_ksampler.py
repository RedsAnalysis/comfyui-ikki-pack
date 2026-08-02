import torch
import torch.nn.functional as F
import logging

import comfy
import comfy.samplers
import comfy.sample
import nodes

try:
    import scipy.ndimage
    SCIPY_AVAILABLE = True
except ImportError:
    SCIPY_AVAILABLE = False

logger = logging.getLogger("Ikki-Detailer-KSampler")
logger.setLevel(logging.DEBUG)
if not logger.handlers:
    ch = logging.StreamHandler()
    ch.setLevel(logging.DEBUG)
    formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
    ch.setFormatter(formatter)
    logger.addHandler(ch)


class IkkiDetailerKSampler:
    """
    Node 4: Advanced Generic Detailer Inpaint KSampler.
    Encodes crop image & mask into VAE latent space, executes diffusion inpainting,
    and softly blends refined pixels with original crop pixels using user-controlled feathering.
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "model": ("MODEL",),
                "positive": ("CONDITIONING",),
                "negative": ("CONDITIONING",),
                "vae": ("VAE",),
                "crop_image": ("IMAGE",),
                "crop_mask": ("MASK",),
                "seed": ("INT", {"default": 0, "min": 0, "max": 0xffffffffffffffff}),
                "steps": ("INT", {"default": 20, "min": 1, "max": 10000}),
                "cfg": ("FLOAT", {"default": 3.5, "min": 0.0, "max": 100.0, "step": 0.1}),
                "sampler_name": (comfy.samplers.KSampler.SAMPLERS, ),
                "scheduler": (comfy.samplers.KSampler.SCHEDULERS, ),
                "denoise": ("FLOAT", {"default": 0.50, "min": 0.0, "max": 1.0, "step": 0.01}),
                "cycles": ("INT", {"default": 1, "min": 1, "max": 10, "step": 1}),
                "noise_mask_feather": ("INT", {"default": 2, "min": 0, "max": 64, "step": 1}),
                "inpaint_blend_feather": ("INT", {"default": 8, "min": 0, "max": 64, "step": 1}),
                "refiner_ratio": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 1.0, "step": 0.01}),
            },
            "optional": {
                "crop_data": ("CROP_DATA",),
                "refiner_model": ("MODEL",),
                "refiner_positive": ("CONDITIONING",),
                "refiner_negative": ("CONDITIONING",),
            }
        }

    RETURN_TYPES = ("IMAGE", "MASK", "CROP_DATA")
    RETURN_NAMES = ("refined_crop_image", "crop_mask", "crop_data")
    FUNCTION = "sample_inpaint"
    CATEGORY = "Ikki/Detailer Pipeline"

    def sample_inpaint(self, model, positive, negative, vae, crop_image, crop_mask, seed, steps, cfg, sampler_name, scheduler, denoise, cycles=1, noise_mask_feather=2, inpaint_blend_feather=8, refiner_ratio=1.0, crop_data=None, refiner_model=None, refiner_positive=None, refiner_negative=None):
        logger.info("--- Starting Ikki Advanced Detailer KSampler ---")
        logger.info(f"Sampler: {sampler_name} | Scheduler: {scheduler} | Steps: {steps} | CFG: {cfg} | Denoise: {denoise}")

        mask = crop_mask.cpu()
        if mask.ndim == 2:
            mask = mask.unsqueeze(0)
        if mask.ndim == 3:
            mask = mask.unsqueeze(1)

        current_crop = crop_image.clone()

        for cycle_idx in range(cycles):
            cycle_seed = seed + cycle_idx * 1000

            try:
                pixels = current_crop[:, :, :, :3]
                latent_samples = vae.encode(pixels)
            except Exception as e:
                logger.exception(f"VAE Encoding failed on cycle {cycle_idx + 1}!")
                raise e

            lat_h, lat_w = latent_samples.shape[2], latent_samples.shape[3]
            latent_mask = F.interpolate(mask, size=(lat_h, lat_w), mode="bilinear", align_corners=False)

            if noise_mask_feather > 0:
                k = noise_mask_feather * 2 + 1
                blurred_mask = F.avg_pool2d(latent_mask, kernel_size=k, stride=1, padding=noise_mask_feather)
                latent_mask = torch.clamp(torch.max(latent_mask, blurred_mask * 1.5), 0.0, 1.0)

            latent_dict = {
                "samples": latent_samples,
                "noise_mask": latent_mask
            }

            base_steps = steps
            use_refiner = (refiner_model is not None and refiner_ratio < 1.0)
            if use_refiner:
                base_steps = max(1, int(steps * refiner_ratio))

            try:
                if use_refiner:
                    sampled_latent = nodes.common_ksampler(
                        model,
                        cycle_seed,
                        steps,
                        cfg,
                        sampler_name,
                        scheduler,
                        positive,
                        negative,
                        latent_dict,
                        denoise=denoise,
                        disable_noise=False,
                        start_step=0,
                        last_step=base_steps,
                        force_full_denoise=True
                    )[0]

                    ref_pos = refiner_positive if refiner_positive is not None else positive
                    ref_neg = refiner_negative if refiner_negative is not None else negative
                    
                    sampled_latent = nodes.common_ksampler(
                        refiner_model,
                        cycle_seed,
                        steps,
                        cfg,
                        sampler_name,
                        scheduler,
                        ref_pos,
                        ref_neg,
                        sampled_latent,
                        denoise=denoise,
                        disable_noise=True,
                        start_step=base_steps,
                        last_step=steps,
                        force_full_denoise=True
                    )[0]
                else:
                    sampled_latent = nodes.common_ksampler(
                        model,
                        cycle_seed,
                        steps,
                        cfg,
                        sampler_name,
                        scheduler,
                        positive,
                        negative,
                        latent_dict,
                        denoise=denoise
                    )[0]
            except Exception as e:
                logger.exception(f"Diffusion inpainting failed on cycle {cycle_idx + 1}!")
                raise e

            try:
                refined_pixels = vae.decode(sampled_latent["samples"])
                while refined_pixels.ndim > 4:
                    refined_pixels = refined_pixels.squeeze(1)

                mask_blend = mask.cpu()
                if mask_blend.ndim == 4:
                    mask_blend = mask_blend.squeeze(1)
                mask_blend = mask_blend.unsqueeze(-1)

                if mask_blend.shape[1] != refined_pixels.shape[1] or mask_blend.shape[2] != refined_pixels.shape[2]:
                    m_p = mask_blend.permute(0, 3, 1, 2)
                    m_p = F.interpolate(m_p, size=(refined_pixels.shape[1], refined_pixels.shape[2]), mode="bilinear", align_corners=False)
                    mask_blend = m_p.permute(0, 2, 3, 1)

                if inpaint_blend_feather > 0:
                    mask_np = mask_blend.numpy()
                    if SCIPY_AVAILABLE:
                        mask_np = scipy.ndimage.gaussian_filter(mask_np, sigma=inpaint_blend_feather)
                    else:
                        m_t = torch.from_numpy(mask_np).permute(0, 3, 1, 2)
                        k = inpaint_blend_feather * 2 + 1
                        m_t = F.avg_pool2d(m_t, kernel_size=k, stride=1, padding=inpaint_blend_feather)
                        mask_np = m_t.permute(0, 2, 3, 1).numpy()
                    mask_blend = torch.from_numpy(mask_np).float()

                orig_crop = current_crop[:, :refined_pixels.shape[1], :refined_pixels.shape[2], :3].cpu()
                current_crop = orig_crop * (1.0 - mask_blend) + refined_pixels * mask_blend
                current_crop = torch.clamp(current_crop, 0.0, 1.0)

            except Exception as e:
                logger.exception(f"VAE Decoding / Blending failed on cycle {cycle_idx + 1}!")
                raise e

        logger.info("--- Detailer KSampler Inpaint Complete ---")
        return (current_crop, crop_mask, crop_data)