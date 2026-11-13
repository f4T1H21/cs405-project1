/**
 * Matching the virtual camera to the painting's own perspective.
 * Bonus for Part C; the full derivation is in report.md §6.3.
 *
 * Three straight edges of the stone slab were found by scanning each image
 * column for the first sustained dark/light transition, then fitted by least
 * squares to an rms of 1.5–2.3 px on a 1280 × 893 image.
 *
 * Near and far edge are parallel in the world but meet 32 image widths to the
 * right, so the slab's width axis lies parallel to the picture plane: a
 * one-point perspective, with the station point on the normal through the
 * principal point. With no yaw or roll the depth vanishing point then sits on
 * the principal column, and the slab's left edge crosses it ABOVE the canvas
 * at (640, −474) px. That is Δ = 921 px above centre, and Δ = f·tan θ: one
 * equation in two unknowns, so fovY is chosen and the elevation θ follows
 * (see FOV_SENSITIVITY). Separating them needs two finite orthogonal
 * vanishing points, and the second one here is at infinity.
 *
 * A perspective picture looks undistorted from one place only: on that normal,
 * far enough away to fill the field of view it was drawn with. The quad is
 * 2 units high, so the distance is d = 1 / tan(fovY / 2), whatever the image's
 * pixel size. That is the camera matchedCamera() returns.
 */

/** The painting these measurements belong to; they mean nothing for any other. */
export const PAINTING_ID = 'kavunlu';

export const IMAGE = { width: 1280, height: 893 };

/** Least-squares fits in PIXELS, y = slope·x + intercept, over `n` columns. */
export const EDGES = {
  far: { slope: 0.00902, intercept: 432.4, rms: 1.51, n: 16 },
  near: { slope: -0.00038, intercept: 822.7, rms: 2.29, n: 83 },
  left: { slope: -1.90043, intercept: 741.9, rms: 2.24, n: 12 },
};

/** Vanishing point of the width axis: far enough out to count as infinity. */
export const WIDTH_VP = { x: 41541, y: 807, imageWidthsFromCentre: 32.0 };

/** Elevation implied by VP_depth for a few candidate fields of view. */
export const FOV_SENSITIVITY = [
  { fovYDeg: 35, focalPx: 1416, elevationDeg: 33.0 },
  { fovYDeg: 45, focalPx: 1078, elevationDeg: 40.5 },
  { fovYDeg: 55, focalPx: 858, elevationDeg: 47.0 },
];

/** The project default, and the middle of the table above. */
export const FOV_Y = 45 * Math.PI / 180;

/** Principal point, assumed to be the centre of the canvas. */
export const principalPoint = () => [IMAGE.width / 2, IMAGE.height / 2];

/** Depth vanishing point: the slab's left edge on the principal column. */
export function depthVanishingPoint() {
  const x = IMAGE.width / 2;
  return [x, EDGES.left.slope * x + EDGES.left.intercept];
}

/** Downward elevation of the painted view, in radians, for a given fovY. */
export function elevation(fovY = FOV_Y) {
  const focal = (IMAGE.height / 2) / Math.tan(fovY / 2);
  return Math.atan((IMAGE.height / 2 - depthVanishingPoint()[1]) / focal);
}

/** Pixel row → height on the quad (y ∈ [−1, 1]). The VP lands outside it. */
export const rowToWorldY = (py) => 1 - 2 * (py / IMAGE.height);

/** The painter's station point: square on, at the distance that fills fovY. */
export function matchedCamera() {
  return {
    target: [0, 0, 0],
    yaw: 0,
    pitch: 0,
    distance: 1 / Math.tan(FOV_Y / 2), // ≈ 2.414 for a 2-unit-high quad
    fovY: FOV_Y,
  };
}

/**
 * The reconstruction as polylines in WORLD coordinates on the painting plane:
 * the three fitted edges extended, the horizon, and the vanishing point.
 */
export function overlay(aspect) {
  const { width: W, height: H } = IMAGE;
  const toWorld = ([px, py]) => [(2 * px / W - 1) * aspect, rowToWorldY(py)];
  const lineAcross = ({ slope, intercept }, x0 = -0.15 * W, x1 = 1.15 * W) =>
    [toWorld([x0, slope * x0 + intercept]), toWorld([x1, slope * x1 + intercept])];

  const vp = depthVanishingPoint();
  const vpWorld = toWorld(vp);
  const r = 0.07;
  return {
    far: lineAcross(EDGES.far),
    near: lineAcross(EDGES.near),
    left: [toWorld([0, EDGES.left.intercept]), vpWorld],
    horizon: [[-1.3 * aspect, vpWorld[1]], [1.3 * aspect, vpWorld[1]]],
    vanishingPoint: vpWorld,
    vpCross: [
      [[vpWorld[0] - r, vpWorld[1]], [vpWorld[0] + r, vpWorld[1]]],
      [[vpWorld[0], vpWorld[1] - r], [vpWorld[0], vpWorld[1] + r]],
    ],
  };
}
