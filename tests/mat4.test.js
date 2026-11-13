import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as m from '../src/math/mat4.js';
import { close, closeArr, apply, project, refMul, I4 } from './helpers.js';

const D = Math.PI / 180;

// Two arbitrary matrices, column-major, and their product A·B (computed by hand / numpy).
const A = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
const B = [2, 0, 1, 0, 0, 1, 0, 3, -1, 0, 2, 0, 0, 4, 0, 1];
const AB = [11, 14, 17, 20, 44, 48, 52, 56, 17, 18, 19, 20, 33, 38, 43, 48];

/* ------------------------------------------------------------ Part A --- */

describe('Part A · basics', () => {
  test('identity is a column-major Float32Array(16)', () => {
    const I = m.identity();
    assert.ok(I instanceof Float32Array, 'return a Float32Array');
    assert.equal(I.length, 16);
    closeArr(I, I4);
  });

  test('multiply(A, B) = A·B in column-major order', () => {
    closeArr(m.multiply(new Float32Array(A), new Float32Array(B)), AB);
    closeArr(m.multiply(new Float32Array(B), new Float32Array(A)), refMul(B, A));
  });

  test('multiply does not modify its inputs and works with I', () => {
    const a = new Float32Array(A), b = new Float32Array(B);
    m.multiply(a, b);
    closeArr(a, A); closeArr(b, B);
    closeArr(m.multiply(m.identity(), a), A);
    closeArr(m.multiply(a, m.identity()), A);
  });

  test('translate puts (tx, ty, tz) at indices 12, 13, 14', () => {
    const T = m.translate(2, -3, 4);
    closeArr(T, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 2, -3, 4, 1]);
    closeArr(apply(T, [1, 1, 1, 1]), [3, -2, 5, 1]);
    closeArr(apply(T, [1, 1, 1, 0]), [1, 1, 1, 0], undefined, 'directions (w = 0) ignore translation:');
  });

  test('scale', () => {
    closeArr(apply(m.scale(2, 3, -1), [1, 1, 1, 1]), [2, 3, -1, 1]);
  });

  test('rotateX(90°): +y → +z', () => {
    closeArr(apply(m.rotateX(90 * D), [0, 1, 0, 0]), [0, 0, 1, 0]);
    closeArr(apply(m.rotateX(90 * D), [0, 0, 1, 0]), [0, -1, 0, 0]);
  });

  test('rotateY(90°): +z → +x', () => {
    closeArr(apply(m.rotateY(90 * D), [0, 0, 1, 0]), [1, 0, 0, 0]);
    closeArr(apply(m.rotateY(90 * D), [1, 0, 0, 0]), [0, 0, -1, 0]);
  });

  test('rotateZ(90°): +x → +y', () => {
    closeArr(apply(m.rotateZ(90 * D), [1, 0, 0, 0]), [0, 1, 0, 0]);
    closeArr(apply(m.rotateZ(90 * D), [0, 1, 0, 0]), [-1, 0, 0, 0]);
  });

  test('rotations by arbitrary angles are orthonormal (Rᵀ·R = I)', () => {
    for (const R of [m.rotateX(0.7), m.rotateY(-1.3), m.rotateZ(2.1)]) {
      closeArr(refMul(m.transpose(R), R), I4);
    }
  });

  test('transpose', () => {
    const T = m.transpose(new Float32Array(A));
    closeArr(T, [1, 5, 9, 13, 2, 6, 10, 14, 3, 7, 11, 15, 4, 8, 12, 16]);
  });

  test('transformVec4', () => {
    closeArr(m.transformVec4(new Float32Array(A), [1, 0, -1, 2]), apply(A, [1, 0, -1, 2]));
  });
});

describe('Part A · composition order', () => {
  const t = [1, 2, 0], s = [2, 2, 2], angle = 90 * D;
  test('T·R·S applies S, then R, then T', () => {
    const TRS = m.multiply(m.translate(...t), m.multiply(m.rotateZ(angle), m.scale(...s)));
    // (1, 0, 0) → scale → (2, 0, 0) → rotZ 90° → (0, 2, 0) → translate → (1, 4, 0)
    closeArr(apply(TRS, [1, 0, 0, 1]), [1, 4, 0, 1]);
  });
  test('S·R·T gives a different result for the same point', () => {
    const SRT = m.multiply(m.scale(...s), m.multiply(m.rotateZ(angle), m.translate(...t)));
    // (1, 0, 0) → translate → (2, 2, 0) → rotZ 90° → (−2, 2, 0) → scale → (−4, 4, 0)
    closeArr(apply(SRT, [1, 0, 0, 1]), [-4, 4, 0, 1]);
  });
});

describe('Part A · rigid inverse', () => {
  test('invertRigid(T·R) · (T·R) = I', () => {
    const M = m.multiply(m.translate(3, -1, 2), m.multiply(m.rotateY(0.8), m.rotateX(-0.4)));
    const Mi = m.invertRigid(M);
    closeArr(refMul(Mi, M), I4);
    closeArr(refMul(M, Mi), I4);
  });
  test('invertRigid does not modify its input', () => {
    const M = m.multiply(m.translate(1, 2, 3), m.rotateZ(0.5));
    const copy = Array.from(M);
    m.invertRigid(M);
    closeArr(M, copy);
  });
});

/* ------------------------------------------------------------ Part C --- */

describe('Part C · lookAt', () => {
  const eye = [3, 2, 5], target = [0, 0.5, 0], up = [0, 1, 0];
  const dist = Math.hypot(3, 1.5, 5);

  test('eye maps to the origin and target onto the −z axis', () => {
    const V = m.lookAt(eye, target, up);
    closeArr(apply(V, [...eye, 1]), [0, 0, 0, 1]);
    closeArr(apply(V, [...target, 1]), [0, 0, -dist, 1], 1e-4);
  });

  test('rotation part is orthonormal and right-handed (det = +1)', () => {
    const V = m.lookAt(eye, target, up);
    const R = Array.from(V); R[12] = R[13] = R[14] = 0;
    closeArr(refMul(m.transpose(new Float32Array(R)), R), I4, 1e-5);
    const det = R[0] * (R[5] * R[10] - R[9] * R[6]) - R[4] * (R[1] * R[10] - R[9] * R[2]) + R[8] * (R[1] * R[6] - R[5] * R[2]);
    close(det, 1, 1e-5, 'determinant');
  });

  test('world up stays up on screen (view-space y > 0, x = 0)', () => {
    const V = m.lookAt([0, 0, 5], [0, 0, 0], [0, 1, 0]);
    closeArr(apply(V, [0, 1, 0, 0]), [0, 1, 0, 0]);
    closeArr(apply(V, [1, 0, 0, 0]), [1, 0, 0, 0], undefined, 'world +x should be view +x (to the right):');
  });

  test('degenerate case: up parallel to the view direction stays finite', () => {
    for (const [e, u] of [[[0, 5, 0], [0, 1, 0]], [[0, -4, 0], [0, 1, 0]], [[0, 0, 3], [0, 0, 1]]]) {
      const V = m.lookAt(e, [0, 0, 0], u);
      for (const x of V) assert.ok(Number.isFinite(x), `lookAt(${e}, 0, ${u}) produced ${x}`);
      const R = Array.from(V); R[12] = R[13] = R[14] = 0;
      closeArr(refMul(m.transpose(new Float32Array(R)), R), I4, 1e-5);
      closeArr(apply(V, [0, 0, 0, 1]), [0, 0, -Math.hypot(...e), 1], 1e-4);
    }
  });
});

describe('Part C · perspective (WebGPU depth z ∈ [0, 1])', () => {
  const fov = 60 * D, aspect = 1.5, near = 0.5, far = 50;
  const P = () => m.perspective(fov, aspect, near, far);
  const tanH = Math.tan(fov / 2);

  test('near plane → z = 0, far plane → z = 1', () => {
    close(project(P(), [0, 0, -near])[2], 0, 1e-5, 'near:');
    close(project(P(), [0, 0, -far])[2], 1, 1e-5, 'far:');
  });

  test('depth increases monotonically between near and far', () => {
    let prev = -Infinity;
    for (const z of [0.5, 1, 2, 5, 10, 30, 50]) {
      const d = project(P(), [0, 0, -z])[2];
      assert.ok(d > prev, `depth at z = −${z} (${d}) should exceed ${prev}`);
      prev = d;
    }
  });

  test('w = −z_view (perspective divide)', () => {
    close(apply(P(), [0.3, -0.2, -7, 1])[3], 7);
  });

  test('frustum edges map to x, y = ±1', () => {
    const z = 4;
    closeArr(project(P(), [0, z * tanH, -z]).slice(0, 2), [0, 1], 1e-5, 'top edge:');
    closeArr(project(P(), [z * tanH * aspect, 0, -z]).slice(0, 2), [1, 0], 1e-5, 'right edge:');
    closeArr(project(P(), [-z * tanH * aspect, -z * tanH, -z]).slice(0, 2), [-1, -1], 1e-5, 'bottom-left:');
  });
});

describe('Part C · orthographic (WebGPU depth z ∈ [0, 1])', () => {
  const O = () => m.orthographic(-4, 2, -1, 3, 0.1, 20);
  test('box corners map to the clip-space cube', () => {
    closeArr(project(O(), [-4, -1, -0.1]), [-1, -1, 0], 1e-5, '(left, bottom, near):');
    closeArr(project(O(), [2, 3, -20]), [1, 1, 1], 1e-5, '(right, top, far):');
  });
  test('w stays 1', () => {
    close(apply(O(), [1, 1, -5, 1])[3], 1);
  });
});

describe('provided', () => {
  test('format prints rows', () => {
    const s = m.format(new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 5, 6, 7, 1]), 1);
    assert.equal(s.split('\n')[0].trim().split(/\s+/).join(' '), '1.0 0.0 0.0 5.0');
  });
});
