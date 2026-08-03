import numpy as np
import logging

logger = logging.getLogger(__name__)

class LinearColorModel:
    """Fits 3x3 transformation matrix M and 3x1 bias b: Y = X @ M^T + b"""
    def __init__(self):
        self.weights = None # shape (3, 4) -> [M | b]

    def fit(self, X: np.ndarray, Y: np.ndarray):
        """X: (N, 3), Y: (N, 3)"""
        try:
            logger.info("Fitting Linear Matrix (3x3 + bias) model...")
            N = X.shape[0]
            X_aug = np.hstack([X, np.ones((N, 1), dtype=np.float32)]) # (N, 4)
            
            # Solve least squares for each target channel
            weights, _, _, _ = np.linalg.lstsq(X_aug, Y, rcond=None)
            self.weights = weights.T # shape (3, 4)
            logger.info("Linear model successfully fitted.")
        except Exception as e:
            logger.error(f"Error fitting linear model: {e}")
            raise e

    def predict(self, img: np.ndarray) -> np.ndarray:
        """Applies linear color transformation to entire image (H, W, 3)."""
        shape = img.shape
        flat_img = img.reshape(-1, 3)
        N = flat_img.shape[0]
        
        flat_aug = np.hstack([flat_img, np.ones((N, 1), dtype=np.float32)])
        out = flat_aug @ self.weights.T
        return np.clip(out.reshape(shape), 0.0, 1.0).astype(np.float32)