import os
import torch
import torch.nn.functional as F
import numpy as np
import logging
import folder_paths

logger = logging.getLogger("Ikki-Detailer-Detector")
logger.setLevel(logging.DEBUG)
if not logger.handlers:
    ch = logging.StreamHandler()
    ch.setLevel(logging.DEBUG)
    formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
    ch.setFormatter(formatter)
    logger.addHandler(ch)

try:
    from ultralytics import YOLO
    YOLO_AVAILABLE = True
except ImportError:
    YOLO_AVAILABLE = False
    logger.error("Ultralytics package NOT FOUND! Run: pip install ultralytics")

if "ultralytics" not in folder_paths.folder_names_and_paths:
    ultralytics_path = os.path.join(folder_paths.models_dir, "ultralytics")
    if not os.path.exists(ultralytics_path):
        os.makedirs(ultralytics_path, exist_ok=True)
    folder_paths.folder_names_and_paths["ultralytics"] = ([ultralytics_path], [".pt", ".pth", ".bin", ".safetensors"])


class SEG:
    """Standard Impact-compatible Segment class"""
    def __init__(self, cropped_image, cropped_mask, confidence, crop_region, bbox, label, control_net_wrapper=None):
        self.cropped_image = cropped_image
        self.cropped_mask = cropped_mask
        self.confidence = confidence
        self.crop_region = crop_region  # (x1, y1, x2, y2)
        self.bbox = bbox                # (x1, y1, x2, y2)
        self.label = label
        self.control_net_wrapper = control_net_wrapper


class IkkiUltralyticsDetector:
    """
    Node 1: Impact-Compatible SEGS Detector Provider.
    Extracts raw bounding boxes, segmentation masks, labels, and builds standard SEGS payloads.
    """
    
    def __init__(self):
        self.model = None
        self.model_name = None

    @classmethod
    def INPUT_TYPES(cls):
        models = folder_paths.get_filename_list("ultralytics")
        if not models:
            models = ["NO_MODELS_FOUND"]

        return {
            "required": {
                "image": ("IMAGE",),
                "model_name": (models, ),
                "threshold": ("FLOAT", {"default": 0.5, "min": 0.0, "max": 1.0, "step": 0.01}),
                "dilation": ("INT", {"default": 10, "min": -512, "max": 512, "step": 1}),
                "crop_factor": ("FLOAT", {"default": 1.5, "min": 1.0, "max": 10.0, "step": 0.1}),  # Fixed default to 1.5
                "drop_size": ("INT", {"default": 16, "min": 1, "max": 4096, "step": 1}),           # Fixed default to 16
                "labels": ("STRING", {"default": "all", "multiline": False, "placeholder": "e.g. face, hair, hand or 'all'"}),
                "device": (["auto", "cuda", "cpu"], {"default": "auto"}),
            }
        }

    RETURN_TYPES = ("SEGS", "MASK", "MASK")
    RETURN_NAMES = ("segs", "combined_mask", "bbox_mask")
    FUNCTION = "detect"
    CATEGORY = "Ikki/Detailer Pipeline"

    def detect(self, image, model_name, threshold=0.5, dilation=10, crop_factor=1.5, drop_size=16, labels="all", device="auto", **kwargs):
        logger.info("--- Starting Ikki SEGS Detector Execution ---")
        
        if not YOLO_AVAILABLE:
            raise RuntimeError("Ultralytics package not found. Run 'pip install ultralytics'")

        model_path = folder_paths.get_full_path("ultralytics", model_name)
        if not model_path:
            raise FileNotFoundError(f"Model {model_name} not found.")

        if self.model is None or self.model_name != model_name:
            logger.info(f"Loading YOLO model from: {model_path}")
            self.model = YOLO(model_path)
            self.model_name = model_name

        target_device = device
        if device == "auto":
            target_device = "cuda" if torch.cuda.is_available() else "cpu"

        # Safely parse numeric types
        try:
            crop_factor = float(crop_factor)
        except (ValueError, TypeError):
            crop_factor = 1.5

        try:
            drop_size = int(drop_size)
        except (ValueError, TypeError):
            drop_size = 16

        allowed_labels = []
        if str(labels).strip().lower() != "all" and str(labels).strip() != "":
            allowed_labels = [l.strip().lower() for l in str(labels).split(",")]

        batch_size, h, w, c = image.shape
        img_tensor = image[0]
        img_np = (img_tensor.cpu().numpy() * 255).astype(np.uint8)

        results = self.model(img_np, conf=threshold, device=target_device, verbose=False)
        result = results[0]
        boxes = result.boxes
        masks = result.masks

        logger.info(f"Found {len(boxes)} raw object detections.")

        names = self.model.names if hasattr(self.model, "names") else {}

        combined_mask = torch.zeros((h, w), dtype=torch.float32, device="cpu")
        bbox_mask = torch.zeros((h, w), dtype=torch.float32, device="cpu")

        resized_masks = None
        if masks is not None and len(masks) > 0:
            mask_data = masks.data.unsqueeze(1).float()
            resized_masks = F.interpolate(mask_data, size=(h, w), mode="bilinear", align_corners=False).squeeze(1).cpu()

        seg_list = []

        for j, box in enumerate(boxes):
            cls_id = int(box.cls.item())
            label_name = names.get(cls_id, str(cls_id)).lower()

            if allowed_labels and label_name not in allowed_labels and str(cls_id) not in allowed_labels:
                continue

            conf = box.conf.item()
            bbox = [int(v) for v in box.xyxy[0].tolist()]
            bx1, by1, bx2, by2 = bbox
            bw, bh = bx2 - bx1, by2 - by1

            if bw < drop_size or bh < drop_size:
                continue

            bbox_mask[by1:by2, bx1:bx2] = 1.0

            cx, cy = bx1 + bw / 2.0, by1 + bh / 2.0
            cw, ch_dim = int(bw * crop_factor), int(bh * crop_factor)

            cx1 = max(0, int(cx - cw / 2.0))
            cy1 = max(0, int(cy - ch_dim / 2.0))
            cx2 = min(w, cx1 + cw)
            cy2 = min(h, cy1 + ch_dim)

            crop_region = (cx1, cy1, cx2, cy2)

            if resized_masks is not None:
                obj_mask = (resized_masks[j] > 0.5).float().cpu()
            else:
                obj_mask = torch.zeros((h, w), dtype=torch.float32, device="cpu")
                obj_mask[by1:by2, bx1:bx2] = 1.0

            if dilation != 0:
                m_t = obj_mask.unsqueeze(0).unsqueeze(0)
                if dilation > 0:
                    k = dilation * 2 + 1
                    m_t = F.max_pool2d(m_t, kernel_size=k, stride=1, padding=dilation)
                else:
                    k = abs(dilation) * 2 + 1
                    m_t = -F.max_pool2d(-m_t, kernel_size=k, stride=1, padding=abs(dilation))
                obj_mask = m_t.squeeze()

            combined_mask = torch.max(combined_mask, obj_mask)

            cropped_img_patch = img_tensor[cy1:cy2, cx1:cx2, :].unsqueeze(0).cpu()
            cropped_msk_patch = obj_mask[cy1:cy2, cx1:cx2].cpu().numpy()

            seg = SEG(
                cropped_image=cropped_img_patch,
                cropped_mask=cropped_msk_patch,
                confidence=conf,
                crop_region=crop_region,
                bbox=bbox,
                label=label_name
            )
            seg_list.append(seg)

        segs = ((h, w), seg_list)
        logger.info(f"Generated {len(seg_list)} Impact-compatible SEGS segments.")

        return (segs, combined_mask.unsqueeze(0), bbox_mask.unsqueeze(0))