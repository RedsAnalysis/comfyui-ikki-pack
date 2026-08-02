import torch
import torch.nn.functional as F
import numpy as np
import logging

try:
    import scipy.ndimage
    SCIPY_AVAILABLE = True
except ImportError:
    SCIPY_AVAILABLE = False

logger = logging.getLogger("Ikki-Detailer-Processor")
logger.setLevel(logging.DEBUG)
if not logger.handlers:
    ch = logging.StreamHandler()
    ch.setLevel(logging.DEBUG)
    formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
    ch.setFormatter(formatter)
    logger.addHandler(ch)


class IkkiDetailerProcessor:
    """
    Node 2: Impact SEGS Detailer Processing Pipe.
    Extracts individual or combined SEGS segments for visual editing and sampling.
    Returns 100% black mask if no objects are detected (skips inpaint safely).
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
                "segs": ("SEGS,DETECTION_DATA",),
                "target_index": ("INT", {"default": -1, "min": -1, "max": 100, "step": 1}),
                "crop_factor": ("FLOAT", {"default": 1.5, "min": 1.0, "max": 5.0, "step": 0.1}),
                "padding": ("INT", {"default": 32, "min": 0, "max": 512, "step": 8}),
                "mask_dilation": ("INT", {"default": 0, "min": -100, "max": 100, "step": 1}),
                "mask_blur": ("INT", {"default": 4, "min": 0, "max": 64, "step": 1}),
                "invert_mask": ("BOOLEAN", {"default": False}),
            },
            "optional": {
                "override_mask": ("MASK",),
            }
        }

    RETURN_TYPES = ("IMAGE", "MASK", "CROP_DATA", "MASK")
    RETURN_NAMES = ("crop_image", "crop_mask", "crop_data", "full_preview_mask")
    FUNCTION = "process"
    CATEGORY = "Ikki/Detailer Pipeline"

    def process(self, image, segs=None, target_index=-1, crop_factor=1.5, padding=32, mask_dilation=0, mask_blur=4, invert_mask=False, override_mask=None, detection_data=None, **kwargs):
        logger.info("--- Starting Detailer SEGS Crop & Mask Processing ---")

        input_payload = segs if segs is not None else detection_data

        if input_payload is None:
            raise ValueError("Neither 'segs' nor 'detection_data' was provided to IkkiDetailerProcessor.")

        if isinstance(input_payload, tuple) and len(input_payload) == 2:
            (orig_h, orig_w), seg_list = input_payload
        elif isinstance(input_payload, list) and len(input_payload) > 0 and "original_shape" in input_payload[0]:
            orig_h, orig_w = input_payload[0]["original_shape"]
            bboxes = input_payload[0]["bboxes"]
            masks = input_payload[0]["masks"]
            seg_list = []
            for j in range(len(bboxes)):
                bx1, by1, bx2, by2 = map(int, bboxes[j])
                class DummySEG:
                    pass
                s = DummySEG()
                s.bbox = (bx1, by1, bx2, by2)
                s.crop_region = (bx1, by1, bx2, by2)
                s.cropped_mask = masks[j].numpy() if masks[j] is not None else np.zeros((orig_h, orig_w))
                seg_list.append(s)
        else:
            orig_h, orig_w = image.shape[1], image.shape[2]
            seg_list = []

        # FIX: Return a 100% BLACK / EMPTY mask when 0 objects are detected
        if not seg_list:
            logger.warning("No detected segments found! Returning whole image with EMPTY (0%) mask to skip inpainting safely.")
            crop_data = {"x1": 0, "y1": 0, "x2": orig_w, "y2": orig_h, "orig_h": orig_h, "orig_w": orig_w}
            empty_mask = torch.zeros((1, orig_h, orig_w), dtype=torch.float32)
            return (image, empty_mask, crop_data, empty_mask)

        if target_index >= len(seg_list):
            target_index = 0

        if target_index == -1:
            logger.info(f"Combining all {len(seg_list)} SEGS segments into a single crop.")
            x1 = min([s.crop_region[0] for s in seg_list])
            y1 = min([s.crop_region[1] for s in seg_list])
            x2 = max([s.crop_region[2] for s in seg_list])
            y2 = max([s.crop_region[3] for s in seg_list])
            
            selected_mask = torch.zeros((orig_h, orig_w), dtype=torch.float32, device="cpu")
            for s in seg_list:
                sx1, sy1, sx2, sy2 = s.crop_region
                m = torch.from_numpy(s.cropped_mask).float()
                if m.shape[0] == (sy2 - sy1) and m.shape[1] == (sx2 - sx1):
                    selected_mask[sy1:sy2, sx1:sx2] = torch.max(selected_mask[sy1:sy2, sx1:sx2], m)
                elif m.shape[0] == orig_h and m.shape[1] == orig_w:
                    selected_mask = torch.max(selected_mask, m)
        else:
            seg = seg_list[target_index]
            x1, y1, x2, y2 = seg.bbox
            selected_mask = torch.zeros((orig_h, orig_w), dtype=torch.float32, device="cpu")
            sx1, sy1, sx2, sy2 = seg.crop_region
            m = torch.from_numpy(seg.cropped_mask).float()
            if m.shape[0] == (sy2 - sy1) and m.shape[1] == (sx2 - sx1):
                selected_mask[sy1:sy2, sx1:sx2] = m
            elif m.shape[0] == orig_h and m.shape[1] == orig_w:
                selected_mask = m

        if override_mask is not None:
            if override_mask.ndim == 3:
                selected_mask = override_mask[0].cpu().clone()
            else:
                selected_mask = override_mask.cpu().clone()

        # Context Expansion
        bw = x2 - x1
        bh = y2 - y1
        cx, cy = x1 + bw / 2.0, y1 + bh / 2.0

        crop_w = int(np.ceil((bw * crop_factor + padding * 2) / 8.0) * 8)
        crop_h = int(np.ceil((bh * crop_factor + padding * 2) / 8.0) * 8)

        crop_x1 = max(0, int(cx - crop_w / 2.0))
        crop_y1 = max(0, int(cy - crop_h / 2.0))
        crop_x2 = min(orig_w, crop_x1 + crop_w)
        crop_y2 = min(orig_h, crop_y1 + crop_h)

        crop_x1 = max(0, crop_x2 - crop_w)
        crop_y1 = max(0, crop_y2 - crop_h)

        if mask_dilation != 0:
            m_t = selected_mask.unsqueeze(0).unsqueeze(0)
            if mask_dilation > 0:
                k = mask_dilation * 2 + 1
                m_t = F.max_pool2d(m_t, kernel_size=k, stride=1, padding=mask_dilation)
            else:
                k = abs(mask_dilation) * 2 + 1
                m_t = -F.max_pool2d(-m_t, kernel_size=k, stride=1, padding=abs(mask_dilation))
            selected_mask = m_t.squeeze()

        mask_np = selected_mask.numpy()
        if mask_blur > 0:
            if SCIPY_AVAILABLE:
                mask_np = scipy.ndimage.gaussian_filter(mask_np, sigma=mask_blur)
            else:
                m_t = torch.from_numpy(mask_np).unsqueeze(0).unsqueeze(0)
                k = mask_blur * 2 + 1
                m_t = F.avg_pool2d(m_t, kernel_size=k, stride=1, padding=mask_blur)
                mask_np = m_t.squeeze().numpy()

        if invert_mask:
            mask_np = 1.0 - mask_np

        edited_mask = torch.from_numpy(mask_np).float()

        crop_img = image[0:1, crop_y1:crop_y2, crop_x1:crop_x2, :].clone()
        crop_msk = edited_mask[crop_y1:crop_y2, crop_x1:crop_x2].unsqueeze(0).clone()

        crop_data = {
            "x1": crop_x1,
            "y1": crop_y1,
            "x2": crop_x2,
            "y2": crop_y2,
            "orig_h": orig_h,
            "orig_w": orig_w
        }

        logger.info("--- Detailer SEGS Processing Complete ---")
        return (crop_img, crop_msk, crop_data, edited_mask.unsqueeze(0))