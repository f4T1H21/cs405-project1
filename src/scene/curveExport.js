/**
 * Curve export — Part D. Control points go out in normalised painting
 * coordinates: u, v ∈ [0, 1], origin TOP-LEFT and v downwards, like texture
 * coordinates. The quad spans x ∈ [−a, a], y ∈ [−1, 1] at z = 0, so
 * u = (x + a) / 2a and v = (1 − y) / 2.
 *
 *   { painting, kind: "bezier-c1" | "catmull-rom" | "bspline",
 *     segments: [[[u, v] × 4], …], points: [[u, v], …] }
 *
 * `segments` and `points` come in as WORLD [x, y]; `points` are the joints,
 * which double as the Catmull–Rom control points.
 */
export function curveToJSON({ painting, kind, aspect, segments = [], points = [] }) {
  const uv = (p) => [round((p[0] + aspect) / (2 * aspect)), round((1 - p[1]) / 2)];
  return {
    painting,
    kind,
    segments: segments.map((seg) => seg.map(uv)),
    points: points.map(uv),
  };
}

const round = (x) => Math.round(x * 1e4) / 1e4;

/** Provided: save any object as a .json download in the browser. */
export function downloadJSON(obj, filename = 'curve.json') {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
