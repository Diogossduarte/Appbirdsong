/*
 * Songbird BirdNET adapter
 *
 * This module is intentionally separated from the UI so the official
 * browser model/runtime can be integrated without coupling it to index.html.
 * No fake species are returned: until the local model is loaded, analysis
 * reports that the engine is unavailable.
 */

export class BirdNetLocal {
  constructor() {
    this.ready = false;
    this.engine = null;
  }

  async init() {
    // The official BirdNET browser runtime/model will be wired here.
    // Keeping this explicit prevents prototype results from being mistaken
    // for real identifications.
    this.ready = false;
    return this.ready;
  }

  async analyzeAudioBlob(audioBlob, context = {}) {
    if (!audioBlob) throw new Error('Nenhum áudio disponível para análise.');
    if (!this.ready || !this.engine) {
      throw new Error('Modelo BirdNET offline ainda não foi instalado neste dispositivo.');
    }

    return this.engine.analyze(audioBlob, {
      latitude: context.latitude ?? null,
      longitude: context.longitude ?? null,
      date: context.date ?? new Date().toISOString()
    });
  }
}
