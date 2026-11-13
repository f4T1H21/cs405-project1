/**
 * Pointer plumbing for the canvas. Provided: it only reports events.
 * What a drag or a click MEANS (orbiting the camera, picking and dragging
 * control points on the painting) is yours to implement — Parts C and D.
 *
 * Positions are given in two forms:
 *   px:  CSS pixels from the canvas' top-left corner
 *   ndc: normalised device coordinates, x, y ∈ [−1, 1], +y UP (as in clip space)
 */
export function attachPointer(canvas, handlers = {}) {
  let dragging = false, button = 0, lastX = 0, lastY = 0;

  const at = (e) => {
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    return { px: [x, y], ndc: [(2 * x) / r.width - 1, 1 - (2 * y) / r.height], shift: e.shiftKey, alt: e.altKey };
  };

  canvas.addEventListener('pointerdown', (e) => {
    dragging = true; button = e.button; lastX = e.clientX; lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
    handlers.down?.({ ...at(e), button });
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = at(e);
    if (dragging) {
      handlers.drag?.({ ...p, button, dx: e.clientX - lastX, dy: e.clientY - lastY });
      lastX = e.clientX; lastY = e.clientY;
    } else handlers.move?.(p);
  });
  const up = (e) => {
    if (!dragging) return;
    dragging = false;
    handlers.up?.({ ...at(e), button });
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); handlers.wheel?.({ ...at(e), delta: e.deltaY }); }, { passive: false });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault()); // allow right-drag
}
