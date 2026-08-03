import numpy as np
import logging
from sklearn.linear_model import HuberRegressor

logger = logging.getLogger(__name__)

def extract_correspondences(
    gen_img: np.ndarray, 
    ref_img: np.ndarray, 
    mask: np.ndarray, 
    max_samples: int = 100_000
) -> tuple[np.ndarray, np.ndarray]:
    """
    Extracts RGB paired correspondences where mask == 0 and removes extreme outliers.
    
    Returns:
        X: (N, 3) Generated RGB
        Y: (N, 3) Reference RGB
    """
    try:
        logger.info("Extracting pixel correspondences from safe mask region...")
        safe_coords = np.where(mask == 0)

        X_raw = gen_img[safe_coords]  # (N, 3)
        Y_raw = ref_img[safe_coords]  # (N, 3)

        if len(X_raw) < 100:
            raise ValueError("Insufficient safe pixels found! Lower threshold or kernel size.")

        # Subsample if pixel count is huge to speed up optimization
        if len(X_raw) > max_samples:
            indices = np.random.choice(len(X_raw), size=max_samples, replace=False)
            X_raw = X_raw[indices]
            Y_raw = Y_raw[indices]

        # Robust Huber Outlier Filtering per channel
        valid_indices = np.ones(len(X_raw), dtype=bool)
        for i in range(3):
            huber = HuberRegressor(max_iter=150)
            huber.fit(X_raw[:, i].reshape(-1, 1), Y_raw[:, i])
            pred = huber.predict(X_raw[:, i].reshape(-1, 1))
            residual = np.abs(Y_raw[:, i] - pred)
            
            # Reject top 1% largest residuals
            threshold = np.percentile(residual, 99)
            valid_indices &= (residual <= threshold)

        X_clean = X_raw[valid_indices]
        Y_clean = Y_raw[valid_indices]

        logger.info(f"Extracted {len(X_clean)} clean correspondences after outlier rejection.")
        return X_clean, Y_clean

    except Exception as e:
        logger.error(f"Error extracting correspondences: {e}")
        raise e