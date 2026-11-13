/**
 * A minimal control panel (no dependencies). Provided.
 * You may replace it with lil-gui if you prefer — that is the only UI library allowed.
 *
 *   const ui = createPanel(document.getElementById('panel'));
 *   const f = ui.folder('Part A');
 *   f.slider('angle', state, 'angle', -Math.PI, Math.PI, 0.01);
 *   f.toggle('T·R·S order', state, 'trs');
 *   f.select('projection', ['perspective', 'orthographic'], cam.projection, v => cam.projection = v);
 *   f.button('reset', () => reset());
 *   const m = f.text();  m.set(mat4.format(M));          // monospaced readout
 */
export function createPanel(root) {
  root.classList.add('panel');
  const api = {
    root,
    folder(title, { open = true } = {}) {
      const d = el('details', { class: 'folder' }, root);
      d.open = open;
      el('summary', { text: title }, d);
      return controls(el('div', { class: 'body' }, d));
    },
    ...controls(root),
  };
  return api;
}

function controls(parent) {
  const self = {
    /** Slider bound to obj[key]. onChange(value) is optional. */
    slider(label, obj, key, min, max, step = 0.01, onChange) {
      const row = el('label', { class: 'row' }, parent);
      el('span', { class: 'name', text: label }, row);
      const input = el('input', { type: 'range', min, max, step, value: obj[key] }, row);
      const out = el('span', { class: 'val' }, row);
      const decimals = step >= 1 ? 0 : Math.min(3, Math.ceil(-Math.log10(step)));
      const show = () => (out.textContent = (+obj[key]).toFixed(decimals));
      input.addEventListener('input', () => { obj[key] = parseFloat(input.value); show(); onChange?.(obj[key]); });
      show();
      return { update() { input.value = obj[key]; show(); } };
    },
    /** Checkbox bound to obj[key] (boolean). */
    toggle(label, obj, key, onChange) {
      const row = el('label', { class: 'row' }, parent);
      const input = el('input', { type: 'checkbox' }, row);
      input.checked = !!obj[key];
      el('span', { class: 'name', text: label }, row);
      input.addEventListener('change', () => { obj[key] = input.checked; onChange?.(obj[key]); });
      return { update() { input.checked = !!obj[key]; } };
    },
    /** Drop-down. options: array of strings or {value, label}. */
    select(label, options, value, onChange) {
      const row = el('label', { class: 'row' }, parent);
      el('span', { class: 'name', text: label }, row);
      const sel = el('select', {}, row);
      for (const o of options) {
        const v = typeof o === 'string' ? o : o.value;
        const opt = el('option', { value: v, text: typeof o === 'string' ? o : o.label }, sel);
        if (v === value) opt.selected = true;
      }
      sel.addEventListener('change', () => onChange(sel.value));
      return { set(v) { sel.value = v; } };
    },
    button(label, onClick) {
      const b = el('button', { text: label }, parent);
      b.addEventListener('click', onClick);
      return b;
    },
    /** Monospaced, multi-line text: use for matrices and camera parameters. */
    text(initial = '') {
      const pre = el('pre', { class: 'readout', text: initial }, parent);
      return { set(s) { if (pre.textContent !== s) pre.textContent = s; }, el: pre };
    },
    /** Short plain note. */
    note(s) { return el('p', { class: 'note', text: s }, parent); },
  };
  return self;
}

function el(tag, attrs = {}, parent) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'text') e.textContent = v;
    else e.setAttribute(k, v);
  }
  parent?.appendChild(e);
  return e;
}
