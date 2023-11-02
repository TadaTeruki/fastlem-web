import PriorityQueue from "ts-priority-queue";
import init, { run_terrain_generator } from "../rust/pkg/rust.js";
import "./style.css";

const MAX_ERODIBILITY = 0.8;
const MIN_ERODIBILITY = 0.2;

type Node = {
  x: number;
  y: number;
  erodibility: number;
  is_ocean: boolean;
};

type VoronoiPixel = {
  px: number;
  py: number;
  sqdistance: number;
  node_index: number;
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
}

function updateTerrainCanvas(nodes: Nodes) {
  let canvas = document.getElementById("canvas-terrain") as HTMLCanvasElement;
  run_terrain_generator(canvas, canvas.width, canvas.height, nodes.getNodes());
}

class EditorCanvas {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  nodes: Nodes;
  nodeCreation: boolean = false;
  pixelScale: number = 2;
  nearestBuffer: Array<Array<number>> | null = null;
  nodeChoosen: number | null = null;

  constructor() {
    this.canvas = document.getElementById("canvas-editor") as HTMLCanvasElement;
    this.ctx = this.canvas.getContext("2d") as CanvasRenderingContext2D;
    this.ctx.imageSmoothingEnabled = false;
    this.nodes = new Nodes();
    this.canvas.oncontextmenu = function () {
      return false;
    };
  }

  start() {
    const resetButton = document.getElementById(
      "button-removeall"
    ) as HTMLButtonElement;
    resetButton.addEventListener("click", () => {
      if (!confirm("Are you sure to remove all nodes?")) {
        return;
      }
      this.removeNodeAll();
    });

    const newButton = document.getElementById(
      "button-new"
    ) as HTMLCanvasElement;
    newButton.addEventListener("click", () => {
      this.nodeCreation = true;
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
      updateTerrainCanvas(this.nodes);
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
          e.clientX - this.canvas.offsetLeft,
          e.clientY - this.canvas.offsetTop
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
            e.clientX - this.canvas.offsetLeft,
            e.clientY - this.canvas.offsetTop,
            "#000",
            null,
            true
          );
        } else {
          const inearest = this.nearestNodeIndex(
            e.clientX - this.canvas.offsetLeft,
            e.clientY - this.canvas.offsetTop
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

  nearestNodeIndex(x: number, y: number) {
    // search nearest using nearestBuffer
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
    return this.nearestBuffer[py][px];
  }

  // with extra function, we can draw the nodes and the small rect
  updateContext(extra?: () => void) {
    this.drawImage();
    this.drawNodes();
    if (extra) {
      extra();
    }
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

    for (let y = 0; y < bufferHeight; y++) {
      for (let x = 0; x < bufferWidth; x++) {
        let color = [0, 0, 0];
        if (this.nodes.getNode(this.nearestBuffer[y][x]).is_ocean) {
          color = [30, 150, 255];
          if (
            x < oceanShadow ||
            y < oceanShadow ||
            !this.nodes.getNode(
              this.nearestBuffer[y - oceanShadow][x - oceanShadow]
            ).is_ocean
          ) {
            color = [15, 120, 240];
          }
        } else {
          const erodibility = this.nodes.getNode(
            this.nearestBuffer[y][x]
          ).erodibility;
          let pixel = Math.floor(120 * erodibility) + 125;
          color = [pixel, pixel, pixel];
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

  setImage() {
    if (this.nodes.getNodes().length == 0) {
      return;
    }

    let queue = new PriorityQueue({
      comparator: (a: VoronoiPixel, b: VoronoiPixel) => {
        if (a.sqdistance == b.sqdistance) {
          return a.node_index - b.node_index;
        }
        return a.sqdistance - b.sqdistance;
      },
    });

    this.nodes.getNodes().forEach((node, index) => {
      queue.queue({
        px: Math.ceil(node.x / this.pixelScale),
        py: Math.ceil(node.y / this.pixelScale),
        node_index: index,
        sqdistance: 0,
      });
    });

    let bufferWidth = Math.ceil(this.canvas.width / this.pixelScale);
    let bufferHeight = Math.ceil(this.canvas.height / this.pixelScale);

    let visited = new Array<boolean>(bufferWidth * bufferHeight);

    let nearestBuffer: Array<Array<number>> = new Array<Array<number>>(
      bufferHeight
    );
    for (let i = 0; i < bufferHeight; i++) {
      nearestBuffer[i] = new Array<number>(bufferWidth);
    }

    while (queue.length > 0) {
      let pixel = queue.dequeue();
      if (visited[pixel.px + pixel.py * bufferWidth]) continue;
      visited[pixel.px + pixel.py * bufferWidth] = true;

      nearestBuffer[pixel.py][pixel.px] = pixel.node_index;
      let node = this.nodes.getNode(pixel.node_index);
      const neighbours = [
        { x: pixel.px, y: pixel.py - 1 },
        { x: pixel.px - 1, y: pixel.py },
        { x: pixel.px + 1, y: pixel.py },
        { x: pixel.px, y: pixel.py + 1 },
      ];
      neighbours.forEach((neighbour) => {
        if (
          neighbour.x < 0 ||
          neighbour.x >= bufferWidth ||
          neighbour.y < 0 ||
          neighbour.y >= bufferHeight
        )
          return;
        let nx = neighbour.x * this.pixelScale;
        let ny = neighbour.y * this.pixelScale;
        let sqdist = Math.pow(nx - node.x, 2) + Math.pow(ny - node.y, 2);
        queue.queue({
          px: neighbour.x,
          py: neighbour.y,
          node_index: pixel.node_index,
          sqdistance: sqdist,
        });
      });
    }
    this.nearestBuffer = nearestBuffer;
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

  addNode(e: MouseEvent) {
    const inearest = this.nearestNodeIndex(
      e.clientX - this.canvas.offsetLeft,
      e.clientY - this.canvas.offsetTop
    );
    const nearest = inearest == null ? null : this.nodes.getNode(inearest);

    this.nodes.addNode({
      x: e.clientX - this.canvas.offsetLeft,
      y: e.clientY - this.canvas.offsetTop,
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
}

window.onload = async () => {
  await init();

  let editor = new EditorCanvas();
  editor.start();
};
