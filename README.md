# CS405 Project 1 — Transformations, Projection & Curves from Paintings

**Painting:** Şeker Ahmed Paşa — *Kavunlu Natürmort* (Sakıp Sabancı Museum).
The painting hangs in the scene as a textured quad at z = 0; objects are placed
in front of it (z > 0), the camera orbits around them, and a piecewise cubic
Bézier curve traces the bottom contour of the cut melon.

Everything is one WebGPU/WGSL application. No maths or scene-graph library is
used: `mat4`, `vec3` and the curve code are written from scratch.

## Running it

Requires **Node.js 20.19+** and a browser with WebGPU (current Chrome or Edge,
Safari 26+, Firefox 141+ on Windows).

```bash
npm install
npm run dev     
npm test
```

Open the page, and use the panel on the right. Nothing else is needed.

## The controls

Everything lives in one panel, grouped by part.

### Painting
| Control | What it does |
|---|---|
| `painting` | Swap the painting. The curve is reset, because its control points are stored in that painting's coordinates. |

### View *(Part E)*
| Control | What it does |
|---|---|
| `view` | **main camera** — the orbiting camera you control. **inspection camera** — a second, fixed camera that watches the whole set-up from the left and draws the main camera's frustum. |
| `projection` | Perspective or orthographic, for the main camera only. Both are framed to match at the target, so the two screenshots are directly comparable. |
| `orbit` | **yaw/pitch** — the spherical orbit of Part C; pitch stops at ±90°. **quaternion** *(bonus)* — a free orbit with no angles to lock, so it rolls straight over the pole and keeps going. Switching does not move the camera. |
| `front` · `three-quarter` · `top` · `painting` *(bonus)* | Fly to a saved viewpoint. The orientation is interpolated with **slerp**, so the camera turns at a constant angular rate; distance, target and fovY are interpolated linearly, with smoothstep easing. `painting` is the station point reconstructed from the painting's own perspective. Grabbing the mouse cancels the flight. |
| `reset all` | Camera, Part A sliders, the scene-graph animation and the curve all go back to their starting values. |

### Camera · Part C
Read-out shows `eye`, `target`, `fovY`, `near`, `far` and the orbit angles.

| Control | What it does |
|---|---|
| **drag** on the canvas | Orbits the main camera (yaw/pitch around the target). Pitch can reach ±90°, which is exactly the case where `up` is parallel to the view direction — `lookAt` picks a different reference up there instead of producing NaNs. |
| **wheel** | Dollies in and out, clamped to [0.4, 5.5] so the scene can never leave the frustum. |
| `fovY (°)` | Vertical field of view. |
| `near`, `far` | The depth range, default [0.1, 7] — enough to hold the scene at every orbit distance. For WebGPU's z ∈ [0, 1] mapping the spacing of representable depths at distance *d* is Δd = q·d²·(far − near)/(far·near) → q·d²/near, so it is the **near** plane that sets the precision and *far* barely matters: dropping `near` to 0.01 costs a factor of ten, while raising `far` to 1000 costs about 1 %. Pull `far` down to ~2 to watch the back of the scene get clipped away. |

### Part A · transforms
| Control | What it does |
|---|---|
| `translate x / y / z`, `rotate z (rad)`, `scale` | Build T, R and S for the red box in front of the painting. |
| `order` | Apply **T·R·S** or **S·R·T**. Both matrices are printed below; `▶` marks the one in use. |

The two other boxes (blue and ochre) are placed with fixed matrices from the
same library.

### Part B · scene graph
| Control | What it does |
|---|---|
| `animate`, `speed` | Run or freeze the two animated joints (the turntable's spin and the arm's swing). |
| read-outs | The tree, depth-first, and the live world matrix of the leaf node `crate`. |

The tree is five levels deep: `root → stand → turntable → armPivot → wrist →
crate`. Only three local matrices are animated; everything else follows from
`world = parent.world · local` in one traversal.

### Part D · curves
| Control | What it does |
|---|---|
| **drag** a control point | Move it. Dragging a joint carries its two handles with it. Blue crosses are the *derived* handles — they are recomputed to keep the joint C¹ and cannot be dragged. |
| **shift-click** on the painting | Append a segment ending where you clicked, C¹ at the new joint (up to 8 segments). |
| `curve` | Show/hide the piecewise Bézier (orange). |
| `Catmull–Rom` | Show the second curve family (cyan): a uniform Catmull–Rom spline through the Bézier's joints, drawn wider and underneath, so it is a halo where the two agree and separates where they do not. |
| `ride the curve` | Animate the small red box along the curve, turned to face along the tangent. Switch it off to park the box at `t`. |
| `t` | Global parameter over the whole curve. It drives the de Casteljau construction (drawn in the segment `t` falls in) and the parked box. |
| `export JSON` | Download the curve with its control points in normalised painting coordinates. A copy of the default export is checked in as `curve-kavunlu.json`. |
| `reset curve` | Back to the traced melon contour. |
| read-out | Segment and control-point counts, and the largest tangent mismatch across the joints — it stays at ~1e-16, i.e. C¹ holds while you drag. |

### Bonus · curve
| Control | What it does |
|---|---|
| `trace & fit` | Turns the next drag into a freehand stroke. On release the stroke is replaced by a **least-squares fit** of a C¹ piecewise cubic Bézier (`src/math/fit.js`): chord-length parameters, two normal equations for the interior control points, then eight rounds of Newton reparameterisation. The read-out gives the rms and maximum deviation, and the rms *before* the C¹ handles were mirrored — so you can see what enforcing C¹ costs. |
| `fit segments` | How many segments the stroke is cut into (by equal arc length) before fitting. |
| `sweep: surface of revolution` | Spins the curve about the chord joining its ends and renders the solid as a lit mesh (`src/scene/revolve.js`), ~15 000 triangles rebuilt whenever the curve changes. Normals are analytic, not finite differences. |
| `evaluate on GPU (compute)` | Evaluates the same curve in a **compute shader** (`src/render/shaders/curve.wgsl`) and writes the ribbon vertices straight into a buffer that is then bound as a vertex buffer — no copy and no curve maths on the CPU. Drawn in green, on top of the CPU curve, so you can check they agree. |

### Debug drawings *(Part E)*
| Control | What it does |
|---|---|
| `scene objects (A, B)` | Hide the boxes, to photograph the traced curve on its own. |
| `node local axes (B)` | Draw every scene-graph node's local frame (x red, y green, z blue). |
| `camera frustum (C)` | Draw the main camera's frustum — visible in the inspection view. Near plane orange, far plane blue, side edges grey, eye-to-near-corner red. |
| `painting perspective (C bonus)` | Draw the perspective reconstructed from the painting itself: the three fitted edges of the stone slab (orange = the slab's near and far edges, cyan = its side edge), the **horizon**, and the **vanishing point** where the side edge meets it. Only meaningful for *Kavunlu Natürmort*, which is what was measured; it draws nothing for the other paintings. Zoom out to bring the vanishing point into frame — it sits above the canvas. |
| `control polygon (D)` | Show the control polygon and the control-point crosses. |
| `de Casteljau (D)` | Show the construction at `t`: one polyline per level, grey → green → magenta, with a white cross on the resulting point. |

The counter at the top of the panel shows smoothed frame time, fps, CPU time
per frame, and the draw calls and vertices submitted in the last frame.

## Where things are

| Path | Part | Contents |
|---|---|---|
| `src/math/vec3.js` | A, C | Vector helpers. |
| `src/math/mat4.js` | A, C | `identity`, `multiply`, `translate`, `rotateX/Y/Z`, `scale`, `transpose`, `invertRigid`, `transformVec4`; `lookAt`, `perspective`, `orthographic`. Column-major, WebGPU depth ∈ [0, 1]. |
| `src/math/curves.js` | D | Bernstein basis, cubic Bézier and its tangent, de Casteljau, C¹ joints, piecewise evaluation, Catmull–Rom **and** the uniform B-spline basis. |
| `src/math/quat.js` | bonus | Unit quaternions: axis-angle, product, rotation of a vector, slerp. |
| `src/math/fit.js` | bonus | Least-squares cubic Bézier fitting with Newton reparameterisation. |
| `src/scene/node.js` | B | `SceneNode` and `updateWorld()`. |
| `src/scene/scene.js` | A, B | The three free objects and the animated hierarchy. |
| `src/scene/camera.js` | C | Orbit state, both cameras, `frustumCorners`, `pickRay`, `projectToNDC`. |
| `src/scene/curve.js` | D | Control points, editing, de Casteljau, the rider, all the curve geometry. |
| `src/scene/revolve.js` | bonus | Sweeping the curve into a surface of revolution. |
| `src/scene/paintingPerspective.js` | bonus | The measured slab edges and the camera they imply. |
| `src/render/curveCompute.js`, `shaders/curve.wgsl` | bonus | The curve evaluated and tessellated on the GPU. |
| `src/scene/curveExport.js` | D | `curveToJSON` (world → normalised u, v). |
| `src/render/mesh.js` | — | Shaded, line and ribbon pipelines; per-object uniform buffers. |
| `src/render/ribbon.js` | — | Polylines → one triangle strip, so curves are not one-pixel hairlines. |
| `src/render/*.js`, `shaders/*.wgsl` | — | Device setup, the render pass, the painting quad, the shaders. |
| `src/main.js` | C, E | Wiring, input, views and the render loop. |
| `tests/` | — | `npm test` — the maths, run under Node's test runner. |

Two conventions worth knowing when reading the code:

* **Column-major matrices**, column vectors, `multiply(A, B) = A·B` so **B acts
  first**. The arrays go into uniform buffers untouched.
* Scene-graph `local` matrices are kept **rigid** (T·R only); a box's size lives
  in `node.data.size` and is applied at draw time as `model = world · S`. That
  keeps world matrices readable (and checkable by hand) and the debug axes
  un-squashed.

## Notes

* Curves are drawn as thin quad strips ("ribbons") rather than GPU lines,
  because a line primitive is one device pixel — a hairline on a 2× display.
* Each drawable owns its uniform buffer: `queue.writeBuffer()` calls all run
  before the frame's commands, so objects sharing one buffer would all read the
  last matrix written.
* The handout asks for *one* of B-spline or Catmull–Rom; both are implemented,
  so `npm test` runs 76 tests with nothing skipped.
* All five bonus extensions are implemented: least-squares curve fitting, a
  surface of revolution swept from the curve, a camera matched to the
  painting's own perspective, a quaternion orbit with slerp between
  viewpoints, and the curve evaluated in a compute shader.
