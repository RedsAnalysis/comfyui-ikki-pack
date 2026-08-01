import { app } from "../../scripts/app.js";

app.registerExtension({
    name: "Ikki.LoraStackLoader",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "IkkiLoraStackLoader") {
            
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                if (onNodeCreated) {
                    onNodeCreated.apply(this, arguments);
                }

                // 1. COMPLETELY HIDE & DISABLE DRAWING FOR THE TEXT BLOCK AT THE BOTTOM
                const stackWidget = this.widgets.find(w => w.name === "lora_stack");
                if (stackWidget) {
                    stackWidget.type = "hidden";
                    stackWidget.draw = () => {}; // Overrides LiteGraph's text rendering (NO text drawn)
                    stackWidget.computeSize = () => [0, 0]; // Takes zero height/width
                    if (stackWidget.inputEl) {
                        stackWidget.inputEl.style.display = "none";
                    }
                }

                let initialValue = [];
                if (stackWidget && stackWidget.value) {
                    try {
                        initialValue = JSON.parse(stackWidget.value);
                    } catch (e) {
                        initialValue = [];
                    }
                }

                const customWidget = {
                    type: "lora_stack_ui",
                    name: "LoRAs",
                    y: 0,
                    value: initialValue,
                    
                    computeSize: function (width) {
                        const rows = this.value.length;
                        // Use current width if available so it doesn't collapse
                        const currentWidth = (this.node && this.node.size) ? this.node.size[0] : 320;
                        return [
                            Math.max(currentWidth, width || 320),
                            Math.max(50, rows * 30 + 40)
                        ];
                    },
                    
                    draw: function (ctx, node, widget_width, y, widget_height) {
                        this.y = y; 
                        const ROW_HEIGHT = 30;
                        ctx.save();
                        
                        for (let i = 0; i < this.value.length; i++) {
                            const row = this.value[i];
                            const rowY = y + i * ROW_HEIGHT;
                            
                            // 1. Toggle box (Green = On, Red = Off)
                            ctx.fillStyle = row.enabled ? "#2ecc71" : "#e74c3c";
                            ctx.fillRect(10, rowY + 5, 20, 20);
                            ctx.fillStyle = "#fff";
                            ctx.font = "14px Arial";
                            ctx.textAlign = "center";
                            ctx.fillText(row.enabled ? "✓" : "✗", 20, rowY + 20);

                            // 2. LoRA Selection Dropdown Box
                            ctx.fillStyle = "#222";
                            ctx.fillRect(35, rowY + 5, widget_width - 120, 20);
                            ctx.fillStyle = "#ddd";
                            ctx.textAlign = "left";
                            let loraText = row.lora || "Select LoRA...";
                            if (loraText.length > 30) loraText = loraText.substring(0, 27) + "...";
                            ctx.fillText(loraText, 40, rowY + 19);

                            // 3. Strength Amount Box
                            ctx.fillStyle = "#333";
                            ctx.fillRect(widget_width - 80, rowY + 5, 70, 20); 
                            ctx.fillStyle = "#fff";
                            ctx.textAlign = "center";
                            ctx.fillText("↔ " + row.strength.toFixed(2), widget_width - 45, rowY + 19);
                        }

                        // Bottom "Add LoRA" Button
                        const addY = y + this.value.length * ROW_HEIGHT;
                        ctx.fillStyle = "#27ae60";
                        ctx.fillRect(10, addY + 5, widget_width - 20, 20);
                        ctx.fillStyle = "#fff";
                        ctx.textAlign = "center";
                        ctx.fillText("+ Add LoRA", widget_width / 2, addY + 20);
                        ctx.restore();
                    },
                    
                    mouse: function (event, pos, node) {
                        const clickY = pos[1] - this.y;
                        const clickX = pos[0];
                        const widget_width = node.size[0];
                        const ROW_HEIGHT = 30;

                        // 2. PRESERVE CUSTOM WIDTH WHEN RESIZING HEIGHT
                        const updateStack = (needsResize = false) => {
                            if (stackWidget) stackWidget.value = JSON.stringify(this.value);
                            if (needsResize) {
                                const currentWidth = node.size[0]; // Keep user's stretched width
                                const newHeight = customWidget.computeSize(currentWidth)[1];
                                node.setSize([currentWidth, newHeight]);
                            }
                            node.graph?.setDirtyCanvas(true, true);
                        };

                        // --- HANDLE DRAGGING STRENGTH ---
                        if (event.type === "pointermove" || event.type === "mousemove") {
                            if (node._is_dragging_strength && node._drag_row) {
                                const deltaX = event.clientX - node._drag_start_x;
                                const sensitivity = 0.01;
                                node._drag_row.strength = node._drag_start_strength + (deltaX * sensitivity);
                                updateStack(false);
                                return true;
                            }
                            return false;
                        }

                        if (event.type === "pointerup" || event.type === "mouseup") {
                            if (node._is_dragging_strength) {
                                node._is_dragging_strength = false;
                                node._drag_row = null;
                                if (app.canvas) app.canvas.node_widget = null;
                                return true;
                            }
                            return false;
                        }

                        // --- HANDLE CLICKING ---
                        if (event.type !== "pointerdown" && event.type !== "mousedown") return false;
                        if (clickY < 0) return false;

                        const rowIdx = Math.floor(clickY / ROW_HEIGHT);

                        if (rowIdx < this.value.length) {
                            const row = this.value[rowIdx];
                            
                            // Clicked: Toggle Box
                            if (clickX >= 10 && clickX <= 30) {
                                row.enabled = !row.enabled;
                                updateStack(false);
                                return true;
                            }
                            // Clicked: LoRA Dropdown Selector
                            else if (clickX >= 35 && clickX <= widget_width - 85) {
                                let loras = ["None (Remove Row)"];
                                try {
                                    loras = loras.concat(LiteGraph.registered_node_types["LoraLoader"].nodeData.input.required.lora_name[0]);
                                } catch (e) {
                                    console.warn("Could not find LoRA list.");
                                }
                                new LiteGraph.ContextMenu(loras, {
                                    event: event,
                                    callback: (val) => {
                                        if (val === "None (Remove Row)") {
                                            this.value.splice(rowIdx, 1);
                                            updateStack(true); // Adjusts height, preserves width
                                        } else {
                                            row.lora = val;
                                            updateStack(false);
                                        }
                                    }
                                });
                                return true;
                            }
                            // Clicked: Strength box (Drag to scrub)
                            else if (clickX >= widget_width - 80 && clickX <= widget_width - 10) {
                                node._is_dragging_strength = true;
                                node._drag_row = row;
                                node._drag_start_x = event.clientX;
                                node._drag_start_strength = row.strength;
                                if (app.canvas) app.canvas.node_widget = [node, this]; 
                                return true;
                            }
                        } else if (rowIdx === this.value.length) {
                            // Clicked: "+ Add LoRA" button
                            this.value.push({ enabled: true, lora: null, strength: 1.0 });
                            updateStack(true); // Adjusts height, preserves width
                            return true;
                        }
                        return false;
                    }
                };

                this.widgets.unshift(customWidget);
                this.setSize(this.computeSize());
            };

            const onConfigure = nodeType.prototype.onConfigure;
            nodeType.prototype.onConfigure = function (info) {
                if (onConfigure) onConfigure.apply(this, arguments);
                const stackWidget = this.widgets.find(w => w.name === "lora_stack");
                const customWidget = this.widgets.find(w => w.type === "lora_stack_ui");
                
                if (stackWidget) {
                    stackWidget.type = "hidden";
                    stackWidget.draw = () => {};
                    stackWidget.computeSize = () => [0, 0];
                    if (stackWidget.inputEl) {
                        stackWidget.inputEl.style.display = "none";
                    }
                }

                if (stackWidget && customWidget) {
                    try {
                        customWidget.value = JSON.parse(stackWidget.value);
                    } catch (e) {
                        customWidget.value = [];
                    }
                    const currentWidth = this.size[0];
                    const newHeight = customWidget.computeSize(currentWidth)[1];
                    this.setSize([currentWidth, newHeight]);
                }
            };
        }
    }
});