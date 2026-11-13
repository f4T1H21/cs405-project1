// Shared colour helpers. Prepended to every shader by withColour() in
// render/shader.js, so your own shaders can call toOutput() too.
//
// Rule: do all lighting and blending maths in LINEAR colour. Return
// toOutput(colour) from every fragment shader that writes to the canvas.

// Set by the pipeline (constants: { ENCODE_SRGB: gpu.encodeSRGB ? 1 : 0 }).
// 0 → the canvas view is '-srgb' and the GPU encodes for us.
// 1 → fallback: we encode here.
override ENCODE_SRGB: u32 = 0u;

fn srgbToLinear(c: vec3f) -> vec3f {
  let lo = c / 12.92;
  let hi = pow((c + 0.055) / 1.055, vec3f(2.4));
  return select(hi, lo, c <= vec3f(0.04045));
}

fn linearToSrgb(c: vec3f) -> vec3f {
  let lo = c * 12.92;
  let hi = 1.055 * pow(c, vec3f(1.0 / 2.4)) - 0.055;
  return select(hi, lo, c <= vec3f(0.0031308));
}

fn toOutput(linear: vec4f) -> vec4f {
  if (ENCODE_SRGB == 1u) {
    return vec4f(linearToSrgb(clamp(linear.rgb, vec3f(0.0), vec3f(1.0))), linear.a);
  }
  return linear;
}
