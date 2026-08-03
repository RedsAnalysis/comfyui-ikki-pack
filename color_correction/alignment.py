import cv2
import numpy as np
import logging

logger = logging.getLogger(__name__)

def align_images_ecc(
    ref_img: np.ndarray, 
    gen_img: np.ndarray, 
    motion_type: str = "affine", 
    max_iters: int = 200, 
    eps: float = 1e-5
) -> tuple[np.ndarray, np.ndarray]:
    """
    Aligns gen_img to ref_img using Enhanced Correlation Coefficient (ECC) alignment.
    
    Inputs:
        ref_img, gen_img: float32 arrays scaled [0, 1], RGB format.
    Returns:
        (aligned_gen_img, warp_matrix)
    """
    try:
        logger.info("Starting ECC image alignment...")
        ref_u8 = (np.clip(ref_img, 0, 1) * 255).astype(np.uint8)
        gen_u8 = (np.clip(gen_img, 0, 1) * 255).astype(np.uint8)

        ref_gray = cv2.cvtColor(ref_u8, cv2.COLOR_RGB2GRAY)
        gen_gray = cv2.cvtColor(gen_u8, cv2.COLOR_RGB2GRAY)

        h, w = ref_gray.shape

        if motion_type == "affine":
            warp_mode = cv2.MOTION_AFFINE
            warp_matrix = np.eye(2, 3, dtype=np.float32)
        else:
            warp_mode = cv2.MOTION_TRANSLATION
            warp_matrix = np.eye(2, 3, dtype=np.float32)

        criteria = (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, max_iters, eps)

        cc, warp_matrix = cv2.findTransformECC(
            ref_gray, gen_gray, warp_matrix, warp_mode, criteria, None, 5
        )
        logger.info(f"ECC alignment converged with correlation: {cc:.4f}")

        aligned_gen = cv2.warpAffine(
            gen_img,
            warp_matrix,
            (w, h),
            flags=cv2.INTER_LINEAR | cv2.WARP_INVERSE_MAP,
            borderMode=cv2.BORDER_REFLECT
        )
        return aligned_gen, warp_matrix

    except cv2.error as e:
        logger.warning(f"ECC alignment failed to converge: {e}. Falling back to unaligned original image.")
        return gen_img.copy(), np.eye(2, 3, dtype=np.float32)
    except Exception as e:
        logger.error(f"Unexpected error in image alignment: {e}")
        return gen_img.copy(), np.eye(2, 3, dtype=np.float32)