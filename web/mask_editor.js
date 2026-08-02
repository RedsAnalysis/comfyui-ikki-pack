import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

app.registerExtension({
    name: "ikki.MaskEditor",
    async nodeCreated(node) {
        if (node.comfyClass !== "IkkiMaskEditor") return;

        node.size = [440, 580];
        node.latestImgUrl = null;
        node.latestMaskUrl = null;

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

        // 2. BRUSH & ACTION TOOLBAR
        const drawToolbar = document.createElement("div");
        drawToolbar.style.display = "flex";
        drawToolbar.style.flexWrap = "wrap";
        drawToolbar.style.gap = "4px";
        drawToolbar.style.justifyContent = "center";
        drawToolbar.style.width = "100%";

        const btnAdd = createBtn("⚪ Add Mask Brush", "#2a9d8f", true);
        const btnRemove = createBtn("⬛ Remove Mask Brush", "#e76f51", false);
        const btnUndo = createBtn("↩️ Undo", "#6c757d", false);
        const btnRedo = createBtn("↪️ Redo", "#6c757d", false);
        const btnReset = createBtn("🔄 Reset Base", "#e63946", false);

        // BIG DISTINCT GREEN PRIMARY BUTTON
        const btnSend = createBtn("🚀 Send & Queue Inpaint", "#10b981", false);
        btnSend.style.width = "100%";              // Spans full toolbar width
        btnSend.style.padding = "8px 12px";        // Bigger touch target
        btnSend.style.fontSize = "12px";          // Larger font size
        btnSend.style.fontWeight = "bold";         // Bold text
        btnSend.style.marginTop = "2px";
        btnSend.style.boxShadow = "0 2px 5px rgba(0, 0, 0, 0.4)"; // Subtle drop shadow

        drawToolbar.appendChild(btnAdd);
        drawToolbar.appendChild(btnRemove);
        drawToolbar.appendChild(btnUndo);
        drawToolbar.appendChild(btnRedo);
        drawToolbar.appendChild(btnReset);
        drawToolbar.appendChild(btnSend); // Appended once at bottom

        // Sliders
        const slidersDiv = document.createElement("div");
        slidersDiv.style.display = "flex";
        slidersDiv.style.gap = "10px";
        slidersDiv.style.width = "100%";
        slidersDiv.style.justifyContent = "space-between";

        const sizeControl = createSlider("Brush Size:", 1, 100, 25);
        const opacityControl = createSlider("Mask Alpha:", 10, 100, 70);

        slidersDiv.appendChild(sizeControl.container);
        slidersDiv.appendChild(opacityControl.container);

        // 3. CANVAS VIEWPORT & STACK
        const canvasViewport = document.createElement("div");
        canvasViewport.style.position = "relative";
        canvasViewport.style.width = "400px";
        canvasViewport.style.height = "400px";
        canvasViewport.style.backgroundColor = "#000";
        canvasViewport.style.borderRadius = "6px";
        canvasViewport.style.overflow = "hidden";

        const canvasWrapper = document.createElement("div");
        canvasWrapper.style.position = "absolute";
        canvasWrapper.style.left = "0";
        canvasWrapper.style.top = "0";
        canvasWrapper.style.width = "100%";
        canvasWrapper.style.height = "100%";
        canvasWrapper.style.cursor = "none"; // Hide default OS cursor

        const imgCanvas = document.createElement("canvas");
        const maskCanvas = document.createElement("canvas");   // EDITABLE MASK CANVAS
        const cursorCanvas = document.createElement("canvas"); // BRUSH RING CANVAS

        [imgCanvas, maskCanvas, cursorCanvas].forEach(c => {
            c.width = 400; c.height = 400;
            c.style.position = "absolute"; c.style.left = "0"; c.style.top = "0";
            c.style.width = "100%"; c.style.height = "100%";
            canvasWrapper.appendChild(c);
        });

        cursorCanvas.style.pointerEvents = "none";
        canvasViewport.appendChild(canvasWrapper);

        container.appendChild(viewToolbar);
        container.appendChild(drawToolbar);
        container.appendChild(slidersDiv);
        container.appendChild(canvasViewport);

        node.addDOMWidget("mask_editor_layers", "canvas", container);

        // Suppress raw text widget from drawing on LiteGraph node UI
        let hiddenWidget = node.widgets?.find(w => w.name === "edited_mask_data");
        if (!hiddenWidget) {
            hiddenWidget = node.addWidget("text", "edited_mask_data", "", () => {}, { multiline: false });
        }
        hiddenWidget.type = "hidden";
        hiddenWidget.draw = function() {};                       // Zero rendering
        hiddenWidget.computeSize = function() { return [0, -10]; }; // Zero height

        // Contexts
        const imgCtx = imgCanvas.getContext("2d");
        const maskCtx = maskCanvas.getContext("2d");
        const cursorCtx = cursorCanvas.getContext("2d");

        let isDrawing = false;
        let brushMode = "add";    // "add" or "remove"
        let viewMode = "overlay"; // "overlay" or "bw"

        // History Stack Engine
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
            }
        }

        function redo() {
            if (redoStack.length > 0) {
                undoStack.push(maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height));
                const state = redoStack.pop();
                maskCtx.putImageData(state, 0, 0);
            }
        }

        // View Mode Toggle
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

        // Export Mask State ONLY when clicking "Send & Queue Inpaint"
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

        // Resizing to Match Input Aspect Ratio
        function adjustAspectRatio(nativeW, nativeH) {
            const maxW = 400;
            const aspect = nativeW / nativeH;
            const displayH = Math.round(maxW / aspect);

            [imgCanvas, maskCanvas, cursorCanvas].forEach(c => {
                c.width = nativeW;
                c.height = nativeH;
            });

            canvasViewport.style.width = `${maxW}px`;
            canvasViewport.style.height = `${displayH}px`;
            node.size = [440, displayH + 160];
        }

        // Render Detector Mask
        function renderDetectorMask(maskImg) {
            const w = maskCanvas.width;
            const h = maskCanvas.height;
            maskCtx.clearRect(0, 0, w, h);

            const tempCanvas = document.createElement("canvas");
            tempCanvas.width = w; tempCanvas.height = h;
            const tempCtx = tempCanvas.getContext("2d");
            tempCtx.drawImage(maskImg, 0, 0, w, h);

            const imgData = tempCtx.getImageData(0, 0, w, h);
            const data = imgData.data;

            for (let i = 0; i < data.length; i += 4) {
                const val = data[i];
                if (val > 128) {
                    data[i]     = 255; // Red
                    data[i + 1] = 40;  // Green
                    data[i + 2] = 40;  // Blue
                    data[i + 3] = 255; // Solid Alpha
                } else {
                    data[i] = 0; data[i + 1] = 0; data[i + 2] = 0;
                    data[i + 3] = 0; // Transparent
                }
            }
            maskCtx.putImageData(imgData, 0, 0);
        }

        // ALWAYS load fresh detector mask on every execution run
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
                adjustAspectRatio(img.naturalWidth, img.naturalHeight);

                // Render Background Crop
                imgCtx.clearRect(0, 0, imgCanvas.width, imgCanvas.height);
                imgCtx.drawImage(img, 0, 0, imgCanvas.width, imgCanvas.height);

                // ALWAYS render fresh detector mask & clear widget cache
                if (hiddenWidget) hiddenWidget.value = "";
                renderDetectorMask(maskImg);
                undoStack.length = 0;
                redoStack.length = 0;

                updateViewMode();
            });
        }

        // Execution Handler
        function handleExecutionData(data) {
            if (data && data.length >= 2) {
                node.latestImgUrl = api.apiURL(`/view?filename=${data[0].filename}&type=${data[0].type}&subfolder=${data[0].subfolder}`);
                node.latestMaskUrl = api.apiURL(`/view?filename=${data[1].filename}&type=${data[1].type}&subfolder=${data[1].subfolder}`);
                loadLayers(node.latestImgUrl, node.latestMaskUrl);
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
        // DIRECT 1:1 DRAWING ENGINE & CURSOR INDICATOR
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
            cursorCtx.strokeStyle = "#FFFFFF";
            cursorCtx.lineWidth = 2 * (maskCanvas.width / canvasViewport.clientWidth);
            cursorCtx.stroke();

            cursorCtx.beginPath();
            cursorCtx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
            cursorCtx.strokeStyle = "#000000";
            cursorCtx.lineWidth = 1 * (maskCanvas.width / canvasViewport.clientWidth);
            cursorCtx.stroke();
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
                maskCtx.strokeStyle = "#ff2828";
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
            maskCtx.beginPath();
            draw(e);
        });

        canvasWrapper.addEventListener("mousemove", draw);
        window.addEventListener("mouseup", () => {
            if (isDrawing) {
                isDrawing = false;
                maskCtx.beginPath();
            }
        });

        // BUTTON ACTIONS
        btnOverlay.onclick = () => { viewMode = "overlay"; setActive(btnOverlay, [btnBW]); updateViewMode(); };
        btnBW.onclick = () => { viewMode = "bw"; setActive(btnBW, [btnOverlay]); updateViewMode(); };

        btnAdd.onclick = () => { brushMode = "add"; setActive(btnAdd, [btnRemove]); };
        btnRemove.onclick = () => { brushMode = "remove"; setActive(btnRemove, [btnAdd]); };

        btnSend.onclick = () => {
            saveMask();
            btnSend.style.backgroundColor = "#059669"; // Darker green while active
            btnSend.innerText = "⚡ Queueing Inpaint...";
            app.queuePrompt();
            setTimeout(() => {
                btnSend.style.backgroundColor = "#10b981"; // Resets back to emerald green
                btnSend.innerText = "🚀 Send & Queue Inpaint";
            }, 1500);
        };

        btnUndo.onclick = undo;
        btnRedo.onclick = redo;

        btnReset.onclick = () => {
            if (hiddenWidget) hiddenWidget.value = "";
            if (node.latestMaskUrl) loadLayers(node.latestImgUrl, node.latestMaskUrl);
        };

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

        updateViewMode();
    }
});