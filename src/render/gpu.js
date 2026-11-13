/**
 * WebGPU setup: adapter + device, canvas configuration, sRGB output and
 * resize handling. Provided — you should not need to change this file.
 */

/**
 * @param {HTMLCanvasElement} canvas
 * @returns {Promise<{
 *   device: GPUDevice, context: GPUCanvasContext, canvas: HTMLCanvasElement,
 *   canvasFormat: GPUTextureFormat,   // format of the swap-chain texture
 *   viewFormat: GPUTextureFormat,     // format your pipelines must render to
 *   encodeSRGB: boolean,              // true → shaders must encode linear → sRGB themselves
 *   onResize: (fn: (w: number, h: number) => void) => void,
 * }>}
 */
export async function initWebGPU(canvas) {
  if (!('gpu' in navigator)) {
    throw new Error(
      'This browser has no WebGPU (navigator.gpu is missing). Use a current Chrome or Edge; ' +
      'Safari 26+; Firefox 141+ on Windows (other platforms: enable dom.webgpu.enabled). ' +
      'The page must be served from localhost or https.'
    );
  }
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) throw new Error('WebGPU is present but no GPU adapter was found (check GPU drivers / browser flags).');
  const device = await adapter.requestDevice();

  device.lost.then((info) => {
    if (info.reason !== 'destroyed') showFatal(`WebGPU device lost: ${info.message}`);
  });
  device.addEventListener('uncapturederror', (e) => console.error('[WebGPU]', e.error.message));

  const context = canvas.getContext('webgpu');
  const canvasFormat = navigator.gpu.getPreferredCanvasFormat(); // 'bgra8unorm' or 'rgba8unorm'

  // sRGB output. Shaders compute LINEAR colour; the display expects sRGB-encoded
  // bytes. Preferred: render into an '-srgb' view of the canvas texture, so the
  // GPU encodes on write (and blending happens in linear space). If the browser
  // does not support that view, fall back to encoding in the fragment shader
  // (see shaders/colour.wgsl → toOutput()).
  let viewFormat = `${canvasFormat}-srgb`;
  let encodeSRGB = false;
  device.pushErrorScope('validation');
  let failed = false;
  try {
    context.configure({ device, format: canvasFormat, viewFormats: [viewFormat], alphaMode: 'opaque' });
  } catch (_) { failed = true; }
  if ((await device.popErrorScope()) || failed) {
    viewFormat = canvasFormat;
    encodeSRGB = true;
    context.configure({ device, format: canvasFormat, alphaMode: 'opaque' });
    console.info('[WebGPU] sRGB canvas view not supported — encoding sRGB in the shader instead.');
  }

  // Resize: keep the drawing buffer at the canvas' size in DEVICE pixels.
  const listeners = [];
  const maxDim = device.limits.maxTextureDimension2D;
  const observer = new ResizeObserver(([entry]) => {
    const dpr = window.devicePixelRatio || 1;
    const box = entry.devicePixelContentBoxSize?.[0];
    const w = box ? box.inlineSize : Math.round(entry.contentBoxSize[0].inlineSize * dpr);
    const h = box ? box.blockSize : Math.round(entry.contentBoxSize[0].blockSize * dpr);
    canvas.width = Math.max(1, Math.min(maxDim, w));
    canvas.height = Math.max(1, Math.min(maxDim, h));
    for (const fn of listeners) fn(canvas.width, canvas.height);
  });
  try { observer.observe(canvas, { box: 'device-pixel-content-box' }); }
  catch (_) { observer.observe(canvas); }

  return {
    adapter, device, context, canvas, canvasFormat, viewFormat, encodeSRGB,
    onResize: (fn) => listeners.push(fn),
  };
}

export function showFatal(message) {
  const box = document.getElementById('fatal');
  if (!box) { alert(message); return; }
  box.hidden = false;
  box.textContent = message;
}
