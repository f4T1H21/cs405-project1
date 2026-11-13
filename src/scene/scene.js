/**
 * Parts A and B. Part D lives in scene/curve.js.
 *
 * main.js calls update(dt), draw(pass, viewProj) and reset() from the panel.
 *
 * Part A is three objects in front of the painting, one of them slider-driven
 * and composable as T·R·S or S·R·T. Part B is a SceneNode tree five levels
 * deep, root → stand → turntable → armPivot → wrist → crate, animated at three
 * joints.
 *
 * Convention throughout: node.local is RIGID (T·R only) and a box's size lives
 * in node.data.size, applied at draw time as model = world · S. That keeps the
 * world matrices readable enough to check by hand, and stops a parent's scale
 * from squashing the debug axes.
 */
import * as mat4 from '../math/mat4.js';
import { SceneNode } from './node.js';
import { cube, axes } from './geometry.js';

/** Starting values of the UI-driven Part A object. */
const PART_A_DEFAULTS = {
  tx: -0.10, ty: 0.30, tz: 0.90,
  angle: 0.6,     // radians, about z
  scale: 0.30,
  order: 'T·R·S',
};

const AXIS_LENGTH = 0.22;

export function createScene({ renderer, painting, panel, meshes }) {
  const cubeMesh = meshes.createMesh(cube(), 'cube');
  const axesMesh = meshes.createMesh(axes(AXIS_LENGTH), 'axes');

  const state = {
    showObjects: true,
    debugAxes: false,
    animate: true,
    speed: 1,
    partA: { ...PART_A_DEFAULTS },
  };
  let clock = 0; // own clock, so "pause" and "speed" actually work

  /* ---------------------------------------------------------- the tree ---- */

  const root = new SceneNode('root');

  // --- Part A: three objects in front of the painting (z > 0). The first is
  // slider-driven in update(); the other two are fixed. -------------------
  const userBox = root.addChild(new SceneNode('userBox'));
  userBox.data = { mesh: cubeMesh, colour: [0.72, 0.22, 0.13], size: [1, 1, 1] };

  const blockLeft = root.addChild(new SceneNode('blockLeft',
    mat4.multiply(mat4.translate(0.78, -0.70, 0.55), mat4.rotateY(0.5))));
  blockLeft.data = { mesh: cubeMesh, colour: [0.15, 0.28, 0.42], size: [0.30, 0.30, 0.30] };

  const blockRight = root.addChild(new SceneNode('blockRight',
    mat4.multiply(mat4.translate(0.40, -0.86, 1.10), mat4.rotateY(-0.35))));
  blockRight.data = { mesh: cubeMesh, colour: [0.55, 0.45, 0.16], size: [0.22, 0.22, 0.22] };

  // --- Part B: five levels, eight nodes under the root. --------------------
  // stand → turntable → armPivot → wrist → crate
  const stand = root.addChild(new SceneNode('stand', mat4.translate(-1.05, -0.92, 0.70)));

  const plinth = stand.addChild(new SceneNode('plinth', mat4.translate(0, 0.12, 0)));
  plinth.data = { mesh: cubeMesh, colour: [0.09, 0.09, 0.10], size: [0.46, 0.24, 0.46] };

  const turntable = stand.addChild(new SceneNode('turntable', mat4.translate(0, 0.30, 0)));
  turntable.data = { mesh: cubeMesh, colour: [0.30, 0.30, 0.33], size: [0.26, 0.06, 0.26] };

  const armPivot = turntable.addChild(new SceneNode('armPivot'));

  const armBar = armPivot.addChild(new SceneNode('armBar', mat4.translate(0.26, 0, 0)));
  armBar.data = { mesh: cubeMesh, colour: [0.52, 0.47, 0.39], size: [0.52, 0.05, 0.05] };

  const counterweight = armPivot.addChild(new SceneNode('counterweight', mat4.translate(-0.17, 0, 0)));
  counterweight.data = { mesh: cubeMesh, colour: [0.22, 0.22, 0.24], size: [0.11, 0.11, 0.11] };

  const wrist = armPivot.addChild(new SceneNode('wrist', mat4.translate(0.52, 0, 0)));

  const crate = wrist.addChild(new SceneNode('crate'));
  crate.data = { mesh: cubeMesh, colour: [0.18, 0.42, 0.22], size: [0.14, 0.14, 0.14] };

  // One uniform buffer per drawable, and one per node's debug axes.
  root.traverse((n) => {
    if (n.data.mesh) n.data.instance = meshes.createInstance('shaded', n.name);
    n.data.axesInstance = meshes.createInstance('lines', `${n.name} axes`);
  });

  /* ------------------------------------------------------------- panel ---- */

  const a = panel.folder('Part A · transforms');
  const sliders = [
    a.slider('translate x', state.partA, 'tx', -1.5, 1.5, 0.01),
    a.slider('translate y', state.partA, 'ty', -1.0, 1.0, 0.01),
    a.slider('translate z', state.partA, 'tz', 0.05, 1.8, 0.01),
    a.slider('rotate z (rad)', state.partA, 'angle', -Math.PI, Math.PI, 0.01),
    a.slider('scale', state.partA, 'scale', 0.05, 0.8, 0.01),
  ];
  const orderSelect = a.select('order', ['T·R·S', 'S·R·T'], state.partA.order,
    (v) => (state.partA.order = v));
  a.note('Both compositions of the same T, R, S — the active one is marked.');
  const trsReadout = a.text('');
  const srtReadout = a.text('');

  const b = panel.folder('Part B · scene graph');
  const animateToggle = b.toggle('animate', state, 'animate');
  const speedSlider = b.slider('speed', state, 'speed', 0, 3, 0.05);
  b.note('tree (depth-first):');
  const treeReadout = b.text(treeDiagram(root));
  b.note('world matrix of the leaf "crate":');
  const leafReadout = b.text('');

  panel.folder('Scene').note(
    `painting ${painting.aspect.toFixed(2)} : 1 — every object sits at z > 0, in front of it.`);

  /* ------------------------------------------------------------- frame ---- */

  /** Both orders of the same T, R and S; the panel prints both. */
  function compose() {
    const p = state.partA;
    const T = mat4.translate(p.tx, p.ty, p.tz);
    const R = mat4.rotateZ(p.angle);
    const S = mat4.scale(p.scale, p.scale, p.scale);
    // multiply(A, B) = A·B, so the RIGHTMOST factor touches the object first.
    const TRS = mat4.multiply(T, mat4.multiply(R, S)); // scale, then rotate, then move
    const SRT = mat4.multiply(S, mat4.multiply(R, T)); // move, then rotate, then scale
    return { TRS, SRT };
  }

  return {
    state,
    root,

    update(dt) {
      if (state.animate) clock += dt * state.speed;

      const { TRS, SRT } = compose();
      userBox.local = state.partA.order === 'T·R·S' ? TRS : SRT;
      const mark = (active) => (active ? '▶ ' : '  ');
      trsReadout.set(`${mark(state.partA.order === 'T·R·S')}M = T·R·S\n${mat4.format(TRS, 3)}`);
      srtReadout.set(`${mark(state.partA.order === 'S·R·T')}M = S·R·T\n${mat4.format(SRT, 3)}`);

      // Three joints move; one traversal updates the whole subtree.
      turntable.local = mat4.multiply(mat4.translate(0, 0.30, 0), mat4.rotateY(clock * 0.8));
      armPivot.local = mat4.rotateZ(0.35 + 0.45 * Math.sin(clock * 1.3));
      crate.local = mat4.rotateY(-clock * 2.0);

      root.updateWorld();
      leafReadout.set(mat4.format(crate.world, 3));
    },

    /** @param {GPURenderPassEncoder} pass  @param {Float32Array} viewProj  P · V */
    draw(pass, viewProj) {
      root.traverse((node) => {
        const { mesh, instance, colour, size } = node.data;
        if (mesh && state.showObjects) {
          // The box's own size, kept out of the node tree.
          const model = mat4.multiply(node.world, mat4.scale(size[0], size[1], size[2]));
          meshes.drawShaded(pass, renderer, mesh, instance, mat4.multiply(viewProj, model), model, colour);
        }
        if (state.debugAxes) {
          meshes.drawLines(pass, renderer, axesMesh, node.data.axesInstance,
            mat4.multiply(viewProj, node.world));
        }
      });
    },

    reset() {
      Object.assign(state.partA, PART_A_DEFAULTS);
      state.speed = 1;
      state.animate = true;
      clock = 0;
      for (const s of sliders) s.update();
      speedSlider.update();
      animateToggle.update();
      orderSelect.set(state.partA.order);
    },
  };
}

/** Plain-text tree for the panel, and for the diagram in the report. */
function treeDiagram(root) {
  const lines = [];
  root.traverse((n, d) => lines.push(`${'  '.repeat(d)}${d ? '└ ' : ''}${n.name}`));
  return lines.join('\n');
}
