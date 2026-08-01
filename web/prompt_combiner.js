import { app } from "../../../scripts/app.js";

function getWidget(node, name) {
    if (!node._widgetCache) node._widgetCache = {};
    if (!node._widgetCache[name]) {
        node._widgetCache[name] = node.widgets?.find(w => w.name === name);
    }
    return node._widgetCache[name];
}

function getWidgetValue(node, name, defaultValue = 0) {
    const w = getWidget(node, name);
    return w ? w.value : defaultValue;
}

// Logic to dynamically handle sequentially growing inputs starting at text_1
function updateTextInputs(node) {
    if (!node.inputs) return;

    // Find the last index of connected text inputs
    let lastConnectedIndex = -1;
    for (let i = 0; i < node.inputs.length; i++) {
        const input = node.inputs[i];
        if (input.name.startsWith("text_") && input.link !== null) {
            lastConnectedIndex = i;
        }
    }

    // Remove empty text inputs after the last connected index + 1 (excluding text_1 at index 0)
    for (let i = node.inputs.length - 1; i >= 0; i--) {
        const input = node.inputs[i];
        if (input.name.startsWith("text_")) {
            if (input.link === null && i > lastConnectedIndex + 1 && i > 0) {
                node.removeInput(i);
            }
        }
    }

    // Check if we need to add a new dynamic text input slot
    const textInputs = node.inputs.filter(i => i.name.startsWith("text_"));
    const lastInput = textInputs[textInputs.length - 1];

    if (!lastInput || lastInput.link !== null) {
        let nextIdx = 1;
        if (lastInput) {
            const match = lastInput.name.match(/text_(\d+)/);
            if (match) {
                nextIdx = parseInt(match[1]) + 1;
            }
        }
        node.addInput(`text_${nextIdx}`, "STRING");
    }

    // Re-index names to maintain perfect chronological ordering (text_1, text_2, text_3...)
    let textCount = 1;
    for (let i = 0; i < node.inputs.length; i++) {
        const input = node.inputs[i];
        if (input.name.startsWith("text_")) {
            input.name = `text_${textCount}`;
            textCount++;
        }
    }
}

app.registerExtension({
    name: "Ikki.PromptCombiner",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "IkkiPromptCombiner") {
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function() {
                if (onNodeCreated) onNodeCreated.apply(this, arguments);
                updateTextInputs(this);
            };

            const onConnectionsChange = nodeType.prototype.onConnectionsChange;
            nodeType.prototype.onConnectionsChange = function(type, slotIndex, isConnected, link_info, ioSlot) {
                if (onConnectionsChange) onConnectionsChange.apply(this, arguments);
                
                if (type === LiteGraph.INPUT) {
                    if (this._updating_inputs) return;
                    this._updating_inputs = true;
                    try {
                        updateTextInputs(this);
                    } finally {
                        this._updating_inputs = false;
                    }
                }
            };
        }
    }
});