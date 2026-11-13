import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { revolveCurve } from '../src/scene/revolve.js';
import { close } from './helpers.js';

/** A half-circle of radius R above the x axis: revolving it gives a sphere. */
const halfCircle = (R, n) => Array.from({ length: n + 1 }, (_, i) => {
  const t = Math.PI * (1 - i / n);
  return [R * Math.cos(t), R * Math.sin(t)];
});

describe('bonus · surface of revolution', () => {
  test('a degenerate profile produces no geometry instead of NaNs', () => {
    for (const p of [[], [[0, 0]], [[1, 1], [1, 1]]]) {
      const r = revolveCurve(p);
      assert.equal(r.vertexCount, 0);
      assert.equal(r.data.length, 0);
    }
  });

  test('vertex count is sides × (samples − 1) × 6, interleaved as 6 floats', () => {
    const r = revolveCurve(halfCircle(1, 10), { sides: 8 });
    assert.equal(r.vertexCount, 8 * 10 * 6);
    assert.equal(r.data.length, r.vertexCount * 6);
    for (const x of r.data) assert.ok(Number.isFinite(x), `got ${x}`);
  });

  test('revolving a half-circle gives a sphere: every point is R from the axis centre', () => {
    const R = 0.7;
    const s = revolveCurve(halfCircle(R, 48), { sides: 24, zOffset: 0 });
    // The chord runs from (−R, 0) to (R, 0), so the centre of the sphere is its midpoint.
    const c = [0, 0, 0];
    for (let i = 0; i < s.vertexCount; i++) {
      const p = s.data.subarray(i * 6, i * 6 + 3);
      close(Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]), R, 2e-3, `vertex ${i}`);
    }
  });

  test('normals are unit length and point away from the axis', () => {
    const R = 0.7;
    const s = revolveCurve(halfCircle(R, 48), { sides: 24, zOffset: 0 });
    for (let i = 0; i < s.vertexCount; i++) {
      const v = s.data.subarray(i * 6, i * 6 + 6);
      close(Math.hypot(v[3], v[4], v[5]), 1, 1e-6, `normal ${i} length`);
      // On a sphere centred at the origin the outward normal is the direction
      // of the point itself.
      const len = Math.hypot(v[0], v[1], v[2]) || 1;
      const cos = (v[0] * v[3] + v[1] * v[4] + v[2] * v[5]) / len;
      assert.ok(cos > 0.98, `normal ${i} should point outward, cos = ${cos}`);
    }
  });

  test('triangle winding matches the normals, so back-face culling keeps the outside', () => {
    const s = revolveCurve(halfCircle(0.6, 24), { sides: 16, zOffset: 0 });
    const v = (i) => Array.from(s.data.subarray(i * 6, i * 6 + 3));
    const n = (i) => Array.from(s.data.subarray(i * 6 + 3, i * 6 + 6));
    const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
    const sub = (a, b) => a.map((x, k) => x - b[k]);
    for (let t = 0; t < s.vertexCount / 3; t++) {
      const [a, b, c] = [v(t*3), v(t*3+1), v(t*3+2)];
      const face = cross(sub(b, a), sub(c, b));
      const len = Math.hypot(...face);
      if (len < 1e-12) continue;                       // degenerate at the poles
      const nv = n(t * 3);
      const dot = (face[0]*nv[0] + face[1]*nv[1] + face[2]*nv[2]) / len;
      assert.ok(dot > 0, `triangle ${t} is wound inside-out (dot ${dot.toFixed(3)})`);
    }
  });

  test('the solid is pushed in front of the painting by default', () => {
    const s = revolveCurve(halfCircle(0.5, 20), { sides: 12 });
    for (let i = 0; i < s.vertexCount; i++) assert.ok(s.data[i * 6 + 2] > 0, 'z > 0');
    close(s.radius, 0.5, 1e-6);
  });
});
