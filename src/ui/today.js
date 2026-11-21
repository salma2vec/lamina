/** Today: a date-seeded study with a timer, in the spirit of a daily drawing practice. */
import { $, $$, fx } from './dom.js';
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

const G = 400;
const WORDS = ['', '', 'two', 'three', 'four', 'five', 'six'];

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
    $$('#duration-seg button').forEach((b) => b.addEventListener('click', () => this.setDuration(+b.dataset.min)));
    $('#timer-start').addEventListener('click', () => this.toggle());
    $('#timer-reset').addEventListener('click', () => this.reset());
    $('#today-reveal').addEventListener('click', () => this.reveal(!this.revealed));
    $('#today-random').addEventListener('click', () => this.load(pickStudy((Math.random() * 2 ** 32) >>> 0), false));
    $('#today-open').addEventListener('click', () => { if (this.pick) { this.close(); this.openInEditor(this.pick); } });
    this.setDuration(10);
  }

  get isOpen() { return !this.root.hidden; }

  open() {
    this.root.hidden = false;
    const date = localDateString();
    $('#today-date').textContent = date;
    if (!this.pick || this.pick.date !== date) this.load({ ...pickStudy(hashSeed(date)), date }, true);
  }

  close() {
    this.root.hidden = true;
    this.pause();
  }

  async load(pick, daily) {
    this.pick = pick;
    this.reveal(false);
    $('#today-title').textContent = pick.spec.name;
    $('#today-desc').textContent = pick.spec.description;
    $('#today-date').textContent = daily ? localDateString() : 'Random study';
    $('#today-levels').textContent = WORDS[pick.spec.levels] || 'three';
    const pl = pick.plane;
    $('#today-plane').textContent = `${pl.axis.toUpperCase()}  offset ${fx(pl.offset, 1)} vox  tilt ${pl.tiltA}° / ${pl.tiltB}°  rotation ${pick.crop.rotation}°`;
    const vol = await syntheticVolume(pick.id, 1);
    if (this.pick !== pick) return;
    const frame = planeFrame(pl);
    const half = planeBoxHalfExtent([128, 128, 128], frame) || 64;
    const n = 320;
    const data = sliceVolume(vol, frame, { n, px: (2 * half) / n });
    const values = cropSlice({ data, w: n, h: n, px: (2 * half) / n }, G, pick.crop, 128);
    this.values = values;
    this.mask = outlineMask('circle', G);
    this.drawSlice();
    this.cane = null;
  }

  drawSlice() {
    const c = $('#today-slice');
    c.width = c.height = G;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(G, G);
    for (let i = 0; i < G * G; i++) {
      const g = Math.max(0, Math.min(255, this.values[i] * 255));
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = g;
      // Anti-aliased disc edge.
      const x = (i % G) + 0.5 - G / 2, y = Math.floor(i / G) + 0.5 - G / 2;
      img.data[i * 4 + 3] = Math.max(0, Math.min(1, G / 2 - Math.hypot(x, y))) * 255;
    }
    ctx.putImageData(img, 0, 0);
  }

  reveal(on) {
    this.revealed = on;
    const c = $('#today-cane');
    $('#today-reveal').textContent = on ? 'Hide' : 'Reveal';
    c.hidden = !on;
    $('.today-canvases').classList.toggle('both', on);
    if (!on || !this.values) return;
    if (!this.cane) {
      const levels = this.pick.spec.levels;
      const t = initialThresholds(histogram(this.values, this.mask), levels);
      let l = quantise(this.values, t, this.mask);
      l = cleanup(l, G, G, { median: 1, openClose: 0, smooth: 1, minWidth: 2.5 / (60 / G), levels });
      const sw = PRESETS.sandalwood.swatches;
      const cols = defaultMapping(levels, sw).map((i) => sw[i].colour);
      this.cane = renderCane(l, G, G, cols, { scale: 1 });
    }
    c.width = this.cane.width; c.height = this.cane.height;
    c.getContext('2d').putImageData(new ImageData(this.cane.data, this.cane.width, this.cane.height), 0, 0);
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
    this.paint();
  }

  tick() {
    const now = performance.now();
    this.remaining -= now - this.last;
    this.last = now;
    if (this.remaining <= 0) {
      this.remaining = 0;
      this.pause();
      if ($('#timer-chime').checked) this.chime();
      this.toast('Time. Put the pencil down.');
    }
    this.paint();
  }

  paint() {
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
