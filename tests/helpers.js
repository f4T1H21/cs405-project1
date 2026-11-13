// Test helpers.
import assert from 'node:assert/strict';

export const EPS = 1e-5;

export function close(actual, expected, eps = EPS, msg = '') {
  assert.ok(Number.isFinite(actual), `${msg} expected a finite number, got ${actual}`);
  assert.ok(Math.abs(actual - expected) <= eps, `${msg} expected ${expected}, got ${actual}`);
}

export function closeArr(actual, expected, eps = EPS, msg = '') {
  assert.ok(actual && typeof actual.length === 'number', `${msg} expected an array, got ${actual}`);
  assert.equal(actual.length, expected.length, `${msg} length`);
  for (let i = 0; i < expected.length; i++) {
    assert.ok(Number.isFinite(actual[i]), `${msg} [${i}] is not finite: ${actual[i]}`);
    assert.ok(
      Math.abs(actual[i] - expected[i]) <= eps,
      `${msg} index ${i}: expected ${expected[i]}, got ${actual[i]}\n  actual:   [${Array.from(actual).map((x) => +(+x).toFixed(5))}]\n  expected: [${Array.from(expected).map((x) => +x.toFixed(5))}]`
    );
  }
}

/** M · v for a column-major 4×4 M (index c*4 + r) and a 4-vector v. */
export function apply(m, v) {
  const o = [0, 0, 0, 0];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) o[r] += m[c * 4 + r] * v[c];
  return o;
}

/** Transform a point (w = 1) and divide by w. */
export function project(m, p) {
  const [x, y, z, w] = apply(m, [p[0], p[1], p[2], 1]);
  return [x / w, y / w, z / w];
}

/** Reference product for checking, column-major. */
export function refMul(a, b) {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++)
    for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}

export const I4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** True if fn() throws the starter's NotImplemented error. */
export function isTodo(fn) {
  try { fn(); return false; } catch (e) { return e?.name === 'NotImplemented'; }
}
