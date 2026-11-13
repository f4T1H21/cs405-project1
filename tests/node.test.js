import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { SceneNode } from '../src/scene/node.js';
import * as m from '../src/math/mat4.js';
import { closeArr, apply, I4 } from './helpers.js';

describe('Part B · scene graph', () => {
  test('root with no parent: world = local', () => {
    const root = new SceneNode('root', m.translate(1, 2, 3));
    root.updateWorld();
    closeArr(root.world, m.translate(1, 2, 3));
  });

  test('three levels of translation add up', () => {
    const root = new SceneNode('root', m.translate(1, 0, 0));
    const arm = root.addChild(new SceneNode('arm', m.translate(0, 2, 0)));
    const hand = arm.addChild(new SceneNode('hand', m.translate(0, 0, 3)));
    root.updateWorld();
    closeArr(apply(hand.world, [0, 0, 0, 1]), [1, 2, 3, 1]);
    closeArr(apply(arm.world, [0, 0, 0, 1]), [1, 2, 0, 1]);
  });

  test('a parent rotation carries the child: world = parent.world · local', () => {
    const root = new SceneNode('root', m.rotateZ(Math.PI / 2));
    const child = root.addChild(new SceneNode('child', m.translate(1, 0, 0)));
    root.updateWorld();
    closeArr(apply(child.world, [0, 0, 0, 1]), [0, 1, 0, 1]);
  });

  test('changing a local matrix and updating again moves the subtree', () => {
    const root = new SceneNode('root');
    const a = root.addChild(new SceneNode('a', m.translate(1, 0, 0)));
    const b = a.addChild(new SceneNode('b', m.translate(1, 0, 0)));
    root.updateWorld();
    closeArr(apply(b.world, [0, 0, 0, 1]), [2, 0, 0, 1]);
    a.local = m.translate(5, 0, 0);
    root.updateWorld();
    closeArr(apply(b.world, [0, 0, 0, 1]), [6, 0, 0, 1]);
  });

  test('updateWorld(parentWorld) uses the matrix it is given', () => {
    const n = new SceneNode('n', m.translate(0, 1, 0));
    n.updateWorld(m.translate(2, 0, 0));
    closeArr(apply(n.world, [0, 0, 0, 1]), [2, 1, 0, 1]);
  });

  test('provided helpers: addChild, traverse, find', () => {
    const root = new SceneNode('root');
    const a = root.addChild(new SceneNode('a'));
    a.addChild(new SceneNode('b'));
    const seen = [];
    root.traverse((n, d) => seen.push(`${n.name}:${d}`));
    assert.deepEqual(seen, ['root:0', 'a:1', 'b:2']);
    assert.equal(root.find('b').parent, a);
    closeArr(root.local, I4);
  });
});
