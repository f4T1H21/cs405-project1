/**
 * Frame setup: one render pass per frame into the canvas, with a depth buffer.
 * Provided. You add draw calls through the callback given to render().
 */

export const DEPTH_FORMAT = 'depth24plus';

export class Renderer {
  /** @param {Awaited<ReturnType<import('./gpu.js').initWebGPU>>} gpu */
  constructor(gpu) {
    this.gpu = gpu;
    this.depth = null;
    /** Background colour in LINEAR RGB (a dark gallery wall). */
    this.clearColor = [0.012, 0.011, 0.010];
    /** Per-frame counters, read by the stats panel. Increment them via countDraw(). */
    this.stats = { draws: 0, vertices: 0 };
  }

  /** Call after every draw() so the panel can show vertices submitted per frame. */
  countDraw(vertexCount, instanceCount = 1) {
    this.stats.draws += 1;
    this.stats.vertices += vertexCount * instanceCount;
  }

  #ensureDepth(width, height) {
    if (this.depth && this.depth.width === width && this.depth.height === height) return;
    this.depth?.destroy();
    this.depth = this.gpu.device.createTexture({
      label: 'depth',
      size: [width, height],
      format: DEPTH_FORMAT,
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
  }

  /**
   * Record and submit one frame.
   * @param {(pass: GPURenderPassEncoder) => void} draw  issue your draw calls here
   */
  render(draw) {
    const { device, context, viewFormat, encodeSRGB } = this.gpu;
    this.stats.draws = 0;
    this.stats.vertices = 0;

    const target = context.getCurrentTexture();
    this.#ensureDepth(target.width, target.height);

    // Clear values are written as-is. With an '-srgb' view the GPU encodes them;
    // in the fallback path we encode the clear colour ourselves.
    const c = this.clearColor.map((x) => (encodeSRGB ? linearToSrgb(x) : x));

    const encoder = device.createCommandEncoder({ label: 'frame' });
    const pass = encoder.beginRenderPass({
      label: 'main pass',
      colorAttachments: [{
        view: target.createView({ format: viewFormat }),
        clearValue: { r: c[0], g: c[1], b: c[2], a: 1 },
        loadOp: 'clear',
        storeOp: 'store',
      }],
      depthStencilAttachment: {
        view: this.depth.createView(),
        depthClearValue: 1.0,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      },
    });
    draw(pass);
    pass.end();
    device.queue.submit([encoder.finish()]);
  }
}

function linearToSrgb(x) {
  return x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
}
