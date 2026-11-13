/**
 * The painting as a textured quad in the scene. Provided.
 *
 * Geometry (world space): centred at the origin in the z = 0 plane,
 * height 2 (y ∈ [−1, 1]) and width 2·aspect (x ∈ [−aspect, aspect]),
 * aspect = image width / height. Texture coordinates have (0, 0) at the
 * TOP-LEFT of the image. Objects you place "in front of the painting" have z > 0.
 *
 * This file is also a complete, small example of a WebGPU draw:
 * vertex buffer → uniform buffer → bind group → pipeline → draw().
 */
import paintingWGSL from './shaders/painting.wgsl?raw';
import { createShader, fragmentConstants } from './shader.js';
import { loadImageBitmap, textureFromBitmap } from './texture.js';
import { DEPTH_FORMAT } from './renderer.js';

export class Painting {
  constructor(gpu) {
    const { device } = gpu;
    this.gpu = gpu;
    this.aspect = 1;
    this.texture = null;
    this.bindGroup = null;
    /** Model matrix of the painting (column-major). Identity = the placement above. */
    this.model = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

    this.uniforms = device.createBuffer({
      label: 'painting uniforms',
      size: 64, // one mat4x4f
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.vertices = device.createBuffer({
      label: 'painting quad',
      size: 6 * 5 * 4, // 6 vertices × (xyz + uv) × 4 bytes
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.sampler = device.createSampler({
      magFilter: 'linear', minFilter: 'linear', mipmapFilter: 'linear',
      addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge',
      maxAnisotropy: 8,
    });

    const module = createShader(device, paintingWGSL, 'painting');
    this.pipeline = device.createRenderPipeline({
      label: 'painting',
      layout: 'auto',
      vertex: {
        module, entryPoint: 'vs',
        buffers: [{
          arrayStride: 5 * 4,
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x3' }, // position
            { shaderLocation: 1, offset: 3 * 4, format: 'float32x2' }, // uv
          ],
        }],
      },
      fragment: {
        module, entryPoint: 'fs',
        targets: [{ format: gpu.viewFormat }],
        constants: fragmentConstants(gpu),
      },
      primitive: { topology: 'triangle-list', cullMode: 'none' }, // visible from behind too
      depthStencil: { format: DEPTH_FORMAT, depthWriteEnabled: true, depthCompare: 'less' },
    });
  }

  /** Load (or replace) the painting image. */
  async load(url) {
    const { device } = this.gpu;
    const bitmap = await loadImageBitmap(url);
    this.texture?.destroy();
    this.texture = textureFromBitmap(device, bitmap);
    this.aspect = bitmap.width / bitmap.height;
    this.size = [bitmap.width, bitmap.height];
    bitmap.close();

    const a = this.aspect;
    //               x   y  z   u  v
    const quad = new Float32Array([
      -a, -1, 0, 0, 1,
       a, -1, 0, 1, 1,
       a,  1, 0, 1, 0,
      -a, -1, 0, 0, 1,
       a,  1, 0, 1, 0,
      -a,  1, 0, 0, 0,
    ]);
    device.queue.writeBuffer(this.vertices, 0, quad);

    this.bindGroup = device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.uniforms } },
        { binding: 1, resource: this.sampler },
        { binding: 2, resource: this.texture.createView() },
      ],
    });
  }

  /**
   * @param {GPURenderPassEncoder} pass
   * @param {Float32Array} mvp  P · V · M for the painting (column-major)
   * @param {import('./renderer.js').Renderer} renderer  for the vertex counter
   */
  draw(pass, mvp, renderer) {
    if (!this.bindGroup) return;
    this.gpu.device.queue.writeBuffer(this.uniforms, 0, mvp);
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.setVertexBuffer(0, this.vertices);
    pass.draw(6);
    renderer.countDraw(6);
  }
}
