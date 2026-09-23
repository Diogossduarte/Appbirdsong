import test from 'node:test';
import assert from 'node:assert/strict';
import { LOCAL_SPECIES, normalizeSearch, speciesMatches } from '../js/species-repository.js';

const trincaFerro = LOCAL_SPECIES.find(item => item.scientificName === 'Saltator similis');

test('Trinca-ferro encontra a espécie canônica Saltator similis', () => {
  assert.equal(speciesMatches(trincaFerro, 'Trinca-ferro'), true);
  assert.equal(speciesMatches(trincaFerro, 'trinca ferro'), true);
});

test('busca por nome científico aceita nome inteiro e partes', () => {
  assert.equal(speciesMatches(trincaFerro, 'Saltator similis'), true);
  assert.equal(speciesMatches(trincaFerro, 'saltator'), true);
});

test('normalização ignora acentos e diferenças entre maiúsculas e minúsculas', () => {
  assert.equal(normalizeSearch('SABIÁ-LARANJEIRA'), 'sabia laranjeira');
  assert.equal(speciesMatches(LOCAL_SPECIES.find(item => item.scientificName === 'Turdus rufiventris'), 'sabia'), true);
});
