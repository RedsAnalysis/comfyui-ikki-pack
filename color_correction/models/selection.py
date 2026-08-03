import numpy as np
import logging
from sklearn.model_selection import train_test_split

from .linear import LinearColorModel
from .polynomial import PolynomialColorModel
from .lut3d import LUT3DColorModel
from ..metrics import compute_delta_e2000

logger = logging.getLogger(__name__)

def fit_and_select_model(
    X: np.ndarray, 
    Y: np.ndarray, 
    user_choice: str = "Auto",
    improvement_threshold: float = 0.05  # Lowered from 0.35 to accurately select 3D LUT / Polynomial
) -> tuple[object, str, dict]:
    """
    Fits available models and selects the best model based on ΔE2000 validation score.
    """
    logger.info(f"Model Selection triggered. Mode: {user_choice}")
    
    # 80/20 Train Validation Split
    X_train, X_val, Y_train, Y_val = train_test_split(X, Y, test_size=0.20, random_state=42)
    
    models = {}
    scores = {}

    def eval_model(name, model_inst):
        try:
            model_inst.fit(X_train, Y_train)
            pred_val = model_inst.predict(X_val)
            delta_e = compute_delta_e2000(pred_val, Y_val)
            models[name] = model_inst
            scores[name] = delta_e
            logger.info(f"Model [{name}] Validation ΔE2000: {delta_e:.4f}")
        except Exception as e:
            logger.error(f"Failed to fit model [{name}]: {e}")

    if user_choice == "Linear":
        eval_model("Linear", LinearColorModel())
        return models["Linear"], "Linear", scores

    if user_choice == "Polynomial":
        eval_model("Polynomial", PolynomialColorModel())
        return models["Polynomial"], "Polynomial", scores

    if user_choice == "3D LUT":
        eval_model("3D LUT", LUT3DColorModel())
        return models["3D LUT"], "3D LUT", scores

    # --- AUTO SELECTION HIERARCHY ---
    eval_model("Linear", LinearColorModel())
    eval_model("Polynomial", PolynomialColorModel())
    eval_model("3D LUT", LUT3DColorModel())

    selected_model_name = "Linear"
    best_score = scores.get("Linear", float('inf'))

    if "Polynomial" in scores:
        poly_score = scores["Polynomial"]
        if (best_score - poly_score) > improvement_threshold:
            selected_model_name = "Polynomial"
            best_score = poly_score

    if "3D LUT" in scores:
        lut_score = scores["3D LUT"]
        if (best_score - lut_score) > improvement_threshold:
            selected_model_name = "3D LUT"
            best_score = lut_score

    logger.info(f"Hierarchical Auto-Selection chose: [{selected_model_name}]")
    return models[selected_model_name], selected_model_name, scores