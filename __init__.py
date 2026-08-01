import os
import sys

# Insert our module paths into the Python search path
node_dir = os.path.dirname(os.path.abspath(__file__))
if node_dir not in sys.path:
    sys.path.insert(0, node_dir)

from py.load_and_crop import IkkiLoadAndCrop
from py.grid_crop import IkkiGridCrop
from py.text_box_switch import IkkiTextBoxSwitch
from py.prompt_combiner import IkkiPromptCombiner
from py.prompt_parser import IkkiPromptParser
from py.lora_stack_loader import IkkiLoraStackLoader

NODE_CLASS_MAPPINGS = {
    "IkkiLoadAndCrop": IkkiLoadAndCrop,
    "IkkiGridCrop": IkkiGridCrop,
    "IkkiTextBoxSwitch": IkkiTextBoxSwitch,
    "IkkiPromptCombiner": IkkiPromptCombiner,
    "IkkiPromptParser": IkkiPromptParser,
    "IkkiLoraStackLoader": IkkiLoraStackLoader,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "IkkiLoadAndCrop": "Load & Crop",
    "IkkiGridCrop": "2x2 Grid Crop",
    "IkkiTextBoxSwitch": "Text Box Switch",
    "IkkiPromptCombiner": "Text Combiner 🧩",
    "IkkiPromptParser": "LLM Prompt Parser 📋",
    "IkkiLoraStackLoader": "Lora Stack Loader 📚",
}

WEB_DIRECTORY = "./web"

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]