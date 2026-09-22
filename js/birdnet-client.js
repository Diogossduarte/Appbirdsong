/* Songbird browser-side BirdNET client.
 * Keeps UI independent from the inference worker and converts recorded audio
 * to the 48 kHz mono PCM expected by the BirdNET web model.
 */
export class BirdNetClient {
  constructor({ workerUrl = './js/birdnet-worker.js', modelRoot = './models', language = 'pt' } = {}) {
    this.workerUrl = workerUrl;
    this.modelRoot = modelRoot;
    this.language = language;
    this.worker = null;
    this.ready = false;
    this.pending = null;
    this.lastSegments = [];
  }

  init() {
    if (this.worker) return Promise.resolve(this.ready);
    return new Promise((resolve, reject) => {
      const url = `${this.workerUrl}?root=${encodeURIComponent(this.modelRoot)}&lang=${encodeURIComponent(this.language)}`;
      this.worker = new Worker(url);
      const timeout = setTimeout(() => reject(new Error('Tempo excedido ao carregar o BirdNET.')), 120000);
      this.worker.onerror = e => { clearTimeout(timeout); reject(new Error(e.message || 'Falha ao iniciar BirdNET.')); };
      this.worker.onmessage = ({ data }) => {
        if (data.message === 'loaded') {
          clearTimeout(timeout);
          this.ready = true;
          resolve(true);
          return;
        }
        if (data.message === 'segments') this.lastSegments = data.segments || [];
        if (data.message === 'pooled' && this.pending) {
          const ranked = this.rank(data.pooled || []);
          const done = this.pending;
          this.pending = null;
          done.resolve({ best: ranked[0] || null, alternatives: ranked.slice(1, 5), segments: this.lastSegments });
        }
      };
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
    if (Number.isFinite(latitude) && Number.isFinite(longitude)) this.setLocation(latitude, longitude);
    const pcmAudio = await this.decodeTo48kMono(blob);
    if (pcmAudio.length < 144000) throw new Error('Grave pelo menos 3 segundos para identificar a ave.');
    if (this.pending) throw new Error('Já existe uma análise em andamento.');
    return new Promise((resolve, reject) => {
      this.pending = { resolve, reject };
      this.worker.postMessage({ message: 'predict', pcmAudio, sensitivity, overlapSec }, [pcmAudio.buffer]);
      setTimeout(() => {
        if (this.pending) {
          this.pending = null;
          reject(new Error('A identificação demorou mais que o esperado.'));
        }
      }, 60000);
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
