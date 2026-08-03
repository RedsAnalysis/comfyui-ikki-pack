import numpy as np
import logging
from scipy.interpolate import RegularGridInterpolator
from scipy.spatial import cKDTree

logger = logging.getLogger(__name__)

class LUT3DColorModel:
    """33x33x33 3D LUT Color Model with Trilinear Interpolation"""
    def __init__(self, lut_size: int = 33):
        self.lut_size = lut_size
        self.grid_nodes = np.linspace(0.0, 1.0, lut_size, dtype=np.float32)
        self.lut_table = None # Shape (33, 33, 33, 3)
        self.interpolator = None

    def fit(self, X: np.ndarray, Y: np.ndarray):
        try:
            logger.info(f"Fitting {self.lut_size}x{self.lut_size}x{self.lut_size} 3D LUT model...")
            
            # 1. Initialize identity grid base
            r, g, b = np.meshgrid(self.grid_nodes, self.grid_nodes, self.grid_nodes, indexing='ij')
            identity_grid = np.stack([r, g, b], axis=-1) # (33, 33, 33, 3)
            
            # 2. Compute residual shifts delta = Y - X
            deltas = Y - X
            
            # 3. Subsample X for fast Spatial KD-Tree distance kernel estimation
            if len(X) > 20_000:
                idx = np.random.choice(len(X), 20_000, replace=False)
                X_sub, deltas_sub = X[idx], deltas[idx]
            else:
                X_sub, deltas_sub = X, deltas

            tree = cKDTree(X_sub)
            flat_grid = identity_grid.reshape(-1, 3)
            
            # Inverse distance weighted residual projection onto 3D grid nodes
            k = 16
            dists, indices = tree.query(flat_grid, k=k)
            weights = 1.0 / (dists + 1e-4)**2
            weights /= np.sum(weights, axis=1, keepdims=True)
            
            interpolated_deltas = np.sum(deltas_sub[indices] * weights[:, :, None], axis=1)
            
            # Blend into LUT
            self.lut_table = identity_grid + interpolated_deltas.reshape(self.lut_size, self.lut_size, self.lut_size, 3)
            self.lut_table = np.clip(self.lut_table, 0.0, 1.0)

            # Build Trilinear Interpolator
            self.interpolator = RegularGridInterpolator(
                (self.grid_nodes, self.grid_nodes, self.grid_nodes),
                self.lut_table,
                bounds_error=False,
                fill_value=None
            )
            logger.info("3D LUT successfully fitted and regularized.")
        except Exception as e:
            logger.error(f"Error fitting 3D LUT: {e}")
            raise e

    def predict(self, img: np.ndarray) -> np.ndarray:
        shape = img.shape
        flat_img = img.reshape(-1, 3)
        out = self.interpolator(flat_img)
        return np.clip(out.reshape(shape), 0.0, 1.0).astype(np.float32)