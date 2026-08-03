import numpy as np
import logging
from sklearn.preprocessing import PolynomialFeatures, StandardScaler
from sklearn.pipeline import make_pipeline
from sklearn.linear_model import Ridge

logger = logging.getLogger(__name__)

class PolynomialColorModel:
    """Degree-2 Polynomial Regression mapping RGB -> RGB'"""
    def __init__(self, degree: int = 2):
        self.degree = degree
        self.model = make_pipeline(
            PolynomialFeatures(degree=degree, include_bias=True),
            StandardScaler(),
            Ridge(alpha=1.0)
        )

    def fit(self, X: np.ndarray, Y: np.ndarray):
        try:
            logger.info("Fitting Degree-2 Polynomial Regression model...")
            self.model.fit(X, Y)
            logger.info("Polynomial model successfully fitted.")
        except Exception as e:
            logger.error(f"Error fitting polynomial model: {e}")
            raise e

    def predict(self, img: np.ndarray) -> np.ndarray:
        shape = img.shape
        flat_img = img.reshape(-1, 3)
        out = self.model.predict(flat_img)
        return np.clip(out.reshape(shape), 0.0, 1.0).astype(np.float32)