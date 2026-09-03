/**
 * Test de tous les flux (Étape 5.2).
 *
 *   pnpm veille:test
 *
 * Teste chaque flux de `config/veille-sources.json`, puis MET À JOUR le champ
 * `statut` de chaque source :
 *   - confirme : le flux répond et son dernier item est récent (< 180 j)
 *   - perime   : le flux répond mais son dernier item date de > 180 j
 *   - mort     : injoignable, non-XML, ou aucun item lisible
 * « Ne jamais laisser un flux mort dans la config sans le marquer » (SPEC).
 * Si un `flux_a_tester` fonctionne, il est promu en `url`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchFeed, looksLikeFeed, newestAgeDays, mapLimit } from './lib/feeds.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG = join(__dirname, '..', 'config', 'veille-sources.json');

const STALE_DAYS = 180;
const CONCURRENCY = 8;

type Statut = 'confirme' | 'perime' | 'mort';

interface Candidate {
  obj: Record<string, any>; // référence mutable dans la config
  nom: string;
  category: string;
  testUrl: string;
  viaAlt: boolean; // testé via flux_a_tester (à promouvoir si OK)
}

function collect(config: Record<string, any>): Candidate[] {
  const out: Candidate[] = [];
  const walk = (node: any, category: string) => {
    if (Array.isArray(node)) return node.forEach((n) => walk(n, category));
    if (!node || typeof node !== 'object') return;
    const url = typeof node.url === 'string' ? node.url : '';
    const alt = typeof node.flux_a_tester === 'string' ? node.flux_a_tester : '';
    let testUrl = '';
    let viaAlt = false;
    if (url.startsWith('http') && looksLikeFeed(url)) testUrl = url;
    else if (alt.startsWith('http')) { testUrl = alt; viaAlt = true; }
    if (typeof node.nom === 'string' && testUrl) {
      out.push({ obj: node, nom: node.nom, category, testUrl, viaAlt });
    }
    for (const v of Object.values(node)) walk(v, category);
  };
  for (const [category, val] of Object.entries(config)) {
    if (category.startsWith('_')) continue;
    walk(val, category);
  }
  return out;
}

async function testOne(c: Candidate): Promise<{ c: Candidate; statut: Statut; detail: string }> {
  try {
    const items = await fetchFeed(c.testUrl, 12000);
    if (!items.length) return { c, statut: 'mort', detail: 'aucun item lisible' };
    const age = newestAgeDays(items);
    if (age !== null && age > STALE_DAYS) {
      return { c, statut: 'perime', detail: `${items.length} items, dernier il y a ${age} j` };
    }
    return { c, statut: 'confirme', detail: `${items.length} items${age !== null ? `, dernier il y a ${age} j` : ''}` };
  } catch (e: any) {
    return { c, statut: 'mort', detail: e?.message ?? 'injoignable' };
  }
}

async function main() {
  const config = JSON.parse(readFileSync(CONFIG, 'utf8'));
  const candidates = collect(config);
  console.log(`\nBrainrot — test des flux : ${candidates.length} flux à vérifier…\n`);

  const results = await mapLimit(candidates, CONCURRENCY, testOne);

  const counts: Record<Statut, number> = { confirme: 0, perime: 0, mort: 0 };
  const icon: Record<Statut, string> = { confirme: '✓', perime: '~', mort: '✗' };

  for (const r of results) {
    counts[r.statut]++;
    // Mise à jour du statut dans la config (par référence).
    r.c.obj.statut = r.statut;
    if (r.c.viaAlt && r.statut !== 'mort') r.c.obj.url = r.c.testUrl; // promotion du flux testé
    console.log(`  ${icon[r.statut]} [${r.statut}] ${r.c.category} · ${r.c.nom} — ${r.detail}`);
  }

  writeFileSync(CONFIG, JSON.stringify(config, null, 2) + '\n', 'utf8');

  console.log(`\nRésumé : ${counts.confirme} confirmé(s), ${counts.perime} périmé(s), ${counts.mort} mort(s).`);
  console.log('Statuts mis à jour dans config/veille-sources.json.\n');
}

main().catch((e) => {
  console.error('Erreur test des flux :', e);
  process.exit(1);
});
