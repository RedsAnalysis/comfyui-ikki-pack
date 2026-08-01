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
    name: "Ikki.TextBoxSwitch",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "IkkiTextBoxSwitch") {
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function() {
                if (onNodeCreated) onNodeCreated.apply(this, arguments);
                
                const textWidget = this.widgets?.find(w => w.name === "text");
                
                // Add "Sync This Slot" Button to the text block
                this.addWidget("button", "Sync This Slot 📋", null, () => {
                    const nodeTitle = this.title;
                    const titleIndex = slotNamesGlobal.indexOf(nodeTitle);
                    if (titleIndex === -1) {
                        console.warn("[IkkiPacks] Node must be renamed to a category (e.g. Pose) to sync.");
                        return;
                    }
                    
                    const key = slotToKeyGlobal[titleIndex];
                    if (!key) return;
                    
                    const canvasNodes = app.graph ? app.graph._nodes : [];
                    const parserNode = canvasNodes.find(n => n.type === "IkkiPromptParser");
                    if (!parserNode) {
                        console.warn("[IkkiPacks] No active Ikki Prompt Parser node found.");
                        return;
                    }
                    
                    const parserTextWidget = parserNode.widgets?.find(w => w.name === "text");
                    const pastedText = parserTextWidget ? parserTextWidget.value : "";
                    if (pastedText) {
                        const parsedData = parsePromptText(pastedText);
                        const val = parsedData[key];
                        if (val !== undefined) {
                            textWidget.value = val;
                            if (textWidget.inputEl) {
                                textWidget.inputEl.value = val;
                            }
                        }
                    }
                    app.canvas.draw(true, true);
                });
            };

            // Detect parser output wire connection, rename title, and snap off
            const onConnectionsChange = nodeType.prototype.onConnectionsChange;
            nodeType.prototype.onConnectionsChange = function(type, slotIndex, isConnected, link_info, ioSlot) {
                if (onConnectionsChange) onConnectionsChange.apply(this, arguments);
                
                if (type === LiteGraph.INPUT && isConnected && link_info && app.graph) {
                    const link = app.graph.links[link_info.id];
                    if (link) {
                        const originNode = app.graph.getNodeById(link.origin_id);
                        if (originNode && originNode.type === "IkkiPromptParser") {
                            const originSlot = link.origin_slot;
                            const slotNames = [
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
                            const categoryName = slotNames[originSlot] || "Category";
                            this.title = categoryName;
                            
                            // Snap off: remove wire link so ComfyUI doesn't track it as execution dependency
                            setTimeout(() => {
                                this.disconnectInput(slotIndex);
                                app.canvas.draw(true, true);
                            }, 50);
                        }
                    }
                }
            };
        }
    }
});