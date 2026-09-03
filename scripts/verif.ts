/**
 * Vérification croisée d'une entité (Étape 5.5).
 *
 *   pnpm verif "Travis Scott"
 *
 * Va chercher la même donnée factuelle (dates clés) sur plusieurs sources et
 * SIGNALE LES DIVERGENCES — c'est ce qui alimente le BLOC CONTRADICTION des
 * articles (« on lit souvent X, c'est faux : … »). Lancé à la main avant d'écrire.
 *
 * Sources (toutes gratuites, sans clé, SANS appel LLM) :
 *   - Wikidata  : données STRUCTURÉES (référence)
 *   - Wikipédia FR + EN : texte d'intro (dates extraites par regex)
 */
const UA = 'BrainrotVerif/1.0 (+https://brainrotstudio.app)';

async function getJSON(url: string): Promise<any> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

/** Propriétés de date Wikidata que l'on compare. */
const DATE_PROPS: Record<string, string> = {
  P569: 'Date de naissance',
  P570: 'Date de décès',
  P571: 'Création / fondation',
  P577: 'Date de publication / sortie',
};

const yearsIn = (txt: string): number[] =>
  [...new Set((txt.match(/\b(?:19|20)\d{2}\b/g) ?? []).map(Number))].sort((a, b) => a - b);

/** "+1991-04-30T00:00:00Z" + precision → { year, label } */
function parseWDTime(v: any): { year: number; label: string } | null {
  const time: string = v?.time ?? '';
  const m = /^[+-](\d{4})-(\d{2})-(\d{2})/.exec(time);
  if (!m) return null;
  const year = Number(m[1]);
  const prec = v?.precision ?? 11;
  if (prec >= 11) {
    const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`);
    return { year, label: d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) };
  }
  return { year, label: String(year) };
}

async function main() {
  const query = process.argv.slice(2).join(' ').trim();
  if (!query) {
    console.error('Usage : pnpm verif "nom de l\'entité"');
    process.exit(2);
  }
  console.log(`\nVérification croisée — « ${query} »\n`);

  // 1. Résolution via WIKIPÉDIA (classe par notoriété, évite les homonymes
  //    obscurs) → titre le plus pertinent → identifiant Wikidata (QID).
  const enc = encodeURIComponent(query);
  const qidFromWiki = async (lang: string): Promise<string | undefined> => {
    const s = await getJSON(`https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${enc}&srlimit=1&format=json&origin=*`);
    const title = s?.query?.search?.[0]?.title;
    if (!title) return undefined;
    const pp = await getJSON(`https://${lang}.wikipedia.org/w/api.php?action=query&prop=pageprops&titles=${encodeURIComponent(title)}&format=json&origin=*`);
    const page: any = Object.values(pp?.query?.pages ?? {})[0];
    return page?.pageprops?.wikibase_item;
  };
  const qid = (await qidFromWiki('fr')) || (await qidFromWiki('en'));
  if (!qid) {
    console.log('Aucune page Wikipédia trouvée. Vérifie l\'orthographe, ou fais la vérif à la main.');
    return;
  }

  // 2. Claims + labels + sitelinks (titres Wikipédia FR/EN).
  const ent = await getJSON(
    `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${qid}&props=claims|labels|descriptions|sitelinks&languages=fr|en&format=json&origin=*`,
  );
  const e = ent?.entities?.[qid];
  const label = e?.labels?.fr?.value ?? e?.labels?.en?.value ?? query;
  const desc = e?.descriptions?.fr?.value ?? e?.descriptions?.en?.value ?? '';
  const frTitle = e?.sitelinks?.frwiki?.title;
  const enTitle = e?.sitelinks?.enwiki?.title;

  console.log(`Entité : ${label}  (${qid})${desc ? ` — ${desc}` : ''}\n`);

  // 3. Intros Wikipédia FR + EN.
  const summary = async (lang: string, title?: string) => {
    if (!title) return '';
    try {
      const s = await getJSON(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`);
      return String(s?.extract ?? '');
    } catch {
      return '';
    }
  };
  const [frTxt, enTxt] = await Promise.all([summary('fr', frTitle), summary('en', enTitle)]);
  const frYears = yearsIn(frTxt);
  const enYears = yearsIn(enTxt);

  // 4. Comparaison des dates structurées Wikidata vs intros.
  let divergences = 0;
  let anyFact = false;
  for (const [prop, propLabel] of Object.entries(DATE_PROPS)) {
    const claim = e?.claims?.[prop]?.[0]?.mainsnak?.datavalue?.value;
    const parsed = claim ? parseWDTime(claim) : null;
    if (!parsed) continue;
    anyFact = true;
    const y = parsed.year;
    const frState = !frTxt ? '—' : frYears.includes(y) ? `mentionne ${y} ✓` : frYears.includes(y - 1) || frYears.includes(y + 1) ? `⚠ mentionne ${frYears.filter((n) => Math.abs(n - y) === 1).join('/')} (≠ ${y})` : `ne mentionne pas ${y}`;
    const enState = !enTxt ? '—' : enYears.includes(y) ? `mentions ${y} ✓` : enYears.includes(y - 1) || enYears.includes(y + 1) ? `⚠ mentions ${enYears.filter((n) => Math.abs(n - y) === 1).join('/')} (≠ ${y})` : `no mention of ${y}`;
    const diverg = frState.includes('⚠') || enState.includes('⚠');
    if (diverg) divergences++;
    console.log(`${propLabel}`);
    console.log(`  Wikidata     : ${parsed.label}`);
    console.log(`  Wikipédia FR : ${frState}`);
    console.log(`  Wikipédia EN : ${enState}`);
    console.log(`  → ${diverg ? '⚠ DIVERGENCE possible — à trancher dans le bloc contradiction' : 'concordant'}\n`);
  }

  if (!anyFact) console.log('Aucune date structurée sur Wikidata pour cette entité (vérif manuelle nécessaire).\n');
  console.log(`Années citées — FR : ${frYears.join(', ') || '—'}`);
  console.log(`Années citées — EN : ${enYears.join(', ') || '—'}\n`);
  console.log(`Bilan : ${divergences} divergence(s) potentielle(s).`);
  console.log('Rappel : Wikidata/Wikipédia sont des points de départ — pour un chiffre publié, cite la source officielle (N1).\n');
}

main().catch((err) => {
  console.error('Erreur vérif :', err);
  process.exit(1);
});
