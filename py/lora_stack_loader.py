import folder_paths
import comfy.utils
import comfy.sd
import json

class IkkiLoraStackLoader:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "model": ("MODEL",),
                "clip": ("CLIP",),
                # We use a hidden string field to pass our JSON data from JS to Python
                "lora_stack": ("STRING", {"default": "[]", "multiline": False}),
            }
        }

    RETURN_TYPES = ("MODEL", "CLIP")
    FUNCTION = "load_loras"
    CATEGORY = "Ikki-Pack/Loaders"

    def load_loras(self, model, clip, lora_stack):
        # Parse the JSON string sent from the frontend custom widget
        try:
            stack = json.loads(lora_stack)
        except Exception as e:
            print(f"[Ikki Lora Stack] Error parsing lora_stack json: {e}")
            stack = []
        
        # If the stack is empty, just return the model and clip as-is
        if not stack:
            return (model, clip)
        
        # Loop through each Lora in the stack
        for item in stack:
            if not item.get("enabled", False):
                continue
                
            lora_name = item.get("lora")
            if not lora_name or lora_name not in folder_paths.get_filename_list("loras"):
                print(f"[Ikki Lora Stack] LoRA not found or invalid: {lora_name}")
                continue
                
            strength = item.get("strength", 1.0)
            lora_path = folder_paths.get_full_path("loras", lora_name)
            
            if lora_path is None:
                print(f"[Ikki Lora Stack] LoRA path not found: {lora_name}")
                continue
            
            try:
                # Load the LoRA file
                lora_model = comfy.utils.load_torch_file(lora_path, safe_load=True)
                # Apply it to the model and clip
                model, clip = comfy.sd.load_lora_for_models(model, clip, lora_model, strength, strength)
                print(f"[Ikki Lora Stack] Loaded {lora_name} with strength {strength}")
            except Exception as e:
                print(f"[Ikki Lora Stack] Error loading LoRA {lora_name}: {e}")
                
        return (model, clip)

# Export the node for ComfyUI to discover
NODE_CLASS_MAPPINGS = {
    "IkkiLoraStackLoader": IkkiLoraStackLoader
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "IkkiLoraStackLoader": "LoRA Stack Loader"
}