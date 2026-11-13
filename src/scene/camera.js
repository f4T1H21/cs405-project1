/**
 * Camera — Part C. Plain data; viewProjection() turns it into P·V with mat4.
 *
 * The camera orbits its target, so the orientation and `distance` are the
 * state of record and `eye` is derived by updateEye(). Everything else reads
 * `eye` and `up`.
 *
 * Two orbit models. Part C's keeps (yaw, pitch) and walks a sphere; the bonus
 * one keeps a unit quaternion, has no angles to lock, and can be slerped
 * between saved viewpoints.
 */
import * as mat4 from '../math/mat4.js';
import * as vec3 from '../math/vec3.js';
import * as quat from '../math/quat.js';
import { matchedCamera } from './paintingPerspective.js';
import { NotImplemented } from '../math/todo.js';

/** ±π/2 stays reachable, so lookAt's degenerate case can be hit from the UI. */
const MAX_PITCH = Math.PI / 2;
const ORBIT_SPEED = 0.005; // radians per CSS pixel of drag

export function createCamera() {
  return updateEye({
    target: [0, 0, 0],
    up: [0, 1, 0],
    yaw: 0,            // radians about world +y; 0 looks along −z
    pitch: 0,          // radians above the xz plane
    distance: 3.4,     // far enough back that the whole set-up is in frame
    eye: [0, 0, 3.4],  // derived from the three above
    fovY: Math.PI / 4, // radians
    /** 'yaw/pitch' uses the angles above; 'quaternion' uses `q`. */
    orbitMode: 'yaw/pitch',
    q: quat.identity(),
    /** Set by goTo(); null when the camera is not flying between viewpoints. */
    anim: null,
    // [0.1, 7] covers a scene ~1.5 units deep orbited from 0.4 to 5.5 away.
    // For z ∈ [0, 1] the depth spacing at distance d is
    // Δd = q·d²·(far − near)/(far·near) → q·d²/near, so NEAR sets the
    // precision and far barely matters: 0.01 would cost a factor of ten.
    near: 0.1,
    far: 7,
    projection: 'perspective', // or 'orthographic'
    orthoHeight: 2.2,  // world units visible vertically in orthographic mode
  });
}

/** The fixed inspection camera of Part C. */
export function createInspectionCamera() {
  const cam = createCamera();
  cam.target = [0, 0, 0.4];
  // Viewed from the left, so the frustum opens away from the control panel.
  cam.yaw = -0.85;
  cam.pitch = 0.30;
  cam.distance = 10.5;
  cam.fovY = 46 * Math.PI / 180;
  cam.far = 60;          // it has to contain the other camera's whole frustum
  cam.orbitMode = 'yaw/pitch';
  return updateEye(cam);
}

/**
 * Recompute `eye` and `up` from the orbit state. The orthographic height is
 * kept matching what the perspective camera sees at the target, so switching
 * projection does not change the framing. A flight in progress always uses the
 * quaternion, whichever model is selected.
 */
export function updateEye(cam) {
  if (cam.orbitMode === 'quaternion' || cam.anim) {
    // Orientation is wholly the quaternion: eye behind the target along the
    // rotated +z, `up` the rotated +y, so nothing goes singular at the poles.
    const back = quat.rotateVec3(cam.q, [0, 0, cam.distance]);
    cam.eye = vec3.add(cam.target, back);
    cam.up = quat.rotateVec3(cam.q, [0, 1, 0]);
  } else {
    const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    cam.eye = [
      cam.target[0] + cam.distance * cp * Math.sin(cam.yaw),
      cam.target[1] + cam.distance * sp,
      cam.target[2] + cam.distance * cp * Math.cos(cam.yaw),
    ];
    cam.up = [0, 1, 0];
  }
  cam.orthoHeight = 2 * cam.distance * Math.tan(cam.fovY / 2);
  return cam;
}

/** Mouse drag → orbit. dx, dy are in CSS pixels. */
export function orbit(cam, dx, dy) {
  cam.anim = null; // taking the controls cancels a flight
  if (cam.orbitMode === 'quaternion') {
    // Yaw about the WORLD up (left-multiply), pitch about the camera's OWN x
    // (right-multiply). Nothing is stored as an angle, so nothing can lock.
    cam.q = quat.normalize(quat.multiply(
      quat.fromAxisAngle([0, 1, 0], -dx * ORBIT_SPEED),
      quat.multiply(cam.q, quat.fromAxisAngle([1, 0, 0], -dy * ORBIT_SPEED))
    ));
  } else {
    cam.yaw -= dx * ORBIT_SPEED;
    cam.pitch = Math.min(MAX_PITCH, Math.max(-MAX_PITCH, cam.pitch + dy * ORBIT_SPEED));
  }
  return updateEye(cam);
}

/** Switch orbit model without moving the camera. */
export function setOrbitMode(cam, mode) {
  if (mode === cam.orbitMode) return cam;
  if (mode === 'quaternion') {
    cam.q = quat.fromYawPitch(cam.yaw, cam.pitch);
  } else {
    // Read the angles back off the orientation so the view holds still. Any
    // roll the free orbit picked up is dropped here.
    const dir = vec3.normalize(vec3.sub(cam.eye, cam.target));
    cam.pitch = Math.asin(Math.min(1, Math.max(-1, dir[1])));
    cam.yaw = Math.atan2(dir[0], dir[2]);
  }
  cam.orbitMode = mode;
  return updateEye(cam);
}

/* ------------------------------------------- viewpoints and flights ----- */

/** `painting` is the station point reconstructed in paintingPerspective.js. */
export function viewpoints() {
  const m = matchedCamera();
  return {
    front: { yaw: 0, pitch: 0, distance: 3.4, fovY: Math.PI / 4, target: [0, 0, 0] },
    'three-quarter': { yaw: 0.75, pitch: 0.34, distance: 3.6, fovY: Math.PI / 4, target: [0, 0, 0.3] },
    top: { yaw: 0, pitch: 1.35, distance: 3.2, fovY: Math.PI / 4, target: [0, 0, 0.4] },
    painting: { yaw: m.yaw, pitch: m.pitch, distance: m.distance, fovY: m.fovY, target: m.target },
  };
}

/**
 * Fly to a named viewpoint: orientation by slerp, so the turn runs at a
 * constant angular rate along the shortest arc; the rest linearly.
 */
export function goTo(cam, name, seconds = 0.9) {
  const to = viewpoints()[name];
  if (!to) return cam;
  const fromQ = cam.orbitMode === 'quaternion' ? cam.q : quat.fromYawPitch(cam.yaw, cam.pitch);
  cam.anim = {
    name,
    t: 0,
    seconds,
    fromQ,
    toQ: quat.fromYawPitch(to.yaw, to.pitch),
    fromDistance: cam.distance,
    fromTarget: [...cam.target],
    fromFov: cam.fovY,
    to,
  };
  return cam;
}

/** Advance a flight. Call once per frame; a no-op when nothing is flying. */
export function tickCamera(cam, dt) {
  const a = cam.anim;
  if (!a) return cam;
  a.t = Math.min(1, a.t + dt / a.seconds);
  const k = a.t * a.t * (3 - 2 * a.t); // smoothstep: start and end at rest

  cam.q = quat.slerp(a.fromQ, a.toQ, k);
  cam.distance = a.fromDistance + (a.to.distance - a.fromDistance) * k;
  cam.fovY = a.fromFov + (a.to.fovY - a.fromFov) * k;
  cam.target = [0, 1, 2].map((i) => a.fromTarget[i] + (a.to.target[i] - a.fromTarget[i]) * k);

  if (a.t >= 1) {
    // Land exactly on the viewpoint, in both representations.
    cam.yaw = a.to.yaw;
    cam.pitch = a.to.pitch;
    cam.q = a.toQ;
    cam.anim = null;
  }
  return updateEye(cam);
}

/** Mouse wheel → dolly in and out along the view direction. */
export function zoom(cam, delta) {
  cam.anim = null;
  // 5.5 is far enough out to show the reconstructed vanishing point above the
  // painting, and still inside the far plane.
  cam.distance = Math.min(5.5, Math.max(0.4, cam.distance * Math.exp(delta * 0.001)));
  return updateEye(cam);
}

/**
 * P·V for `cam`. `paintingAspect` is only used by the placeholder fallback.
 * @returns {{ matrix: Float32Array, fallback: boolean, missing?: string }}
 */
export function viewProjection(cam, aspect, paintingAspect = 1) {
  try {
    const view = mat4.lookAt(cam.eye, cam.target, cam.up);
    return { matrix: mat4.multiply(projection(cam, aspect), view), fallback: false };
  } catch (e) {
    if (!(e instanceof NotImplemented)) throw e;
    return { matrix: fitMatrix(aspect, paintingAspect), fallback: true, missing: e.message };
  }
}

/** P alone, for either projection mode. */
export function projection(cam, aspect) {
  if (cam.projection === 'orthographic') {
    const h = cam.orthoHeight / 2, w = h * aspect;
    return mat4.orthographic(-w, w, -h, h, cam.near, cam.far);
  }
  return mat4.perspective(cam.fovY, aspect, cam.near, cam.far);
}

/* ------------------------------------------------- frustum and picking -- */

/**
 * The eight world-space frustum corners: 0–3 the near quad, 4–7 the far quad,
 * counter-clockwise from bottom-left as the camera sees them. They are trivial
 * in VIEW space, where the half-height at distance d is d·tan(fovY/2), so they
 * are built there and pushed out with the rigid inverse of V.
 */
export function frustumCorners(cam, aspect) {
  const toWorld = mat4.invertRigid(mat4.lookAt(cam.eye, cam.target, cam.up));
  const ortho = cam.projection === 'orthographic';
  const corners = [];
  for (const d of [cam.near, cam.far]) {
    const h = ortho ? cam.orthoHeight / 2 : d * Math.tan(cam.fovY / 2);
    const w = h * aspect;
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const p = mat4.transformVec4(toWorld, [sx * w, sy * h, -d, 1]);
      corners.push([p[0], p[1], p[2]]);
    }
  }
  return corners;
}

/** World-space ray under an NDC pointer position. Part D drags with this. */
export function pickRay(cam, ndc, aspect) {
  const toWorld = mat4.invertRigid(mat4.lookAt(cam.eye, cam.target, cam.up));
  let o, d;
  if (cam.projection === 'orthographic') {
    const h = cam.orthoHeight / 2, w = h * aspect;
    o = [ndc[0] * w, ndc[1] * h, 0, 1]; // parallel rays start on the near plane
    d = [0, 0, -1, 0];
  } else {
    const h = Math.tan(cam.fovY / 2), w = h * aspect;
    o = [0, 0, 0, 1];                    // all rays start at the eye
    d = [ndc[0] * w, ndc[1] * h, -1, 0];
  }
  const O = mat4.transformVec4(toWorld, o);
  const D = mat4.transformVec4(toWorld, d);
  return { origin: [O[0], O[1], O[2]], dir: vec3.normalize([D[0], D[1], D[2]]) };
}

/** Where a ray meets the plane z = `z` (the painting's plane), or null. */
export function intersectPlaneZ(ray, z = 0) {
  if (Math.abs(ray.dir[2]) < 1e-6) return null;
  const t = (z - ray.origin[2]) / ray.dir[2];
  if (t <= 0) return null;
  return [ray.origin[0] + t * ray.dir[0], ray.origin[1] + t * ray.dir[1], z];
}

/** World point → normalised device coordinates, or null if behind the camera. */
export function projectToNDC(viewProj, p) {
  const c = mat4.transformVec4(viewProj, [p[0], p[1], p[2] ?? 0, 1]);
  if (c[3] <= 1e-6) return null;
  return [c[0] / c[3], c[1] / c[3]];
}

/**
 * The starter's placeholder, kept for the NotImplemented path above: fits the
 * painting quad to the canvas with +z in front. There is no camera in it.
 */
function fitMatrix(aspect, paintingAspect) {
  const s = 0.92 * Math.min(1, aspect / paintingAspect);
  return new Float32Array([
    s / aspect, 0, 0, 0,
    0, s, 0, 0,
    0, 0, -0.05, 0,
    0, 0, 0.5, 1,
  ]);
}
