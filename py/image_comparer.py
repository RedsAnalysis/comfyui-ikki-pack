import os
from nodes import PreviewImage

class IkkiImageComparer(PreviewImage):
    """A node that compares two images in the UI using a slider or click feature."""
    
    NAME = "IkkiImageComparer"
    CATEGORY = "ikki"
    FUNCTION = "compare_images"
    DESCRIPTION = "Compares two images (image_a and image_b) interactively in the node UI."

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {},
            "optional": {
                "image_a": ("IMAGE",),
                "image_b": ("IMAGE",),
            },
            "hidden": {
                "prompt": "PROMPT",
                "extra_pnginfo": "EXTRA_PNGINFO"
            },
        }

    def compare_images(self, image_a=None, image_b=None, filename_prefix="ikki.compare.", prompt=None, extra_pnginfo=None):
        result = {"ui": {"a_images": [], "b_images": []}}
        
        if image_a is not None and len(image_a) > 0:
            result['ui']['a_images'] = self.save_images(image_a, filename_prefix, prompt, extra_pnginfo)['ui']['images']

        if image_b is not None and len(image_b) > 0:
            result['ui']['b_images'] = self.save_images(image_b, filename_prefix, prompt, extra_pnginfo)['ui']['images']

        return result