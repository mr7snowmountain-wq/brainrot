/**
 * pin:publish — notre moteur d'auto-publication Pinterest.
 *
 * Dès qu'un article est EN LIGNE (publishDate <= aujourd'hui, non draft) et
 * pas encore posté, construit son pin et le publie sur le compte Pinterest.
 * Idempotent : un journal (visuels/pinterest-log.json) garantit un seul pin
 * par article. À brancher sur un cron quotidien après déploiement.
 *
 *   pnpm pin:publish --dry-run     # montre ce qui serait posté, ne poste rien
 *   pnpm pin:publish               # poste (exige PINTEREST_ACCESS_TOKEN + _BOARD_ID)
 *
 * Env : PINTEREST_ACCESS_TOKEN, PINTEREST_BOARD_ID, SITE_URL (déf. https://brainrotstudio.app)
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { SITE_ROOT, walk, readArticle, isMain } from './lib/util.ts';
import { buildPinDraft, postPin } from './lib/pinterest.ts';

const ARTICLES = join(SITE_ROOT, 'src', 'content', 'articles');
const LOG = join(SITE_ROOT, '..', 'visuels', 'pinterest-log.json');
const SITE_URL = (process.env.SITE_URL || 'https://brainrotstudio.app').replace(/\/$/, '');

const dryRun = process.argv.includes('--dry-run');

function loadLog(): Record<string, { pinId: string; at: string }> {
  if (!existsSync(LOG)) return {};
  try { return JSON.parse(readFileSync(LOG, 'utf8')); } catch { return {}; }
}
function saveLog(log: object) { writeFileSync(LOG, JSON.stringify(log, null, 2)); }

async function main() {
  const token = process.env.PINTEREST_ACCESS_TOKEN;
  const board = process.env.PINTEREST_BOARD_ID;
  const today = new Date().toISOString().slice(0, 10);
  const log = loadLog();

  const live = walk(ARTICLES)
    .map(readArticle)
    .filter((a) => !a.data.draft)
    .filter((a) => {
      const d = a.data.publishDate instanceof Date
        ? a.data.publishDate.toISOString().slice(0, 10)
        : String(a.data.publishDate).slice(0, 10);
      return d <= today;
    });

  const drafts = live.map((a) => buildPinDraft(a.data, a.file, SITE_URL));
  const already = drafts.filter((d) => log[d.slug]);
  const skipped = drafts.filter((d) => !log[d.slug] && d.skipped);
  const toPost = drafts.filter((d) => !log[d.slug] && !d.skipped);

  console.log(`\nPinterest — ${SITE_URL}`);
  console.log(`En ligne : ${live.length} · déjà postés : ${already.length} · à poster : ${toPost.length} · ignorés : ${skipped.length}`);
  if (dryRun) console.log('MODE DRY-RUN : rien ne sera posté.\n');

  for (const d of skipped) console.log(`⏭  ${d.slug} — ${d.skipped}`);

  for (const d of toPost) {
    if (dryRun) {
      console.log(`\n📌 ${d.slug}`);
      console.log(`   titre : ${d.title}`);
      console.log(`   desc  : ${d.description}`);
      console.log(`   lien  : ${d.link}`);
      console.log(`   image : ${d.imageUrl}`);
      continue;
    }
    if (!token || !board) {
      console.error('\n✗ PINTEREST_ACCESS_TOKEN et PINTEREST_BOARD_ID requis pour poster (ou utilise --dry-run).');
      process.exit(2);
    }
    try {
      const pinId = await postPin(d, board, token);
      log[d.slug] = { pinId, at: new Date().toISOString() };
      saveLog(log);
      console.log(`✓ ${d.slug} → pin ${pinId}`);
    } catch (e: any) {
      console.error(`✗ ${d.slug} — ${e.message}`);
    }
  }
  console.log('\nTerminé.\n');
}

if (isMain(import.meta.url)) main();
