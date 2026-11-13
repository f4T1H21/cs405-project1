/**
 * The Part D curve evaluated and tessellated on the GPU. Bonus.
 *
 * The output buffer is STORAGE | VERTEX, so the compute pass writes exactly
 * the bytes the ribbon pipeline reads back as vertices: no copy, and no curve
 * maths on the CPU. Its command buffer is submitted before the frame's, which
 * is what orders the write ahead of the read.
 */
import curveWGSL from './shaders/curve.wgsl?raw';

const FLOATS_PER_VERTEX = 6;
const PARAM_FLOATS = 8; // 4 scalars + vec4 colour, padded to 32 bytes

export class CurveCompute {
  constructor(gpu, maxSamples, maxControls) {
    const { device } = gpu;
    this.gpu = gpu;
    this.maxSamples = maxSamples;

    this.params = device.createBuffer({
      label: 'curve compute params',
      size: PARAM_FLOATS * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.controls = device.createBuffer({
      label: 'curve control points',
      size: Math.max(2, maxControls) * 2 * 4, // vec2f each
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    this.vertices = device.createBuffer({
      label: 'curve ribbon (compute output)',
      size: maxSamples * 2 * FLOATS_PER_VERTEX * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX,
    });

    this.pipeline = device.createComputePipeline({
      label: 'curve ribbon',
      layout: 'auto',
      compute: { module: device.createShaderModule({ label: 'curve', code: curveWGSL }), entryPoint: 'main' },
    });
    this.bindGroup = device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.params } },
        { binding: 1, resource: { buffer: this.controls } },
        { binding: 2, resource: { buffer: this.vertices } },
      ],
    });

    this.#scratchParams = new Float32Array(PARAM_FLOATS);
    this.#scratchControls = new Float32Array(Math.max(2, maxControls) * 2);
    /** Shaped like a MeshRenderer mesh so the ribbon pipeline can draw it. */
    this.mesh = { buffer: this.vertices, count: 0 };
  }

  #scratchParams;
  #scratchControls;

  /** @param {number[][]} points  flat control-point list, [x, y] each */
  dispatch(points, { samples, halfWidth, z, colour }) {
    const { device } = this.gpu;
    const segmentCount = Math.floor((points.length - 1) / 3);
    const n = Math.min(samples, this.maxSamples);
    if (segmentCount < 1 || n < 2) { this.mesh.count = 0; return; }

    for (let i = 0; i < points.length; i++) {
      this.#scratchControls[i * 2] = points[i][0];
      this.#scratchControls[i * 2 + 1] = points[i][1];
    }
    device.queue.writeBuffer(this.controls, 0, this.#scratchControls, 0, points.length * 2);

    // The u32 fields go in through an aliased view of the same scratch array.
    const u = new Uint32Array(this.#scratchParams.buffer);
    u[0] = n;
    u[1] = segmentCount;
    this.#scratchParams[2] = halfWidth;
    this.#scratchParams[3] = z;
    this.#scratchParams.set(colour, 4);
    device.queue.writeBuffer(this.params, 0, this.#scratchParams);

    const encoder = device.createCommandEncoder({ label: 'curve compute' });
    const pass = encoder.beginComputePass({ label: 'curve ribbon' });
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.dispatchWorkgroups(Math.ceil(n / 64));
    pass.end();
    // On its own, before the frame: that is what orders this write ahead of
    // the draw call that reads it.
    device.queue.submit([encoder.finish()]);

    this.mesh.count = n * 2;
  }
}
