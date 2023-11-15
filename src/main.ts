import init, {
  run_terrain_generator,
  nearest_node_buffer,
  TerrainObject,
} from "./rust/pkg/rust.js";
import "./style.css";

const MAX_ERODIBILITY = 1.25;
const MIN_ERODIBILITY = 0.1;
const NODES_NUM = 30000;
const MAX_ALTITUDE = 100.0;
const MAX_SHADOW_ALTITUDE = 5.0;
const SHADOW_INDEX_DIST = 1;
const CLOP_EDGE_PIXELS = 3;

type Node = {
  x: number;
  y: number;
  erodibility: number;
  is_ocean: boolean;
};

class Nodes {
  nodes: Array<Node>;
  constructor() {
    this.nodes = new Array<Node>();
  }

  addNode(node: Node) {
    this.nodes.push(node);
  }

  getNode(index: number) {
    return this.nodes[index];
  }

  getNodes() {
    return this.nodes;
  }

  deleteNode(index: number) {
    this.nodes.splice(index, 1);
  }

  length() {
    return this.nodes.length;
  }

  createJson() {
    return JSON.stringify(this.nodes);
  }
}

class Colormap {
  colors: Array<[number, number, number]>;
  weights: Array<number>;
  constructor(colors: Array<[number, number, number]>, weights: Array<number>) {
    this.colors = colors;
    this.weights = weights;
  }

  getColor(value: number) {
    let i = 0;
    while (i < this.weights.length && value > this.weights[i]) {
      i++;
    }
    if (i == 0) {
      return this.colors[0];
    }
    if (i == this.weights.length) {
      return this.colors[this.colors.length - 1];
    }
    const color1 = this.colors[i - 1];
    const color2 = this.colors[i];
    const weight1 = this.weights[i - 1];
    const weight2 = this.weights[i];
    const ratio = (value - weight1) / (weight2 - weight1);
    return [
      Math.floor(color1[0] * (1 - ratio) + color2[0] * ratio),
      Math.floor(color1[1] * (1 - ratio) + color2[1] * ratio),
      Math.floor(color1[2] * (1 - ratio) + color2[2] * ratio),
    ];
  }
}

class Buffer {
  buffer: Array<number>;
  width: number;

  constructor(buffer: Array<number>, width: number) {
    this.buffer = buffer;
    this.width = width;
  }

  get(x: number, y: number) {
    return this.buffer[y * this.width + x];
  }

  set(x: number, y: number, value: number) {
    this.buffer[y * this.width + x] = value;
  }
}

class TerrainData {
  surfaceWidth: number;
  surfaceHeight: number;
  cropEdgePixels: number;
  shadowIndexDist: number;
  nodeNum: number;
  terrainObject: TerrainObject | null = null;

  constructor(
    imageWidth: number,
    imageHeight: number,
    cropEdgePixels: number,
    shadowIndexDist: number,
    nodeNum: number
  ) {
    this.surfaceWidth = imageWidth;
    this.surfaceHeight = imageHeight;
    this.cropEdgePixels = cropEdgePixels;
    this.shadowIndexDist = shadowIndexDist;
    this.nodeNum = nodeNum;
    this.terrainObject = null;
  }

  render(nodes: Nodes) {
    this.terrainObject = run_terrain_generator(
      this.surfaceWidth + this.cropEdgePixels * 2 + this.shadowIndexDist,
      this.surfaceHeight + this.cropEdgePixels * 2 + this.shadowIndexDist,
      NODES_NUM,
      3,
      nodes.getNodes()
    );
    return this;
  }

  createImageData(
    colormap: Colormap,
    shadow: boolean,
    outputWidth: number = this.surfaceWidth,
    outputHeight: number = this.surfaceHeight
  ) {
    const imageData = new ImageData(outputWidth, outputHeight);
    for (let imgx = 0; imgx < outputWidth; imgx++) {
      for (let imgy = 0; imgy < outputHeight; imgy++) {
        const x =
          ((imgx + this.cropEdgePixels) * this.surfaceWidth) / outputWidth;
        const y =
          ((imgy + this.cropEdgePixels) * this.surfaceHeight) / outputHeight;
        const altitude = this.terrainObject!.get_altitude(x, y);
        const prop = altitude / MAX_ALTITUDE;
        const color = colormap.getColor(prop);

        let brightness = 1.0;

        if (shadow) {
          const altitude2 = this.terrainObject!.get_altitude(
            x + this.shadowIndexDist,
            y + this.shadowIndexDist
          );
          brightness =
            1.0 -
            Math.atan((altitude - altitude2) / MAX_SHADOW_ALTITUDE) /3.14 +
            0.05 * Math.random();
        }

        const imageIndex = imgy * outputWidth + imgx;

        imageData.data[imageIndex * 4 + 0] = color[0] * brightness;
        imageData.data[imageIndex * 4 + 1] = color[1] * brightness;
        imageData.data[imageIndex * 4 + 2] = color[2] * brightness;
        imageData.data[imageIndex * 4 + 3] = 255;
      }
    }
    return imageData;
  }
}

class EditorCanvas {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  nodes: Nodes;
  nodeCreation: boolean = false;
  pixelScale: number = 1;
  nearestBuffer: Buffer | null = null;
  nodeChoosen: number | null = null;
  terrainData: TerrainData;

  constructor() {
    this.canvas = document.getElementById("canvas-editor") as HTMLCanvasElement;
    this.ctx = this.canvas.getContext("2d") as CanvasRenderingContext2D;
    this.ctx.imageSmoothingEnabled = false;
    this.nodes = new Nodes();
    this.canvas.oncontextmenu = function () {
      return false;
    };
    this.terrainData = new TerrainData(
      this.canvas.width,
      this.canvas.height,
      CLOP_EDGE_PIXELS,
      SHADOW_INDEX_DIST,
      NODES_NUM
    );
  }

  getCursorX(e: MouseEvent) {
    const rect = this.canvas.getBoundingClientRect();
    return e.clientX - rect.left;
  }

  getCursorY(e: MouseEvent) {
    const rect = this.canvas.getBoundingClientRect();
    return e.clientY - rect.top;
  }

  nearestNodeIndex(x: number, y: number) {
    if (this.nearestBuffer == null) {
      return null;
    }
    let bufferWidth = Math.ceil(this.canvas.width / this.pixelScale);
    let bufferHeight = Math.ceil(this.canvas.height / this.pixelScale);
    let px = Math.floor(x / this.pixelScale);
    let py = Math.floor(y / this.pixelScale);
    if (px < 0 || px >= bufferWidth || py < 0 || py >= bufferHeight) {
      return null;
    }
    return this.nearestBuffer.get(px, py);
  }

  addNode(e: MouseEvent) {
    const inearest = this.nearestNodeIndex(
      this.getCursorX(e),
      this.getCursorY(e)
    );
    const nearest = inearest == null ? null : this.nodes.getNode(inearest);

    this.nodes.addNode({
      x: this.getCursorX(e),
      y: this.getCursorY(e),
      erodibility: nearest
        ? nearest.erodibility
        : (MAX_ERODIBILITY + MIN_ERODIBILITY) / 2,
      is_ocean: nearest ? nearest.is_ocean : false,
    });
    this.nodeChoosen = this.nodes.getNodes().length - 1;
  }

  removeNodeAll() {
    this.nodes = new Nodes();
    this.nearestBuffer = null;
    this.updateContext();
  }

  updateContext(extra?: () => void) {
    this.drawImage();
    this.drawNodes();
    if (extra) {
      extra();
    }
  }

  loadTemplate(i: number) {
    fetch("template" + i + ".json")
      .then((response) => response.json())
      .then((data) => {
        this.nodes = new Nodes();
        data.forEach((node: Node) => {
          this.nodes.addNode(node);
        });
        this.setImage();
        this.updateContext();
        this.nodeChoosen = null;
        this.nodeCreation = false;
      });
  }

  start() {
    // load templates
    const templateNum = 3;
    for (let i = 1; i <= templateNum; i++) {
      const templateButton = document.getElementById(
        "button-template" + i
      ) as HTMLButtonElement;
      templateButton.addEventListener("click", () => {
        if (
          !confirm(
            "Are you sure to load this template? All nodes will be removed."
          )
        ) {
          return;
        }
        this.loadTemplate(i);
      });
    }

    this.loadTemplate(1);

    const removeButton = document.getElementById(
      "button-remove"
    ) as HTMLButtonElement;
    removeButton.addEventListener("click", () => {
      if (this.nodeChoosen != null) {
        this.nodes.deleteNode(this.nodeChoosen);
        if (this.nodes.getNodes().length == 0) {
          this.removeNodeAll();
        }
        this.nodeChoosen = null;
        this.nodeCreation = false;
        this.setImage();
        this.updateContext();
      }
    });

    const resetButton = document.getElementById(
      "button-removeall"
    ) as HTMLButtonElement;
    resetButton.addEventListener("click", () => {
      if (!confirm("Are you sure to remove all nodes?")) {
        return;
      }
      this.removeNodeAll();
      this.nodeChoosen = null;
      this.nodeCreation = false;
    });

    const newButton = document.getElementById(
      "button-new"
    ) as HTMLCanvasElement;
    newButton.addEventListener("click", () => {
      this.nodeCreation = true;
    });

    const saveButton = document.getElementById(
      "button-save"
    ) as HTMLCanvasElement;
    saveButton.addEventListener("click", () => {
      const resolution = document.getElementById(
        "resolution"
      ) as HTMLInputElement;
      this.saveImageGrayscale(parseInt(resolution.value));
    });

    const erodibilitySlider = document.getElementById(
      "erodibility-slider"
    ) as HTMLInputElement;
    erodibilitySlider.addEventListener("input", () => {
      if (this.nodeChoosen != null) {
        const erodibilityRatio = parseFloat(erodibilitySlider.value) / 100;
        this.nodes.getNode(this.nodeChoosen).erodibility =
          MIN_ERODIBILITY +
          erodibilityRatio * (MAX_ERODIBILITY - MIN_ERODIBILITY);
        this.updateContext();
      }
    });

    erodibilitySlider.addEventListener("change", () => {
      if (this.nodeChoosen != null) {
        this.setImage();
        this.updateContext();
      }
    });

    const oceanCheckbox = document.getElementById(
      "ocean-checkbox"
    ) as HTMLInputElement;
    oceanCheckbox.addEventListener("change", () => {
      if (this.nodeChoosen != null) {
        this.nodes.getNode(this.nodeChoosen).is_ocean = oceanCheckbox.checked;
        this.updateContext();
      }
    });

    const startButton = document.getElementById(
      "button-start"
    ) as HTMLButtonElement;
    startButton.addEventListener("click", () => {
      this.terrainData.render(this.nodes);

      const colormap = new Colormap(
        [
          [70, 150, 200],
          [240, 240, 210],
          [190, 200, 120],
          [25, 100, 25],
          [15, 60, 15],
        ],
        [0.0, 0.001, 0.015, 0.3, 0.5]
      );

      let imageData = this.terrainData.createImageData(colormap, true);

      let canvas = document.getElementById(
        "canvas-terrain"
      ) as HTMLCanvasElement;
      let ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
      ctx.putImageData(imageData, 0, 0);
    });

    this.canvas.addEventListener("mousedown", (e) => {
      if (this.nodeCreation) {
        this.addNode(e);
        if (e.button == 0) {
          this.nodeCreation = false;
        }

        setTimeout(() => {
          this.setImage();
          this.updateContext();
        }, 0);

        this.updateContext();
      } else {
        const inearest = this.nearestNodeIndex(
          this.getCursorX(e),
          this.getCursorY(e)
        );
        if (inearest != null) {
          this.nodeChoosen = inearest;
        }
      }

      if (this.nodeChoosen != null) {
        const erodibilityRatio =
          (this.nodes.getNode(this.nodeChoosen).erodibility - MIN_ERODIBILITY) /
          (MAX_ERODIBILITY - MIN_ERODIBILITY);
        erodibilitySlider.value = (erodibilityRatio * 100).toString();
        oceanCheckbox.checked = this.nodes.getNode(this.nodeChoosen).is_ocean;
      }

      this.updateContext();
    });

    this.canvas.addEventListener("keydown", (e) => {
      if (e.key == "Delete" && this.nodeChoosen != null) {
        this.nodes.deleteNode(this.nodeChoosen);
        this.nodeChoosen = null;
        this.setImage();
        this.updateContext();
      }
      if (e.key == "Escape") {
        if (this.nodeCreation) {
          this.nodeCreation = false;
        } else if (this.nodeChoosen != null) {
          this.nodeChoosen = null;
        }

        this.updateContext();
      }
    });

    this.canvas.addEventListener("mousemove", (e) => {
      this.updateContext(() => {
        if (this.nodeCreation) {
          this.drawSmallRect(
            this.getCursorX(e),
            this.getCursorY(e),
            "#000",
            null,
            true
          );
        } else {
          const inearest = this.nearestNodeIndex(
            this.getCursorX(e),
            this.getCursorY(e)
          );
          if (inearest != null && this.nodeChoosen != null) {
            const nearest = this.nodes.getNode(inearest);
            this.drawSmallRect(nearest.x, nearest.y, "#f33", null, false);
          }
        }
      });
    });

    this.canvas.addEventListener("mouseleave", () => {
      this.updateContext();
    });

    this.updateContext();
  }

  drawImage() {
    if (this.nearestBuffer == null) {
      this.ctx.fillStyle = "#aaa";
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      return;
    }
    let resizedArrayBuffer = new ArrayBuffer(
      this.canvas.width * this.canvas.height * 4
    );
    const resizedPixels = new Uint8ClampedArray(resizedArrayBuffer);
    let bufferWidth = Math.ceil(this.canvas.width / this.pixelScale);
    let bufferHeight = Math.ceil(this.canvas.height / this.pixelScale);

    const oceanShadow = 2;

    const colormap = new Colormap(
      [
        [190, 200, 120],
        [180, 200, 80],
        [25, 100, 25],
      ],
      [0.0, 0.2, 1.0]
    );

    for (let y = 0; y < bufferHeight; y++) {
      for (let x = 0; x < bufferWidth; x++) {
        let color = [0, 0, 0];
        if (this.nodes.getNode(this.nearestBuffer.get(x, y)).is_ocean) {
          color = [30, 150, 255];
          if (
            x < oceanShadow ||
            y < oceanShadow ||
            !this.nodes.getNode(
              this.nearestBuffer.get(x - oceanShadow, y - oceanShadow)
            ).is_ocean
          ) {
            color = [15, 120, 240];
          }
        } else {
          const erodibility = this.nodes.getNode(
            this.nearestBuffer.get(x, y)
          ).erodibility;

          const erodibilityRatio =
            (erodibility - MIN_ERODIBILITY) /
            (MAX_ERODIBILITY - MIN_ERODIBILITY);

          color = colormap.getColor(1.0 - erodibilityRatio);
        }

        for (let k = 0; k < this.pixelScale; k++) {
          for (let l = 0; l < this.pixelScale; l++) {
            resizedPixels[
              (x * this.pixelScale + k) * 4 +
                (y * this.pixelScale + l) * this.canvas.width * 4
            ] = color[0];
            resizedPixels[
              (x * this.pixelScale + k) * 4 +
                (y * this.pixelScale + l) * this.canvas.width * 4 +
                1
            ] = color[1];
            resizedPixels[
              (x * this.pixelScale + k) * 4 +
                (y * this.pixelScale + l) * this.canvas.width * 4 +
                2
            ] = color[2];
            resizedPixels[
              (x * this.pixelScale + k) * 4 +
                (y * this.pixelScale + l) * this.canvas.width * 4 +
                3
            ] = 255;
          }
        }
      }
    }

    const imageData = new ImageData(
      resizedPixels,
      this.canvas.width,
      this.canvas.height
    );
    this.ctx.putImageData(imageData, 0, 0);
  }

  saveImageGrayscale(width: number) {
    let imageData = this.terrainData.createImageData(
      new Colormap(
        [
          [0, 0, 0],
          [255, 255, 255],
        ],
        [0.0, 1.0]
      ),
      false,
      width,
      width
    );

    let canvas = document.createElement("canvas") as HTMLCanvasElement;
    canvas.width = width;
    canvas.height = width;

    let ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
    ctx.putImageData(imageData, 0, 0);

    let img = new Image();
    img.src = canvas.toDataURL("image/png");

    img.onload = function () {
      var link = document.createElement("a");
      link.href = img.src;
      link.download = "terrain.png";
      link.click();
    };
  }

  setImage() {
    if (this.nodes.getNodes().length == 0) {
      return;
    }

    let bufferWidth = Math.ceil(this.canvas.width / this.pixelScale);
    let bufferHeight = Math.ceil(this.canvas.height / this.pixelScale);

    let buffer = nearest_node_buffer(
      bufferWidth,
      bufferHeight,
      this.pixelScale,
      this.nodes.getNodes()
    );

    this.nearestBuffer = new Buffer(Array.from(buffer), bufferWidth);
  }

  drawSmallRect(
    x: number,
    y: number,
    colorStroke: string | null,
    colorFill: string | null,
    line: boolean,
    shadow: boolean = true
  ) {
    const rectSize = 12;
    const shadowSize = 2;
    const innerWidth = 3;
    if (line) {
      this.ctx.strokeStyle = "#fff";
      this.ctx.beginPath();
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(this.canvas.width, y);
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, this.canvas.height);
      this.ctx.stroke();
    }
    if (colorFill != null) {
      if (shadow) {
        this.ctx.fillStyle = "#0002";
        this.ctx.fillRect(
          x - rectSize / 2 + shadowSize,
          y - rectSize / 2 + shadowSize,
          rectSize,
          rectSize
        );
      }
      this.ctx.fillStyle = colorFill;
      this.ctx.fillRect(x - rectSize / 2, y - rectSize / 2, rectSize, rectSize);
    }
    if (colorStroke != null) {
      this.ctx.strokeStyle = colorStroke;

      this.ctx.lineWidth = innerWidth;
      this.ctx.strokeRect(
        x - rectSize / 2 + innerWidth / 2,
        y - rectSize / 2 + innerWidth / 2,
        rectSize - innerWidth,
        rectSize - innerWidth
      );
    }
  }

  drawNodes() {
    this.nodes.getNodes().forEach((node, index) => {
      let color = "#000";
      if (this.nodeChoosen != null && index == this.nodeChoosen) {
        color = "#f33";
      }
      this.drawSmallRect(node.x, node.y, null, color, false);
    });
  }
}

window.onload = async () => {
  await init();

  let editor = new EditorCanvas();
  editor.start();
};
