import numpy as np
import cv2
import logging

from .alignment import align_images_ecc
from .masking import create_ignore_mask
from .correspondence import extract_correspondences
from .models.selection import fit_and_select_model
from .metrics import compute_rmse, compute_delta_e2000
from .visualization import generate_delta_e_heatmap

logger = logging.getLogger(__name__)

def blend_reference_background(ref_img: np.ndarray, corrected_img: np.ndarray, mask: np.ndarray, feather_radius: int = 15) -> np.ndarray:
    """
    Seamlessly replaces unchanged background with exact Reference pixels, 
    blending the color-matched subject along the mask boundary.
    """
    mask_f32 = mask.astype(np.float32)
    
    # Create smooth Gaussian alpha feathering around mask edges
    if feather_radius > 1:
        ksize = feather_radius if feather_radius % 2 == 1 else feather_radius + 1
        smooth_mask = cv2.GaussianBlur(mask_f32, (ksize, ksize), 0)
    else:
        smooth_mask = mask_f32
        
    smooth_mask_3ch = smooth_mask[:, :, None] # (H, W, 1)
    
    # Ref background (0 in mask) + Corrected Subject (1 in mask)
    blended = ref_img * (1.0 - smooth_mask_3ch) + corrected_img * smooth_mask_3ch
    return np.clip(blended, 0.0, 1.0)


def run_color_matching_pipeline(
    ref_pil, 
    gen_pil, 
    model_choice: str = "Auto", 
    threshold: float = 8.0, 
    kernel_size: int = 15,
    enable_local_refinement: bool = False,
    composite_bg: bool = True, # <--- NEW: Replaces background with exact Reference
    mask_mode: str = "Auto",
    user_mask_arr: np.ndarray = None
) -> tuple[np.ndarray, np.ndarray, dict, np.ndarray]:
    
    logger.info("--- STARTING COLOR MATCHING PIPELINE ---")
    
    ref_pil = ref_pil.convert("RGB")
    gen_pil = gen_pil.convert("RGB")

    ref_img = np.array(ref_pil).astype(np.float32) / 255.0
    gen_img = np.array(gen_pil).astype(np.float32) / 255.0

    if ref_img.shape != gen_img.shape:
        gen_img = cv2.resize(gen_img, (ref_img.shape[1], ref_img.shape[0]), interpolation=cv2.INTER_LANCZOS4)

    delta_e_before = compute_delta_e2000(ref_img, gen_img)
    rmse_before = compute_rmse(ref_img, gen_img)

    aligned_gen, warp_matrix = align_images_ecc(ref_img, gen_img)

    mask, diff_map = create_ignore_mask(
        ref_img, aligned_gen, 
        threshold=threshold, 
        kernel_size=kernel_size,
        mask_mode=mask_mode,
        user_mask=user_mask_arr
    )

    X, Y = extract_correspondences(aligned_gen, ref_img, mask)
    model, chosen_model_name, model_scores = fit_and_select_model(X, Y, user_choice=model_choice)

    corrected_img = model.predict(aligned_gen)

    if enable_local_refinement:
        residual = np.where((mask == 0)[:, :, None], ref_img - corrected_img, 0.0)
        h, w, c = ref_img.shape
        grid_res = cv2.resize(residual, (32, 32), interpolation=cv2.INTER_AREA)
        smooth_residual = cv2.resize(grid_res, (w, h), interpolation=cv2.INTER_LINEAR)
        corrected_img = np.clip(corrected_img + smooth_residual * 0.3, 0.0, 1.0)

    # Seamless Reference Background Compositing
    if composite_bg:
        logger.info("Applying Seamless Reference Background Compositing...")
        corrected_img = blend_reference_background(ref_img, corrected_img, mask, feather_radius=kernel_size)

    delta_e_after = compute_delta_e2000(ref_img, corrected_img)
    rmse_after = compute_rmse(ref_img, corrected_img)
    heatmap = generate_delta_e_heatmap(ref_img, corrected_img)

    stats = {
        "ΔE2000 Before": round(delta_e_before, 3),
        "ΔE2000 After": round(delta_e_after, 3),
        "RMSE Before": round(rmse_before, 4),
        "RMSE After": round(rmse_after, 4),
        "Model Chosen": chosen_model_name,
        "Background Mode": "Exact Reference (Seamless)" if composite_bg else "Global Color Transformed",
        "Original Resolution": f"{ref_img.shape[1]}x{ref_img.shape[0]}",
        "Validation Scores": {k: round(v, 3) for k, v in model_scores.items()}
    }

    corrected_out = (np.clip(corrected_img, 0, 1) * 255).astype(np.uint8)
    logger.info("--- PIPELINE COMPLETED SUCCESSFULLY ---")

    return corrected_out, heatmap, stats, mask