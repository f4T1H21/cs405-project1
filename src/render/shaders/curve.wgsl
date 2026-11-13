// Evaluate the piecewise cubic Bézier on the GPU, writing a ribbon straight
// into a buffer that is then bound as a VERTEX buffer. Bonus for Part D.
//
// One invocation per sample, each writing the quad strip's two vertices as 6
// raw floats. A struct of two vec3f would be padded to 32 bytes and no longer
// match the ribbon pipeline's layout.

struct Params {
  sampleCount: u32,    // vertices written = 2 × sampleCount
  segmentCount: u32,   // control points read = 3 × segmentCount + 1
  halfWidth: f32,      // half the ribbon width, world units
  z: f32,              // plane the curve lives in
  colour: vec4f,
};

@group(0) @binding(0) var<uniform> p: Params;
@group(0) @binding(1) var<storage, read> controls: array<vec2f>;
@group(0) @binding(2) var<storage, read_write> verts: array<f32>;

/** B(t) over the four control points of segment `seg`, Bernstein form. */
fn bezier(seg: u32, t: f32) -> vec2f {
  let i = seg * 3u;
  let s = 1.0 - t;
  return controls[i] * (s * s * s)
       + controls[i + 1u] * (3.0 * s * s * t)
       + controls[i + 2u] * (3.0 * s * t * t)
       + controls[i + 3u] * (t * t * t);
}

/** B′(t) = 3(1−t)²(P1−P0) + 6(1−t)t(P2−P1) + 3t²(P3−P2). */
fn tangent(seg: u32, t: f32) -> vec2f {
  let i = seg * 3u;
  let s = 1.0 - t;
  return 3.0 * s * s * (controls[i + 1u] - controls[i])
       + 6.0 * s * t * (controls[i + 2u] - controls[i + 1u])
       + 3.0 * t * t * (controls[i + 3u] - controls[i + 2u]);
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= p.sampleCount) { return; }

  // Global parameter first, then the segment it falls in.
  let u = f32(i) / f32(max(p.sampleCount - 1u, 1u));
  let g = clamp(u, 0.0, 1.0) * f32(p.segmentCount);
  let seg = min(u32(floor(g)), p.segmentCount - 1u);
  let t = g - f32(seg);

  let pos = bezier(seg, t);
  let d = tangent(seg, t);
  let n = normalize(vec2f(-d.y, d.x) + vec2f(1e-9, 0.0)) * p.halfWidth;

  let base = i * 12u;
  verts[base + 0u] = pos.x + n.x;
  verts[base + 1u] = pos.y + n.y;
  verts[base + 2u] = p.z;
  verts[base + 3u] = p.colour.r;
  verts[base + 4u] = p.colour.g;
  verts[base + 5u] = p.colour.b;
  verts[base + 6u] = pos.x - n.x;
  verts[base + 7u] = pos.y - n.y;
  verts[base + 8u] = p.z;
  verts[base + 9u] = p.colour.r;
  verts[base + 10u] = p.colour.g;
  verts[base + 11u] = p.colour.b;
}
