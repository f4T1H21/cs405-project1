/**
 * mat4 — 4×4 matrices for Parts A and C. The tests check these conventions:
 *
 *   Float32Array(16), COLUMN-MAJOR: element (row r, column c) is at c*4 + r,
 *   which is what WebGPU wants for a mat4x4f, so nothing is repacked on
 *   upload. Translation therefore lands at 12, 13, 14.
 *
 *   Column vectors, p' = M·p, and multiply(A, B) = A·B, so B acts FIRST.
 *   Right-handed, radians, rotateZ(π/2) takes +x to +y.
 *   View space looks down −z with +y up; clip space is WebGPU's z ∈ [0, 1],
 *   not OpenGL's [−1, 1].
 *
 * Tests: tests/mat4.test.js
 */
import * as vec3 from './vec3.js';

/* ------------------------------------------------------------- Part A ---- */

export function identity() {
  return new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ]);
}

/** A·B, so B is applied first. Leaves both inputs alone. */
export function multiply(a, b) {
  const out = new Float32Array(16);
  // out(r, c) = Σ_k a(r, k)·b(k, c), with (row, col) living at col*4 + row.
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += a[k * 4 + r] * b[c * 4 + k];
      out[c * 4 + r] = sum;
    }
  }
  return out;
}

export function translate(tx, ty, tz) {
  return new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    tx, ty, tz, 1,
  ]);
}

export function rotateX(rad) {
  const c = Math.cos(rad), s = Math.sin(rad);
  return new Float32Array([
    1, 0, 0, 0,
    0, c, s, 0,
    0, -s, c, 0,
    0, 0, 0, 1,
  ]);
}

export function rotateY(rad) {
  const c = Math.cos(rad), s = Math.sin(rad);
  // Signs mirror rotateX and rotateZ: a positive angle takes +z to +x.
  return new Float32Array([
    c, 0, -s, 0,
    0, 1, 0, 0,
    s, 0, c, 0,
    0, 0, 0, 1,
  ]);
}

export function rotateZ(rad) {
  const c = Math.cos(rad), s = Math.sin(rad);
  return new Float32Array([
    c, s, 0, 0,
    -s, c, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ]);
}

export function scale(sx, sy, sz) {
  return new Float32Array([
    sx, 0, 0, 0,
    0, sy, 0, 0,
    0, 0, sz, 0,
    0, 0, 0, 1,
  ]);
}

export function transpose(m) {
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) out[r * 4 + c] = m[c * 4 + r];
  return out;
}

/**
 * Inverse of a rigid M = T·R, no scale. R is orthonormal so R⁻¹ = Rᵀ, giving
 * M⁻¹ = [Rᵀ, −Rᵀ·t; 0, 1], with no determinant and no division.
 */
export function invertRigid(m) {
  const out = identity();
  for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++) out[c * 4 + r] = m[r * 4 + c];
  const t = [m[12], m[13], m[14]];
  // Row r of Rᵀ is column r of R, i.e. m[r*4 .. r*4+2].
  for (let r = 0; r < 3; r++) {
    out[12 + r] = -(m[r * 4] * t[0] + m[r * 4 + 1] * t[1] + m[r * 4 + 2] * t[2]);
  }
  return out;
}

/** M·v for v = [x, y, z, w]. */
export function transformVec4(m, v) {
  const out = [0, 0, 0, 0];
  for (let r = 0; r < 4; r++) {
    out[r] = m[r] * v[0] + m[4 + r] * v[1] + m[8 + r] * v[2] + m[12 + r] * v[3];
  }
  return out;
}

/* ------------------------------------------------------------- Part C ---- */

/**
 * View matrix for a camera at `eye` looking at `target`. The camera looks down
 * its own −z, so its +z runs backwards, from target to eye.
 */
export function lookAt(eye, target, up) {
  let f = vec3.normalize(vec3.sub(eye, target));          // forward (camera +z)
  if (vec3.length(f) === 0) f = [0, 0, 1];                // eye == target

  // up × f collapses when up ‖ f, so fall back to whichever axis is least
  // aligned with f.
  let s = vec3.cross(up, f);
  if (vec3.length(s) < 1e-6) {
    const alt = Math.abs(f[1]) < 0.9 ? [0, 1, 0] : [0, 0, 1];
    s = vec3.cross(alt, f);
  }
  s = vec3.normalize(s);                                  // right  (camera +x)
  const u = vec3.cross(f, s);                             // up     (camera +y)

  // The rigid inverse of the camera's placement, written out: rows are the
  // basis vectors, translation is −(basis · eye).
  return new Float32Array([
    s[0], u[0], f[0], 0,
    s[1], u[1], f[1], 0,
    s[2], u[2], f[2], 0,
    -vec3.dot(s, eye), -vec3.dot(u, eye), -vec3.dot(f, eye), 1,
  ]);
}

/**
 * Perspective for WebGPU's z ∈ [0, 1]. fovY in radians, near and far positive
 * distances along −z. Row 4 is (0, 0, −1, 0), so w_clip = −z_view: that is the
 * perspective divide. Row 3 then solves −near → 0 and −far → 1.
 */
export function perspective(fovY, aspect, near, far) {
  const f = 1 / Math.tan(fovY / 2);
  const nf = 1 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, far * nf, -1,
    0, 0, near * far * nf, 0,
  ]);
}

/**
 * Orthographic box x ∈ [left, right], y ∈ [bottom, top], z ∈ [−near, −far],
 * onto [−1, 1] in x and y and [0, 1] in z. w stays 1, so there is no divide.
 */
export function orthographic(left, right, bottom, top, near, far) {
  const nf = 1 / (near - far);
  return new Float32Array([
    2 / (right - left), 0, 0, 0,
    0, 2 / (top - bottom), 0, 0,
    0, 0, nf, 0,
    -(right + left) / (right - left), -(top + bottom) / (top - bottom), near * nf, 1,
  ]);
}

/* ------------------------------------------------- provided (not graded) - */

/** Pretty-print a column-major matrix as four rows, for the panel. */
export function format(m, digits = 2) {
  if (!m) return '(none)';
  const w = digits + 4;
  let s = '';
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) s += (+m[c * 4 + r]).toFixed(digits).padStart(w);
    if (r < 3) s += '\n';
  }
  return s;
}
