import colourWGSL from './shaders/colour.wgsl?raw';

const PRELUDE_LINES = colourWGSL.split('\n').length; // so error line numbers match YOUR file

/**
 * Create a shader module with the shared colour helpers (toOutput,
 * srgbToLinear, linearToSrgb, ENCODE_SRGB) prepended.
 * Every pipeline that renders to the canvas must pass
 *   constants: { ENCODE_SRGB: gpu.encodeSRGB ? 1 : 0 }
 * in its `fragment` stage — use fragmentConstants(gpu) for that.
 */
export function createShader(device, code, label) {
  const module = device.createShaderModule({ label, code: `${colourWGSL}\n${code}` });
  module.getCompilationInfo().then((info) => {
    for (const m of info.messages) {
      const fn = m.type === 'error' ? console.error : console.warn;
      const line = m.lineNum > PRELUDE_LINES ? m.lineNum - PRELUDE_LINES : `${m.lineNum} (colour.wgsl)`;
      fn(`[WGSL ${label ?? ''}] ${m.type} line ${line}: ${m.message}`);
    }
  });
  return module;
}

export const fragmentConstants = (gpu) => ({ ENCODE_SRGB: gpu.encodeSRGB ? 1 : 0 });
