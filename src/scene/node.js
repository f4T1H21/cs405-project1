/**
 * Scene graph node — Part B.
 *
 * Each node holds a LOCAL transform (relative to its parent) and a WORLD
 * matrix that you compute by traversal:  world = parent.world · local.
 * Tests: tests/node.test.js
 */
import * as mat4 from '../math/mat4.js';

// Literal, so a node can be built before mat4.identity() is implemented.
const I = () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

export class SceneNode {
  /**
   * @param {string} name   shown in debug output and your report diagram
   * @param {Float32Array} [local]  local transform (default identity)
   */
  constructor(name, local = I()) {
    this.name = name;
    this.local = local;
    this.world = I();
    this.parent = null;
    this.children = [];
    /** Anything you want to attach: a mesh, a colour, an animation function… */
    this.data = {};
  }

  /** Attach `child` under this node and return it (so calls can be chained). */
  addChild(child) {
    if (child.parent) child.parent.children.splice(child.parent.children.indexOf(child), 1);
    child.parent = this;
    this.children.push(child);
    return child;
  }

  /** world = parentWorld · local, recursively. The root is called with no argument. */
  updateWorld(parentWorld) {
    this.world = parentWorld ? mat4.multiply(parentWorld, this.local) : new Float32Array(this.local);
    for (const c of this.children) c.updateWorld(this.world);
  }

  /** Visit this node and all descendants depth-first: fn(node, depth). */
  traverse(fn, depth = 0) {
    fn(this, depth);
    for (const c of this.children) c.traverse(fn, depth + 1);
  }

  /** First node in the subtree with the given name, or null. */
  find(name) {
    if (this.name === name) return this;
    for (const c of this.children) {
      const hit = c.find(name);
      if (hit) return hit;
    }
    return null;
  }
}

// Re-exported for convenience when building trees: import { mat4 } from './node.js'
export { mat4 };
