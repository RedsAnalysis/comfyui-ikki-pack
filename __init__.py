import os
import sys

# Insert our module paths into the Python search path
node_dir = os.path.dirname(os.path.abspath(__file__))
if node_dir not in sys.path:
    sys.path.insert(0, node_dir)

from py.load_and_crop import IkkiLoadAndCrop
from py.text_box_switch import IkkiTextBoxSwitch
from py.prompt_combiner import IkkiPromptCombiner
from py.prompt_parser import IkkiPromptParser
from py.lora_stack_loader import IkkiLoraStackLoader
from py.ultralytics_detector import IkkiUltralyticsDetector
from py.detailer_processor import IkkiDetailerProcessor
from py.mask_editor import IkkiMaskEditor
from py.detailer_ksampler import IkkiDetailerKSampler
from py.composite_back import IkkiCompositeBack
from py.image_comparer import IkkiImageComparer
from py.color_matching import IkkiColorMatching

NODE_CLASS_MAPPINGS = {
    "IkkiLoadAndCrop": IkkiLoadAndCrop,
    "IkkiTextBoxSwitch": IkkiTextBoxSwitch,
    "IkkiPromptCombiner": IkkiPromptCombiner,
    "IkkiPromptParser": IkkiPromptParser,
    "IkkiLoraStackLoader": IkkiLoraStackLoader,
    "IkkiUltralyticsDetector": IkkiUltralyticsDetector,
    "IkkiDetailerProcessor": IkkiDetailerProcessor,
    "IkkiMaskEditor": IkkiMaskEditor,
    "IkkiDetailerKSampler": IkkiDetailerKSampler,
    "IkkiCompositeBack": IkkiCompositeBack,
    "IkkiImageComparer": IkkiImageComparer,
    "IkkiColorMatching": IkkiColorMatching,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "IkkiLoadAndCrop": "Load & Crop",
    "IkkiTextBoxSwitch": "Text Box Switch",
    "IkkiPromptCombiner": "Text Combiner 🧩",
    "IkkiPromptParser": "LLM Prompt Parser 📋",
    "IkkiLoraStackLoader": "Lora Stack Loader 📚",
    "IkkiUltralyticsDetector": "Ultralytics Detector ☃️",
    "IkkiDetailerProcessor": "Detailer Processor ⌨️",
    "IkkiMaskEditor": "Visual Mask Editor 🎨",
    "IkkiDetailerKSampler": "Detailer KSampler ⚡",
    "IkkiCompositeBack": "Composite Back 🕸️",
    "IkkiImageComparer": "Image Comparer ⚖️",
    "IkkiColorMatching": "Color Matching Studio 🖼️",
}

WEB_DIRECTORY = "./web"

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]