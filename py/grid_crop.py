import os
import torch
import numpy as np
from PIL import Image, ImageOps
import folder_paths

class IkkiGridCrop:
    @classmethod
    def INPUT_TYPES(s):
        try:
            input_dir = folder_paths.get_input_directory()
            files = [f for f in os.listdir(input_dir) if os.path.isfile(os.path.join(input_dir, f))]
        except Exception:
            files = []
        
        return {
            "required": {
                "image1": (sorted(files), {"image_upload": True}),
                "image2": (sorted(files), {"image_upload": True}),
                "image3": (sorted(files), {"image_upload": True}),
                "image4": (sorted(files), {"image_upload": True}),
                
                "width": ("INT", {"default": 512, "min": 8, "max": 8192}),
                "height": ("INT", {"default": 512, "min": 8, "max": 8192}),
                
                "x1": ("FLOAT", {"default": 0.0, "min": 0.0, "max": 100.0, "step": 0.1}),
                "y1": ("FLOAT", {"default": 0.0, "min": 0.0, "max": 100.0, "step": 0.1}),
                "x2": ("FLOAT", {"default": 0.0, "min": 0.0, "max": 100.0, "step": 0.1}),
                "y2": ("FLOAT", {"default": 0.0, "min": 0.0, "max": 100.0, "step": 0.1}),
                "x3": ("FLOAT", {"default": 0.0, "min": 0.0, "max": 100.0, "step": 0.1}),
                "y3": ("FLOAT", {"default": 0.0, "min": 0.0, "max": 100.0, "step": 0.1}),
                "x4": ("FLOAT", {"default": 0.0, "min": 0.0, "max": 100.0, "step": 0.1}),
                "y4": ("FLOAT", {"default": 0.0, "min": 0.0, "max": 100.0, "step": 0.1}),
            }
        }

    RETURN_TYPES = ("IMAGE", "IMAGE", "IMAGE", "IMAGE", "IMAGE")
    RETURN_NAMES = ("GRID_2x2", "CROP_1", "CROP_2", "CROP_3", "CROP_4")
    FUNCTION = "process"
    CATEGORY = "IkkiPack/Crop"

    def load_and_crop(self, image_name, x_percent, y_percent, tgt_w, tgt_h):
        if not image_name:
            return torch.zeros((1, tgt_h, tgt_w, 3))
            
        image_path = folder_paths.get_annotated_filepath(image_name)
        if not os.path.exists(image_path):
            return torch.zeros((1, tgt_h, tgt_w, 3))

        i = Image.open(image_path)
        i = ImageOps.exif_transpose(i)
        img = np.array(i.convert("RGB")).astype(np.float32) / 255.0
        img = torch.from_numpy(img)[None,]

        B, H, W, C = img.shape
        px = int((x_percent / 100.0) * W)
        py = int((y_percent / 100.0) * H)

        x1 = max(0, min(px, W - tgt_w)) if W >= tgt_w else 0
        y1 = max(0, min(py, H - tgt_h)) if H >= tgt_h else 0
        x2 = min(x1 + tgt_w, W)
        y2 = min(y1 + tgt_h, H)

        crop = img[:, y1:y2, x1:x2, :]
        
        if crop.shape[1] != tgt_h or crop.shape[2] != tgt_w:
            padded = torch.zeros((1, tgt_h, tgt_w, 3))
            padded[:, :crop.shape[1], :crop.shape[2], :] = crop
            return padded

        return crop

    def process(self, **kwargs):
        image1 = kwargs.get("image1")
        image2 = kwargs.get("image2")
        image3 = kwargs.get("image3")
        image4 = kwargs.get("image4")
        width = kwargs.get("width", 512)
        height = kwargs.get("height", 512)
        x1 = kwargs.get("x1", 0.0)
        y1 = kwargs.get("y1", 0.0)
        x2 = kwargs.get("x2", 0.0)
        y2 = kwargs.get("y2", 0.0)
        x3 = kwargs.get("x3", 0.0)
        y3 = kwargs.get("y3", 0.0)
        x4 = kwargs.get("x4", 0.0)
        y4 = kwargs.get("y4", 0.0)

        c1 = self.load_and_crop(image1, x1, y1, width, height)
        c2 = self.load_and_crop(image2, x2, y2, width, height)
        c3 = self.load_and_crop(image3, x3, y3, width, height)
        c4 = self.load_and_crop(image4, x4, y4, width, height)

        row1 = torch.cat([c1, c2], dim=2)
        row2 = torch.cat([c3, c4], dim=2)
        grid = torch.cat([row1, row2], dim=1)

        return (grid, c1, c2, c3, c4)