import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as fit from '../src/math/fit.js';
import * as c from '../src/math/curves.js';
import { close, closeArr } from './helpers.js';

const sample = (seg, n) => Array.from({ length: n + 1 }, (_, i) => c.cubicBezier(...seg, i / n));

describe('bonus · least-squares Bézier fitting', () => {
  test('chord-length parameters run 0 → 1 and follow distance', () => {
    const t = fit.chordLengthParams([[0, 0], [1, 0], [3, 0]]);
    closeArr(t, [0, 1 / 3, 1]);
  });

  test('chord-length parameters survive a degenerate (all-equal) stroke', () => {
    const t = fit.chordLengthParams([[2, 2], [2, 2], [2, 2]]);
    for (const x of t) assert.ok(Number.isFinite(x), `got ${x}`);
    close(t[0], 0); close(t[t.length - 1], 1);
  });

  test('fitting samples of a cubic recovers that cubic', () => {
    const seg = [[0, 0], [1, 2], [3, 3], [4, 0]];
    const got = fit.fitCubicBezier(sample(seg, 60));
    // Many control polygons describe nearly the same cubic, so the interior
    // controls come back close rather than exact; the CURVE is what matters.
    // The segment spans ~5 units, so this is well under 1 % of its size.
    close(fit.error([got], sample(seg, 200), 96).max, 0, 0.02, 'max deviation');
    closeArr(got[0], seg[0]);
    closeArr(got[3], seg[3]);
  });

  test('a straight stroke fits a straight curve', () => {
    const pts = Array.from({ length: 20 }, (_, i) => [i / 19, 2 * (i / 19)]);
    const got = fit.fitCubicBezier(pts);
    close(fit.error([got], pts).max, 0, 1e-6);
  });

  test('fitCubicBezier works in 3D and pins the endpoints', () => {
    const seg = [[0, 0, 0], [1, 2, -1], [3, 3, 2], [4, 0, 1]];
    const got = fit.fitCubicBezier(sample(seg, 40));
    assert.equal(got[1].length, 3);
    closeArr(got[0], seg[0]);
    closeArr(got[3], seg[3]);
    close(fit.error([got], sample(seg, 120)).max, 0, 0.05);
  });

  test('too few samples still returns a usable cubic', () => {
    const got = fit.fitCubicBezier([[0, 0], [1, 1]]);
    assert.equal(got.length, 4);
    for (const p of got.flat()) assert.ok(Number.isFinite(p));
  });

  test('fitPiecewise returns C¹ segments that share their joints', () => {
    // A wiggle that one cubic cannot follow.
    const pts = Array.from({ length: 200 }, (_, i) => {
      const x = (i / 199) * 4 * Math.PI;
      return [x, Math.sin(x)];
    });
    const r = fit.fitPiecewise(pts, 4);
    assert.equal(r.segments.length, 4);
    for (let i = 0; i + 1 < r.segments.length; i++) {
      closeArr(r.segments[i][3], r.segments[i + 1][0], 1e-9, `joint ${i} is shared:`);
      closeArr(
        c.cubicBezierTangent(...r.segments[i], 1),
        c.cubicBezierTangent(...r.segments[i + 1], 0),
        1e-9, `joint ${i} is C¹:`
      );
    }
  });

  test('more segments fit a wiggly stroke better', () => {
    const pts = Array.from({ length: 300 }, (_, i) => {
      const x = (i / 299) * 4 * Math.PI;
      return [x, Math.sin(x)];
    });
    const few = fit.fitPiecewise(pts, 1).rms;
    const many = fit.fitPiecewise(pts, 6).rms;
    assert.ok(many < few, `6 segments (${many}) should beat 1 (${few})`);
    assert.ok(many < 0.05, `6 segments should be close, got rms ${many}`);
  });

  test('fitPiecewise copes with a short or repeated stroke', () => {
    for (const pts of [[[0, 0]], [[1, 1], [1, 1], [1, 1]], [[0, 0], [1, 1]]]) {
      const r = fit.fitPiecewise(pts, 3);
      assert.ok(r.segments.length >= 1);
      for (const x of r.segments.flat(2)) assert.ok(Number.isFinite(x), `got ${x}`);
    }
  });
});
