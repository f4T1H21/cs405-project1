/**
 * fit — least-squares fitting of cubic Béziers to a hand-traced polyline.
 * Bonus for Part D.
 *
 * Control points enter the Bézier linearly, B(t) = Σ Bᵢ(t)·Pᵢ, so pinning the
 * endpoints to the ends of the stroke leaves only P1 and P2 unknown, and
 * minimising E = Σᵢ |B(tᵢ) − Qᵢ|² is a 2×2 normal-equation system. Every
 * coordinate shares that one system, because the basis values are scalars.
 *
 * Tests: tests/fit.test.js
 */
import { bernstein3, cubicBezier, cubicBezierTangent, c1NextControl } from './curves.js';

/**
 * Parameters proportional to distance travelled. Uniform tᵢ would bunch the
 * curve up wherever the hand moved slowly.
 */
export function chordLengthParams(points) {
  const d = [0];
  for (let i = 1; i < points.length; i++) {
    d.push(d[i - 1] + dist(points[i - 1], points[i]));
  }
  const total = d[d.length - 1];
  return total === 0 ? d.map((_, i) => i / Math.max(1, points.length - 1)) : d.map((x) => x / total);
}

/**
 * The cubic closest, in the least-squares sense, to `points`, with the ends
 * pinned to the first and last of them.
 *
 * Chord length only approximates the curve's own parameterisation, so each
 * solve is followed by a Newton step that moves every sample to the parameter
 * of its true closest point, then another solve. Eight rounds get a clean
 * stroke within a few tenths of a percent. The control points may still differ
 * from the ones that drew it: many control polygons describe nearly the same
 * curve.
 *
 * @returns {number[][]} [P0, P1, P2, P3]
 */
export function fitCubicBezier(points, { iterations = 8 } = {}) {
  let params = chordLengthParams(points);
  let seg = solveControls(points, params);
  for (let k = 0; k < iterations; k++) {
    params = params.map((t, i) => newtonStep(seg, points[i], t));
    seg = solveControls(points, params);
  }
  return seg;
}

/** One least-squares solve for P1 and P2 with P0 and P3 pinned. */
function solveControls(points, params) {
  const p0 = points[0], p3 = points[points.length - 1];
  const dim = p0.length;
  let c11 = 0, c12 = 0, c22 = 0;
  const x1 = new Array(dim).fill(0), x2 = new Array(dim).fill(0);

  for (let i = 0; i < points.length; i++) {
    const [b0, b1, b2, b3] = bernstein3(params[i]);
    c11 += b1 * b1;
    c12 += b1 * b2;
    c22 += b2 * b2;
    for (let k = 0; k < dim; k++) {
      // What is left of the sample once the pinned ends are accounted for.
      const r = points[i][k] - b0 * p0[k] - b3 * p3[k];
      x1[k] += b1 * r;
      x2[k] += b2 * r;
    }
  }

  const det = c11 * c22 - c12 * c12;
  if (!(Math.abs(det) > 1e-12)) {
    // Too few or coincident samples: fall back to thirds along the chord.
    return [p0, lerp(p0, p3, 1 / 3), lerp(p0, p3, 2 / 3), p3];
  }
  const v1 = [], v2 = [];
  for (let k = 0; k < dim; k++) {
    v1.push((c22 * x1[k] - c12 * x2[k]) / det);
    v2.push((c11 * x2[k] - c12 * x1[k]) / det);
  }
  return [p0, v1, v2, p3];
}

/**
 * One Newton step on f(t) = (B(t) − q)·B′(t), where
 * f′(t) = |B′(t)|² + (B(t) − q)·B″(t). Clamped to [0, 1]; a vanishing f′
 * leaves t alone.
 */
function newtonStep(seg, q, t) {
  const b = cubicBezier(...seg, t);
  const d1 = cubicBezierTangent(...seg, t);
  const d2 = secondDerivative(seg, t);
  let f = 0, df = 0;
  for (let k = 0; k < q.length; k++) {
    f += (b[k] - q[k]) * d1[k];
    df += d1[k] * d1[k] + (b[k] - q[k]) * d2[k];
  }
  if (!(Math.abs(df) > 1e-12)) return t;
  return Math.min(1, Math.max(0, t - f / df));
}

/** B″(t) = 6(1−t)(P2 − 2P1 + P0) + 6t(P3 − 2P2 + P1). */
function secondDerivative([p0, p1, p2, p3], t) {
  return p0.map((_, k) =>
    6 * (1 - t) * (p2[k] - 2 * p1[k] + p0[k]) + 6 * t * (p3[k] - 2 * p2[k] + p1[k]));
}

/**
 * Fit a C¹ piecewise cubic to a traced polyline: cut it into `count` pieces of
 * equal arc length, fit each (shared joints give C⁰ for free), then mirror the
 * outgoing handle of every interior joint. That last step moves the curve, so
 * the caller gets the error from before it (`rmsC0`) as well as after.
 *
 * @returns {{ points, segments, rms, rmsC0, max }}
 */
export function fitPiecewise(points, count = 3) {
  const clean = dedupe(points);
  // A piece needs a handful of samples to be worth fitting at all.
  const n = Math.max(1, Math.min(count, Math.floor(clean.length / 4)));
  if (clean.length < 4) {
    const seg = fitCubicBezier(clean.length >= 2 ? clean : [[0, 0], [0, 0]]);
    return { points: seg, segments: [seg], rms: 0, rmsC0: 0, max: 0 };
  }

  const t = chordLengthParams(clean);
  const cuts = [0];
  for (let k = 1; k < n; k++) {
    // First sample at or past k/n of the total length.
    let i = cuts[k - 1] + 1;
    while (i < clean.length - 1 && t[i] < k / n) i++;
    cuts.push(Math.min(i, clean.length - 2));
  }
  cuts.push(clean.length - 1);

  const flat = [];
  for (let k = 0; k < n; k++) {
    const chunk = clean.slice(cuts[k], cuts[k + 1] + 1);
    const seg = fitCubicBezier(chunk);
    flat.push(...(k === 0 ? seg : seg.slice(1)));
  }

  const rmsC0 = error(toSegments(flat), clean).rms;
  for (let i = 4; i < flat.length; i += 3) flat[i] = c1NextControl(flat[i - 2], flat[i - 1]);
  const after = error(toSegments(flat), clean);
  return { points: flat, segments: toSegments(flat), rms: after.rms, rmsC0, max: after.max };
}

/** A flat control-point list viewed as segments of four. */
export function toSegments(flat) {
  const out = [];
  for (let i = 0; i + 3 < flat.length; i += 3) out.push(flat.slice(i, i + 4));
  return out;
}

/**
 * How far the curve sits from the samples. Each sample is measured against the
 * nearest point of a dense walk of the curve, taken as a POLYLINE: measuring
 * against its vertices instead could never read below the step size, and
 * measuring geometrically keeps the number independent of the fitting
 * parameterisation.
 */
export function error(segments, points, steps = 32) {
  if (!segments.length || !points.length) return { rms: 0, max: 0 };
  const dense = [];
  for (const seg of segments) {
    for (let s = 0; s <= steps; s++) {
      if (dense.length && s === 0) continue; // the joint is already there
      dense.push(cubicBezier(...seg, s / steps));
    }
  }
  let sum = 0, max = 0;
  for (const p of points) {
    let best = Infinity;
    for (let i = 0; i + 1 < dense.length; i++) {
      best = Math.min(best, distToSegment(p, dense[i], dense[i + 1]));
    }
    sum += best * best;
    max = Math.max(max, best);
  }
  return { rms: Math.sqrt(sum / points.length), max };
}

/* ------------------------------------------------------------ helpers --- */

const dist = (a, b) => Math.hypot(...a.map((x, i) => x - b[i]));
const lerp = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);

/** Distance from p to the line segment ab (not to the infinite line). */
function distToSegment(p, a, b) {
  let num = 0, den = 0;
  for (let k = 0; k < p.length; k++) {
    const d = b[k] - a[k];
    num += (p[k] - a[k]) * d;
    den += d * d;
  }
  const t = den === 0 ? 0 : Math.min(1, Math.max(0, num / den));
  return Math.hypot(...p.map((x, k) => x - (a[k] + (b[k] - a[k]) * t)));
}

/** Repeated samples add nothing and give chord length a zero to divide by. */
function dedupe(points, eps = 1e-9) {
  const out = [];
  for (const p of points) if (!out.length || dist(out[out.length - 1], p) > eps) out.push([...p]);
  return out;
}
