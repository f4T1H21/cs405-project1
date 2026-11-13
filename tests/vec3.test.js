import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as v from '../src/math/vec3.js';
import { close, closeArr } from './helpers.js';

test('add / sub / scale', () => {
  closeArr(v.add([1, 2, 3], [4, -5, 6]), [5, -3, 9]);
  closeArr(v.sub([1, 2, 3], [4, -5, 6]), [-3, 7, -3]);
  closeArr(v.scale([1, -2, 3], 2), [2, -4, 6]);
});

test('functions do not modify their inputs', () => {
  const a = [1, 2, 3], b = [4, 5, 6];
  v.add(a, b); v.sub(a, b); v.scale(a, 3); v.cross(a, b); v.normalize(a);
  assert.deepEqual(a, [1, 2, 3]);
  assert.deepEqual(b, [4, 5, 6]);
});

test('dot', () => {
  close(v.dot([1, 2, 3], [4, -5, 6]), 12);
  close(v.dot([1, 0, 0], [0, 1, 0]), 0);
});

test('cross is right-handed and perpendicular', () => {
  closeArr(v.cross([1, 0, 0], [0, 1, 0]), [0, 0, 1]);
  closeArr(v.cross([0, 1, 0], [0, 0, 1]), [1, 0, 0]);
  closeArr(v.cross([0, 1, 0], [1, 0, 0]), [0, 0, -1]);
  const a = [1, 2, 3], b = [-2, 0.5, 4], c = v.cross(a, b);
  close(v.dot(c, a), 0);
  close(v.dot(c, b), 0);
});

test('length and normalize', () => {
  close(v.length([3, 4, 12]), 13);
  closeArr(v.normalize([3, 0, 4]), [0.6, 0, 0.8]);
  close(v.length(v.normalize([7, -3, 2])), 1);
});

test('normalize of the zero vector is [0, 0, 0], not NaN', () => {
  closeArr(v.normalize([0, 0, 0]), [0, 0, 0]);
});
