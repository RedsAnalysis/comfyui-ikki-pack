import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

function imageDataToUrl(data) {
  return api.apiURL(
    `/view?filename=${encodeURIComponent(data.filename)}&type=${data.type}&subfolder=${data.subfolder}${app.getPreviewFormatParam()}${app.getRandParam()}`
  );
}

class IkkiImageComparerWidget {
  constructor(name, node) {
    this.name = name;
    this.type = "custom";
    this.node = node;
    this.hitAreas = {};
    this.selected = [];
    this._value = { images: [] };
  }

  set value(v) {
    let cleanedVal;
    if (Array.isArray(v)) {
      cleanedVal = v.map((d, i) => {
        if (!d || typeof d === "string") {
          d = { url: d, name: i === 0 ? "A" : "B", selected: true };
        }
        return d;
      });
    } else {
      cleanedVal = v.images || [];
    }

    if (cleanedVal.length > 2) {
      const hasAAndB =
        cleanedVal.some((i) => i.name.startsWith("A")) &&
        cleanedVal.some((i) => i.name.startsWith("B"));
      if (!hasAAndB) {
        cleanedVal = [cleanedVal[0], cleanedVal[1]];
      }
    }

    let selected = cleanedVal.filter((d) => d.selected);
    if (!selected.length && cleanedVal.length) {
      cleanedVal[0].selected = true;
    }

    selected = cleanedVal.filter((d) => d.selected);
    if (selected.length === 1 && cleanedVal.length > 1) {
      cleanedVal.find((d) => !d.selected).selected = true;
    }

    this._value.images = cleanedVal;
    selected = cleanedVal.filter((d) => d.selected);
    this.setSelected(selected);
  }

  get value() {
    return this._value;
  }

  setSelected(selected) {
    this._value.images.forEach((d) => (d.selected = false));
    
    // Store images internally instead of node.imgs to prevent ComfyUI's 
    // standard side-by-side renderer from triggering.
    if (!this.node.compareImgs) {
      this.node.compareImgs = [];
    }
    this.node.compareImgs.length = 0;
    this.node.imgs = []; // Ensure node.imgs stays empty for ComfyUI

    for (const sel of selected) {
      if (!sel.img) {
        sel.img = new Image();
        sel.img.src = sel.url;
        this.node.compareImgs.push(sel.img);
      }
      sel.selected = true;
    }
    this.selected = selected;
  }

  draw(ctx, node, width, y) {
    this.hitAreas = {};

    // Mode handling
    if (node.properties?.["comparer_mode"] === "Click") {
      this.drawImage(ctx, this.selected[node.isPointerDown ? 1 : 0], y);
    } else {
      this.drawImage(ctx, this.selected[0], y);
      if (node.isPointerOver) {
        this.drawImage(ctx, this.selected[1], y, node.pointerOverPos[0]);
      }
    }
  }

  drawImage(ctx, image, y, cropX) {
    if (!image?.img?.naturalWidth || !image?.img?.naturalHeight) return;

    let [nodeWidth, nodeHeight] = this.node.size;
    const imageAspect = image.img.naturalWidth / image.img.naturalHeight;
    let height = nodeHeight - y;
    const widgetAspect = nodeWidth / height;

    let targetWidth, targetHeight;
    let offsetX = 0;

    if (imageAspect > widgetAspect) {
      targetWidth = nodeWidth;
      targetHeight = nodeWidth / imageAspect;
    } else {
      targetHeight = height;
      targetWidth = height * imageAspect;
      offsetX = (nodeWidth - targetWidth) / 2;
    }

    const widthMultiplier = image.img.naturalWidth / targetWidth;
    const sourceX = 0;
    const sourceY = 0;
    const sourceWidth =
      cropX != null ? (cropX - offsetX) * widthMultiplier : image.img.naturalWidth;
    const sourceHeight = image.img.naturalHeight;
    const destX = (nodeWidth - targetWidth) / 2;
    const destY = y + (height - targetHeight) / 2;
    const destWidth = cropX != null ? cropX - offsetX : targetWidth;
    const destHeight = targetHeight;

    ctx.save();
    ctx.beginPath();
    let globalCompositeOperation = ctx.globalCompositeOperation;

    if (cropX != null) {
      ctx.rect(destX, destY, destWidth, destHeight);
      ctx.clip();
    }

    ctx.drawImage(
      image.img,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      destX,
      destY,
      destWidth,
      destHeight
    );

    // Render comparison dividing line
    if (cropX != null && cropX >= (nodeWidth - targetWidth) / 2 && cropX <= targetWidth + offsetX) {
      ctx.beginPath();
      ctx.moveTo(cropX, destY);
      ctx.lineTo(cropX, destY + destHeight);
      ctx.globalCompositeOperation = "difference";
      ctx.strokeStyle = "rgba(255, 255, 255, 1)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    ctx.globalCompositeOperation = globalCompositeOperation;
    ctx.restore();
  }

  computeSize(width) {
    return [width, 20];
  }

  serializeValue(node, index) {
    const v = [];
    for (const data of this._value.images) {
      const d = { ...data };
      delete d.img;
      v.push(d);
    }
    return { images: v };
  }
}

app.registerExtension({
  name: "Ikki.ImageComparer",
  async nodeCreated(node) {
    if (node.comfyClass === "IkkiImageComparer") {
      node.imgs = [];
      node.compareImgs = [];
      node.isPointerDown = false;
      node.isPointerOver = false;
      node.pointerOverPos = [0, 0];
      node.properties = node.properties || {};
      node.properties["comparer_mode"] = "Slide";

      node.addProperty("comparer_mode", "Slide", "enum", {
        values: ["Slide", "Click"],
      });

      // Suppress default background preview image rendering
      node.onDrawBackground = function (ctx, canvas) {
        // Left empty intentionally so standard preview images are not drawn side-by-side
      };

      node.canvasWidget = node.addCustomWidget(
        new IkkiImageComparerWidget("ikki_comparer", node)
      );

      const setIsPointerDown = (down = node.isPointerDown) => {
        const newIsDown = down && !!app.canvas.pointer_is_down;
        if (node.isPointerDown !== newIsDown) {
          node.isPointerDown = newIsDown;
          node.setDirtyCanvas(true, false);
        }
        if (node.isPointerDown) {
          requestAnimationFrame(() => setIsPointerDown());
        }
      };

      const origOnMouseDown = node.onMouseDown;
      node.onMouseDown = function (event, pos, canvas) {
        origOnMouseDown?.apply(this, arguments);
        setIsPointerDown(true);
        return false;
      };

      const origOnMouseEnter = node.onMouseEnter;
      node.onMouseEnter = function (event) {
        origOnMouseEnter?.apply(this, arguments);
        setIsPointerDown(!!app.canvas.pointer_is_down);
        node.isPointerOver = true;
      };

      const origOnMouseLeave = node.onMouseLeave;
      node.onMouseLeave = function (event) {
        origOnMouseLeave?.apply(this, arguments);
        setIsPointerDown(false);
        node.isPointerOver = false;
      };

      const origOnMouseMove = node.onMouseMove;
      node.onMouseMove = function (event, pos, canvas) {
        origOnMouseMove?.apply(this, arguments);
        node.pointerOverPos = [...pos];
      };

      const origOnExecuted = node.onExecuted;
      node.onExecuted = function (output) {
        origOnExecuted?.apply(this, arguments);

        output.a_images = output.a_images || [];
        output.b_images = output.b_images || [];

        const imagesToChoose = [];
        for (const [i, d] of output.a_images.entries()) {
          imagesToChoose.push({
            name: "A",
            selected: i === 0,
            url: imageDataToUrl(d),
          });
        }
        for (const [i, d] of output.b_images.entries()) {
          imagesToChoose.push({
            name: "B",
            selected: i === 0,
            url: imageDataToUrl(d),
          });
        }
        node.canvasWidget.value = { images: imagesToChoose };
      };
    }
  },
});