/**
 * Surface of revolution swept from the traced curve. Bonus for Part D.
 *
 * The curve is drawn in the plane of the painting, so it already is a profile.
 * Measure it in the frame of the chord joining its ends (â along the chord, n̂
 * perpendicular inside the painting, b̂ out of it) and spin it about â:
 *
 *     P(s, θ) = O + s·â + r(s)·(cos θ · n̂ + sin θ · b̂)
 *     ∂P/∂s × ∂P/∂θ = r·(−r′·â + cos θ · n̂ + sin θ · b̂)
 *
 * so the unit normal is exact and needs no finite differences. For the melon
 * contour the chord runs along the melon's own axis, so the sweep makes a melon.
 *
 * @param {number[][]} profile  curve samples [x, y] in painting-plane coordinates
 * @returns interleaved [x, y, z, nx, ny, nz] for 'triangle-list'
 */
export function revolveCurve(profile, { sides = 36, zOffset = null } = {}) {
  const empty = { data: new Float32Array(0), vertexCount: 0, radius: 0, axis: null };
  if (!profile || profile.length < 2) return empty;

  const a = profile[0], b = profile[profile.length - 1];
  const ax = b[0] - a[0], ay = b[1] - a[1];
  const len = Math.hypot(ax, ay);
  if (!(len > 1e-6)) return empty;

  // â along the chord, n̂ perpendicular inside the painting, b̂ = â × n̂ out of it.
  const A = [ax / len, ay / len, 0];
  const N = [-A[1], A[0], 0];
  const B = [0, 0, 1];

  // (s, r): distance along the chord, and signed distance from it.
  const sr = profile.map((p) => {
    const dx = p[0] - a[0], dy = p[1] - a[1];
    return [dx * A[0] + dy * A[1], dx * N[0] + dy * N[1]];
  });
  const radius = Math.max(...sr.map(([, r]) => Math.abs(r)));
  if (!(radius > 1e-6)) return empty;

  // Keep the solid in front of the painting by default.
  const dz = zOffset ?? radius + 0.02;

  const point = (s, r, cos, sin) => [
    a[0] + s * A[0] + r * (cos * N[0] + sin * B[0]),
    a[1] + s * A[1] + r * (cos * N[1] + sin * B[1]),
    dz + s * A[2] + r * (cos * N[2] + sin * B[2]),
  ];
  const normal = (dr, cos, sin) => {
    const v = [
      -dr * A[0] + cos * N[0] + sin * B[0],
      -dr * A[1] + cos * N[1] + sin * B[1],
      -dr * A[2] + cos * N[2] + sin * B[2],
    ];
    const l = Math.hypot(...v) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
  };

  // r′ by central difference along s.
  const drds = sr.map(([s, r], i) => {
    const lo = sr[Math.max(0, i - 1)], hi = sr[Math.min(sr.length - 1, i + 1)];
    const ds = hi[0] - lo[0];
    return Math.abs(ds) < 1e-9 ? 0 : (hi[1] - lo[1]) / ds;
  });

  const out = [];
  const push = (i, j) => {
    const th = (j / sides) * Math.PI * 2;
    const cos = Math.cos(th), sin = Math.sin(th);
    // A profile dipping below the axis gives a negative radius, which puts the
    // point on the far side; flipping the normal with it keeps it outward.
    const flip = sr[i][1] < 0 ? -1 : 1;
    out.push(...point(sr[i][0], sr[i][1], cos, sin), ...normal(drds[i] * flip, cos * flip, sin * flip));
  };

  // scene/geometry.js sets the convention that (v1 − v0) × (v2 − v1) is the
  // OUTWARD normal, which cullMode 'back' expects. Walking (s, θ) in order
  // gives the inward one, so each triangle's last two vertices are swapped.
  for (let i = 0; i + 1 < sr.length; i++) {
    for (let j = 0; j < sides; j++) {
      const j1 = j + 1;
      push(i, j); push(i + 1, j1); push(i + 1, j);
      push(i, j); push(i, j1); push(i + 1, j1);
    }
  }

  return {
    data: new Float32Array(out),
    vertexCount: out.length / 6,
    radius,
    axis: { origin: [a[0], a[1], dz], dir: A },
  };
}
