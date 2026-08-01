import { app } from "../../../scripts/app.js";

const slotNamesGlobal = [
    "Quality",
    "Character & Series",
    "Appearance",
    "Pose",
    "Expression",
    "Clothing",
    "Camera",
    "Lighting",
    "Background",
    "Effects"
];

const slotToKeyGlobal = [
    "quality",
    "character",
    "appearance",
    "pose",
    "expression",
    "clothing",
    "camera",
    "lighting",
    "background",
    "effects"
];

// Clean and normalize unstructured block texts
function parsePromptText(text) {
    const categories = {
        quality: "",
        character: "",
        appearance: "",
        pose: "",
        expression: "",
        clothing: "",
        camera: "",
        lighting: "",
        background: "",
        effects: ""
    };
    
    const keyMap = {
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
    };
    
    const regex = /(?:^|,|\n)\s*(?:\*\*)?(Quality|Character and Series|Appearance|Pose|Expression|Clothing|Camera|Lighting|Background|Effects)(?:\*\*)?\s*:\s*/gi;
    
    let matches = [];
    let match;
    while ((match = regex.exec(text)) !== null) {
        matches.push({
            index: match.index,
            end: regex.lastIndex,
            category: match[1]
        });
    }
    
    if (matches.length === 0) {
        categories.quality = text;
        return categories;
    }
    
    const firstMatch = matches[0];
    const preText = text.substring(0, firstMatch.index).trim().replace(/,+$/, "").trim();
    if (preText) {
        categories.quality = preText;
    }
    
    for (let i = 0; i < matches.length; i++) {
        const m = matches[i];
        const categoryName = m.category.toLowerCase();
        const key = keyMap[categoryName];
        
        const start = m.end;
        const end = (i + 1 < matches.length) ? matches[i+1].index : text.length;
        
        let content = text.substring(start, end).trim().replace(/,+$/, "").trim();
        
        if (key) {
            if (categories[key]) {
                categories[key] += ", " + content;
            } else {
                categories[key] = content;
            }
        }
    }
    
    for (let key in categories) {
        let segment = categories[key];
        let rawParts = segment.replace(/\n/g, ",").split(",");
        let parts = rawParts.map(p => p.trim()).filter(p => p.length > 0);
        categories[key] = parts.join(", ");
    }
    
    return categories;
}

app.registerExtension({
    name: "Ikki.PromptParser",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "IkkiPromptParser") {
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function() {
                if (onNodeCreated) onNodeCreated.apply(this, arguments);
                
                const textWidget = this.widgets?.find(w => w.name === "text");
                
                // Add "Sync All Slots" execution button directly to UI
                this.addWidget("button", "Sync All Slots 📋", null, () => {
                    const pastedText = textWidget ? textWidget.value : "";
                    if (!pastedText) return;
                    
                    const parsedData = parsePromptText(pastedText);
                    const canvasNodes = app.graph ? app.graph._nodes : [];
                    if (!canvasNodes) return;
                    
                    let syncCount = 0;
                    for (const node of canvasNodes) {
                        if (node.type === "IkkiTextBoxSwitch") {
                            const nodeTitle = node.title;
                            const titleIndex = slotNamesGlobal.indexOf(nodeTitle);
                            if (titleIndex !== -1) {
                                const key = slotToKeyGlobal[titleIndex];
                                if (key && parsedData[key] !== undefined) {
                                    const textWidgetTarget = node.widgets?.find(w => w.name === "text");
                                    const allowSyncWidget = node.widgets?.find(w => w.name === "allow_sync");
                                    
                                    const allowSync = allowSyncWidget ? allowSyncWidget.value : true;
                                    
                                    if (allowSync && textWidgetTarget) {
                                        const val = parsedData[key];
                                        textWidgetTarget.value = val;
                                        if (textWidgetTarget.inputEl) {
                                            textWidgetTarget.inputEl.value = val;
                                        }
                                        syncCount++;
                                    }
                                }
                            }
                        }
                    }
                    
                    app.canvas.draw(true, true);
                    console.log(`[IkkiPacks] Synced ${syncCount} matching text boxes.`);
                });
            };
        }
    }
});