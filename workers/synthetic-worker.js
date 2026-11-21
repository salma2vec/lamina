/** Generates synthetic study volumes off the main thread. */
import { generate } from '../src/volume/synthetic.js';

self.onmessage = (e) => {
  const { job, id, seed, size } = e.data;
  try {
    const volume = generate(id, size, seed, (p) => self.postMessage({ job, type: 'progress', p }));
    self.postMessage({ job, type: 'done', volume }, [volume.data.buffer]);
  } catch (err) {
    self.postMessage({ job, type: 'error', message: err.message });
  }
};
