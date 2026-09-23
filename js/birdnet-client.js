/* Songbird browser-side BirdNET client.
 * Keeps UI independent from the inference worker and converts recorded audio
 * to the 48 kHz mono PCM expected by the BirdNET web model.
 */
export class BirdNetClient {
  constructor({ workerUrl = './js/birdnet-worker.js', modelRoot = './models', language = 'pt' } = {}) {
    this.workerUrl = workerUrl;
    this.modelRoot = new URL(modelRoot, document.baseURI).href.replace(/\/$/, '');
    this.language = language;
    this.worker = null;
    this.ready = false;
    this.pending = null;
    this.lastSegments = [];
    this.initPromise = null;
  }

  init() {
    if (this.ready) return Promise.resolve(true);
    if (this.initPromise) return this.initPromise;
    this.initPromise = new Promise((resolve, reject) => {
      const url = `${this.workerUrl}?root=${encodeURIComponent(this.modelRoot)}&lang=${encodeURIComponent(this.language)}`;
      this.worker = new Worker(url);
      const timeout = setTimeout(() => reject(new Error('Tempo excedido ao carregar o BirdNET.')), 120000);
      const fail = message => {
        clearTimeout(timeout);
        const error = new Error(message || 'Falha ao iniciar BirdNET.');
        if (this.pending) {
          const pending = this.pending;
          this.pending = null;
          clearTimeout(pending.timer);
          pending.reject(error);
        } else {
          reject(error);
        }
      };
      this.worker.onerror = event => fail(event.message);
      this.worker.onmessage = ({ data }) => {
        if (data.message === 'loaded') {
          clearTimeout(timeout);
          this.ready = true;
          resolve(true);
          return;
        }
        if (data.message === 'error') {
          fail(data.error);
          return;
        }
        if (data.message === 'segments') this.lastSegments = data.segments || [];
        if (data.message === 'pooled' && this.pending) {
          const ranked = this.rank(data.pooled || []);
          const done = this.pending;
          this.pending = null;
          clearTimeout(done.timer);
          done.resolve({ best: ranked[0] || null, alternatives: ranked.slice(1, 5), segments: this.lastSegments });
        }
      };
    });
    return this.initPromise.catch(error => {
      this.worker?.terminate();
      this.worker = null;
      this.initPromise = null;
      throw error;
    });
  }

  setLocation(latitude, longitude) {
    if (!this.worker || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
    this.worker.postMessage({ message: 'area-scores', latitude, longitude });
  }

  rank(items) {
    return items
      .map(x => ({ ...x, score: Number(x.confidence || 0) * Number(x.geoscore ?? 1) }))
      .sort((a, b) => b.score - a.score);
  }

  async analyzeBlob(blob, { latitude = null, longitude = null, sensitivity = 1, overlapSec = 1.5 } = {}) {
    if (!this.ready) await this.init();
    const pcmAudio = await this.decodeTo48kMono(blob);
    if (pcmAudio.length < 144000) throw new Error('Grave pelo menos 3 segundos para identificar a ave.');
    if (this.pending) throw new Error('Já existe uma análise em andamento.');
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending?.timer === timer) {
          this.pending = null;
          reject(new Error('A identificação demorou mais que o esperado.'));
        }
      }, 60000);
      this.pending = { resolve, reject, timer };
      const pcmForWorker = pcmAudio.slice();
      this.worker.postMessage({ message: 'predict', pcmAudio: pcmForWorker, latitude, longitude, sensitivity, overlapSec }, [pcmForWorker.buffer]);
    });
  }

  async decodeTo48kMono(blob) {
    const bytes = await blob.arrayBuffer();
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) throw new Error('AudioContext não disponível neste navegador.');
    const ctx = new Ctx();
    try {
      const decoded = await ctx.decodeAudioData(bytes.slice(0));
      const length = Math.ceil(decoded.duration * 48000);
      const offline = new OfflineAudioContext(1, Math.max(length, 1), 48000);
      const mono = offline.createBuffer(1, decoded.length, decoded.sampleRate);
      const out = mono.getChannelData(0);
      for (let c = 0; c < decoded.numberOfChannels; c++) {
        const input = decoded.getChannelData(c);
        for (let i = 0; i < input.length; i++) out[i] += input[i] / decoded.numberOfChannels;
      }
      const src = offline.createBufferSource();
      src.buffer = mono;
      src.connect(offline.destination);
      src.start();
      const rendered = await offline.startRendering();
      return new Float32Array(rendered.getChannelData(0));
    } finally {
      await ctx.close().catch(() => {});
    }
  }
}
