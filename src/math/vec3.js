/**
 * vec3 — vectors as plain arrays [x, y, z]. Every function returns a new array
 * and never touches its arguments. Tests: tests/vec3.test.js
 */

export function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }

export function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }

export function scale(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }

export function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

/** Right-handed: cross([1,0,0], [0,1,0]) = [0,0,1]. */
export function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

export function length(a) { return Math.hypot(a[0], a[1], a[2]); }

/** A zero-length vector normalises to [0, 0, 0] rather than NaN. */
export function normalize(a) {
  const len = length(a);
  return len === 0 ? [0, 0, 0] : [a[0] / len, a[1] / len, a[2] / len];
}
