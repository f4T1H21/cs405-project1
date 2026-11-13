// Unlit per-vertex colour, shared by the debug axes, the frustum and every
// ribbon. Vertices are [x, y, z, r, g, b].

struct Uniforms {
  mvp: mat4x4f,
  tint: vec4f, // rgb multiplier, a = overall opacity
};

@group(0) @binding(0) var<uniform> u: Uniforms;

struct VSOut {
  @builtin(position) position: vec4f,
  @location(0) colour: vec3f,
};

@vertex
fn vs(@location(0) pos: vec3f, @location(1) colour: vec3f) -> VSOut {
  var o: VSOut;
  o.position = u.mvp * vec4f(pos, 1.0);
  o.colour = colour;
  return o;
}

@fragment
fn fs(i: VSOut) -> @location(0) vec4f {
  return toOutput(vec4f(i.colour * u.tint.rgb, u.tint.a));
}
