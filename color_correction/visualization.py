import cv2
import numpy as np
import logging

logger = logging.getLogger(__name__)

def generate_delta_e_heatmap(img1: np.ndarray, img2: np.ndarray) -> np.ndarray:
    """Generates a colorized heat map of perceptual differences (ΔE)."""
    try:
        u8_1 = (np.clip(img1, 0, 1) * 255).astype(np.uint8)
        u8_2 = (np.clip(img2, 0, 1) * 255).astype(np.uint8)

        lab1 = cv2.cvtColor(u8_1, cv2.COLOR_RGB2LAB).astype(np.float32)
        lab2 = cv2.cvtColor(u8_2, cv2.COLOR_RGB2LAB).astype(np.float32)

        delta = np.sqrt(np.sum((lab1 - lab2) ** 2, axis=-1))
        
        # Normalize to [0, 255] for visual mapping
        norm_delta = np.clip((delta / 20.0) * 255.0, 0, 255).astype(np.uint8)
        heatmap = cv2.applyColorMap(norm_delta, cv2.COLORMAP_JET)
        heatmap_rgb = cv2.cvtColor(heatmap, cv2.COLOR_BGR2RGB)
        
        return heatmap_rgb
    except Exception as e:
        logger.error(f"Error rendering heatmap: {e}")
        return np.zeros_like(img1, dtype=np.uint8)