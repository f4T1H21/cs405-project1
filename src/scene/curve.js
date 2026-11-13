/**
 * Curves over the painting — Part D, plus the curve bonuses.
 *
 * A piecewise cubic Bézier in the PLANE OF THE PAINTING (z ≈ 0), kept as one
 * flat list: n segments means 3n + 1 points, and segment i is points[3i…3i+3],
 * so neighbouring segments share their joint.
 *
 * C¹ holds by construction. After any edit the outgoing handle of every
 * interior joint is recomputed as P(3i+1) = 2·P(3i) − P(3i−1), which is what
 * makes the incoming tangent 3(P3−P2) equal the outgoing 3(Q1−Q0). Those
 * derived handles draw blue and cannot be dragged.
 *
 * Mouse: drag a control point (a joint carries its handles), shift-click to
 * append a segment, or switch on "trace & fit" and draw a freehand stroke to
 * replace the curve with a least-squares fit of it.
 *
 * The bonuses here are that fit, the surface of revolution (scene/revolve.js)
 * and the same curve evaluated in a compute shader (render/curveCompute.js).
 */
import * as mat4 from '../math/mat4.js';
import * as curves from '../math/curves.js';
import * as fitting from '../math/fit.js';
import { cube } from './geometry.js';
import { projectToNDC } from './camera.js';
import { revolveCurve } from './revolve.js';
import { CurveCompute } from '../render/curveCompute.js';
import { curveToJSON, downloadJSON } from './curveExport.js';
import { ribbonStrips } from '../render/ribbon.js';

/**
 * The bottom contour of the cut melon in "Kavunlu Natürmort", in normalised
 * painting coordinates (u right, v down). Three segments; 4 and 7 are the
 * derived handles. Follows the painted edge to about 1 % of the image width.
 */
const DEFAULT_UV = [
  [0.200, 0.691], [0.213, 0.706], [0.227, 0.755], [0.280, 0.778],
  [0.333, 0.801], [0.430, 0.847], [0.520, 0.831],
  [0.610, 0.815], [0.770, 0.709], [0.820, 0.684],
];

const CURVE_Z = 0.01;      // a hair in front of the painting
const TRAVEL_Z = 0.05;     // the object that rides the curve
const SAMPLES_PER_SEGMENT = 48;
const MAX_SEGMENTS = 8;
const MAX_CONTROLS = 3 * MAX_SEGMENTS + 1;
const MAX_SAMPLES = MAX_SEGMENTS * SAMPLES_PER_SEGMENT + 1;
const MARKER = 0.028;      // half-length of a control-point cross, world units
const PICK_RADIUS = 0.06;  // in NDC-y units (≈ 3 % of the window height)

/** Profile samples and steps around the axis, for the sweep. */
const REVOLVE_SIDES = 36, REVOLVE_SAMPLES = 72;

/** Ribbon half-widths, world units. */
const W_CURVE = 0.007, W_CR = 0.013, W_POLY = 0.0022, W_MARK = 0.0035, W_CAST = 0.004, W_STROKE = 0.004;

/* colours, LINEAR rgb */
const C_CURVE = [1.0, 0.38, 0.12];
const C_GPU = [0.35, 1.0, 0.45];
const C_POLY = [0.60, 0.60, 0.64];
const C_JOINT = [1.0, 0.82, 0.20];
const C_HANDLE = [0.92, 0.92, 0.92];
const C_DERIVED = [0.30, 0.60, 0.95];
const C_CR = [0.15, 0.80, 0.75];
const C_STROKE = [0.95, 0.95, 0.35];
const C_CAST = [[0.65, 0.65, 0.70], [0.35, 0.95, 0.40], [0.95, 0.45, 0.90], [1, 1, 1]];

export function createCurveLayer({ gpu, renderer, painting, panel, meshes, paintingId }) {
  const state = {
    showCurve: true,
    showPolygon: true,
    showCasteljau: true,
    showCatmullRom: false,
    animate: true,
    t: 0.45,
    // bonuses
    trace: false,
    fitSegments: 4,
    revolve: false,
    gpuCurve: false,
  };

  /** Control points in WORLD coordinates, [x, y]. */
  let points = [];
  let dragIndex = -1;
  let clock = 0;
  let stroke = null;        // freehand samples while tracing
  let fitReport = null;     // result of the last least-squares fit
  let dirty = true;         // the curve changed, so swept geometry is stale

  /* ----------------------------------------------- painting ↔ world ----- */
  const aspect = () => painting.aspect;
  const fromUV = ([u, v]) => [(2 * u - 1) * aspect(), 1 - 2 * v];

  function loadDefault() {
    points = DEFAULT_UV.map(fromUV);
    fitReport = null;
    stroke = null;
    enforceC1();
    dirty = true;
  }
  loadDefault();

  /* ------------------------------------------------------- curve data --- */

  const segmentCount = () => (points.length - 1) / 3;
  const isJoint = (i) => i % 3 === 0;
  /** Outgoing handles of interior joints are derived, not edited. */
  const isDerived = (i) => i % 3 === 1 && i > 1;

  /** The flat list viewed as segments of four control points. */
  function segments() {
    const out = [];
    for (let i = 0; i + 3 < points.length; i += 3) out.push(points.slice(i, i + 4));
    return out;
  }

  const joints = () => points.filter((_, i) => isJoint(i));

  function enforceC1() {
    for (let i = 4; i < points.length; i += 3) {
      points[i] = curves.c1NextControl(points[i - 2], points[i - 1]);
    }
  }

  function movePoint(i, to) {
    const dx = to[0] - points[i][0], dy = to[1] - points[i][1];
    points[i] = [to[0], to[1]];
    // A joint has to drag its handles along or the curve tears.
    if (isJoint(i)) {
      for (const j of [i - 1, i + 1]) {
        if (points[j]) points[j] = [points[j][0] + dx, points[j][1] + dy];
      }
    }
    enforceC1();
    dirty = true;
  }

  /** Shift-click: append a segment ending at `to`, C¹ at the new joint. */
  function addSegment(to) {
    if (segmentCount() >= MAX_SEGMENTS) return;
    const end = points[points.length - 1];
    const p1 = curves.c1NextControl(points[points.length - 2], end);
    const p2 = [(p1[0] + to[0]) / 2, (p1[1] + to[1]) / 2];
    points.push(p1, p2, [to[0], to[1]]);
    enforceC1();
    dirty = true;
  }

  /** Replace the curve with a least-squares fit of the freehand stroke. */
  function fitStroke() {
    if (!stroke || stroke.length < 4) { stroke = null; return; }
    const n = Math.min(state.fitSegments, MAX_SEGMENTS);
    const r = fitting.fitPiecewise(stroke, n);
    fitReport = {
      samples: stroke.length,
      segments: r.segments.length,
      rms: r.rms,
      rmsC0: r.rmsC0,
      max: r.max,
    };
    points = r.points.map((p) => [p[0], p[1]]);
    enforceC1();
    stroke = null;
    dirty = true;
  }

  /* ------------------------------------------------------------ meshes -- */

  const RIBBON_MAX = 2 * (MAX_SEGMENTS * SAMPLES_PER_SEGMENT + 2);
  const curveMesh = meshes.createDynamicMesh(RIBBON_MAX, 'bezier');
  const crMesh = meshes.createDynamicMesh(RIBBON_MAX, 'catmull-rom');
  const polyMesh = meshes.createDynamicMesh(2 * MAX_CONTROLS + 4, 'control polygon');
  const markMesh = meshes.createDynamicMesh(8 * MAX_CONTROLS, 'control points');
  const castMesh = meshes.createDynamicMesh(128, 'de Casteljau');
  const strokeMesh = meshes.createDynamicMesh(4096, 'freehand stroke');
  const revolveMesh = meshes.createDynamicMesh(REVOLVE_SIDES * (REVOLVE_SAMPLES - 1) * 6, 'revolved');

  const inst = {
    curve: meshes.createInstance('lines', 'bezier'),
    gpu: meshes.createInstance('lines', 'bezier (compute)'),
    cr: meshes.createInstance('lines', 'catmull-rom'),
    poly: meshes.createInstance('lines', 'control polygon'),
    mark: meshes.createInstance('lines', 'control points'),
    cast: meshes.createInstance('lines', 'de Casteljau'),
    stroke: meshes.createInstance('lines', 'freehand stroke'),
    rider: meshes.createInstance('shaded', 'rider'),
    revolve: meshes.createInstance('shaded', 'revolved'),
  };
  const riderMesh = meshes.createMesh(cube(), 'rider');
  let riderModel = mat4.identity();

  /** The same curve, evaluated and tessellated by a compute shader. */
  const compute = new CurveCompute(gpu, MAX_SAMPLES, MAX_CONTROLS);

  /* --------------------------------------------------------------- UI --- */

  const d = panel.folder('Part D · curves');
  d.toggle('curve', state, 'showCurve');
  d.toggle('Catmull–Rom', state, 'showCatmullRom');
  const animToggle = d.toggle('ride the curve', state, 'animate');
  const tSlider = d.slider('t', state, 't', 0, 1, 0.001);
  d.note('drag a control point · shift-click to add a segment');
  const info = d.text('');
  d.button('export JSON', () => {
    downloadJSON(curveToJSON({
      painting: paintingId(),
      kind: 'bezier-c1',
      aspect: aspect(),
      segments: segments(),
      points: joints(),
    }), `curve-${paintingId()}.json`);
  });
  d.button('reset curve', () => loadDefault());

  const bf = panel.folder('Bonus · curve');
  const traceToggle = bf.toggle('trace & fit (drag to draw)', state, 'trace');
  bf.slider('fit segments', state, 'fitSegments', 1, MAX_SEGMENTS, 1);
  bf.toggle('sweep: surface of revolution', state, 'revolve', () => (dirty = true));
  bf.toggle('evaluate on GPU (compute)', state, 'gpuCurve');
  const bonusInfo = bf.text('no fit yet');

  /* ----------------------------------------------- geometry building ---- */

  const ribbons = (strips, w) => ribbonStrips(strips, w, CURVE_Z);

  /** The whole curve as a polyline of n + 1 points. */
  function sampleCurve(n = segmentCount() * SAMPLES_PER_SEGMENT) {
    const segs = segments();
    const pts = [];
    for (let i = 0; i <= n; i++) pts.push(curves.evalPiecewise(segs, i / n));
    return pts;
  }

  /** A cross, so a control point can be seen and grabbed. */
  const cross = (p, colour, r = MARKER) => ([
    { pts: [[p[0] - r, p[1]], [p[0] + r, p[1]]], colour },
    { pts: [[p[0], p[1] - r], [p[0], p[1] + r]], colour },
  ]);

  function buildCurve() {
    meshes.updateMesh(curveMesh, ribbons([{ pts: sampleCurve(), colour: C_CURVE }], W_CURVE));
  }

  function buildPolygon() {
    meshes.updateMesh(polyMesh, ribbons([{ pts: points, colour: C_POLY }], W_POLY));
    const marks = points.flatMap((p, i) =>
      cross(p, isJoint(i) ? C_JOINT : isDerived(i) ? C_DERIVED : C_HANDLE));
    meshes.updateMesh(markMesh, ribbons(marks, W_MARK));
  }

  /**
   * de Casteljau in whichever segment t falls in. Each level is a polyline in
   * its own colour; the last level's single point lies on the curve and gets a
   * white cross.
   */
  function buildCasteljau() {
    const segs = segments();
    const g = Math.min(state.t, 0.999999) * segs.length;
    const i = Math.floor(g);
    const levels = curves.deCasteljau(segs[i], g - i);
    const strips = levels.map((pts, k) => ({ pts, colour: C_CAST[Math.min(k, C_CAST.length - 1)] }));
    strips.push(...cross(levels[levels.length - 1][0], [1, 1, 1], MARKER * 0.8));
    meshes.updateMesh(castMesh, ribbons(strips, W_CAST));
  }

  /**
   * The second curve family: uniform Catmull–Rom through the Bézier's joints,
   * which it interpolates rather than approximates. Drawn wider and underneath
   * so it reads as a halo where the two agree.
   */
  function buildCatmullRom() {
    const j = joints();
    if (j.length < 2) { crMesh.count = 0; return; }
    // Duplicated ends give the first and last spans their missing neighbours.
    const p = [j[0], ...j, j[j.length - 1]];
    const pts = [];
    for (let i = 0; i + 3 < p.length; i++) {
      for (let s = 0; s <= SAMPLES_PER_SEGMENT; s++) {
        if (i > 0 && s === 0) continue; // the joint is already there
        pts.push(curves.catmullRom(p[i], p[i + 1], p[i + 2], p[i + 3], s / SAMPLES_PER_SEGMENT));
      }
    }
    meshes.updateMesh(crMesh, ribbons([{ pts, colour: C_CR }], W_CR));
  }

  /** The box that rides the curve, turned to face along the tangent. */
  function buildRider(u) {
    const segs = segments();
    const p = curves.evalPiecewise(segs, u);
    const tangent = curves.evalPiecewiseTangent(segs, u);
    // The curve is planar, so following the tangent is one rotation about z.
    const angle = Math.atan2(tangent[1], tangent[0]);
    riderModel = mat4.multiply(
      mat4.translate(p[0], p[1], TRAVEL_Z),
      mat4.multiply(mat4.rotateZ(angle), mat4.scale(0.14, 0.045, 0.045))
    );
  }

  /** Sweep the curve into a solid and upload it. */
  function buildRevolve() {
    const swept = revolveCurve(sampleCurve(REVOLVE_SAMPLES - 1), { sides: REVOLVE_SIDES });
    meshes.updateMesh(revolveMesh, swept.data);
    revolveInfo = swept;
  }
  let revolveInfo = null;

  /** Largest mismatch between the tangents on the two sides of a joint. */
  function c1Residual() {
    const segs = segments();
    let worst = 0;
    for (let i = 0; i + 1 < segs.length; i++) {
      const inT = curves.cubicBezierTangent(...segs[i], 1);
      const outT = curves.cubicBezierTangent(...segs[i + 1], 0);
      worst = Math.max(worst, Math.hypot(inT[0] - outT[0], inT[1] - outT[1]));
    }
    return worst;
  }

  /* ------------------------------------------------------------- API ---- */

  return {
    state,

    /** @returns {boolean} true when the pointer was used for the curve */
    pointerDown({ ndc, shift }, viewProj, canvasAspect, worldPoint) {
      if (state.trace) {
        stroke = worldPoint ? [[worldPoint[0], worldPoint[1]]] : [];
        return true;
      }
      if (shift && worldPoint) { addSegment(worldPoint); return true; }
      dragIndex = -1;
      let best = PICK_RADIUS;
      points.forEach((p, i) => {
        if (isDerived(i)) return; // derived handles follow their joint
        const n = projectToNDC(viewProj, [p[0], p[1], CURVE_Z]);
        if (!n) return;
        const dist = Math.hypot((n[0] - ndc[0]) * canvasAspect, n[1] - ndc[1]);
        if (dist < best) { best = dist; dragIndex = i; }
      });
      return dragIndex >= 0;
    },

    pointerDrag(worldPoint) {
      if (!worldPoint) return false;
      if (stroke) {
        // Samples the hand barely moved add nothing and make the chord-length
        // parameters noisy.
        const last = stroke[stroke.length - 1];
        if (!last || Math.hypot(worldPoint[0] - last[0], worldPoint[1] - last[1]) > 0.004) {
          stroke.push([worldPoint[0], worldPoint[1]]);
        }
        return true;
      }
      if (dragIndex < 0) return false;
      movePoint(dragIndex, worldPoint);
      return true;
    },

    pointerUp() {
      if (stroke) fitStroke();
      dragIndex = -1;
    },

    update(dt) {
      if (state.animate) clock += dt;
      const u = state.animate ? (clock * 0.12) % 1 : state.t;

      buildCurve();
      buildPolygon();
      buildCasteljau();
      if (state.showCatmullRom) buildCatmullRom(); else crMesh.count = 0;
      buildRider(u);

      if (stroke && stroke.length > 1) {
        meshes.updateMesh(strokeMesh, ribbons([{ pts: stroke, colour: C_STROKE }], W_STROKE));
      } else {
        strokeMesh.count = 0;
      }

      if (state.revolve) {
        if (dirty) buildRevolve();
      } else {
        revolveMesh.count = 0;
      }

      // Submitted here, before the frame's render pass.
      if (state.gpuCurve) {
        compute.dispatch(points, {
          samples: Math.min(MAX_SAMPLES, segmentCount() * SAMPLES_PER_SEGMENT + 1),
          halfWidth: W_CURVE, z: CURVE_Z, colour: [...C_GPU, 1],
        });
      } else {
        compute.mesh.count = 0;
      }

      dirty = false;

      info.set(
        `segments ${segmentCount()}   control points ${points.length}\n` +
        `C¹ residual at joints  ${c1Residual().toExponential(1)}\n` +
        `rider u ${u.toFixed(3)}`
      );
      bonusInfo.set(bonusText());
      tSlider.update();
    },

    draw(pass, viewProj) {
      const white = [1, 1, 1, 1]; // the colour is per-vertex, so no tint

      if (state.revolve && revolveMesh.count) {
        const model = mat4.identity();
        meshes.drawShaded(pass, renderer, revolveMesh, inst.revolve,
          mat4.multiply(viewProj, model), model, [0.62, 0.66, 0.22]);
      }
      if (state.showCatmullRom) {
        meshes.drawLines(pass, renderer, crMesh, inst.cr, viewProj, white, 'ribbon');
      }
      if (state.showCurve) {
        meshes.drawLines(pass, renderer, curveMesh, inst.curve, viewProj, white, 'ribbon');
      }
      if (state.gpuCurve && compute.mesh.count) {
        meshes.drawLines(pass, renderer, compute.mesh, inst.gpu, viewProj, white, 'ribbon');
      }
      if (strokeMesh.count) {
        meshes.drawLines(pass, renderer, strokeMesh, inst.stroke, viewProj, white, 'ribbon');
      }
      if (state.showPolygon) {
        meshes.drawLines(pass, renderer, polyMesh, inst.poly, viewProj, white, 'ribbon');
        meshes.drawLines(pass, renderer, markMesh, inst.mark, viewProj, white, 'ribbon');
      }
      if (state.showCasteljau) {
        meshes.drawLines(pass, renderer, castMesh, inst.cast, viewProj, white, 'ribbon');
      }
      meshes.drawShaded(pass, renderer, riderMesh, inst.rider,
        mat4.multiply(viewProj, riderModel), riderModel, [0.95, 0.2, 0.15]);
    },

    reset() {
      loadDefault();
      state.t = 0.45;
      state.animate = true;
      state.trace = false;
      clock = 0;
      animToggle.update();
      traceToggle.update();
      tSlider.update();
    },
  };

  function bonusText() {
    const lines = [];
    if (state.trace) lines.push(stroke ? `tracing… ${stroke.length} samples` : 'trace: drag on the painting');
    if (fitReport) {
      lines.push(
        `fit ${fitReport.samples} samples → ${fitReport.segments} segments`,
        `  rms ${fitReport.rms.toFixed(4)}  max ${fitReport.max.toFixed(4)}`,
        `  rms before C¹ ${fitReport.rmsC0.toFixed(4)}`
      );
    }
    if (state.revolve && revolveInfo) {
      lines.push(`sweep ${revolveInfo.vertexCount.toLocaleString('en-US')} vertices, r ${revolveInfo.radius.toFixed(3)}`);
    }
    if (state.gpuCurve) lines.push(`GPU curve: ${compute.mesh.count} vertices from a compute pass`);
    return lines.length ? lines.join('\n') : 'no fit yet';
  }
}
