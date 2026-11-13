/**
 * Entry point: wires GPU, painting, cameras, scene, curves and UI together and
 * runs the render loop. Part E, one application holding Parts A to D.
 *
 *   p_clip = P · V · M · p_object
 *
 * Split into math/, scene/, render/ and ui/.
 */
import './ui/style.css';
import { initWebGPU, showFatal } from './render/gpu.js';
import { Renderer } from './render/renderer.js';
import { Painting } from './render/painting.js';
import { MeshRenderer } from './render/mesh.js';
import { ribbonStrips } from './render/ribbon.js';
import {
  createCamera, createInspectionCamera, viewProjection, updateEye, setOrbitMode,
  orbit, zoom, goTo, tickCamera, frustumCorners, pickRay, intersectPlaneZ,
} from './scene/camera.js';
import { createScene } from './scene/scene.js';
import { createCurveLayer } from './scene/curve.js';
import * as perspective from './scene/paintingPerspective.js';
import { createPanel } from './ui/panel.js';
import { Stats } from './ui/stats.js';
import { attachPointer } from './ui/input.js';
import { PAINTINGS, DEFAULT_PAINTING, paintingURL } from './config.js';
import * as mat4 from './math/mat4.js';

async function main() {
  const canvas = document.getElementById('gfx');
  const gpu = await initWebGPU(canvas);
  const renderer = new Renderer(gpu);
  const painting = new Painting(gpu);
  const meshes = new MeshRenderer(gpu);

  const params = new URLSearchParams(location.search);
  let current = PAINTINGS.find((p) => p.id === params.get('painting'))
    ?? PAINTINGS.find((p) => p.id === DEFAULT_PAINTING);
  await painting.load(paintingURL(current));

  /* ---------------- cameras (Part C) ---------------- */
  const camera = createCamera();              // orbited with the mouse
  const inspector = createInspectionCamera(); // fixed, looks at the whole set-up
  const view = { mode: 'main camera', showFrustum: true, showPerspective: false };
  const activeCamera = () => (view.mode === 'main camera' ? camera : inspector);

  /* ---------------- UI ---------------- */
  const panelRoot = document.getElementById('panel');
  const panel = createPanel(panelRoot);
  const title = document.createElement('h1');
  title.textContent = 'CS405 · Project 1';
  panelRoot.appendChild(title);
  const stats = new Stats(panelRoot);

  const pf = panel.folder('Painting');
  pf.select('painting', PAINTINGS.map((p) => ({ value: p.id, label: `${p.artist} — ${p.title}` })), current.id,
    async (id) => {
      current = PAINTINGS.find((p) => p.id === id);
      await painting.load(paintingURL(current));
      curve.reset();            // the control points are in painting coordinates
      buildPerspectiveOverlay(); // and so is the reconstructed perspective
      history.replaceState(null, '', `?painting=${id}`);
    });

  // Part E: view switching, reset and every debug toggle in one place, each
  // bound straight to the state object its module exposes.
  const vf = panel.folder('View');
  const viewSelect = vf.select('view', ['main camera', 'inspection camera'], view.mode,
    (v) => (view.mode = v));
  // Only the main camera switches projection. The inspector stays perspective,
  // so an orthographic frustum shows up as the box it is.
  const projSelect = vf.select('projection', ['perspective', 'orthographic'], camera.projection,
    (v) => (camera.projection = v));
  const orbitSelect = vf.select('orbit', ['yaw/pitch', 'quaternion'], camera.orbitMode,
    (v) => setOrbitMode(camera, v));
  vf.note('fly to a viewpoint (slerp):');
  for (const name of ['front', 'three-quarter', 'top', 'painting']) {
    vf.button(name, () => { view.mode = 'main camera'; viewSelect.set(view.mode); goTo(camera, name); });
  }
  vf.button('reset all', () => {
    Object.assign(camera, createCamera());
    Object.assign(camUI, { fov: 45, near: camera.near, far: camera.far });
    for (const s of camSliders) s.update();
    view.mode = 'main camera';
    viewSelect.set(view.mode);
    projSelect.set(camera.projection);
    orbitSelect.set(camera.orbitMode);
    scene.reset();
    curve.reset();
  });

  const cf = panel.folder('Camera · Part C');
  const camStatus = cf.text('');
  const camUI = { fov: 45, near: camera.near, far: camera.far };
  const camSliders = [
    cf.slider('fovY (°)', camUI, 'fov', 20, 100, 1, (v) => { camera.fovY = v * Math.PI / 180; updateEye(camera); }),
    cf.slider('near', camUI, 'near', 0.01, 2, 0.01, (v) => (camera.near = v)),
    cf.slider('far', camUI, 'far', 1, 40, 0.5, (v) => (camera.far = v)),
  ];
  const camReadout = cf.text('');
  cf.note('drag to orbit · wheel to zoom');

  const scene = createScene({ renderer, painting, panel, meshes });
  const curve = createCurveLayer({
    gpu, renderer, painting, panel, meshes, paintingId: () => current.id,
  });

  const df = panel.folder('Debug drawings');
  df.toggle('scene objects (A, B)', scene.state, 'showObjects');
  df.toggle('node local axes (B)', scene.state, 'debugAxes');
  df.toggle('camera frustum (C)', view, 'showFrustum');
  df.toggle(`painting perspective (C bonus, ${perspective.PAINTING_ID} only)`, view, 'showPerspective');
  df.toggle('control polygon (D)', curve.state, 'showPolygon');
  df.toggle('de Casteljau (D)', curve.state, 'showCasteljau');
  df.note(gpu.encodeSRGB ? 'sRGB: encoded in shader (fallback)' : 'sRGB: canvas -srgb view');

  /* -------------- input --------------- */
  // Drag orbits the main camera and the wheel zooms it, unless the drag
  // started on a control point, or trace mode turns it into a stroke.
  let dragMode = 'orbit';
  const aspectOf = () => canvas.width / canvas.height;
  /** Where the pointer meets the painting's plane, in world coordinates. */
  const planeHit = (ndc) => intersectPlaneZ(pickRay(activeCamera(), ndc, aspectOf()), 0);

  attachPointer(canvas, {
    down(e) {
      const vp = viewProjection(activeCamera(), aspectOf(), painting.aspect).matrix;
      dragMode = curve.pointerDown(e, vp, aspectOf(), planeHit(e.ndc)) ? 'curve' : 'orbit';
    },
    drag(e) {
      if (dragMode === 'curve') curve.pointerDrag(planeHit(e.ndc));
      else orbit(camera, e.dx, e.dy); // the inspection camera stays put
    },
    up() { curve.pointerUp(); dragMode = 'orbit'; },
    wheel(e) { zoom(camera, e.delta); },
  });

  /* --------- frustum of the main camera, seen from the inspector -------- */
  const frustumMesh = meshes.createDynamicMesh(32, 'frustum');
  const frustumInst = meshes.createInstance('lines', 'frustum');

  function buildFrustum(cam, aspect) {
    const c = frustumCorners(cam, aspect); // 0–3 near, 4–7 far
    const out = [];
    const line = (p, q, col) => out.push(p[0], p[1], p[2], ...col, q[0], q[1], q[2], ...col);
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      line(c[i], c[j], [1.0, 0.72, 0.2]);          // near plane
      line(c[4 + i], c[4 + j], [0.35, 0.6, 1.0]);  // far plane
      line(c[i], c[4 + i], [0.55, 0.55, 0.6]);     // side edges
      line(cam.eye, c[i], [0.9, 0.3, 0.25]);       // eye → near corners
    }
    meshes.updateMesh(frustumMesh, new Float32Array(out));
  }

  /* ----- the painting's own perspective, reconstructed (Part C bonus) --- */
  const perspMesh = meshes.createDynamicMesh(256, 'painting perspective');
  const perspInst = meshes.createInstance('lines', 'painting perspective');

  function buildPerspectiveOverlay() {
    // The edges were measured on one painting, so over any other the overlay
    // just goes away.
    if (current.id !== perspective.PAINTING_ID) { perspMesh.count = 0; return; }
    const o = perspective.overlay(painting.aspect);
    const EDGE = [1.0, 0.55, 0.15], DEPTH = [0.25, 0.85, 1.0], HORIZON = [1.0, 0.35, 0.85];
    meshes.updateMesh(perspMesh, ribbonStrips([
      { pts: o.far, colour: EDGE },
      { pts: o.near, colour: EDGE },
      { pts: o.left, colour: DEPTH },
      { pts: o.horizon, colour: HORIZON },
      ...o.vpCross.map((pts) => ({ pts, colour: [1, 1, 1] })),
    ], 0.004, 0.02));
  }
  buildPerspectiveOverlay();

  /* ------------ render loop ----------- */
  let last = performance.now();
  function frame(now) {
    stats.begin(now);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;

    tickCamera(camera, dt); // advances a slerp flight, if one is running
    scene.update(dt, now / 1000);
    curve.update(dt);

    const aspect = aspectOf();
    const cam = activeCamera();
    const vp = viewProjection(cam, aspect, painting.aspect);
    camStatus.set(vp.fallback
      ? `PLACEHOLDER view (no camera yet)\n${vp.missing}`
      : `${view.mode} · P · V (${cam.projection})`);
    camStatus.el.classList.toggle('warn', vp.fallback);
    camReadout.set(
      `eye    ${cam.eye.map((x) => x.toFixed(2)).join(', ')}\n` +
      `target ${cam.target.map((x) => x.toFixed(2)).join(', ')}\n` +
      `fovY ${(cam.fovY * 180 / Math.PI).toFixed(1)}°  near ${cam.near}  far ${cam.far}\n` +
      (camera.orbitMode === 'quaternion'
        ? `q ${camera.q.map((x) => x.toFixed(2)).join(', ')}  dist ${camera.distance.toFixed(2)}`
        : `yaw ${(camera.yaw * 180 / Math.PI).toFixed(0)}°  pitch ${(camera.pitch * 180 / Math.PI).toFixed(0)}°` +
          `  dist ${camera.distance.toFixed(2)}`) +
      (camera.anim ? `\nflying to "${camera.anim.name}" ${(camera.anim.t * 100).toFixed(0)}%` : '')
    );

    const showFrustum = view.mode !== 'main camera' && view.showFrustum;
    if (showFrustum) buildFrustum(camera, aspect);

    const paintingMVP = vp.fallback ? vp.matrix : mat4.multiply(vp.matrix, painting.model);
    renderer.render((pass) => {
      painting.draw(pass, paintingMVP, renderer);
      if (view.showPerspective && perspMesh.count) {
        meshes.drawLines(pass, renderer, perspMesh, perspInst, vp.matrix, [1, 1, 1, 1], 'ribbon');
      }
      scene.draw(pass, vp.matrix);
      curve.draw(pass, vp.matrix);
      if (showFrustum) {
        meshes.drawLines(pass, renderer, frustumMesh, frustumInst, vp.matrix, [1, 1, 1, 1], 'list');
      }
    });

    stats.end(renderer.stats);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

main().catch((e) => {
  console.error(e);
  showFatal(e.message ?? String(e));
});
