/**
 * Mesh and line pipelines, following render/painting.js:
 * vertex buffer → uniform buffer → bind group → pipeline → draw().
 *
 * Each drawable gets its OWN uniform buffer. queue.writeBuffer() calls all run
 * before the frame's commands, so drawables sharing one would every one of
 * them read the last matrix written.
 *
 * Four pipelines share the vertex layout [x, y, z, a, b, c]:
 *   shaded   triangle-list,  lit,   (a, b, c) = normal  — boxes, swept surface
 *   list     line-list,      unlit, (a, b, c) = colour  — axes, frustum, markers
 *   strip    line-strip,     unlit, (a, b, c) = colour  — control polygons
 *   ribbon   triangle-strip, unlit, (a, b, c) = colour  — the curves
 */
import meshWGSL from './shaders/mesh.wgsl?raw';
import linesWGSL from './shaders/lines.wgsl?raw';
import { createShader, fragmentConstants } from './shader.js';
import { DEPTH_FORMAT } from './renderer.js';

const FLOATS_PER_VERTEX = 6; // xyz + (normal | colour)
const MESH_UNIFORM_FLOATS = 16 + 16 + 4; // mvp, model, colour
const LINE_UNIFORM_FLOATS = 16 + 4; // mvp, tint

export class MeshRenderer {
  /** @param {Awaited<ReturnType<import('./gpu.js').initWebGPU>>} gpu */
  constructor(gpu) {
    this.gpu = gpu;
    const { device } = gpu;

    const vertexLayout = {
      arrayStride: FLOATS_PER_VERTEX * 4,
      attributes: [
        { shaderLocation: 0, offset: 0, format: 'float32x3' },
        { shaderLocation: 1, offset: 3 * 4, format: 'float32x3' },
      ],
    };

    const meshModule = createShader(device, meshWGSL, 'mesh');
    this.shadedPipeline = device.createRenderPipeline({
      label: 'shaded mesh',
      layout: 'auto',
      vertex: { module: meshModule, entryPoint: 'vs', buffers: [vertexLayout] },
      fragment: {
        module: meshModule, entryPoint: 'fs',
        targets: [{ format: gpu.viewFormat }],
        constants: fragmentConstants(gpu),
      },
      primitive: { topology: 'triangle-list', cullMode: 'back' },
      depthStencil: { format: DEPTH_FORMAT, depthWriteEnabled: true, depthCompare: 'less' },
    });

    // Overlays sit on top of whatever they annotate, so no depth test and no
    // depth writes.
    const linesModule = createShader(device, linesWGSL, 'lines');
    // EXPLICIT and shared: with layout 'auto' each pipeline gets a bind-group
    // layout of its own, and a bind group made for one is rejected by another.
    this.lineBindGroupLayout = device.createBindGroupLayout({
      label: 'line uniforms',
      entries: [{
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform' },
      }],
    });
    const lineLayout = device.createPipelineLayout({ bindGroupLayouts: [this.lineBindGroupLayout] });
    const linePipeline = (topology, label) => device.createRenderPipeline({
      label, layout: lineLayout,
      vertex: { module: linesModule, entryPoint: 'vs', buffers: [vertexLayout] },
      fragment: {
        module: linesModule, entryPoint: 'fs',
        targets: [{ format: gpu.viewFormat }],
        constants: fragmentConstants(gpu),
      },
      primitive: { topology },
      depthStencil: { format: DEPTH_FORMAT, depthWriteEnabled: false, depthCompare: 'always' },
    });
    this.pipelines = {
      list: linePipeline('line-list', 'debug lines'),
      strip: linePipeline('line-strip', 'debug line strip'),
      ribbon: linePipeline('triangle-strip', 'curve ribbon'),
    };
  }

  /** Upload static interleaved vertex data; returns { buffer, count }. */
  createMesh(data, label = 'mesh') {
    const buffer = this.gpu.device.createBuffer({
      label, size: data.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.gpu.device.queue.writeBuffer(buffer, 0, data);
    return { buffer, count: data.length / FLOATS_PER_VERTEX };
  }

  /** A mesh rewritten every frame: curves, markers, the frustum. */
  createDynamicMesh(maxVertices, label = 'dynamic mesh') {
    const buffer = this.gpu.device.createBuffer({
      label, size: maxVertices * FLOATS_PER_VERTEX * 4,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    return { buffer, count: 0, maxVertices };
  }

  /** @param {Float32Array} data interleaved [x,y,z, r,g,b] vertices */
  updateMesh(mesh, data) {
    const count = Math.min(data.length / FLOATS_PER_VERTEX, mesh.maxVertices);
    this.gpu.device.queue.writeBuffer(mesh.buffer, 0, data, 0, count * FLOATS_PER_VERTEX);
    mesh.count = count;
  }

  /** One uniform buffer + bind group for one drawable. */
  createInstance(kind = 'shaded', label = 'instance') {
    const shaded = kind === 'shaded';
    const floats = shaded ? MESH_UNIFORM_FLOATS : LINE_UNIFORM_FLOATS;
    const layout = shaded ? this.shadedPipeline.getBindGroupLayout(0) : this.lineBindGroupLayout;
    const uniforms = this.gpu.device.createBuffer({
      label, size: floats * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    return {
      kind,
      uniforms,
      scratch: new Float32Array(floats),
      bindGroup: this.gpu.device.createBindGroup({
        layout,
        entries: [{ binding: 0, resource: { buffer: uniforms } }],
      }),
    };
  }

  /** @param {Float32Array} mvp P·V·M  @param {Float32Array} model M  @param {number[]} colour linear rgb */
  drawShaded(pass, renderer, mesh, instance, mvp, model, colour) {
    instance.scratch.set(mvp, 0);
    instance.scratch.set(model, 16);
    instance.scratch.set([colour[0], colour[1], colour[2], colour[3] ?? 1], 32);
    this.#submit(pass, renderer, this.shadedPipeline, mesh, instance);
  }

  /** @param {'list'|'strip'|'ribbon'} topology  how to connect the vertices */
  drawLines(pass, renderer, mesh, instance, mvp, tint = [1, 1, 1, 1], topology = 'list') {
    instance.scratch.set(mvp, 0);
    instance.scratch.set(tint, 16);
    this.#submit(pass, renderer, this.pipelines[topology], mesh, instance);
  }

  #submit(pass, renderer, pipeline, mesh, instance) {
    if (mesh.count === 0) return;
    this.gpu.device.queue.writeBuffer(instance.uniforms, 0, instance.scratch);
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, instance.bindGroup);
    pass.setVertexBuffer(0, mesh.buffer);
    pass.draw(mesh.count);
    renderer.countDraw(mesh.count);
  }
}
