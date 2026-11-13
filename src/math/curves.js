/**
 * curves — Part D.
 *
 * Points are plain arrays of any dimension: [x, y] in the plane of the
 * painting, or [x, y, z] in world space. Every function must work for both
 * (the tests use 2D and 3D). Return new arrays; never modify the inputs.
 *
 * A piecewise cubic Bézier curve is an array of segments, each segment being
 * four control points [P0, P1, P2, P3]. Consecutive segments share a joint:
 * segments[i][3] equals segments[i + 1][0].
 *
 * Tests: tests/curves.test.js
 */
const combine = (points, weights) =>
  points[0].map((_, k) => points.reduce((sum, p, i) => sum + weights[i] * p[k], 0));

/* ---------------------------------------------------------- Bézier ------ */

/** The four cubic Bernstein basis values [B0(t), B1(t), B2(t), B3(t)]. */
export function bernstein3(t) {
  const s = 1 - t;
  // The terms of (s + t)³, so they always sum to 1.
  return [s * s * s, 3 * s * s * t, 3 * s * t * t, t * t * t];
}

/** Point on the cubic Bézier curve with control points p0..p3 at t ∈ [0, 1]. */
export function cubicBezier(p0, p1, p2, p3, t) {
  return combine([p0, p1, p2, p3], bernstein3(t));
}

/** First derivative dB/dt of the cubic Bézier at t (not normalised). */
export function cubicBezierTangent(p0, p1, p2, p3, t) {
  const s = 1 - t;
  // Weights of 3(1−t)²(P1−P0) + 6(1−t)t(P2−P1) + 3t²(P3−P2), gathered per point.
  return combine(
    [p0, p1, p2, p3],
    [-3 * s * s, 3 * s * s - 6 * s * t, 6 * s * t - 3 * t * t, 3 * t * t]
  );
}

/**
 * de Casteljau's construction for any number of control points.
 * Returns every level, for drawing the construction:
 *   levels[0] = the input points (n points)
 *   levels[1] = n − 1 interpolated points
 *   …
 *   levels[n − 1] = [the point on the curve]
 */
export function deCasteljau(points, t) {
  const levels = [points.map((p) => [...p])];
  while (levels[levels.length - 1].length > 1) {
    const prev = levels[levels.length - 1];
    const next = [];
    for (let i = 0; i < prev.length - 1; i++) {
      next.push(prev[i].map((x, k) => x + (prev[i + 1][k] - x) * t));
    }
    levels.push(next);
  }
  return levels;
}

/* ----------------------------------------------- piecewise, C¹ joints --- */

/**
 * Given the last two control points P2, P3 of one segment, return the P1 of
 * the NEXT segment that makes the joint at P3 C¹-continuous.
 */
export function c1NextControl(p2, p3) {
  // 3(P3 − P2) = 3(Q1 − P3) holds exactly when Q1 is P2 mirrored through P3.
  return p3.map((x, k) => 2 * x - p2[k]);
}

/**
 * Evaluate a piecewise cubic Bézier at a global parameter u ∈ [0, 1] that
 * runs over the whole curve: with n segments, segment i covers
 * u ∈ [i/n, (i+1)/n]. u = 0 is the first P0, u = 1 the last P3.
 */
export function evalPiecewise(segments, u) {
  const n = segments.length;
  const g = Math.min(Math.max(u, 0), 1) * n;
  const i = Math.min(Math.floor(g), n - 1); // u = 1 belongs to the last segment
  return cubicBezier(...segments[i], g - i);
}

/** Tangent of a piecewise cubic Bézier at the same global parameter u. */
export function evalPiecewiseTangent(segments, u) {
  const n = segments.length;
  const g = Math.min(Math.max(u, 0), 1) * n;
  const i = Math.min(Math.floor(g), n - 1);
  return cubicBezierTangent(...segments[i], g - i);
}

/* --- second curve family. The handout asks for one; both are here. ------ */

/**
 * Uniform Catmull–Rom: the segment between p1 and p2 (passes through both),
 * t ∈ [0, 1], with tangents (p2 − p0)/2 at p1 and (p3 − p1)/2 at p2.
 */
export function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  // 0.5 · [ 2P1 + (−P0+P2)t + (2P0−5P1+4P2−P3)t² + (−P0+3P1−3P2+P3)t³ ]
  return combine([p0, p1, p2, p3], [
    0.5 * (-t + 2 * t2 - t3),
    0.5 * (2 - 5 * t2 + 3 * t3),
    0.5 * (t + 4 * t2 - 3 * t3),
    0.5 * (-t2 + t3),
  ]);
}

/**
 * Uniform cubic B-spline basis [N0(t) … N3(t)]. Unlike Bernstein it does not
 * interpolate: at t = 0 the weights are (1, 4, 1)/6, so the curve passes near
 * p1 rather than through it.
 */
export function bsplineBasis(t) {
  const s = 1 - t, t2 = t * t, t3 = t2 * t;
  return [
    s * s * s / 6,
    (3 * t3 - 6 * t2 + 4) / 6,
    (-3 * t3 + 3 * t2 + 3 * t + 1) / 6,
    t3 / 6,
  ];
}

/** Point on the uniform cubic B-spline segment controlled by p0..p3. */
export function bspline(p0, p1, p2, p3, t) {
  return combine([p0, p1, p2, p3], bsplineBasis(t));
}
