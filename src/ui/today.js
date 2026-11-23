/** Today: a date-seeded study with a timer, in the spirit of a daily drawing practice. */
import { $, $$, el } from './dom.js';
import { localDateString, hashSeed, pickStudy } from '../daily.js';
import { syntheticVolume } from './loader.js';
import { planeFrame, planeBoxHalfExtent } from '../geom/plane.js';
import { sliceVolume } from '../volume/resample.js';
import { cropSlice } from '../cane/crop.js';
import { outlineMask } from '../cane/outline.js';
import { histogram, initialThresholds, quantise } from '../cane/quantise.js';
import { cleanup } from '../cane/morph.js';
import { renderCane } from '../cane/render.js';
import { PRESETS, defaultMapping } from '../cane/palette.js';
import { defaultParams } from '../state.js';

const G = 400;

/** Draw RGBA pixels (G x G) into a canvas at its displayed size. */
function paint(canvas, rgba) {
  const r = canvas.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const s = Math.max(64, Math.round(Math.min(r.width || G, r.height || G) * dpr));
  canvas.width = canvas.height = s;
  const src = document.createElement('canvas');
  src.width = src.height = G;
  src.getContext('2d').putImageData(new ImageData(rgba, G, G), 0, 0);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, s, s);
}

export class Today {
  /**
   * @param {(pick:Object) => void} openInEditor
   * @param {(msg:string) => void} toast
   */
  constructor(openInEditor, toast) {
    this.root = $('#today');
    this.openInEditor = openInEditor;
    this.toast = toast;
    this.minutes = 10;
    this.remaining = 10 * 60 * 1000;
    this.running = false;
    this.timer = 0;
    this.pick = null;
    this.revealed = false;
    this.chimeOn = false;
    $$('#duration-seg button').forEach((b) => b.addEventListener('click', () => this.setDuration(+b.dataset.min)));
    $('#timer-start').addEventListener('click', () => this.toggle());
    $('#timer-reset').addEventListener('click', () => this.reset());
    $('#today-reveal').addEventListener('click', () => this.reveal(!this.revealed));
    $('#today-random').addEventListener('click', () => this.load(pickStudy((Math.random() * 2 ** 32) >>> 0), false));
    $('#today-open').addEventListener('click', () => { if (this.pick) { this.close(); this.openInEditor(this.pick); } });
    $('#timer-chime').addEventListener('click', () => {
      this.chimeOn = !this.chimeOn;
      $('#timer-chime').setAttribute('aria-pressed', String(this.chimeOn));
    });
    new ResizeObserver(() => this.isOpen && this.repaint()).observe($('#today-figure'));
    this.setDuration(10);
  }

  get isOpen() { return !this.root.hidden; }

  open() {
    this.root.hidden = false;
    const date = localDateString();
    if (!this.pick || this.pick.date !== date) this.load({ ...pickStudy(hashSeed(date)), date }, true);
    else this.repaint();
  }

  close() {
    if (this.root.hidden) return;
    this.root.hidden = true;
    this.pause();
    if (this.onClose) this.onClose();
  }

  async load(pick, daily) {
    this.pick = pick;
    this.daily = daily;
    this.reveal(false);
    const words = ['', '', 'two', 'three', 'four', 'five', 'six'];
    $('#today-title').replaceChildren(
      el('span', { text: `${pick.spec.name} — ${words[pick.spec.levels] || 'three'} clays` }),
      el('span', { class: 'date', text: daily ? localDateString() : 'random study' }),
    );
    let vol;
    try {
      vol = await syntheticVolume(pick.id, 1);
    } catch (err) {
      // The editor may have cancelled a shared generation job. Start it again.
      if (!err.cancelled) throw err;
      vol = await syntheticVolume(pick.id, 1);
    }
    if (this.pick !== pick) return;
    const pl = pick.plane;
    const frame = planeFrame(pl);
    const half = planeBoxHalfExtent([128, 128, 128], frame) || 64;
    const n = 320;
    const data = sliceVolume(vol, frame, { n, px: (2 * half) / n });
    this.values = cropSlice({ data, w: n, h: n, px: (2 * half) / n }, G, pick.crop, 128);
    this.mask = outlineMask('circle', G);
    this.cane = null;
    this.sliceRGBA = new Uint8ClampedArray(G * G * 4);
    for (let i = 0; i < G * G; i++) {
      const g = Math.max(0, Math.min(255, this.values[i] * 255));
      const o = i * 4;
      this.sliceRGBA[o] = this.sliceRGBA[o + 1] = this.sliceRGBA[o + 2] = g;
      // Anti-aliased disc edge.
      const x = (i % G) + 0.5 - G / 2, y = Math.floor(i / G) + 0.5 - G / 2;
      this.sliceRGBA[o + 3] = Math.max(0, Math.min(1, G / 2 - Math.hypot(x, y))) * 255;
    }
    this.repaint();
  }

  repaint() {
    if (this.sliceRGBA) paint($('#today-slice'), this.sliceRGBA);
    if (this.revealed && this.cane) paint($('#today-cane'), this.cane.data);
  }

  reveal(on) {
    this.revealed = on;
    $('#today-reveal').textContent = on ? 'Hide' : 'Reveal';
    $('#today-cane').hidden = !on;
    $('#today-figure').classList.toggle('both', on);
    if (!on || !this.values) { this.repaint(); return; }
    if (!this.cane) {
      const levels = this.pick.spec.levels;
      const t = initialThresholds(histogram(this.values, this.mask), levels);
      let l = quantise(this.values, t, this.mask);
      const d = defaultParams();
      l = cleanup(l, G, G, { ...d.clean, minWidth: d.clean.minFeature / (d.cane.size / G), levels });
      const sw = PRESETS.sandalwood.swatches;
      const cols = defaultMapping(levels, sw).map((i) => sw[i].colour);
      this.cane = renderCane(l, G, G, cols, { scale: 1 });
    }
    this.repaint();
  }

  setDuration(min) {
    this.minutes = min;
    $$('#duration-seg button').forEach((b) => b.setAttribute('aria-checked', String(+b.dataset.min === min)));
    this.reset();
  }

  toggle() { if (this.running) this.pause(); else this.start(); }

  start() {
    if (this.remaining <= 0) this.remaining = this.minutes * 60000;
    this.running = true;
    this.last = performance.now();
    $('#timer-start').textContent = 'Pause';
    clearInterval(this.timer);
    this.timer = setInterval(() => this.tick(), 200);
  }

  pause() {
    this.running = false;
    clearInterval(this.timer);
    $('#timer-start').textContent = 'Start';
  }

  reset() {
    this.pause();
    this.remaining = this.minutes * 60000;
    this.paintTimer();
  }

  tick() {
    const now = performance.now();
    this.remaining -= now - this.last;
    this.last = now;
    if (this.remaining <= 0) {
      this.remaining = 0;
      this.pause();
      if (this.chimeOn) this.chime();
      this.toast('Time. Put the pencil down.');
    }
    this.paintTimer();
  }

  paintTimer() {
    const s = Math.ceil(this.remaining / 1000);
    $('#timer').textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    $('#timer-progress').style.width = `${(1 - this.remaining / (this.minutes * 60000)) * 100}%`;
  }

  chime() {
    try {
      const ac = new AudioContext();
      for (const [f, t] of [[880, 0], [660, 0.18]]) {
        const o = ac.createOscillator(), g = ac.createGain();
        o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, ac.currentTime + t);
        g.gain.exponentialRampToValueAtTime(0.12, ac.currentTime + t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + t + 0.9);
        o.connect(g).connect(ac.destination);
        o.start(ac.currentTime + t);
        o.stop(ac.currentTime + t + 1);
      }
      setTimeout(() => ac.close(), 1500);
    } catch {
      /* Audio is optional. */
    }
  }
}
