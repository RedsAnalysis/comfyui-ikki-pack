import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";

function loadImage(filename, callback) {
    if (!filename) return null;
    const img = new Image();
    img.onload = () => callback(img);
    img.src = api.apiURL(`/view?filename=${encodeURIComponent(filename)}&type=input&t=${Date.now()}`);
    return img;
}

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

app.registerExtension({
    name: "Ikki.GridCrop",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "IkkiGridCrop") {
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function() {
                if (onNodeCreated) onNodeCreated.apply(this, arguments);
                this.isDraggingCropBox = false;
                this.draggingIndex = -1;
                this.cropImgs = [null, null, null, null];
                this.currentImgNames = [null, null, null, null];
                this._widgetCache = {};
            };

            const computeSize = nodeType.prototype.computeSize;
            nodeType.prototype.computeSize = function(out) {
                let size = computeSize ? computeSize.apply(this, arguments) : [this.size[0], this.size[1]];
                let widgets_h = this.widgets ? this.widgets.length * 24 : 0;
                size[1] = Math.max(size[1], widgets_h + 380);
                return size;
            };

            const onDrawBackground = nodeType.prototype.onDrawBackground;
            nodeType.prototype.onDrawBackground = function(ctx) {
                if (this.imgs) this.imgs = null;
                if (onDrawBackground) onDrawBackground.apply(this, arguments);
            };

            const onDrawForeground = nodeType.prototype.onDrawForeground;
            nodeType.prototype.onDrawForeground = function(ctx) {
                if (onDrawForeground) onDrawForeground.apply(this, arguments);
                if (this.flags.collapsed) return;

                for (let i = 0; i < 4; i++) {
                    const imgName = getWidgetValue(this, `image${i+1}`, null);
                    if (imgName && this.currentImgNames[i] !== imgName) {
                        this.currentImgNames[i] = imgName;
                        const idx = i;
                        loadImage(imgName, (img) => {
                            this.cropImgs[idx] = img;
                            this.setSize(this.computeSize([this.size[0], this.size[1]]));
                            this.setDirtyCanvas(true, true);
                        });
                    }
                }

                let widgets_y = this.widgets?.length > 0 ? this.widgets[this.widgets.length - 1].last_y + 30 : 0;
                const padding = 10;
                const draw_area_w = Math.max(10, this.size[0] - (padding * 2));
                const draw_area_h = Math.max(10, this.size[1] - widgets_y - padding);

                const quad_w = draw_area_w / 2;
                const quad_h = draw_area_h / 2;

                const cropW = getWidgetValue(this, "width", 512);
                const cropH = getWidgetValue(this, "height", 512);

                this.boxRects = [];
                this.imgScales = [];
                const colors = ["#00ccff", "#ff0077", "#ffaa00", "#00ff55"];

                for (let i = 0; i < 4; i++) {
                    const row = Math.floor(i / 2);
                    const col = i % 2;
                    const qx = padding + (col * quad_w);
                    const qy = widgets_y + (row * quad_h);

                    const img = this.cropImgs[i];
                    if (!img || !img.naturalWidth) {
                        ctx.fillStyle = "#222";
                        ctx.fillRect(qx + 2, qy + 2, quad_w - 4, quad_h - 4);
                        ctx.fillStyle = "#666";
                        ctx.font = "12px Arial";
                        ctx.fillText(`Image ${i+1}`, qx + 10, qy + 20);
                        this.boxRects.push(null);
                        this.imgScales.push(null);
                        continue;
                    }

                    const trueImgW = img.naturalWidth;
                    const trueImgH = img.naturalHeight;
                    const aspect = trueImgW / trueImgH;
                    const quad_aspect = quad_w / quad_h;

                    let draw_w, draw_h, draw_x, draw_y;
                    if (aspect > quad_aspect) {
                        draw_w = quad_w - 10;
                        draw_h = draw_w / aspect;
                        draw_x = qx + 5;
                        draw_y = qy + (quad_h - draw_h) / 2;
                    } else {
                        draw_h = quad_h - 10;
                        draw_w = draw_h * aspect;
                        draw_x = qx + (quad_w - draw_w) / 2;
                        draw_y = qy + 5;
                    }

                    const imgScale = draw_w / trueImgW;
                    this.imgScales.push(imgScale);

                    ctx.drawImage(img, draw_x, draw_y, draw_w, draw_h);

                    let cropX = (getWidgetValue(this, `x${i+1}`, 0) / 100) * trueImgW;
                    let cropY = (getWidgetValue(this, `y${i+1}`, 0) / 100) * trueImgH;

                    cropX = Math.max(0, Math.min(cropX, trueImgW - cropW));
                    cropY = Math.max(0, Math.min(cropY, trueImgH - cropH));

                    const boxX = draw_x + (cropX * imgScale);
                    const boxY = draw_y + (cropY * imgScale);
                    const boxW = cropW * imgScale;
                    const boxH = cropH * imgScale;

                    this.boxRects.push({ x: boxX, y: boxY, w: boxW, h: boxH, trueW: trueImgW, trueH: trueImgH });

                    ctx.save();
                    ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
                    ctx.beginPath();
                    ctx.rect(draw_x, draw_y, draw_w, draw_h);
                    ctx.rect(boxX, boxY, boxW, boxH);
                    ctx.fill("evenodd");

                    ctx.strokeStyle = colors[i];
                    ctx.lineWidth = 2;
                    ctx.setLineDash([3, 3]);
                    ctx.strokeRect(boxX, boxY, boxW, boxH);

                    ctx.fillStyle = colors[i];
                    ctx.fillText(`${i+1}`, boxX + 4, boxY + 14);
                    ctx.restore();
                }
            };

            const onMouseDown = nodeType.prototype.onMouseDown;
            nodeType.prototype.onMouseDown = function(e, localPos, canvas) {
                let handled = onMouseDown ? onMouseDown.apply(this, arguments) : false;
                if (handled) return true;

                if (this.boxRects) {
                    for (let i = 0; i < 4; i++) {
                        const rect = this.boxRects[i];
                        if (rect && localPos[0] >= rect.x && localPos[0] <= rect.x + rect.w && localPos[1] >= rect.y && localPos[1] <= rect.y + rect.h) {
                            this.isDraggingCropBox = true;
                            this.draggingIndex = i;
                            this.dragStartX = localPos[0];
                            this.dragStartY = localPos[1];
                            this.dragStartWidgetX = getWidgetValue(this, `x${i+1}`, 0);
                            this.dragStartWidgetY = getWidgetValue(this, `y${i+1}`, 0);
                            return true;
                        }
                    }
                }
                return false;
            };

            const onMouseMove = nodeType.prototype.onMouseMove;
            nodeType.prototype.onMouseMove = function(e, localPos, canvas) {
                if (onMouseMove) onMouseMove.apply(this, arguments);

                if (this.isDraggingCropBox && this.draggingIndex !== -1) {
                    const i = this.draggingIndex;
                    const scale = this.imgScales[i];
                    const rect = this.boxRects[i];

                    if (!scale || !rect) return;

                    const dx = localPos[0] - this.dragStartX;
                    const dy = localPos[1] - this.dragStartY;

                    const trueImgW = rect.trueW;
                    const trueImgH = rect.trueH;

                    const cropW = getWidgetValue(this, "width", 512);
                    const cropH = getWidgetValue(this, "height", 512);

                    let newPixelX = ((this.dragStartWidgetX / 100) * trueImgW) + (dx / scale);
                    let newPixelY = ((this.dragStartWidgetY / 100) * trueImgH) + (dy / scale);

                    newPixelX = Math.max(0, Math.min(newPixelX, trueImgW - cropW));
                    newPixelY = Math.max(0, Math.min(newPixelY, trueImgH - cropH));

                    if (!isNaN(newPixelX) && !isNaN(newPixelY)) {
                        setWidgetValue(this, `x${i+1}`, parseFloat(((newPixelX / trueImgW) * 100).toFixed(2)));
                        setWidgetValue(this, `y${i+1}`, parseFloat(((newPixelY / trueImgH) * 100).toFixed(2)));
                        this.setDirtyCanvas(true, true);
                    }
                }
            };

            const onMouseUp = nodeType.prototype.onMouseUp;
            nodeType.prototype.onMouseUp = function(e, localPos, canvas) {
                if (onMouseUp) onMouseUp.apply(this, arguments);
                this.isDraggingCropBox = false;
                this.draggingIndex = -1;
            };
        }
    }
});