// The painting: a textured quad. The texture is 'rgba8unorm-srgb', so
// textureSample() already returns LINEAR colour.

struct Uniforms {
  mvp: mat4x4f,   // P · V · M, column-major, uploaded as 16 floats
};

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var tex: texture_2d<f32>;

struct VSOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
};

@vertex
fn vs(@location(0) pos: vec3f, @location(1) uv: vec2f) -> VSOut {
  var o: VSOut;
  o.position = u.mvp * vec4f(pos, 1.0);
  o.uv = uv;
  return o;
}

@fragment
fn fs(i: VSOut) -> @location(0) vec4f {
  return toOutput(textureSample(tex, samp, i.uv));
}
