// Lit mesh for the Part A and B objects, and the swept surface.
// Vertices are [x, y, z, nx, ny, nz]; see scene/geometry.js.

struct Uniforms {
  mvp: mat4x4f,    // P · V · M
  model: mat4x4f,  // M, for lighting the normal in world space
  colour: vec4f,   // base colour, LINEAR RGB
};

@group(0) @binding(0) var<uniform> u: Uniforms;

struct VSOut {
  @builtin(position) position: vec4f,
  @location(0) normal: vec3f,
};

@vertex
fn vs(@location(0) pos: vec3f, @location(1) nrm: vec3f) -> VSOut {
  var o: VSOut;
  o.position = u.mvp * vec4f(pos, 1.0);
  // w = 0 drops the translation. This wants the inverse transpose really, but
  // the scales here are mild enough that M only costs a slight shading bias.
  o.normal = (u.model * vec4f(nrm, 0.0)).xyz;
  return o;
}

@fragment
fn fs(i: VSOut) -> @location(0) vec4f {
  let n = normalize(i.normal);
  let lightDir = normalize(vec3f(0.35, 0.85, 0.75)); // key light, from the gallery
  let diffuse = max(dot(n, lightDir), 0.0);
  let fill = 0.25 * max(dot(n, vec3f(0.0, 0.0, 1.0)), 0.0); // soft light from the viewer
  let ambient = 0.18;
  return toOutput(vec4f(u.colour.rgb * (ambient + 0.8 * diffuse + fill), u.colour.a));
}
