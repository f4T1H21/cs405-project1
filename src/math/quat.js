/**
 * quat — unit quaternions for the bonus orbit camera. A quaternion is
 * [x, y, z, w] with (x, y, z) = sin(θ/2)·axis and w = cos(θ/2). Storing no
 * angles about fixed axes is what removes gimbal lock, so the orbit can run
 * over the poles and keep going.
 *
 * Every function returns a new array. Tests: tests/quat.test.js
 */

export function identity() { return [0, 0, 0, 1]; }

/** `axis` need not be unit length. */
export function fromAxisAngle(axis, rad) {
  const len = Math.hypot(axis[0], axis[1], axis[2]);
  if (len === 0) return identity();
  const s = Math.sin(rad / 2) / len;
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(rad / 2)];
}

/** a·b is "b first, then a", like matrix multiplication. */
export function multiply(a, b) {
  const [ax, ay, az, aw] = a, [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

export function normalize(q) {
  const len = Math.hypot(q[0], q[1], q[2], q[3]);
  return len === 0 ? identity() : [q[0] / len, q[1] / len, q[2] / len, q[3] / len];
}

export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];

/** Undoes q, for unit q. */
export function conjugate(q) { return [-q[0], -q[1], -q[2], q[3]]; }

/**
 * q·v·q⁻¹ expanded to v + 2w(u × v) + 2u × (u × v), u being the vector part,
 * so no matrix is ever built.
 */
export function rotateVec3(q, v) {
  const u = [q[0], q[1], q[2]], w = q[3];
  const uv = [
    u[1] * v[2] - u[2] * v[1],
    u[2] * v[0] - u[0] * v[2],
    u[0] * v[1] - u[1] * v[0],
  ];
  const uuv = [
    u[1] * uv[2] - u[2] * uv[1],
    u[2] * uv[0] - u[0] * uv[2],
    u[0] * uv[1] - u[1] * uv[0],
  ];
  return [0, 1, 2].map((i) => v[i] + 2 * (w * uv[i] + uuv[i]));
}

/**
 * Slerp along the shortest arc, so the camera turns at a constant angular
 * rate. Nearly parallel inputs fall back to a normalised lerp, where sin(Ω) → 0
 * would otherwise divide away the precision.
 */
export function slerp(a, b, t) {
  let cos = dot(a, b);
  let end = b;
  if (cos < 0) { cos = -cos; end = [-b[0], -b[1], -b[2], -b[3]]; } // shortest arc
  if (cos > 0.9995) {
    return normalize([0, 1, 2, 3].map((i) => a[i] + (end[i] - a[i]) * t));
  }
  const omega = Math.acos(Math.min(1, cos));
  const sin = Math.sin(omega);
  const wa = Math.sin((1 - t) * omega) / sin;
  const wb = Math.sin(t * omega) / sin;
  return [0, 1, 2, 3].map((i) => a[i] * wa + end[i] * wb);
}

/**
 * Yaw about world +y, then pitch about the camera's own +x. Used when swapping
 * orbit models so the view does not jump. Pitch is negated because a positive
 * rotation about +x takes +z to −y, while a positive orbit pitch lifts the
 * camera towards +y.
 */
export function fromYawPitch(yaw, pitch) {
  return multiply(fromAxisAngle([0, 1, 0], yaw), fromAxisAngle([1, 0, 0], -pitch));
}
