/**
 * Diffusion échelonnée — attribue une `publishDate` aux articles pour une
 * publication automatique (rebuild quotidien). Cadence :
 *  - Jour 1 : tous les piliers publiés d'un coup (les hubs d'abord).
 *  - Ensuite plafond/jour par phase : 3 (mois 1-3) → 4 (4-6) → 5 (7-9) → 6 (10+).
 *  - Un article « court » n'est jamais daté avant lancement + 30 jours
 *    (cohérent avec la règle de cadence du validateur : court ≥ 30 j après son pilier).
 *  - Heures 8h-22h aléatoires et distinctes ; dimanche off, samedi réduit.
 *
 *   pnpm schedule --launch 2026-09-01 [--reassign] [--dry-run] [--seed x]
 */
import {
  ARTICLES_DIR,
  walk,
  readArticle,
  setPublishDate,
  toLocalIso,
  mulberry32,
  seedFrom,
  isMain,
} from './lib/util.ts';
import { CATEGORY_SLUGS } from '../src/config/taxonomy.ts';

const CADENCE_MIN_DAYS = 30;
const categoryRank = (c?: string) => {
  const i = (CATEGORY_SLUGS as readonly string[]).indexOf(c || '');
  return i === -1 ? 999 : i;
};

interface Args { launch?: string; reassign: boolean; dryRun: boolean; seed: string; includeDrafts: boolean; }
function parseArgs(argv: string[]): Args {
  const a: Args = { reassign: false, dryRun: false, seed: 'brainrot', includeDrafts: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i], v = argv[i + 1];
    if (k === '--launch') (a.launch = v), i++;
    else if (k === '--seed') (a.seed = v), i++;
    else if (k === '--reassign') a.reassign = true;
    else if (k === '--dry-run') a.dryRun = true;
    else if (k === '--include-drafts') a.includeDrafts = true;
  }
  return a;
}

const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const monthIndex = (launch: Date, d: Date) =>
  (d.getFullYear() - launch.getFullYear()) * 12 + (d.getMonth() - launch.getMonth()) + 1;

function capForDay(launch: Date, d: Date): number {
  const m = monthIndex(launch, d);
  const cap = m <= 3 ? 3 : m <= 6 ? 4 : m <= 9 ? 5 : 6;
  const dow = d.getDay(); // 0 dim, 6 sam
  if (dow === 0) return 0;
  if (dow === 6) return Math.max(1, Math.floor(cap / 2));
  return cap;
}

interface Item { file: string; data: any; date?: Date; }

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.launch) {
    console.error('Usage : pnpm schedule --launch AAAA-MM-JJ [--reassign] [--dry-run] [--seed x]');
    process.exit(2);
  }
  const launch = new Date(args.launch + 'T00:00:00');
  if (isNaN(+launch)) { console.error('Date de lancement invalide.'); process.exit(2); }
  const rng = mulberry32(seedFrom(args.seed));

  const all: Item[] = walk(ARTICLES_DIR).map(readArticle).map((a) => ({ file: a.file, data: a.data }));
  const eligibles = all.filter((a) => args.includeDrafts || a.data.draft !== true);
  const targets = args.reassign ? eligibles : eligibles.filter((a) => !a.data.publishDate);

  if (!targets.length) {
    console.log('\nRien à dater (utilise --reassign pour tout redater).\n');
    return;
  }

  // Heures 8h-22h distinctes pour un jour donné.
  const timesFor = (day: Date, n: number): Date[] => {
    const used = new Set<string>();
    const out: Date[] = [];
    while (out.length < n) {
      const hh = 8 + Math.floor(rng() * 14); // 8..21
      const mm = Math.floor(rng() * 60);
      const key = `${hh}:${mm}`;
      if (used.has(key)) continue;
      used.add(key);
      const d = new Date(day); d.setHours(hh, mm, Math.floor(rng() * 60), 0);
      out.push(d);
    }
    return out.sort((a, b) => +a - +b);
  };

  // 1) Lancement : tous les piliers au jour 1 (dans l'ordre des catégories).
  const burst = targets.filter((a) => a.data.type === 'pilier');
  const rest = targets.filter((a) => a.data.type !== 'pilier');
  burst.sort((a, b) => categoryRank(a.data.category) - categoryRank(b.data.category));
  const burstTimes = timesFor(launch, Math.max(burst.length, 1));
  burst.forEach((a, i) => { a.date = burstTimes[i]; });

  // 2) Ordre de la file : courts et autres, par catégorie.
  rest.sort((a, b) => categoryRank(a.data.category) - categoryRank(b.data.category));

  const remaining = [...rest];
  let day = addDays(launch, 1);
  let guard = 0;
  while (remaining.length && guard++ < 30000) {
    const cap = capForDay(launch, day);
    if (cap === 0) { day = addDays(day, 1); continue; }
    const slots = timesFor(day, cap);
    let placed = 0;
    for (let i = 0; i < remaining.length && placed < cap; ) {
      const a = remaining[i];
      // Un court n'est jamais daté avant lancement + 30 jours.
      const tooEarly = a.data.type === 'court' && day.getTime() < addDays(launch, CADENCE_MIN_DAYS).getTime();
      if (tooEarly) { i++; continue; }
      a.date = slots[placed];
      remaining.splice(i, 1);
      placed++;
    }
    day = addDays(day, 1);
  }

  // Écriture + rapport
  const scheduled = [...burst, ...rest].filter((a) => a.date).sort((a, b) => +a.date! - +b.date!);
  let changed = 0;
  for (const a of scheduled) if (!args.dryRun && setPublishDate(a.file, a.date!)) changed++;

  const last = scheduled[scheduled.length - 1]?.date;
  console.log(`\nCadence — lancement ${args.launch}${args.dryRun ? ' [DRY-RUN]' : ''}`);
  console.log(`Jour 1 : ${burst.length} pilier(s) d'un coup.`);
  console.log(`${rest.length} article(s) échelonné(s) ensuite, fin le ${last ? toLocalIso(last).slice(0, 10) : '—'}.`);
  if (remaining.length) console.log(`⚠ ${remaining.length} non planifié(s) (file bloquée — vérifier les contraintes).`);
  console.log('');
  for (const a of scheduled.slice(0, 30)) {
    const rel = a.file.split(/[\\/]/).slice(-1)[0];
    console.log(`  ${toLocalIso(a.date!)}  ${a.data.category ?? '?'}/${a.data.type ?? '?'}  ${a.data.cluster ?? ''}  ${rel}`);
  }
  if (scheduled.length > 30) console.log(`  … (+${scheduled.length - 30})`);
  console.log(`\n${args.dryRun ? '(dry-run) aucun fichier modifié' : changed + ' fichier(s) mis à jour'}.\n`);
}

if (isMain(import.meta.url)) main();
