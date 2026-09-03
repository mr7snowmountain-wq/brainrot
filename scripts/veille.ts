/**
 * Veille quotidienne — détection de sujets (Étape 5).
 *
 *   pnpm veille
 *
 * Lit tous les flux CONFIRMÉS de `config/veille-sources.json` (statuts posés par
 * `pnpm veille:test`, Étape 5.2) et écrit `veille/AAAA-MM-JJ.pdf` : la liste des
 * candidats du jour. AUCUN appel à un modèle de langage — que du HTTP + parsing.
 *
 * Le tri par priorité + la comparaison aux articles publiés (5.3) et la fraîcheur
 * (5.4) viennent ensuite. Ici : lecture parallèle + sortie PDF.
 */
import { readFileSync, mkdirSync, createWriteStream } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';
import { fetchFeed, looksLikeFeed, ts, fmtDate, mapLimit, type FeedItem } from './lib/feeds.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SITE_ROOT = join(__dirname, '..');
const CONFIG = join(SITE_ROOT, 'config', 'veille-sources.json');
const OUT_DIR = join(SITE_ROOT, 'veille');

const ITEMS_PER_FEED = 4;
const CONCURRENCY = 8;

/** Libellé « Type » par catégorie de la config. */
const TYPE_LABEL: Record<string, string> = {
  musique_urbaine: 'musique',
  anime_manga: 'anime',
  jeux_video: 'jeu',
  cinema_series: 'ciné/série',
  sport: 'sport',
  mode_lifestyle: 'mode',
  culture_web: 'culture web',
};

interface Source {
  nom: string;
  url: string;
  category: string;
  type: string;
}

/** Toutes les sources CONFIRMÉES qui sont des flux. */
function collectConfirmed(config: Record<string, any>): Source[] {
  const out: Source[] = [];
  const walk = (node: any, category: string, type: string) => {
    if (Array.isArray(node)) return node.forEach((n) => walk(n, category, type));
    if (!node || typeof node !== 'object') return;
    const url = typeof node.url === 'string' ? node.url : '';
    if (node.statut === 'confirme' && url.startsWith('http') && looksLikeFeed(url) && typeof node.nom === 'string') {
      out.push({ nom: node.nom, url, category, type });
    }
    for (const v of Object.values(node)) walk(v, category, type);
  };
  for (const [category, val] of Object.entries(config)) {
    if (category.startsWith('_')) continue;
    walk(val, category, TYPE_LABEL[category] ?? category);
  }
  return out;
}

async function main() {
  const config = JSON.parse(readFileSync(CONFIG, 'utf8'));
  const sources = collectConfirmed(config);

  const today = new Date();
  const iso = today.toISOString().slice(0, 10);
  const titreDate = today.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

  const results = await mapLimit(sources, CONCURRENCY, async (src) => {
    try {
      const items = (await fetchFeed(src.url, 12000))
        .sort((a, b) => ts(b.date) - ts(a.date))
        .slice(0, ITEMS_PER_FEED);
      return { src, items, ok: items.length > 0, raison: items.length ? '' : 'aucun item lisible' };
    } catch (e: any) {
      return { src, items: [] as FeedItem[], ok: false, raison: e?.message ?? 'injoignable' };
    }
  });

  const reachable = results.filter((r) => r.ok);
  const unreachable = results.filter((r) => !r.ok);
  const totalItems = reachable.reduce((n, r) => n + r.items.length, 0);

  mkdirSync(OUT_DIR, { recursive: true });
  const outFile = join(OUT_DIR, `${iso}.pdf`);

  await new Promise<void>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: `Veille du ${titreDate}`, Author: 'Brainrot Veille' } });
    const stream = createWriteStream(outFile);
    stream.on('finish', () => resolve());
    stream.on('error', reject);
    doc.pipe(stream);

    const INK = '#141024', SOFT = '#6b6684', ACCENT = '#7c3aed', LINK = '#2563eb';

    doc.font('Helvetica-Bold').fontSize(22).fillColor(INK).text(`Veille du ${titreDate}`);
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(9).fillColor(SOFT)
      .text(`Généré automatiquement le ${today.toLocaleString('fr-FR')} — ${reachable.length}/${sources.length} flux — ${totalItems} sujets — aucun appel IA.`);
    doc.moveDown(0.15);
    doc.fontSize(9).fillColor(SOFT)
      .text('Le tri par priorité (le plus chaud d\'abord) et la comparaison aux articles publiés arrivent en 5.3.');
    doc.moveDown(0.8);

    doc.font('Helvetica-Bold').fontSize(15).fillColor(ACCENT).text('À surveiller — dernières remontées des flux');
    doc.moveDown(0.4);
    for (const { src, items } of reachable) {
      doc.moveDown(0.3);
      doc.font('Helvetica-Bold').fontSize(12).fillColor(INK).text(`${src.nom}  ·  ${src.type}`);
      doc.moveDown(0.15);
      for (const it of items) {
        doc.font('Helvetica-Bold').fontSize(10.5).fillColor(INK).text(`•  ${it.title}`, { indent: 6 });
        doc.font('Helvetica').fontSize(8.5).fillColor(SOFT).text(`${src.type}  ·  publié le ${fmtDate(it.date)}`, { indent: 18 });
        doc.font('Helvetica').fontSize(8.5).fillColor(LINK).text(it.link, { indent: 18, link: it.link, underline: true });
        doc.moveDown(0.25);
      }
    }

    doc.moveDown(0.6);
    doc.font('Helvetica-Bold').fontSize(15).fillColor(ACCENT).text('Sources injoignables aujourd\'hui');
    doc.moveDown(0.3);
    if (unreachable.length === 0) {
      doc.font('Helvetica-Oblique').fontSize(10).fillColor(SOFT).text('Aucune — tous les flux confirmés ont répondu.');
    } else {
      for (const { src, raison } of unreachable) {
        doc.font('Helvetica').fontSize(9.5).fillColor(INK).text(`•  ${src.nom}`, { continued: true });
        doc.fillColor(SOFT).text(`  — ${raison}`);
      }
    }

    doc.end();
  });

  console.log(`\nVeille écrite : veille/${iso}.pdf`);
  console.log(`  Flux confirmés lus : ${reachable.length}/${sources.length}`);
  console.log(`  Sujets remontés    : ${totalItems}`);
  console.log(`  Injoignables       : ${unreachable.length}`);
  console.log('');
}

main().catch((e) => {
  console.error('Erreur veille :', e);
  process.exit(1);
});
