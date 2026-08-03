import cv2
import numpy as np
import logging

logger = logging.getLogger(__name__)

def create_ignore_mask(
    ref_img: np.ndarray, 
    gen_img: np.ndarray, 
    threshold: float = 8.0, 
    kernel_size: int = 15,
    mask_mode: str = "Auto",
    user_mask: np.ndarray = None
) -> tuple[np.ndarray, np.ndarray]:
    """
    Generates binary ignore mask where:
    mask == 0: Safe/Unchanged background pixels.
    mask == 1: Foreground pixels to ignore during fitting.
    """
    try:
        logger.info(f"Generating ignore mask (Mode={mask_mode}, Threshold={threshold}, Kernel={kernel_size})...")
        h, w = ref_img.shape[:2]

        # 1. Compute Auto LAB Difference Mask
        ref_u8 = (np.clip(ref_img, 0, 1) * 255).astype(np.uint8)
        gen_u8 = (np.clip(gen_img, 0, 1) * 255).astype(np.uint8)

        ref_lab = cv2.cvtColor(ref_u8, cv2.COLOR_RGB2LAB).astype(np.float32)
        gen_lab = cv2.cvtColor(gen_u8, cv2.COLOR_RGB2LAB).astype(np.float32)

        diff_lab = ref_lab - gen_lab
        diff_magnitude = np.sqrt(np.sum(diff_lab ** 2, axis=-1))
        auto_mask = (diff_magnitude > threshold).astype(np.uint8)

        # 2. Process User Mask if provided
        processed_user_mask = np.zeros((h, w), dtype=np.uint8)
        if user_mask is not None:
            mask_arr = np.array(user_mask)
            
            if mask_arr.ndim == 3:
                # If RGBA, brush strokes are in Alpha channel
                if mask_arr.shape[2] == 4:
                    processed_user_mask = (mask_arr[:, :, 3] > 10).astype(np.uint8)
                else:
                    processed_user_mask = (np.max(mask_arr[:, :, :3], axis=-1) > 10).astype(np.uint8)
            elif mask_arr.ndim == 2:
                processed_user_mask = (mask_arr > 10 if mask_arr.max() > 1 else mask_arr > 0.05).astype(np.uint8)

            if processed_user_mask.shape[:2] != (h, w):
                processed_user_mask = cv2.resize(processed_user_mask, (w, h), interpolation=cv2.INTER_NEAREST)

        # 3. Combine Modes
        if mask_mode == "Manual":
            final_mask = processed_user_mask
        elif mask_mode == "Combine":
            final_mask = np.logical_or(auto_mask, processed_user_mask).astype(np.uint8)
        else: # "Auto"
            final_mask = auto_mask

        # 4. Morphological Dilation
        if kernel_size > 1:
            kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (kernel_size, kernel_size))
            final_mask = cv2.dilate(final_mask, kernel, iterations=1)

        safe_pixel_count = np.sum(final_mask == 0)
        logger.info(f"Mask created. Safe pixels remaining: {safe_pixel_count} / {final_mask.size}")

        return final_mask, diff_magnitude

    except Exception as e:
        logger.error(f"Error creating ignore mask: {e}")
        raise e