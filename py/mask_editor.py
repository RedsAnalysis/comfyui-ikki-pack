import os
import random
import io
import base64
import torch
import numpy as np
from PIL import Image
import logging
import folder_paths

logger = logging.getLogger("Ikki-Mask-Editor")
logger.setLevel(logging.DEBUG)
if not logger.handlers:
    ch = logging.StreamHandler()
    ch.setLevel(logging.DEBUG)
    formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
    ch.setFormatter(formatter)
    logger.addHandler(ch)


class IkkiMaskEditor:
    """
    Node 3: Single-Layer Visual Mask Editor.
    Decodes transparent-background PNG from frontend canvas into PyTorch binary MASK tensor.
    """
    
    OUTPUT_NODE = True

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
                "mask": ("MASK",),
            },
            "optional": {
                "crop_data": ("CROP_DATA",),
                "edited_mask_data": ("STRING", {"default": "", "multiline": False}),
            }
        }

    RETURN_TYPES = ("MASK", "IMAGE", "CROP_DATA")
    RETURN_NAMES = ("edited_mask", "crop_image", "crop_data")
    FUNCTION = "edit_mask"
    CATEGORY = "Ikki/Detailer Pipeline"

    def edit_mask(self, image, mask, crop_data=None, edited_mask_data=""):
        logger.info("--- Starting Visual Mask Editor Execution ---")

        base_mask = mask.cpu().clone()
        if base_mask.ndim == 2:
            base_mask = base_mask.unsqueeze(0)

        out_mask = base_mask

        if edited_mask_data and edited_mask_data.startswith("data:image/png;base64,"):
            try:
                logger.info("Custom mask canvas data received. Decoding...")
                base64_str = edited_mask_data.split(",")[1]
                img_bytes = base64.b64decode(base64_str)
                pil_mask = Image.open(io.BytesIO(img_bytes)).convert("RGBA")

                h, w = image.shape[1], image.shape[2]
                if pil_mask.size != (w, h):
                    pil_mask = pil_mask.resize((w, h), Image.BILINEAR)

                mask_np = np.array(pil_mask)
                alpha = mask_np[:, :, 3]
                rgb = mask_np[:, :, 0:3].mean(axis=2)
                binary = ((alpha > 10) & (rgb > 10)).astype(np.float32)

                out_mask = torch.from_numpy(binary).unsqueeze(0)
                logger.info(f"Edited mask decoded successfully. Mask mean coverage: {out_mask.mean().item():.2f}")
            except Exception as e:
                logger.exception("Failed to decode mask data! Falling back to base detector mask.")
                out_mask = base_mask
        else:
            logger.info("No manual canvas edits found. Using base detector mask.")

        temp_dir = folder_paths.get_temp_directory()
        rand_prefix = f"ikki_editor_{random.randint(100000, 999999)}"

        img_np = (image[0].cpu().numpy() * 255).astype(np.uint8)
        pil_img = Image.fromarray(img_np)
        img_filename = f"{rand_prefix}_img.png"
        pil_img.save(os.path.join(temp_dir, img_filename))

        mask_np_orig = base_mask[0].numpy()
        mask_binary = ((mask_np_orig > 0.5) * 255).astype(np.uint8)
        pil_mask_orig = Image.fromarray(mask_binary, mode="L")
        mask_filename = f"{rand_prefix}_mask.png"
        pil_mask_orig.save(os.path.join(temp_dir, mask_filename))

        logger.info("--- Visual Mask Editor Execution Complete ---")

        return {
            "ui": {
                "ikki_editor_data": [
                    {"filename": img_filename, "subfolder": "", "type": "temp"},
                    {"filename": mask_filename, "subfolder": "", "type": "temp"}
                ]
            },
            "result": (out_mask, image, crop_data)
        }