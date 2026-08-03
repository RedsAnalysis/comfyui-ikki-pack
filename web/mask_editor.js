import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

app.registerExtension({
    name: "ikki.MaskEditor",
    async nodeCreated(node) {
        if (node.comfyClass !== "IkkiMaskEditor") return;

        // Expanded node default dimensions
        node.size = [500, 680];
        node.latestImgUrl = null;
        node.latestMaskUrl = null;

        // Mask Lock State & Active Color State
        let isLocked = false;
        let currentColor = "#ff2828"; // Default Neon Red

        // Undo / Redo History Stack
        const undoStack = [];
        const redoStack = [];
        const MAX_HISTORY = 30;

        // Container
        const container = document.createElement("div");
        container.style.display = "flex";
        container.style.flexDirection = "column";
        container.style.alignItems = "center";
        container.style.gap = "6px";
        container.style.width = "100%";
        container.style.padding = "6px";
        container.style.boxSizing = "border-box";
        container.style.backgroundColor = "#18181c";
        container.style.borderRadius = "8px";
        container.style.color = "#fff";
        container.style.fontFamily = "sans-serif";

        // 1. VIEW MODE TOOLBAR
        const viewToolbar = document.createElement("div");
        viewToolbar.style.display = "flex";
        viewToolbar.style.gap = "6px";
        viewToolbar.style.width = "100%";
        viewToolbar.style.justifyContent = "center";

        const btnOverlay = createBtn("👁️ Overlay View", "#3a86ff", true);
        const btnBW = createBtn("🏁 B&W Mask View", "#4a4e69", false);

        viewToolbar.appendChild(btnOverlay);
        viewToolbar.appendChild(btnBW);

        // 2. BRUSH & COLOR TOOLBAR
        const drawToolbar = document.createElement("div");
        drawToolbar.style.display = "flex";
        drawToolbar.style.flexWrap = "wrap";
        drawToolbar.style.gap = "6px";
        drawToolbar.style.justifyContent = "center";
        drawToolbar.style.alignItems = "center";
        drawToolbar.style.width = "100%";

        const btnAdd = createBtn("⚪ Add Mask", "#2a9d8f", true);
        const btnRemove = createBtn("⬛ Remove Mask", "#e76f51", false);
        const btnUndo = createBtn("↩️ Undo", "#6c757d", false);
        const btnRedo = createBtn("↪️ Redo", "#6c757d", false);

        // --- SLEEK COLLAPSIBLE COLOR DOT PICKER ---
        const colorPickerContainer = document.createElement("div");
        colorPickerContainer.style.display = "flex";
        colorPickerContainer.style.alignItems = "center";
        colorPickerContainer.style.gap = "6px";
        colorPickerContainer.style.position = "relative";

        const mainColorDot = document.createElement("div");
        mainColorDot.style.width = "18px";
        mainColorDot.style.height = "18px";
        mainColorDot.style.borderRadius = "50%";
        mainColorDot.style.backgroundColor = currentColor;
        mainColorDot.style.border = "2px solid #ffffff";
        mainColorDot.style.cursor = "pointer";
        mainColorDot.style.boxShadow = "0 0 4px rgba(0,0,0,0.6)";
        mainColorDot.title = "Click to change mask color";

        const palettePopup = document.createElement("div");
        palettePopup.style.display = "none";
        palettePopup.style.flexDirection = "row";
        palettePopup.style.gap = "5px";
        palettePopup.style.backgroundColor = "#24242b";
        palettePopup.style.padding = "4px 6px";
        palettePopup.style.borderRadius = "12px";
        palettePopup.style.border = "1px solid #4a4e69";
        palettePopup.style.boxShadow = "0 4px 10px rgba(0,0,0,0.8)";
        palettePopup.style.zIndex = "100";

        const presetColors = ["#ff2828", "#39ff14", "#00e5ff", "#ffe600", "#ff007f", "#ffffff"];

        presetColors.forEach(col => {
            const dot = document.createElement("div");
            dot.style.width = "15px";
            dot.style.height = "15px";
            dot.style.borderRadius = "50%";
            dot.style.backgroundColor = col;
            dot.style.cursor = "pointer";
            dot.style.border = "1px solid rgba(255,255,255,0.7)";
            dot.style.transition = "transform 0.1s";

            dot.onmouseover = () => { dot.style.transform = "scale(1.2)"; };
            dot.onmouseout = () => { dot.style.transform = "scale(1)"; };

            dot.onclick = (e) => {
                e.stopPropagation();
                currentColor = col;
                mainColorDot.style.backgroundColor = col;
                palettePopup.style.display = "none";
                if (node.latestMaskUrl && !isLocked) {
                    renderDetectorMask(latestMaskImgObj);
                }
            };

            palettePopup.appendChild(dot);
        });

        mainColorDot.onclick = (e) => {
            e.stopPropagation();
            palettePopup.style.display = palettePopup.style.display === "none" ? "flex" : "none";
        };

        // Close palette if clicking outside
        document.addEventListener("click", () => {
            palettePopup.style.display = "none";
        });

        colorPickerContainer.appendChild(mainColorDot);
        colorPickerContainer.appendChild(palettePopup);

        drawToolbar.appendChild(btnAdd);
        drawToolbar.appendChild(btnRemove);
        drawToolbar.appendChild(colorPickerContainer); // Inserted next to brush mode
        drawToolbar.appendChild(btnUndo);
        drawToolbar.appendChild(btnRedo);

        // 3. MAIN CONTROL TOOLBAR (LOCK & SYNC)
        const controlToolbar = document.createElement("div");
        controlToolbar.style.display = "flex";
        controlToolbar.style.gap = "6px";
        controlToolbar.style.width = "100%";
        controlToolbar.style.justifyContent = "space-between";
        controlToolbar.style.marginTop = "2px";

        const btnLock = createBtn("🔓 Unlocked", "#e76f51", false);
        btnLock.style.width = "49%";
        btnLock.style.padding = "6px 8px";
        btnLock.style.fontWeight = "bold";

        const btnSync = createBtn("🔄 Sync Detector", "#4a4e69", false);
        btnSync.style.width = "49%";
        btnSync.style.padding = "6px 8px";
        btnSync.style.fontWeight = "bold";

        controlToolbar.appendChild(btnLock);
        controlToolbar.appendChild(btnSync);

        // Sliders
        const slidersDiv = document.createElement("div");
        slidersDiv.style.display = "flex";
        slidersDiv.style.gap = "10px";
        slidersDiv.style.width = "100%";
        slidersDiv.style.justifyContent = "space-between";

        const sizeControl = createSlider("Brush Size:", 1, 100, 15);
        const opacityControl = createSlider("Mask Alpha:", 10, 100, 70);

        slidersDiv.appendChild(sizeControl.container);
        slidersDiv.appendChild(opacityControl.container);

        // 4. CANVAS VIEWPORT & STACK
        const canvasViewport = document.createElement("div");
        canvasViewport.style.position = "relative";
        canvasViewport.style.width = "460px";
        canvasViewport.style.height = "460px";
        canvasViewport.style.backgroundColor = "#000";
        canvasViewport.style.borderRadius = "6px";
        canvasViewport.style.overflow = "hidden";

        const canvasWrapper = document.createElement("div");
        canvasWrapper.style.position = "absolute";
        canvasWrapper.style.left = "0";
        canvasWrapper.style.top = "0";
        canvasWrapper.style.width = "100%";
        canvasWrapper.style.height = "100%";
        canvasWrapper.style.cursor = "none";

        const imgCanvas = document.createElement("canvas");
        const maskCanvas = document.createElement("canvas");
        const cursorCanvas = document.createElement("canvas");

        [imgCanvas, maskCanvas, cursorCanvas].forEach(c => {
            c.width = 460; c.height = 460;
            c.style.position = "absolute"; c.style.left = "0"; c.style.top = "0";
            c.style.width = "100%"; c.style.height = "100%";
            canvasWrapper.appendChild(c);
        });

        cursorCanvas.style.pointerEvents = "none";
        canvasViewport.appendChild(canvasWrapper);

        container.appendChild(viewToolbar);
        container.appendChild(drawToolbar);
        container.appendChild(controlToolbar);
        container.appendChild(slidersDiv);
        container.appendChild(canvasViewport);

        node.addDOMWidget("mask_editor_layers", "canvas", container);

        let hiddenWidget = node.widgets?.find(w => w.name === "edited_mask_data");
        if (!hiddenWidget) {
            hiddenWidget = node.addWidget("text", "edited_mask_data", "", () => {}, { multiline: false });
        }
        hiddenWidget.type = "hidden";
        hiddenWidget.draw = function() {};                       
        hiddenWidget.computeSize = function() { return [0, -10]; };

        // Contexts & State
        const imgCtx = imgCanvas.getContext("2d");
        const maskCtx = maskCanvas.getContext("2d");
        const cursorCtx = cursorCanvas.getContext("2d");

        let isDrawing = false;
        let brushMode = "add";
        let viewMode = "overlay";
        let latestMaskImgObj = null;

        function hexToRgba(hex, alpha) {
            let c = hex.replace('#', '');
            if (c.length === 3) c = c.split('').map(x => x + x).join('');
            const r = parseInt(c.substring(0, 2), 16) || 255;
            const g = parseInt(c.substring(2, 4), 16) || 40;
            const b = parseInt(c.substring(4, 6), 16) || 40;
            return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        }

        function updateLockUI() {
            if (isLocked) {
                btnLock.innerText = "🔒 Mask Locked";
                btnLock.style.backgroundColor = "#10b981";
            } else {
                btnLock.innerText = "🔓 Unlocked";
                btnLock.style.backgroundColor = "#e76f51";
            }
        }

        function pushUndo() {
            if (undoStack.length >= MAX_HISTORY) undoStack.shift();
            undoStack.push(maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height));
            redoStack.length = 0;
        }

        function undo() {
            if (undoStack.length > 0) {
                redoStack.push(maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height));
                const state = undoStack.pop();
                maskCtx.putImageData(state, 0, 0);
                saveMask();
            }
        }

        function redo() {
            if (redoStack.length > 0) {
                undoStack.push(maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height));
                const state = redoStack.pop();
                maskCtx.putImageData(state, 0, 0);
                saveMask();
            }
        }

        function updateViewMode() {
            const alpha = opacityControl.input.value / 100.0;
            if (viewMode === "overlay") {
                imgCanvas.style.display = "block";
                maskCanvas.style.filter = "none";
                maskCanvas.style.opacity = alpha;
            } else if (viewMode === "bw") {
                imgCanvas.style.display = "none";
                maskCanvas.style.filter = "grayscale(100%) brightness(200%)";
                maskCanvas.style.opacity = "1.0";
            }
        }

        function saveMask() {
            const exportCanvas = document.createElement("canvas");
            exportCanvas.width = maskCanvas.width;
            exportCanvas.height = maskCanvas.height;
            const expCtx = exportCanvas.getContext("2d");

            expCtx.drawImage(maskCanvas, 0, 0);

            const imgData = expCtx.getImageData(0, 0, exportCanvas.width, exportCanvas.height);
            const data = imgData.data;
            for (let i = 0; i < data.length; i += 4) {
                const alpha = data[i + 3];
                if (alpha > 10) {
                    data[i] = 255; data[i + 1] = 255; data[i + 2] = 255; data[i + 3] = 255;
                } else {
                    data[i] = 0; data[i + 1] = 0; data[i + 2] = 0; data[i + 3] = 0;
                }
            }
            expCtx.putImageData(imgData, 0, 0);

            const dataUrl = exportCanvas.toDataURL("image/png");
            if (hiddenWidget) {
                hiddenWidget.value = dataUrl;
                if (typeof hiddenWidget.callback === "function") {
                    hiddenWidget.callback(dataUrl);
                }
            }
            node.setDirtyCanvas(true, true);
        }

        node.onSerialize = function() {
            if (isLocked) saveMask();
        };

        // ACCURATE ASPECT RATIO RESIZING WITH FULL TOOLBAR PADDING
        function adjustAspectRatio(nativeW, nativeH) {
            const maxW = 460;
            const aspect = nativeW / nativeH;
            const displayH = Math.round(maxW / aspect);

            [imgCanvas, maskCanvas, cursorCanvas].forEach(c => {
                c.width = nativeW;
                c.height = nativeH;
            });

            canvasViewport.style.width = `${maxW}px`;
            canvasViewport.style.height = `${displayH}px`;
            
            // Added +220px to account for header, 3 toolbars, sliders, and margins
            node.size = [500, displayH + 220];
        }

        function renderDetectorMask(maskImg) {
            if (!maskImg) return;
            const w = maskCanvas.width;
            const h = maskCanvas.height;
            maskCtx.clearRect(0, 0, w, h);

            const tempCanvas = document.createElement("canvas");
            tempCanvas.width = w; tempCanvas.height = h;
            const tempCtx = tempCanvas.getContext("2d");
            tempCtx.drawImage(maskImg, 0, 0, w, h);

            const imgData = tempCtx.getImageData(0, 0, w, h);
            const data = imgData.data;

            // Extract RGB from chosen color hex
            const activeRgb = hexToRgba(currentColor, 1.0);
            const rgbMatch = activeRgb.match(/\d+/g);
            const rVal = rgbMatch ? parseInt(rgbMatch[0]) : 255;
            const gVal = rgbMatch ? parseInt(rgbMatch[1]) : 40;
            const bVal = rgbMatch ? parseInt(rgbMatch[2]) : 40;

            for (let i = 0; i < data.length; i += 4) {
                const val = data[i];
                if (val > 128) {
                    data[i]     = rVal;
                    data[i + 1] = gVal;
                    data[i + 2] = bVal;
                    data[i + 3] = 255;
                } else {
                    data[i] = 0; data[i + 1] = 0; data[i + 2] = 0;
                    data[i + 3] = 0;
                }
            }
            maskCtx.putImageData(imgData, 0, 0);
        }

        function loadLayers(imgUrl, maskUrl) {
            if (!imgUrl || !maskUrl) return;

            const imgPromise = new Promise((resolve) => {
                const img = new Image();
                img.crossOrigin = "anonymous";
                img.onload = () => resolve(img);
                img.src = imgUrl;
            });

            const maskPromise = new Promise((resolve) => {
                const maskImg = new Image();
                maskImg.crossOrigin = "anonymous";
                maskImg.onload = () => resolve(maskImg);
                maskImg.src = maskUrl;
            });

            Promise.all([imgPromise, maskPromise]).then(([img, maskImg]) => {
                latestMaskImgObj = maskImg;
                adjustAspectRatio(img.naturalWidth, img.naturalHeight);

                imgCtx.clearRect(0, 0, imgCanvas.width, imgCanvas.height);
                imgCtx.drawImage(img, 0, 0, imgCanvas.width, imgCanvas.height);

                if (!isLocked) {
                    if (hiddenWidget) hiddenWidget.value = "";
                    renderDetectorMask(maskImg);
                    undoStack.length = 0;
                    redoStack.length = 0;
                }

                updateViewMode();
            });
        }

        function handleExecutionData(data) {
            if (data && data.length >= 2) {
                node.latestImgUrl = api.apiURL(`/view?filename=${data[0].filename}&type=${data[0].type}&subfolder=${data[0].subfolder}`);
                node.latestMaskUrl = api.apiURL(`/view?filename=${data[1].filename}&type=${data[1].type}&subfolder=${data[1].subfolder}`);
                
                if (!isLocked) {
                    loadLayers(node.latestImgUrl, node.latestMaskUrl);
                }
            }
        }

        node.onExecuted = function(message) {
            if (message && message.ikki_editor_data) handleExecutionData(message.ikki_editor_data);
        };

        api.addEventListener("executed", (evt) => {
            if (evt.detail && String(evt.detail.node) === String(node.id)) {
                if (evt.detail.output && evt.detail.output.ikki_editor_data) {
                    handleExecutionData(evt.detail.output.ikki_editor_data);
                }
            }
        });

        // -------------------------------------------------------------
        // DYNAMIC PREVIEW CURSOR ENGINE
        // -------------------------------------------------------------
        function getPos(e) {
            const rect = maskCanvas.getBoundingClientRect();
            const scaleX = maskCanvas.width / rect.width;
            const scaleY = maskCanvas.height / rect.height;

            return {
                x: (e.clientX - rect.left) * scaleX,
                y: (e.clientY - rect.top) * scaleY
            };
        }

        function drawCursor(e) {
            const pos = getPos(e);
            cursorCtx.clearRect(0, 0, cursorCanvas.width, cursorCanvas.height);

            const radius = sizeControl.input.value / 2;

            cursorCtx.beginPath();
            cursorCtx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
            if (brushMode === "add") {
                cursorCtx.fillStyle = hexToRgba(currentColor, 0.4);
            } else {
                cursorCtx.fillStyle = "rgba(0, 229, 255, 0.4)";
            }
            cursorCtx.fill();
        }

        function draw(e) {
            drawCursor(e);

            if (!isDrawing) return;

            const pos = getPos(e);
            const size = sizeControl.input.value;
            maskCtx.lineWidth = size;
            maskCtx.lineCap = "round";
            maskCtx.lineJoin = "round";

            if (brushMode === "add") {
                maskCtx.globalCompositeOperation = "source-over";
                maskCtx.strokeStyle = currentColor;
                maskCtx.lineTo(pos.x, pos.y);
                maskCtx.stroke();
                maskCtx.beginPath();
                maskCtx.moveTo(pos.x, pos.y);
            } else if (brushMode === "remove") {
                maskCtx.globalCompositeOperation = "destination-out";
                maskCtx.strokeStyle = "rgba(0,0,0,1)";
                maskCtx.lineTo(pos.x, pos.y);
                maskCtx.stroke();
                maskCtx.beginPath();
                maskCtx.moveTo(pos.x, pos.y);
            }
        }

        canvasWrapper.addEventListener("mouseenter", (e) => drawCursor(e));
        canvasWrapper.addEventListener("mouseleave", () => cursorCtx.clearRect(0, 0, cursorCanvas.width, cursorCanvas.height));

        canvasWrapper.addEventListener("mousedown", (e) => {
            pushUndo();
            isDrawing = true;
            
            if (!isLocked) {
                isLocked = true;
                updateLockUI();
            }

            maskCtx.beginPath();
            draw(e);
        });

        canvasWrapper.addEventListener("mousemove", draw);
        window.addEventListener("mouseup", () => {
            if (isDrawing) {
                isDrawing = false;
                maskCtx.beginPath();
                saveMask();
            }
        });

        // BUTTON ACTIONS
        btnOverlay.onclick = () => { viewMode = "overlay"; setActive(btnOverlay, [btnBW]); updateViewMode(); };
        btnBW.onclick = () => { viewMode = "bw"; setActive(btnBW, [btnOverlay]); updateViewMode(); };

        btnAdd.onclick = () => { brushMode = "add"; setActive(btnAdd, [btnRemove]); };
        btnRemove.onclick = () => { brushMode = "remove"; setActive(btnRemove, [btnAdd]); };

        btnLock.onclick = () => {
            isLocked = !isLocked;
            updateLockUI();
            if (isLocked) saveMask();
        };

        btnSync.onclick = () => {
            isLocked = false;
            updateLockUI();
            if (hiddenWidget) hiddenWidget.value = "";
            if (node.latestMaskUrl && node.latestImgUrl) {
                loadLayers(node.latestImgUrl, node.latestMaskUrl);
            }
        };

        btnUndo.onclick = undo;
        btnRedo.onclick = redo;

        opacityControl.input.oninput = updateViewMode;

        // Helpers
        function createBtn(text, color, active) {
            const btn = document.createElement("button");
            btn.innerText = text;
            btn.style.padding = "4px 6px";
            btn.style.border = "none";
            btn.style.borderRadius = "4px";
            btn.style.backgroundColor = active ? "#3a86ff" : color;
            btn.style.color = "#fff";
            btn.style.cursor = "pointer";
            btn.style.fontSize = "11px";
            return btn;
        }

        function setActive(activeBtn, otherBtns) {
            activeBtn.style.backgroundColor = "#3a86ff";
            otherBtns.forEach(b => b.style.backgroundColor = "#4a4e69");
        }

        function createSlider(label, min, max, val) {
            const div = document.createElement("div");
            div.style.display = "flex";
            div.style.alignItems = "center";
            div.style.gap = "4px";

            const lbl = document.createElement("span");
            lbl.innerText = label;
            lbl.style.fontSize = "11px";

            const input = document.createElement("input");
            input.type = "range";
            input.min = min; input.max = max; input.value = val;
            input.style.width = "75px";

            const numInput = document.createElement("input");
            numInput.type = "number";
            numInput.min = min; numInput.max = max; numInput.value = val;
            numInput.style.width = "38px";
            numInput.style.backgroundColor = "#2a2a32";
            numInput.style.color = "#fff";
            numInput.style.border = "1px solid #4a4e69";
            numInput.style.borderRadius = "3px";
            numInput.style.fontSize = "11px";
            numInput.style.textAlign = "center";

            input.addEventListener("input", () => {
                numInput.value = input.value;
            });

            numInput.addEventListener("input", () => {
                let clamped = Math.min(max, Math.max(min, Number(numInput.value) || min));
                input.value = clamped;
                input.dispatchEvent(new Event("input"));
            });

            div.appendChild(lbl);
            div.appendChild(input);
            div.appendChild(numInput);
            return { container: div, input: input, numInput: numInput };
        }

        updateLockUI();
        updateViewMode();
    }
});