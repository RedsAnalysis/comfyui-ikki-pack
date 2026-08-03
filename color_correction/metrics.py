import numpy as np
import logging
import cv2

logger = logging.getLogger(__name__)

try:
    import colour
    HAS_COLOUR_SCIENCE = True
except ImportError:
    HAS_COLOUR_SCIENCE = False
    logger.warning("colour-science library not available. Falling back to internal ΔE approximation.")

def compute_rmse(img1: np.ndarray, img2: np.ndarray) -> float:
    """Computes Root Mean Squared Error (RMSE) between two float32 [0,1] images."""
    try:
        diff = img1.astype(np.float32) - img2.astype(np.float32)
        return float(np.sqrt(np.mean(diff ** 2)))
    except Exception as e:
        logger.error(f"Error computing RMSE: {e}")
        return float('nan')

def compute_delta_e2000(img1_rgb: np.ndarray, img2_rgb: np.ndarray) -> float:
    """
    Computes average ΔE2000 in LAB space between two RGB float32 [0,1] images or arrays.
    """
    try:
        if img1_rgb.shape != img2_rgb.shape:
            raise ValueError(f"Shape mismatch: {img1_rgb.shape} vs {img2_rgb.shape}")

        if HAS_COLOUR_SCIENCE:
            # colour-science expects RGB in [0, 1] for sRGB -> Lab conversion
            lab1 = colour.XYZ_to_Lab(colour.sRGB_to_XYZ(img1_rgb))
            lab2 = colour.XYZ_to_Lab(colour.sRGB_to_XYZ(img2_rgb))
            delta_e = colour.delta_E(lab1, lab2, method="CIE 2000")
            return float(np.mean(delta_e))
        else:
            # OpenCV Fallback (approximate CIE76 / Euclidean in LAB)
            img1_u8 = (np.clip(img1_rgb, 0, 1) * 255).astype(np.uint8)
            img2_u8 = (np.clip(img2_rgb, 0, 1) * 255).astype(np.uint8)
            lab1 = cv2.cvtColor(img1_u8, cv2.COLOR_RGB2LAB).astype(np.float32)
            lab2 = cv2.cvtColor(img2_u8, cv2.COLOR_RGB2LAB).astype(np.float32)
            diff = lab1 - lab2
            dist = np.sqrt(np.sum(diff ** 2, axis=-1))
            return float(np.mean(dist))
    except Exception as e:
        logger.error(f"Error computing Delta E: {e}")
        return float('nan')