import torch
import numpy as np
import cv2
from PIL import Image
from color_correction.pipeline import run_color_matching_pipeline

class IkkiColorMatching:
    """
    IKKI Color Matching Node: Estimates global color transformation between Reference
    and Generated images and applies seamless color grading.
    """
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "reference_image": ("IMAGE",),
                "generated_image": ("IMAGE",),
                "model_choice": (["Auto", "Linear", "Polynomial", "3D LUT"], {"default": "Auto"}),
                "mask_mode": (["Auto", "Manual", "Combine"], {"default": "Auto"}),
                "diff_threshold": ("FLOAT", {"default": 5.0, "min": 1.0, "max": 30.0, "step": 0.5}),
                "mask_dilation": ("INT", {"default": 15, "min": 1, "max": 51, "step": 2}),
                "composite_bg": ("BOOLEAN", {"default": True}),
                "local_refinement": ("BOOLEAN", {"default": False}),
            },
            "optional": {
                "mask": ("MASK",), # Connects to IkkiMaskEditor or any ComfyUI mask output!
            }
        }

    RETURN_TYPES = ("IMAGE", "IMAGE", "MASK")
    RETURN_NAMES = ("matched_image", "heatmap_image", "active_mask")
    FUNCTION = "process"
    CATEGORY = "ikki-pack/color"

    def process(
        self, 
        reference_image: torch.Tensor, 
        generated_image: torch.Tensor, 
        model_choice: str, 
        mask_mode: str, 
        diff_threshold: float, 
        mask_dilation: int, 
        composite_bg: bool,
        local_refinement: bool, 
        mask: torch.Tensor = None
    ):
        # SMART MASK MODE DETECT:
        # If a mask input is attached but mask_mode was left on "Auto", automatically switch to "Manual"
        effective_mask_mode = mask_mode
        if mask is not None and mask_mode == "Auto":
            effective_mask_mode = "Manual"

        output_images = []
        heatmap_images = []
        output_masks = []

        batch_size = generated_image.shape[0]

        for b in range(batch_size):
            ref_idx = b if b < reference_image.shape[0] else 0
            ref_np = (reference_image[ref_idx].cpu().numpy() * 255.0).clip(0, 255).astype(np.uint8)
            gen_np = (generated_image[b].cpu().numpy() * 255.0).clip(0, 255).astype(np.uint8)

            ref_pil = Image.fromarray(ref_np, mode="RGB")
            gen_pil = Image.fromarray(gen_np, mode="RGB")

            user_mask_np = None
            if mask is not None:
                mask_idx = b if b < mask.shape[0] else 0
                user_mask_np = (mask[mask_idx].cpu().numpy() * 255.0).clip(0, 255).astype(np.uint8)

            corrected_out_u8, heatmap_u8, stats, used_mask_u8 = run_color_matching_pipeline(
                ref_pil=ref_pil,
                gen_pil=gen_pil,
                model_choice=model_choice,
                threshold=diff_threshold,
                kernel_size=mask_dilation,
                enable_local_refinement=local_refinement,
                composite_bg=composite_bg,
                mask_mode=effective_mask_mode, # Uses smart effective_mask_mode
                user_mask_arr=user_mask_np
            )

            corrected_tensor = torch.from_numpy(corrected_out_u8.astype(np.float32) / 255.0)
            heatmap_tensor = torch.from_numpy(heatmap_u8.astype(np.float32) / 255.0)
            mask_tensor = torch.from_numpy(used_mask_u8.astype(np.float32))

            output_images.append(corrected_tensor)
            heatmap_images.append(heatmap_tensor)
            output_masks.append(mask_tensor)

        out_batch = torch.stack(output_images, dim=0)
        heatmap_batch = torch.stack(heatmap_images, dim=0)
        mask_batch = torch.stack(output_masks, dim=0)

        return (out_batch, heatmap_batch, mask_batch)