import re

class IkkiPromptParser:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "text": ("STRING", {"multiline": True, "default": ""}),
            }
        }

    RETURN_TYPES = (
        "STRING", "STRING", "STRING", "STRING", "STRING",
        "STRING", "STRING", "STRING", "STRING", "STRING"
    )
    RETURN_NAMES = (
        "QUALITY",
        "CHARACTER_AND_SERIES",
        "APPEARANCE",
        "POSE",
        "EXPRESSION",
        "CLOTHING",
        "CAMERA",
        "LIGHTING",
        "BACKGROUND",
        "EFFECTS"
    )
    FUNCTION = "process"
    CATEGORY = "IkkiPack/Prompt"

    def process(self, **kwargs):
        text = kwargs.get("text", "").strip()
        
        categories = {
            "quality": "",
            "character": "",
            "appearance": "",
            "pose": "",
            "expression": "",
            "clothing": "",
            "camera": "",
            "lighting": "",
            "background": "",
            "effects": ""
        }
        
        key_map = {
            "quality": "quality",
            "character and series": "character",
            "character": "character",
            "appearance": "appearance",
            "pose": "pose",
            "expression": "expression",
            "clothing": "clothing",
            "camera": "camera",
            "lighting": "lighting",
            "background": "background",
            "effects": "effects"
        }
        
        pattern = r'(?:^|,|\n)\s*(?:\*\*)?(Quality|Character and Series|Appearance|Pose|Expression|Clothing|Camera|Lighting|Background|Effects)(?:\*\*)?\s*:\s*'
        
        matches = list(re.finditer(pattern, text, re.IGNORECASE))
        
        if not matches:
            categories["quality"] = text
        else:
            first_match_start = matches[0].start()
            pre_text = text[:first_match_start].strip().rstrip(",").strip()
            if pre_text:
                categories["quality"] = pre_text
                
            for i in range(len(matches)):
                match = matches[i]
                category_name = match.group(1).lower()
                key = key_map.get(category_name)
                
                start_index = match.end()
                end_index = matches[i+1].start() if i + 1 < len(matches) else len(text)
                
                content = text[start_index:end_index].strip().rstrip(",").strip()
                if key:
                    if categories[key]:
                        categories[key] += ", " + content
                    else:
                        categories[key] = content
                        
        def clean_segment(segment):
            raw_parts = segment.replace("\n", ",").split(",")
            parts = [p.strip() for p in raw_parts if p.strip()]
            return ", ".join(parts)
            
        return (
            clean_segment(categories["quality"]),
            clean_segment(categories["character"]),
            clean_segment(categories["appearance"]),
            clean_segment(categories["pose"]),
            clean_segment(categories["expression"]),
            clean_segment(categories["clothing"]),
            clean_segment(categories["camera"]),
            clean_segment(categories["lighting"]),
            clean_segment(categories["background"]),
            clean_segment(categories["effects"])
        )