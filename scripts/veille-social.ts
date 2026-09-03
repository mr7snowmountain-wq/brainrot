/**
 * Brouillons Reddit / Quora (Étape 5.6) — PRÉPARATION, jamais de publication.
 *
 *   pnpm veille:social
 *
 * Pour chaque article PUBLIÉ, génère des LIENS DE RECHERCHE ciblés (Reddit par
 * subreddit pertinent + Quora) à ouvrir À LA MAIN pour trouver les fils récents
 * où placer une réponse utile. Le script NE POSTE RIEN et ne se connecte à aucun
 * compte (SPEC-VEILLE : « la publication reste humaine »).
 *
 * Pourquoi des liens et pas une liste automatique : Reddit bloque désormais la
 * lecture JSON non authentifiée (HTTP 403). Une auto-liste demanderait un compte
 * OAuth Reddit — surdimensionné et fragile. Les liens ciblés sont fiables.
 */
import { readFileSync, readdirSync, existsSync, mkdirSync, createWriteStream } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';
import matter from 'gray-matter';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SITE_ROOT = join(__dirname, '..');
const ARTICLES_DIR = join(SITE_ROOT, 'src', 'content', 'articles');
const OUT_DIR = join(SITE_ROOT, 'veille');
const SITE_URL = (process.env.SITE_URL || 'https://brainrotstudio.app').replace(/\/$/, '');

const STOP = new Set(['vaut','le','la','les','coup','est','ce','que','qui','en','de','des','un','une','du','pour','sur','2026','2027','2025','avis','test','guide','comment','pourquoi']);

/** Subreddits pertinents par catégorie (là où poser une réponse utile). */
const SUBS: Record<string, string[]> = {
  gaming: ['gaming', 'AndroidGaming', 'gachagaming'],
  'streaming-series': ['netflix', 'Series', 'television'],
  'anime-manga': ['anime', 'manga'],
  musique: ['rapfrancais', 'hiphopheads'],
  tech: ['technology', 'pcgaming'],
  'culture-web': ['OutOfTheLoop', 'memes'],
};

interface Art { titre: string; category: string; query: string; url: string; }

function readPublished(): Art[] {
  const out: Art[] = [];
  const walk = (d: string) => {
    if (!existsSync(d)) return;
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!/\.mdx?$/.test(e.name)) continue;
      try {
        const { data } = matter(readFileSync(p, 'utf8'));
        if (data?.draft === true || !data?.category) continue;
        const slug = basename(e.name).replace(/\.mdx?$/, '');
        const query = slug.replace(/-/g, ' ').split(' ').filter((w) => w.length > 1 && !STOP.has(w)).slice(0, 4).join(' ');
        out.push({ titre: String(data?.titre_h1 ?? slug), category: String(data.category), query, url: `${SITE_URL}/${data.category}/${slug}` });
      } catch { /* ignore */ }
    }
  };
  walk(ARTICLES_DIR);
  return out;
}

const redditSub = (sub: string, q: string) => `https://www.reddit.com/r/${sub}/search/?q=${encodeURIComponent(q)}&restrict_sr=1&sort=new&t=week`;
const redditAll = (q: string) => `https://www.reddit.com/search/?q=${encodeURIComponent(q)}&sort=new&t=week`;
const quora = (q: string) => `https://www.quora.com/search?q=${encodeURIComponent(q)}`;

function main() {
  const arts = readPublished();
  const today = new Date();
  const iso = today.toISOString().slice(0, 10);
  const titreDate = today.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

  mkdirSync(OUT_DIR, { recursive: true });
  const outFile = join(OUT_DIR, `fils-a-repondre-${iso}.pdf`);
  const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: `Fils à répondre — ${titreDate}` } });
  const stream = createWriteStream(outFile);
  doc.pipe(stream);
  const INK = '#141024', SOFT = '#6b6684', ACCENT = '#7c3aed', LINK = '#2563eb', WARN = '#dc2626';

  doc.font('Helvetica-Bold').fontSize(22).fillColor(INK).text(`Fils à répondre — ${titreDate}`);
  doc.moveDown(0.3);
  doc.font('Helvetica-Bold').fontSize(9).fillColor(WARN)
    .text('À RÉPONDRE À LA MAIN. Jamais de post automatique (auto-post = bannissement du domaine).');
  doc.moveDown(0.15);
  doc.font('Helvetica').fontSize(8.5).fillColor(SOFT)
    .text('Ouvre les liens, repère les fils de moins de 48 h avec peu de réponses, et apporte une vraie réponse utile. Sur un compte neuf : réponds SANS lien au début ; le lien devient acceptable avec de l\'historique et du karma. 10 min/jour sur 3-4 fils bien choisis suffisent.');
  doc.moveDown(0.7);

  if (!arts.length) doc.font('Helvetica-Oblique').fontSize(10).fillColor(SOFT).text('Aucun article publié : rien à croiser pour l\'instant.');

  for (const art of arts) {
    doc.moveDown(0.5);
    doc.font('Helvetica-Bold').fontSize(13).fillColor(ACCENT).text(art.titre);
    doc.font('Helvetica').fontSize(8).fillColor(SOFT).text(`Ton article : ${art.url}`, { link: art.url, underline: true });
    doc.moveDown(0.25);

    doc.font('Helvetica-Bold').fontSize(10).fillColor(INK).text('Reddit — chercher les fils récents');
    for (const sub of SUBS[art.category] ?? []) {
      doc.font('Helvetica').fontSize(9).fillColor(LINK).text(`r/${sub}`, { indent: 12, link: redditSub(sub, art.query), underline: true });
    }
    doc.font('Helvetica').fontSize(9).fillColor(LINK).text('Recherche Reddit globale', { indent: 12, link: redditAll(art.query), underline: true });

    doc.moveDown(0.15);
    doc.font('Helvetica-Bold').fontSize(10).fillColor(INK).text('Quora — chercher les questions');
    doc.font('Helvetica').fontSize(9).fillColor(LINK).text('Recherche Quora', { indent: 12, link: quora(art.query), underline: true });
  }

  doc.end();
  stream.on('finish', () => {
    console.log(`\nBrouillons écrits : veille/fils-a-repondre-${iso}.pdf`);
    console.log(`  Articles croisés : ${arts.length}`);
    console.log('  (liens de recherche ciblés — à ouvrir et répondre à la main)\n');
  });
}

main();
