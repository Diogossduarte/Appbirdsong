import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const serviceWorker = await readFile(new URL('../service-worker.js', import.meta.url), 'utf8');

test('Guia usa navegação interna, ficha, filtros e o formulário compartilhado', () => {
  for (const id of ['guideBtn', 'guideScreen', 'guideBack', 'guideSearch', 'speciesView', 'speciesSong', 'speciesRegister', 'observationForm']) {
    assert.match(index, new RegExp(`id="${id}"`));
  }
  assert.match(index, /data-guide-filter="mine"/);
  assert.match(index, /onRegister:openObservationForm/);
});

test('reprodução do Guia reutiliza a integração Xeno-canto existente', () => {
  assert.match(index, /findXenoCantoRecording\(sb,species\.scientificName\)/);
  assert.doesNotMatch(index, /recordingPlayer\.play\(\)/);
});

test('app shell offline inclui o repositório e o Guia no cache v6', () => {
  assert.match(serviceWorker, /songbird-offline-v6/);
  assert.match(serviceWorker, /\.\/js\/species-repository\.js/);
  assert.match(serviceWorker, /\.\/js\/bird-guide\.js/);
});
