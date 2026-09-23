const DB_NAME = 'songbird';
const DB_VERSION = 1;
const SPECIES_STORE = 'species';
const OBSERVATIONS_STORE = 'observations';

// Pequeno catálogo editorial embarcado. Ele garante que o Guia tenha conteúdo
// útil no primeiro uso offline; respostas online são mescladas e armazenadas.
export const LOCAL_SPECIES = [
  {
    scientificName: 'Saltator similis', commonNamePt: 'Trinca-ferro', family: 'Thraupidae',
    description: 'Ave canora de porte médio, reconhecida pelo bico robusto e pela faixa clara acima dos olhos.',
    distributionBrazil: 'Encontrada em grande parte do Brasil, especialmente nas regiões Sudeste, Centro-Oeste e Sul.',
    habitat: 'Bordas de mata, capoeiras, cerrados, parques e áreas arborizadas.',
    diet: 'Frutos, sementes, folhas, flores e pequenos invertebrados.', size: '20 a 22 cm',
    vocalization: 'Canto forte, melodioso e composto por frases bem marcadas.',
    photoUrl: 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Saltator_similis_-_Piraju,_Sao_Paulo,_Brazil_-_8.jpg'
  },
  {
    scientificName: 'Turdus rufiventris', commonNamePt: 'Sabiá-laranjeira', family: 'Turdidae',
    description: 'Sabiá de dorso pardo e ventre alaranjado, muito conhecido por seu canto ao amanhecer.',
    distributionBrazil: 'Ocorre em grande parte do Brasil.', habitat: 'Matas, parques, quintais e áreas urbanas arborizadas.',
    diet: 'Frutos e invertebrados.', size: 'Cerca de 25 cm',
    vocalization: 'Canto flautado, variado e melodioso.',
    photoUrl: 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Rufous-bellied_Thrush-3.jpg'
  },
  {
    scientificName: 'Pitangus sulphuratus', commonNamePt: 'Bem-te-vi', family: 'Tyrannidae',
    description: 'Ave de cabeça listrada, peito amarelo e bico forte, frequente perto de pessoas.',
    distributionBrazil: 'Amplamente distribuída no Brasil.', habitat: 'Campos, margens de rios, cidades e áreas abertas arborizadas.',
    diet: 'Insetos, frutos e pequenos vertebrados.', size: 'Cerca de 22 cm',
    vocalization: 'Chamado forte que lembra a expressão “bem-te-vi”.'
  },
  {
    scientificName: 'Furnarius rufus', commonNamePt: 'João-de-barro', family: 'Furnariidae',
    description: 'Ave de plumagem parda conhecida pelo ninho de barro em forma de forno.',
    distributionBrazil: 'Ocorre principalmente nas regiões Sul, Sudeste e Centro-Oeste.',
    habitat: 'Campos, pastagens, parques e áreas urbanas.', diet: 'Insetos e outros pequenos invertebrados.',
    size: 'Cerca de 19 cm', vocalization: 'Dueto forte e ritmado realizado pelo casal.'
  },
  {
    scientificName: 'Ramphastos toco', commonNamePt: 'Tucanuçu', family: 'Ramphastidae',
    description: 'Maior tucano brasileiro, com bico grande alaranjado e plumagem predominantemente preta.',
    distributionBrazil: 'Presente em extensas áreas do Brasil central, oriental e meridional.',
    habitat: 'Cerrados, matas de galeria, bordas de floresta e áreas abertas arborizadas.',
    diet: 'Principalmente frutos; também ovos, filhotes e pequenos animais.', size: 'Até cerca de 56 cm'
  },
  {
    scientificName: 'Vanellus chilensis', commonNamePt: 'Quero-quero', family: 'Charadriidae',
    description: 'Ave terrestre de pernas longas, peito preto e esporões nas asas.',
    distributionBrazil: 'Amplamente distribuída no Brasil.', habitat: 'Campos, pastagens, gramados e margens de ambientes aquáticos.',
    diet: 'Insetos e outros pequenos invertebrados.', size: 'Cerca de 35 cm', vocalization: 'Chamado alto e repetitivo, usado também como alarme.'
  },
  {
    scientificName: 'Colaptes campestris', commonNamePt: 'Pica-pau-do-campo', family: 'Picidae',
    description: 'Pica-pau de áreas abertas, com lados da cabeça e do pescoço amarelos.',
    distributionBrazil: 'Ocorre em grande parte do território brasileiro.', habitat: 'Campos, cerrados, pastagens e áreas rurais.',
    diet: 'Formigas, cupins e outros insetos.', size: 'Cerca de 32 cm'
  },
  {
    scientificName: 'Euphonia chlorotica', commonNamePt: 'Fim-fim', family: 'Fringillidae',
    description: 'Pequena ave; o macho tem ventre amarelo e dorso escuro azulado.',
    distributionBrazil: 'Amplamente distribuída no Brasil.', habitat: 'Matas abertas, bordas, cerrados, pomares e jardins.',
    diet: 'Frutos, com destaque para ervas-de-passarinho.', size: 'Cerca de 10 cm', vocalization: 'Chamado curto que dá origem ao nome popular.'
  }
];

export function normalizeSearch(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR')
    .replace(/[-–—]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function speciesMatches(species, query) {
  const needle = normalizeSearch(query);
  if (!needle) return true;
  return normalizeSearch(`${species.commonNamePt || ''} ${species.scientificName || ''}`).includes(needle);
}

function requestResult(request) {
  return new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
}

function openDatabase() {
  if (!globalThis.indexedDB) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SPECIES_STORE)) db.createObjectStore(SPECIES_STORE, { keyPath: 'scientificName' });
      if (!db.objectStoreNames.contains(OBSERVATIONS_STORE)) {
        const store = db.createObjectStore(OBSERVATIONS_STORE, { keyPath: 'localId' });
        store.createIndex('scientificName', 'scientificName');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readAll(storeName) {
  const db = await openDatabase();
  if (!db) return [];
  return requestResult(db.transaction(storeName).objectStore(storeName).getAll());
}

async function putAll(storeName, values) {
  const db = await openDatabase();
  if (!db) return;
  await new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    values.forEach(value => tx.objectStore(storeName).put(value));
    tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
  });
}

function canonicalSpecies(row) {
  const scientificName = String(row.scientificName || row.scientific_name || '').trim();
  if (!scientificName) return null;
  const result = { scientificName };
  const fields = {
    commonNamePt: row.commonNamePt || row.common_name_pt || row.name_pt,
    family: row.family, description: row.description || row.description_pt,
    distributionBrazil: row.distributionBrazil || row.distribution_brazil,
    habitat: row.habitat, diet: row.diet || row.food, size: row.size,
    vocalization: row.vocalization, photoUrl: row.photoUrl || row.photo_url
  };
  Object.entries(fields).forEach(([key, value]) => { if (value) result[key] = value; });
  return result;
}

export class SpeciesRepository {
  constructor(supabase) { this.supabase = supabase; }

  async getSpecies() {
    const cached = await readAll(SPECIES_STORE).catch(() => []);
    const merged = new Map([...LOCAL_SPECIES, ...cached].map(item => [item.scientificName, item]));
    if (navigator.onLine !== false && this.supabase) {
      const query = this.supabase.from('species').select('*');
      const { data, error } = await Promise.race([
        query,
        new Promise(resolve => setTimeout(() => resolve({ data: null, error: new Error('timeout') }), 3000))
      ]);
      if (!error && Array.isArray(data)) {
        const online = data.map(canonicalSpecies).filter(Boolean);
        online.forEach(item => merged.set(item.scientificName, { ...merged.get(item.scientificName), ...item }));
        await putAll(SPECIES_STORE, [...merged.values()]).catch(() => {});
      }
    }
    return [...merged.values()].filter(item => item.commonNamePt).sort((a, b) => a.commonNamePt.localeCompare(b.commonNamePt, 'pt-BR'));
  }

  async saveLocalObservation(observation) {
    const record = { ...observation, localId: observation.localId || crypto.randomUUID(), createdAt: observation.createdAt || new Date().toISOString() };
    await putAll(OBSERVATIONS_STORE, [record]);
    return record;
  }

  async getObservationCounts(userId) {
    const counts = new Map();
    const local = await readAll(OBSERVATIONS_STORE).catch(() => []);
    const online = userId && navigator.onLine !== false && this.supabase;
    local.filter(item => (!userId || !item.userId || item.userId === userId) && (!online || !item.synced))
      .forEach(item => counts.set(item.scientificName, (counts.get(item.scientificName) || 0) + 1));
    if (online) {
      const { data, error } = await this.supabase.from('observations').select('detected_scientific_name').eq('user_id', userId);
      if (!error) data.forEach(item => {
        const name = item.detected_scientific_name;
        if (name) counts.set(name, (counts.get(name) || 0) + 1);
      });
    }
    return counts;
  }
}
