class IkkiTextBoxSwitch:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "text": ("STRING", {"multiline": True, "default": ""}),
                "active": ("BOOLEAN", {"default": True}),
                "allow_sync": ("BOOLEAN", {"default": True}),
            },
            "optional": {
                "text_input": ("STRING", {"forceInput": True}),
            }
        }
    
    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("TEXT",)
    FUNCTION = "process"
    CATEGORY = "IkkiPack/Prompt"

    @classmethod
    def IS_CHANGED(s, **kwargs):
        text = kwargs.get("text", "")
        active = kwargs.get("active", True)
        allow_sync = kwargs.get("allow_sync", True)
        return f"{text}_{active}_{allow_sync}"

    def process(self, **kwargs):
        text = kwargs.get("text", "")
        active = kwargs.get("active", True)

        if not active:
            return ("",)
            
        return (text,)