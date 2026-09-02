/**
 * Tableau de bord de diffusion (CLI).
 *
 *   pnpm status
 *
 * Affiche : nombre de publiés / en attente / brouillons / non datés,
 * la prochaine date de publication, la répartition par catégorie, et les
 * articles qui échouent à la validation.
 */
import { ARTICLES_DIR, walk, readArticle, toLocalIso } from './lib/util.ts';
import { validateArticle } from './validate-articles.ts';
import { CATEGORY_SLUGS, categoryLabel } from '../src/config/taxonomy.ts';

type Bucket = 'publié' | 'en attente' | 'brouillon' | 'non daté';

function bucketOf(data: Record<string, any>, now: Date): Bucket {
  if (data.draft === true) return 'brouillon';
  if (!data.publishDate) return 'non daté';
  return new Date(data.publishDate).getTime() <= now.getTime() ? 'publié' : 'en attente';
}

function main() {
  const now = new Date();
  const files = walk(ARTICLES_DIR).map(readArticle);

  const counts: Record<Bucket, number> = { 'publié': 0, 'en attente': 0, 'brouillon': 0, 'non daté': 0 };
  const byCat = new Map<string, { total: number; publié: number }>();
  const pending: { when: Date; label: string }[] = [];
  const failing: { file: string; errors: string[] }[] = [];

  for (const f of files) {
    const b = bucketOf(f.data, now);
    counts[b]++;
    const cat = String(f.data.category ?? '—');
    const entry = byCat.get(cat) ?? { total: 0, publié: 0 };
    entry.total++;
    if (b === 'publié') entry.publié++;
    byCat.set(cat, entry);
    if (b === 'en attente') {
      pending.push({ when: new Date(f.data.publishDate), label: f.data.titre_h1 ?? f.file });
    }
    const rep = validateArticle(f.file);
    if (rep.errors.length) failing.push({ file: rep.file, errors: rep.errors });
  }

  pending.sort((a, b) => +a.when - +b.when);

  console.log('\n════════ Brainrot — diffusion ════════\n');
  console.log(`  Total articles   : ${files.length}`);
  console.log(`  Publiés          : ${counts['publié']}`);
  console.log(`  En attente       : ${counts['en attente']}`);
  console.log(`  Brouillons       : ${counts['brouillon']}`);
  console.log(`  Non datés        : ${counts['non daté']}`);

  console.log('\n  Par catégorie');
  for (const slug of CATEGORY_SLUGS) {
    const e = byCat.get(slug);
    if (!e) continue;
    console.log(`    ${(categoryLabel(slug) + ' '.repeat(18)).slice(0, 18)} : ${e.publié}/${e.total} publiés`);
  }

  if (pending.length) {
    console.log('\n  Prochaine publication');
    console.log(`    ${toLocalIso(pending[0].when)}  —  ${pending[0].label}`);
    if (pending.length > 1) {
      console.log(`    puis ${pending.length - 1} autre(s), jusqu'au ${toLocalIso(pending[pending.length - 1].when)}`);
    }
  } else {
    console.log('\n  Aucune publication en attente.');
  }

  if (failing.length) {
    console.log(`\n  ⚠ ${failing.length} article(s) en échec de validation (ne partiront pas)`);
    for (const f of failing) {
      console.log(`    ✗ ${f.file}`);
      f.errors.forEach((e) => console.log(`        ${e}`));
    }
  } else {
    console.log('\n  ✓ Tous les articles passent la validation.');
  }
  console.log('\n══════════════════════════════════════\n');
}

main();
