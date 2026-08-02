import torch
import torch.nn.functional as F
import numpy as np
import logging

try:
    import scipy.ndimage
    SCIPY_AVAILABLE = True
except ImportError:
    SCIPY_AVAILABLE = False

logger = logging.getLogger("Ikki-Composite-Back")
logger.setLevel(logging.DEBUG)
if not logger.handlers:
    ch = logging.StreamHandler()
    ch.setLevel(logging.DEBUG)
    formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
    ch.setFormatter(formatter)
    logger.addHandler(ch)


class IkkiCompositeBack:
    """
    Node 5: Composite Back To Image.
    Pastes the refined crop image back into the full original image
    using coordinate metadata (crop_data) and feathered mask blending.
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "original_image": ("IMAGE",),
                "refined_crop_image": ("IMAGE",),
                "crop_mask": ("MASK",),
                "crop_data": ("CROP_DATA",),
                "composite_mode": (["mask_blend", "box_blend"], {"default": "mask_blend"}),
                "blend_feather": ("INT", {"default": 16, "min": 0, "max": 128, "step": 1}),
            }
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("final_image",)
    FUNCTION = "composite"
    CATEGORY = "Ikki/Detailer Pipeline"

    def composite(self, original_image, refined_crop_image, crop_mask, crop_data, composite_mode="mask_blend", blend_feather=16):
        logger.info("--- Starting Detailer Composite Back Execution ---")

        orig = original_image.cpu()
        while orig.ndim > 4:
            orig = orig.squeeze(1)

        ref_crop = refined_crop_image.cpu()
        while ref_crop.ndim > 4:
            ref_crop = ref_crop.squeeze(1)

        mask = crop_mask.cpu()
        while mask.ndim > 3:
            mask = mask.squeeze(1)

        x1 = crop_data["x1"]
        y1 = crop_data["y1"]
        x2 = crop_data["x2"]
        y2 = crop_data["y2"]
        orig_h = crop_data["orig_h"]
        orig_w = crop_data["orig_w"]

        crop_w = x2 - x1
        crop_h = y2 - y1

        out_img = orig[0].clone()
        crop_patch = ref_crop[0]
        mask_patch = mask[0]

        if crop_patch.shape[0] != crop_h or crop_patch.shape[1] != crop_w:
            crop_perm = crop_patch.permute(2, 0, 1).unsqueeze(0)
            crop_perm = F.interpolate(crop_perm, size=(crop_h, crop_w), mode="bilinear", align_corners=False)
            crop_patch = crop_perm.squeeze(0).permute(1, 2, 0)

        if composite_mode == "box_blend":
            mask_np = np.ones((crop_h, crop_w), dtype=np.float32)
        else:
            if mask_patch.shape[0] != crop_h or mask_patch.shape[1] != crop_w:
                mask_perm = mask_patch.unsqueeze(0).unsqueeze(0)
                mask_perm = F.interpolate(mask_perm, size=(crop_h, crop_w), mode="bilinear", align_corners=False)
                mask_patch = mask_perm.squeeze(0).squeeze(0)
            mask_np = mask_patch.numpy()

        if blend_feather > 0:
            if SCIPY_AVAILABLE:
                mask_np = scipy.ndimage.gaussian_filter(mask_np, sigma=blend_feather)
            else:
                m_t = torch.from_numpy(mask_np).unsqueeze(0).unsqueeze(0)
                k = blend_feather * 2 + 1
                m_t = F.avg_pool2d(m_t, kernel_size=k, stride=1, padding=blend_feather)
                mask_np = m_t.squeeze().numpy()

        mask_tensor = torch.from_numpy(mask_np).float().unsqueeze(-1)

        orig_patch = out_img[y1:y2, x1:x2, :]
        blended_patch = orig_patch * (1.0 - mask_tensor) + crop_patch * mask_tensor

        out_img[y1:y2, x1:x2, :] = torch.clamp(blended_patch, 0.0, 1.0)

        logger.info(f"--- Composite Back Complete (Final Resolution: {out_img.shape[1]}x{out_img.shape[0]}) ---")
        return (out_img.unsqueeze(0),)