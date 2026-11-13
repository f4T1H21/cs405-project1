/**
 * Polylines → one triangle strip. A GPU line is one device pixel, a hairline at
 * dpr 2, so every flat annotation here is drawn as a thin quad strip instead:
 * each sample becomes p ± w·n. Strips are joined by two duplicated vertices,
 * whose triangles have zero area and rasterise to nothing.
 *
 * @param {{pts: number[][], colour: number[]}[]} strips  polylines in the z = `z` plane
 * @returns {Float32Array} interleaved [x, y, z, r, g, b] for 'triangle-strip'
 */
export function ribbonStrips(strips, w, z = 0.01) {
  const out = [];
  const push = (p, c) => out.push(p[0], p[1], z, c[0], c[1], c[2]);
  let last = null;
  for (const { pts, colour } of strips) {
    if (!pts || pts.length < 2) continue;
    const side = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      const tx = b[0] - a[0], ty = b[1] - a[1];
      const len = Math.hypot(tx, ty) || 1;
      const nx = (-ty / len) * w, ny = (tx / len) * w;
      side.push([pts[i][0] + nx, pts[i][1] + ny], [pts[i][0] - nx, pts[i][1] - ny]);
    }
    if (last) { push(last.p, last.c); push(side[0], colour); }
    for (const v of side) push(v, colour);
    last = { p: side[side.length - 1], c: colour };
  }
  return new Float32Array(out);
}
