import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as q from '../src/math/quat.js';
import { close, closeArr } from './helpers.js';

const D = Math.PI / 180;

describe('bonus · quaternions', () => {
  test('identity rotates nothing', () => {
    closeArr(q.rotateVec3(q.identity(), [1, 2, 3]), [1, 2, 3]);
  });

  test('fromAxisAngle matches the mat4 rotations', () => {
    closeArr(q.rotateVec3(q.fromAxisAngle([0, 0, 1], 90 * D), [1, 0, 0]), [0, 1, 0]);
    closeArr(q.rotateVec3(q.fromAxisAngle([0, 1, 0], 90 * D), [0, 0, 1]), [1, 0, 0]);
    closeArr(q.rotateVec3(q.fromAxisAngle([1, 0, 0], 90 * D), [0, 1, 0]), [0, 0, 1]);
  });

  test('unit quaternions stay unit, and multiply composes (b first)', () => {
    const a = q.fromAxisAngle([0, 1, 0], 0.7), b = q.fromAxisAngle([1, 0, 0], -0.4);
    const ab = q.multiply(a, b);
    close(Math.hypot(...ab), 1, 1e-6, 'norm');
    closeArr(q.rotateVec3(ab, [0.3, -0.2, 1]), q.rotateVec3(a, q.rotateVec3(b, [0.3, -0.2, 1])), 1e-6);
  });

  test('rotation preserves length', () => {
    const v = [0.3, -1.2, 2];
    const r = q.rotateVec3(q.fromAxisAngle([1, 2, -3], 1.1), v);
    close(Math.hypot(...r), Math.hypot(...v), 1e-6);
  });

  test('conjugate undoes the rotation', () => {
    const a = q.fromAxisAngle([1, -2, 0.5], 2.2);
    closeArr(q.rotateVec3(q.conjugate(a), q.rotateVec3(a, [1, 2, 3])), [1, 2, 3], 1e-6);
  });

  test('slerp hits both ends and the half-way rotation', () => {
    const a = q.identity(), b = q.fromAxisAngle([0, 1, 0], 90 * D);
    closeArr(q.slerp(a, b, 0), a, 1e-6);
    closeArr(q.slerp(a, b, 1), b, 1e-6);
    closeArr(q.rotateVec3(q.slerp(a, b, 0.5), [0, 0, 1]),
      q.rotateVec3(q.fromAxisAngle([0, 1, 0], 45 * D), [0, 0, 1]), 1e-6);
  });

  test('slerp takes the short way round even when told the long one', () => {
    const a = q.identity();
    const b = q.fromAxisAngle([0, 1, 0], 20 * D).map((x) => -x); // same rotation, negated
    const mid = q.slerp(a, b, 0.5);
    closeArr(q.rotateVec3(mid, [0, 0, 1]),
      q.rotateVec3(q.fromAxisAngle([0, 1, 0], 10 * D), [0, 0, 1]), 1e-6);
  });

  test('slerp is stable for nearly equal rotations', () => {
    const a = q.fromAxisAngle([0, 1, 0], 0.5);
    const b = q.fromAxisAngle([0, 1, 0], 0.5 + 1e-7);
    for (const x of q.slerp(a, b, 0.5)) assert.ok(Number.isFinite(x), `got ${x}`);
  });

  test('fromYawPitch agrees with the spherical orbit it replaces', () => {
    for (const [yaw, pitch] of [[0, 0], [0.9, 0.3], [-2.1, -1.2]]) {
      const d = 3.4;
      const eye = q.rotateVec3(q.fromYawPitch(yaw, pitch), [0, 0, d]);
      closeArr(eye, [
        d * Math.cos(pitch) * Math.sin(yaw),
        d * Math.sin(pitch),
        d * Math.cos(pitch) * Math.cos(yaw),
      ], 1e-5, `yaw ${yaw} pitch ${pitch}:`);
    }
  });
});
