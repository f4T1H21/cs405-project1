/**
 * Frame-time counter (Part E asks for this readout). Provided.
 *
 *   frame  — time between successive frames (requestAnimationFrame), smoothed.
 *            Usually capped by the display refresh (16.7 ms at 60 Hz).
 *   cpu    — time your JavaScript spends building and submitting the frame.
 *   draws / vertices — what you submitted this frame (Renderer.countDraw()).
 *
 * GPU time is not measured here (that needs the 'timestamp-query' feature).
 */
export class Stats {
  constructor(parent) {
    this.el = document.createElement('div');
    this.el.className = 'stats';
    parent.appendChild(this.el);
    this.frameMs = 0;
    this.cpuMs = 0;
    this.last = 0;
    this.t0 = 0;
    this.lastShown = 0;
  }

  begin(now) {
    if (this.last) this.frameMs = smooth(this.frameMs, now - this.last);
    this.last = now;
    this.t0 = performance.now();
  }

  /** @param {{draws:number, vertices:number}} counts */
  end(counts) {
    this.cpuMs = smooth(this.cpuMs, performance.now() - this.t0);
    if (this.last - this.lastShown < 250) return; // refresh the text 4× per second
    this.lastShown = this.last;
    const fps = this.frameMs > 0 ? 1000 / this.frameMs : 0;
    this.el.textContent =
      `frame ${this.frameMs.toFixed(2)} ms (${fps.toFixed(0)} fps) · cpu ${this.cpuMs.toFixed(2)} ms\n` +
      `draws ${counts.draws} · vertices ${counts.vertices.toLocaleString('en-US')}`;
  }
}

const smooth = (avg, x) => (avg === 0 ? x : avg * 0.9 + x * 0.1);
