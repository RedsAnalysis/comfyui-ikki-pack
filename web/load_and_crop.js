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

function setWidgetValue(node, name, val) {
    const w = getWidget(node, name);
    if (w) w.value = val;
}

app.registerExtension({
    name: "Ikki.LoadAndCrop",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "IkkiLoadAndCrop") {
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function() {
                if (onNodeCreated) onNodeCreated.apply(this, arguments);
                this.isDraggingCropBox = false;
                this.cropImg = null;
                this.currentImgName = null;
                this._widgetCache = {};
            };

            const computeSize = nodeType.prototype.computeSize;
            nodeType.prototype.computeSize = function(out) {
                let size = computeSize ? computeSize.apply(this, arguments) : [this.size[0], this.size[1]];
                if (this.cropImg && this.cropImg.naturalWidth > 0) {
                    let widgets_h = this.widgets ? this.widgets.length * 24 : 0;
                    const aspect = this.cropImg.naturalWidth / this.cropImg.naturalHeight;
                    const preview_width = Math.max(100, size[0] - 20);
                    const preview_height = preview_width / aspect;
                    size[1] = Math.max(size[1], widgets_h + preview_height + 40);
                }
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

                const imgWidgetVal = getWidgetValue(this, "image", null);
                if (imgWidgetVal && this.currentImgName !== imgWidgetVal) {
                    this.currentImgName = imgWidgetVal;
                    loadImage(imgWidgetVal, (img) => {
                        this.cropImg = img;
                        this.setSize(this.computeSize([this.size[0], this.size[1]]));
                        this.setDirtyCanvas(true, true);
                    });
                }

                if (!this.cropImg || !this.cropImg.naturalWidth) return;

                const img = this.cropImg;
                const trueImgW = img.naturalWidth;
                const trueImgH = img.naturalHeight;

                let widgets_y = this.widgets?.length > 0 ? this.widgets[this.widgets.length - 1].last_y + 30 : 0;
                const padding = 10;
                const draw_w = Math.max(10, this.size[0] - (padding * 2));
                const draw_h = draw_w / (trueImgW / trueImgH);
                this.imgScale = draw_w / trueImgW;

                ctx.drawImage(img, padding, widgets_y, draw_w, draw_h);

                const cropX_percent = getWidgetValue(this, "x", 0);
                const cropY_percent = getWidgetValue(this, "y", 0);
                const cropW = getWidgetValue(this, "width", 512);
                const cropH = getWidgetValue(this, "height", 512);

                let cropX = (cropX_percent / 100) * trueImgW;
                let cropY = (cropY_percent / 100) * trueImgH;

                cropX = Math.max(0, Math.min(cropX, trueImgW - cropW));
                cropY = Math.max(0, Math.min(cropY, trueImgH - cropH));

                const boxX = padding + (cropX * this.imgScale);
                const boxY = widgets_y + (cropY * this.imgScale);
                const boxW = cropW * this.imgScale;
                const boxH = cropH * this.imgScale;
                this.boxRect = { x: boxX, y: boxY, w: boxW, h: boxH };

                ctx.save();
                ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
                ctx.beginPath();
                ctx.rect(padding, widgets_y, draw_w, draw_h);
                ctx.rect(boxX, boxY, boxW, boxH);
                ctx.fill("evenodd");

                ctx.strokeStyle = "#00ffcc";
                ctx.lineWidth = 2;
                ctx.setLineDash([4, 4]);
                ctx.strokeRect(boxX, boxY, boxW, boxH);
                ctx.restore();
            };

            const onMouseDown = nodeType.prototype.onMouseDown;
            nodeType.prototype.onMouseDown = function(e, localPos, canvas) {
                let handled = onMouseDown ? onMouseDown.apply(this, arguments) : false;
                if (handled) return true;
                if (this.boxRect && this.cropImg) {
                    const { x, y, w, h } = this.boxRect;
                    if (localPos[0] >= x && localPos[0] <= x + w && localPos[1] >= y && localPos[1] <= y + h) {
                        this.isDraggingCropBox = true;
                        this.dragStartX = localPos[0];
                        this.dragStartY = localPos[1];
                        this.dragStartWidgetX = getWidgetValue(this, "x", 0);
                        this.dragStartWidgetY = getWidgetValue(this, "y", 0);
                        return true;
                    }
                }
                return false;
            };

            const onMouseMove = nodeType.prototype.onMouseMove;
            nodeType.prototype.onMouseMove = function(e, localPos, canvas) {
                if (onMouseMove) onMouseMove.apply(this, arguments);
                if (this.isDraggingCropBox && this.cropImg && this.imgScale) {
                    const dx = localPos[0] - this.dragStartX;
                    const dy = localPos[1] - this.dragStartY;
                    const trueImgW = this.cropImg.naturalWidth;
                    const trueImgH = this.cropImg.naturalHeight;
                    const cropW = getWidgetValue(this, "width", 512);
                    const cropH = getWidgetValue(this, "height", 512);

                    let newPixelX = ((this.dragStartWidgetX / 100) * trueImgW) + (dx / this.imgScale);
                    let newPixelY = ((this.dragStartWidgetY / 100) * trueImgH) + (dy / this.imgScale);

                    newPixelX = Math.max(0, Math.min(newPixelX, trueImgW - cropW));
                    newPixelY = Math.max(0, Math.min(newPixelY, trueImgH - cropH));

                    if (!isNaN(newPixelX) && !isNaN(newPixelY)) {
                        setWidgetValue(this, "x", parseFloat(((newPixelX / trueImgW) * 100).toFixed(2)));
                        setWidgetValue(this, "y", parseFloat(((newPixelY / trueImgH) * 100).toFixed(2)));
                        this.setDirtyCanvas(true, true);
                    }
                }
            };

            const onMouseUp = nodeType.prototype.onMouseUp;
            nodeType.prototype.onMouseUp = function(e, localPos, canvas) {
                if (onMouseUp) onMouseUp.apply(this, arguments);
                this.isDraggingCropBox = false;
            };
        }
    }
});