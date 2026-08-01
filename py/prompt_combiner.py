class IkkiPromptCombiner:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "trailing_comma": ("BOOLEAN", {"default": True}),
            },
            "optional": {
                "text_1": ("STRING", {"forceInput": True}),
            }
        }

    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("COMBINED_TEXT", "COMBINED_PREVIEW")
    FUNCTION = "process"
    CATEGORY = "IkkiPack/Prompt"

    def process(self, **kwargs):
        trailing_comma = kwargs.get("trailing_comma", True)
        
        parts = []
        i = 1
        while f"text_{i}" in kwargs or i < 100:
            text_val = kwargs.get(f"text_{i}", "")
            if text_val:
                cleaned = text_val.strip()
                cleaned = cleaned.strip(",").strip()
                if cleaned:
                    parts.append(cleaned)
            i += 1
            if i > 100 and not any(f"text_{j}" in kwargs for j in range(i, i + 10)):
                break
                
        combined_text = ""
        if parts:
            if trailing_comma:
                combined_text = ",\n".join(parts) + ",\n"
            else:
                combined_text = ",\n".join(parts)
            
        return (combined_text, combined_text)