/**
 * Validation des articles contre les règles éditoriales BLOQUANTES (GEO) et de
 * l'entité contre l'environnement.
 *
 *   pnpm validate         → mode dev  (placeholders = avertissement)
 *   pnpm validate:prod    → mode prod (placeholders = erreur)
 *   pnpm build            → lance validate:prod en prebuild.
 *
 * Sort en code 1 dès qu'une ERREUR est trouvée. Réutilisable :
 * `validateArticle()` est exporté pour le tableau de bord.
 */
import { relative, basename, dirname } from 'node:path';
import {
  classifyH2,
  countWords,
  extractH2,
  hasNumericClaim,
  countInternalLinks,
  findForbiddenMentions,
  slugStopwords,
} from '../src/lib/rules.ts';
import { REQUIRED_ENTITY_KEYS, isPlaceholder } from '../src/config/entity.ts';
import { CATEGORY_SLUGS } from '../src/config/taxonomy.ts';
import { SITE_ROOT, ARTICLES_DIR, loadEnv, walk, readArticle, isMain } from './lib/util.ts';
import { findPinBannedWords } from './lib/pinterest.ts';

const IS_PROD = (process.env.SITE_ENV || '').toLowerCase() === 'production';

const REPONSE_MIN = 40;
const REPONSE_MAX = 60;
const FAQ_MIN = 5;
const FAQ_MAX = 9;
const LIENS_MIN = 3;
const CADENCE_MIN_DAYS = 30;

const ENV = loadEnv();
const SITE_URL = ENV.SITE_URL || 'https://brainrotgame.fr';

export interface Report {
  file: string;
  errors: string[];
  warnings: string[];
}

function bodyLinks(body: string): string[] {
  const hrefs: string[] = [];
  const re = /\[[^\]]*\]\(([^)\s]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) hrefs.push(m[1]);
  return hrefs;
}

function tokens(q: string): Set<string> {
  return new Set(
    q
      .toLowerCase()
      .replace(/[^\p{L}\s]/gu, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 3),
  );
}

/** Paires de questions à fort recouvrement lexical (Jaccard > 0.6). */
function nearDuplicateQuestions(qs: string[]): [string, string][] {
  const sets = qs.map(tokens);
  const pairs: [string, string][] = [];
  for (let i = 0; i < qs.length; i++) {
    for (let j = i + 1; j < qs.length; j++) {
      const a = sets[i];
      const b = sets[j];
      if (a.size === 0 || b.size === 0) continue;
      let inter = 0;
      for (const w of a) if (b.has(w)) inter++;
      const jac = inter / (a.size + b.size - inter);
      if (jac > 0.6) pairs.push([qs[i], qs[j]]);
    }
  }
  return pairs;
}

export function validateArticle(file: string): Report {
  const rel = relative(SITE_ROOT, file);
  const errors: string[] = [];
  const warnings: string[] = [];
  const { raw, data: d, content } = readArticle(file);

  const h2s = extractH2(content);

  // 0. Catégorie : présente, connue, et cohérente avec le dossier de rangement.
  if (!d.category) {
    errors.push('category manquante');
  } else if (!CATEGORY_SLUGS.includes(d.category)) {
    errors.push(`category inconnue : "${d.category}" (attendu : ${CATEGORY_SLUGS.join(', ')})`);
  } else {
    const folder = basename(dirname(file));
    if (folder !== d.category && folder !== 'articles') {
      warnings.push(`dossier "${folder}" ≠ category "${d.category}" (range l'article dans src/content/articles/${d.category}/)`);
    }
  }

  // 1. H1 = requête réelle — BLOQUANT sur l'impératif (ordre au lecteur).
  if (!d.titre_h1) {
    errors.push('titre_h1 manquant');
  } else if (classifyH2(String(d.titre_h1)) === 'imperative') {
    errors.push(`titre_h1 à l'impératif — doit être une requête : "${d.titre_h1}"`);
  }

  // 2. H2 = requête réelle — BLOQUANT sur l'impératif ; un H2 nominal (sans
  //    verbe ni « ? ») est signalé (idéal GEO = question), sans bloquer :
  //    les listicles ont des sections nommées légitimes (noms de jeux, etc.).
  for (const h of h2s) {
    const v = classifyH2(h);
    if (v === 'imperative') errors.push(`H2 à l'impératif (ordre au lecteur) — doit être une requête : "${h}"`);
    else if (v === 'nominal') warnings.push(`H2 nominal — une question serait mieux reprise par les IA : "${h}"`);
  }

  // 3. Bloc réponse 40-60 mots — BLOQUANT
  if (!d.reponse) {
    errors.push('bloc "reponse" manquant');
  } else {
    const n = countWords(String(d.reponse));
    if (n < REPONSE_MIN || n > REPONSE_MAX) {
      errors.push(`bloc "reponse" = ${n} mots (attendu ${REPONSE_MIN}-${REPONSE_MAX})`);
    }
  }

  // 4. Au moins 3 liens internes — BLOQUANT
  const allHrefs: string[] = [
    ...bodyLinks(content),
    ...(Array.isArray(d.liens_internes) ? d.liens_internes.map((l: any) => l?.href) : []),
    d.pilier_ref?.href,
  ].filter(Boolean);
  const nInternes = countInternalLinks(allHrefs, SITE_URL);
  if (nInternes < LIENS_MIN) errors.push(`${nInternes} lien(s) interne(s) (minimum ${LIENS_MIN})`);

  // 5. FAQ 5-9 — BLOQUANT sur le nombre ; doublons = avertissement.
  const nFaq = Array.isArray(d.faq) ? d.faq.length : 0;
  if (nFaq < FAQ_MIN || nFaq > FAQ_MAX) errors.push(`FAQ = ${nFaq} question(s) (attendu ${FAQ_MIN}-${FAQ_MAX})`);
  if (Array.isArray(d.faq)) {
    const dupes = nearDuplicateQuestions(d.faq.map((f: any) => String(f?.q ?? '')));
    for (const [a, b] of dupes) warnings.push(`questions de FAQ très proches (fusionner ?) : "${a}" / "${b}"`);
  }

  // 6. Sources — AUCUN CHIFFRE SANS SOURCE. Une source = une URL vérifiable
  //    (le schéma Zod l'impose déjà). L'identifiant est optionnel.
  const sources = Array.isArray(d.sources) ? d.sources : [];
  for (const [i, s] of sources.entries()) {
    if (!s?.url) errors.push(`source #${i + 1} sans url vérifiable`);
  }
  const chiffres = hasNumericClaim(String(d.reponse ?? '') + '\n' + content);
  if (chiffres && sources.length === 0) {
    errors.push('des chiffres sont présents mais aucune source (aucun chiffre sans source)');
  }
  if (d.type === 'pilier' && sources.length === 0) {
    warnings.push('pilier sans aucune source — un hub gagne à citer au moins une référence');
  }

  // 7. Aucune fausse caution (« relu par… ») — BLOQUANT
  const forbidden = findForbiddenMentions(raw);
  if (forbidden.length) errors.push(`mention interdite (fausse caution) : ${forbidden.join(', ')}`);

  // 8. Review → note attendue (avertissement, non bloquant)
  if (d.jsonld_type === 'Review' && typeof d.note !== 'number') {
    warnings.push('jsonld_type: Review sans note /10 (ajoute `note:` pour la ⭐ dans les résultats)');
  }

  // 9. Avertissements divers
  const slug = d.slug || basename(file).replace(/\.mdx?$/, '');
  const sw = slugStopwords(slug);
  if (sw.length) warnings.push(`slug avec stop-words : ${sw.join(', ')}`);
  const md = String(d.meta_description ?? '');
  if (md.length < 50 || md.length > 200) warnings.push(`meta_description = ${md.length} car. (idéal 50-160)`);

  // 10. Médias — frontmatter images[] = source unique. Aucune image brute en corps
  //     (sinon elle échappe au sitemap-images → pas indexée dans Google Images).
  if (/!\[[^\]]*\]\([^)]*\)/.test(content) || /<img[\s>]/i.test(content)) {
    errors.push('image brute dans le corps — déclare-la dans images[] et pose-la via <Media id> (sinon absente du sitemap)');
  }
  const imgs = Array.isArray(d.images) ? d.images : [];
  for (const [i, im] of imgs.entries()) {
    if (!im?.id) errors.push(`images[${i}] sans id`);
    const w = countWords(String(im?.alt ?? ''));
    if (w < 5 || w > 20) errors.push(`images[${i}] (${im?.id ?? '?'}) : alt = ${w} mot(s) (attendu 5-20)`);
    if (!im?.src && !im?.label) warnings.push(`images[${i}] (${im?.id ?? '?'}) : ni src ni label (placeholder muet)`);
    if (im?.pinDescription) {
      const bad = findPinBannedWords(String(im.pinDescription));
      if (bad.length) errors.push(`images[${i}] (${im?.id ?? '?'}) : pinDescription contient un mot rejeté par Pinterest (${bad.join(', ')})`);
    }
  }

  return { file: rel, errors, warnings };
}

export function validateEntity(): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  for (const key of REQUIRED_ENTITY_KEYS) {
    if (isPlaceholder(ENV[key])) {
      (IS_PROD ? errors : warnings).push(`variable d'entité non renseignée : ${key}`);
    }
  }
  return { errors, warnings };
}

function main() {
  console.log(`\nBrainrot — validation (${IS_PROD ? 'PRODUCTION' : 'développement'})\n`);
  const reports = walk(ARTICLES_DIR).map(validateArticle);
  const entity = validateEntity();

  let totalErrors = entity.errors.length;
  let totalWarnings = entity.warnings.length;

  if (entity.errors.length || entity.warnings.length) {
    console.log('● Entité');
    entity.errors.forEach((e) => console.log(`   ✗ ${e}`));
    entity.warnings.forEach((w) => console.log(`   ⚠ ${w}`));
    console.log('');
  }
  if (reports.length === 0) console.log('   (aucun article dans src/content/articles/ pour l’instant)\n');

  for (const r of reports) {
    if (!r.errors.length && !r.warnings.length) {
      console.log(`✓ ${r.file}`);
      continue;
    }
    console.log(`● ${r.file}`);
    r.errors.forEach((e) => console.log(`   ✗ ${e}`));
    r.warnings.forEach((w) => console.log(`   ⚠ ${w}`));
    totalErrors += r.errors.length;
    totalWarnings += r.warnings.length;
  }

  // Cadence : un article court ne se publie pas avant que le pilier de son
  // cluster soit en ligne depuis au moins 30 jours.
  const items = walk(ARTICLES_DIR).map(readArticle);
  const byPath = new Map<string, any>();
  for (const it of items) {
    const slug = basename(it.file).replace(/\.mdx?$/, '');
    const cat = it.data.category ?? basename(dirname(it.file));
    byPath.set(`/${cat}/${slug}`, it.data);
  }
  for (const it of items) {
    if (it.data.type !== 'court' || !it.data.publishDate) continue;
    const rel = relative(SITE_ROOT, it.file);
    const pil = it.data.pilier_ref?.href ? byPath.get(it.data.pilier_ref.href) : null;
    if (!pil || pil.type !== 'pilier') {
      console.log(`● ${rel}\n   ✗ court sans pilier valide (pilier_ref introuvable ou pas un pilier)`);
      totalErrors++;
      continue;
    }
    if (!pil.publishDate) {
      console.log(`● ${rel}\n   ✗ court publié alors que son pilier n'a pas de date de publication`);
      totalErrors++;
      continue;
    }
    const diff = (new Date(it.data.publishDate).getTime() - new Date(pil.publishDate).getTime()) / 86400000;
    if (diff < CADENCE_MIN_DAYS) {
      console.log(`● ${rel}\n   ✗ court publié ${Math.round(diff)} j après son pilier (minimum ${CADENCE_MIN_DAYS} j)`);
      totalErrors++;
    }
  }

  console.log(`\n${totalErrors} erreur(s), ${totalWarnings} avertissement(s).`);
  if (totalErrors > 0) {
    console.log('Build refusé.\n');
    process.exit(1);
  }
  console.log('OK.\n');
}

if (isMain(import.meta.url)) main();
