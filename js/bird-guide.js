import { SpeciesRepository, speciesMatches } from './species-repository.js';

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}

export class BirdGuide {
  constructor({ supabase, getUser, onRegister, playSong }) {
    this.repository = new SpeciesRepository(supabase);
    this.getUser = getUser; this.onRegister = onRegister; this.playSong = playSong;
    this.species = []; this.counts = new Map(); this.filter = 'all'; this.selected = null;
    this.screen = document.getElementById('guideScreen');
    document.getElementById('guideBack').onclick = () => this.close();
    document.getElementById('speciesBack').onclick = () => this.showList();
    document.getElementById('guideSearch').addEventListener('input', () => this.renderList());
    document.querySelectorAll('[data-guide-filter]').forEach(button => button.onclick = () => this.setFilter(button.dataset.guideFilter));
    document.getElementById('speciesRegister').onclick = () => this.onRegister(this.selected);
    document.getElementById('speciesSong').onclick = () => this.playSong(this.selected);
    addEventListener('popstate', () => { if (this.screen.classList.contains('active')) this.close(false); });
  }

  async open() {
    this.screen.classList.add('active'); document.querySelector('.app').setAttribute('aria-hidden', 'true');
    history.pushState({ guide: true }, '', '#guia');
    document.getElementById('guideSearch').focus();
    document.getElementById('guideStatus').textContent = 'Carregando espécies disponíveis…';
    try {
      [this.species, this.counts] = await Promise.all([
        this.repository.getSpecies(), this.repository.getObservationCounts(this.getUser()?.id)
      ]);
      this.renderList();
    } catch {
      document.getElementById('guideStatus').textContent = 'Não foi possível ler os dados locais.';
    }
  }

  close(useHistory = true) {
    this.screen.classList.remove('active'); document.querySelector('.app').removeAttribute('aria-hidden');
    this.showList(); if (useHistory && location.hash === '#guia') history.back();
  }

  showList() {
    document.getElementById('guideListView').hidden = false; document.getElementById('speciesView').hidden = true; this.selected = null;
  }

  setFilter(filter) {
    this.filter = filter;
    document.querySelectorAll('[data-guide-filter]').forEach(button => button.classList.toggle('active', button.dataset.guideFilter === filter));
    this.renderList();
  }

  renderList() {
    const query = document.getElementById('guideSearch').value;
    const mineCount = [...this.counts.values()].filter(Boolean).length;
    document.getElementById('mineCount').textContent = `Minhas aves · ${mineCount} ${mineCount === 1 ? 'espécie' : 'espécies'}`;
    const filtered = this.species.filter(item => speciesMatches(item, query) && (this.filter === 'all' || this.counts.has(item.scientificName)));
    document.getElementById('guideStatus').textContent = `${filtered.length} ${filtered.length === 1 ? 'espécie encontrada' : 'espécies encontradas'}${navigator.onLine === false ? ' · modo offline' : ''}`;
    const list = document.getElementById('guideResults');
    list.innerHTML = filtered.map(item => {
      const count = this.counts.get(item.scientificName) || 0;
      return `<button class="guide-card" data-species="${escapeHtml(item.scientificName)}">
        <span class="guide-photo">${item.photoUrl ? `<img src="${escapeHtml(item.photoUrl)}" alt="" loading="lazy">` : '🐦'}</span>
        <span class="guide-card-text"><strong>${escapeHtml(item.commonNamePt)}</strong><em>${escapeHtml(item.scientificName)}</em>${item.family ? `<small>${escapeHtml(item.family)}</small>` : ''}${count ? `<span class="registered">✓ Registrada por você · ${count}</span>` : ''}</span>
        <span aria-hidden="true">›</span></button>`;
    }).join('') || '<div class="guide-empty">Nenhuma espécie encontrada com esses termos.</div>';
    list.querySelectorAll('[data-species]').forEach(button => button.onclick = () => this.openSpecies(button.dataset.species));
  }

  openSpecies(scientificName) {
    this.selected = this.species.find(item => item.scientificName === scientificName);
    if (!this.selected) return;
    const item = this.selected, count = this.counts.get(item.scientificName) || 0;
    document.getElementById('speciesDetail').innerHTML = `
      ${item.photoUrl ? `<img class="detail-photo" src="${escapeHtml(item.photoUrl)}" alt="${escapeHtml(item.commonNamePt)}">` : '<div class="detail-photo placeholder">🐦</div>'}
      <h2>${escapeHtml(item.commonNamePt)}</h2><em class="detail-scientific">${escapeHtml(item.scientificName)}</em>
      ${item.family ? `<div class="detail-family">Família ${escapeHtml(item.family)}</div>` : ''}
      ${this.field('Descrição', item.description)}${this.field('Distribuição no Brasil', item.distributionBrazil)}
      ${this.field('Habitat', item.habitat)}${this.field('Alimentação', item.diet)}${this.field('Tamanho', item.size)}
      ${this.field('Vocalização', item.vocalization)}
      <div class="detail-field"><strong>Suas observações</strong><p>${count}</p></div>`;
    document.getElementById('guideListView').hidden = true; document.getElementById('speciesView').hidden = false;
    document.getElementById('speciesView').scrollTop = 0;
  }

  field(label, value) { return value ? `<div class="detail-field"><strong>${label}</strong><p>${escapeHtml(value)}</p></div>` : ''; }

  async observationSaved() {
    this.counts = await this.repository.getObservationCounts(this.getUser()?.id); this.renderList();
    if (this.selected) this.openSpecies(this.selected.scientificName);
  }
}
