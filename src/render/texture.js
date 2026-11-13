/**
 * Image → GPU texture, with correct sRGB handling and mipmaps.
 * Provided — you should not need to change this file.
 *
 * JPEG pixels are sRGB-ENCODED. Storing them in an 'rgba8unorm-srgb' texture
 * means the GPU decodes to LINEAR on every sample, and filtering / mipmapping
 * happen in linear space, which is what lighting and blending need.
 */

export async function loadImageBitmap(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load ${url} (${res.status})`);
  return createImageBitmap(await res.blob());
}

/**
 * @param {GPUDevice} device
 * @param {ImageBitmap} bitmap
 * @returns {GPUTexture}  format 'rgba8unorm-srgb', full mip chain
 */
export function textureFromBitmap(device, bitmap, label = 'painting') {
  const { width, height } = bitmap;
  const mipLevelCount = Math.floor(Math.log2(Math.max(width, height))) + 1;
  const texture = device.createTexture({
    label,
    size: [width, height],
    format: 'rgba8unorm-srgb',
    mipLevelCount,
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
  });
  device.queue.copyExternalImageToTexture({ source: bitmap }, { texture }, [width, height]);
  generateMipmaps(device, texture);
  return texture;
}

/* Each level is rendered from the previous one with a linear filter. */
const mipCache = new WeakMap();
function generateMipmaps(device, texture) {
  let res = mipCache.get(device);
  if (!res) {
    const module = device.createShaderModule({
      label: 'mipmap',
      code: /* wgsl */ `
        @group(0) @binding(0) var src: texture_2d<f32>;
        @group(0) @binding(1) var samp: sampler;
        struct V { @builtin(position) p: vec4f, @location(0) uv: vec2f };
        @vertex fn vs(@builtin(vertex_index) i: u32) -> V {
          let xy = vec2f(f32((i << 1u) & 2u), f32(i & 2u));   // full-screen triangle
          return V(vec4f(xy * 2.0 - 1.0, 0.0, 1.0), vec2f(xy.x, 1.0 - xy.y));
        }
        @fragment fn fs(v: V) -> @location(0) vec4f { return textureSample(src, samp, v.uv); }`,
    });
    const pipeline = device.createRenderPipeline({
      label: 'mipmap',
      layout: 'auto',
      vertex: { module, entryPoint: 'vs' },
      fragment: { module, entryPoint: 'fs', targets: [{ format: 'rgba8unorm-srgb' }] },
    });
    const sampler = device.createSampler({ minFilter: 'linear', magFilter: 'linear' });
    res = { pipeline, sampler };
    mipCache.set(device, res);
  }
  const encoder = device.createCommandEncoder({ label: 'mipmaps' });
  for (let level = 1; level < texture.mipLevelCount; level++) {
    const bindGroup = device.createBindGroup({
      layout: res.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: texture.createView({ baseMipLevel: level - 1, mipLevelCount: 1 }) },
        { binding: 1, resource: res.sampler },
      ],
    });
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: texture.createView({ baseMipLevel: level, mipLevelCount: 1 }),
        loadOp: 'clear', storeOp: 'store',
      }],
    });
    pass.setPipeline(res.pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(3);
    pass.end();
  }
  device.queue.submit([encoder.finish()]);
}
