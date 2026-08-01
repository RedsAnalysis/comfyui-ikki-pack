import os
import torch
import numpy as np
from PIL import Image, ImageOps
import folder_paths

class IkkiLoadAndCrop:
    @classmethod
    def INPUT_TYPES(s):
        try:
            input_dir = folder_paths.get_input_directory()
            files = [f for f in os.listdir(input_dir) if os.path.isfile(os.path.join(input_dir, f))]
        except Exception:
            files = []
            
        return {
            "required": {
                "image": (sorted(files), {"image_upload": True}),
                "x": ("FLOAT", {"default": 0.0, "min": 0.0, "max": 100.0, "step": 0.1}),
                "y": ("FLOAT", {"default": 0.0, "min": 0.0, "max": 100.0, "step": 0.1}),
                "width": ("INT", {"default": 512, "min": 8, "max": 8192}),
                "height": ("INT", {"default": 512, "min": 8, "max": 8192}),
            }
        }

    RETURN_TYPES = ("IMAGE", "IMAGE")
    RETURN_NAMES = ("CROP_PIECE", "IMAGE_WITH_HOLE")
    FUNCTION = "process"
    CATEGORY = "IkkiPack/Crop"

    def process(self, **kwargs):
        image = kwargs.get("image")
        x = kwargs.get("x", 0.0)
        y = kwargs.get("y", 0.0)
        width = kwargs.get("width", 512)
        height = kwargs.get("height", 512)

        image_path = folder_paths.get_annotated_filepath(image)
        i = Image.open(image_path)
        i = ImageOps.exif_transpose(i)
        img = i.convert("RGB")
        img = np.array(img).astype(np.float32) / 255.0
        img = torch.from_numpy(img)[None,]

        B, H, W, C = img.shape
        px = int((x / 100.0) * W)
        py = int((y / 100.0) * H)

        x1 = max(0, min(px, W - 1))
        y1 = max(0, min(py, H - 1))
        x2 = max(x1 + 1, min(px + width, W))
        y2 = max(y1 + 1, min(py + height, H))

        crop = img[:, y1:y2, x1:x2, :]
        this_hole = img.clone()
        this_hole[:, y1:y2, x1:x2, :] = 0.0 

        return (crop, this_hole)