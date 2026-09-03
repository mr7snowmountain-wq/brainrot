/**
 * Veille quotidienne — détection ET CLASSEMENT des sujets (Étapes 5.1→5.3).
 *
 *   pnpm veille
 *
 * Lit tous les flux CONFIRMÉS (statuts posés par `pnpm veille:test`), puis :
 *  - extrait les « entités » des titres (surtout les noms entre « … ») ;
 *  - une entité citée par PLUSIEURS flux le même jour = CHAUD (pic de buzz) ;
 *  - bonus pour les mots-clés sensationnels (sortie, trailer, record…) et la récence ;
 *  - écarte les sujets déjà traités dans un article publié.
 * Sortie : `veille/AAAA-MM-JJ.pdf`, le plus chaud en haut. ZÉRO appel LLM.
 */
import { readFileSync, mkdirSync, createWriteStream, readdirSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';
import matter from 'gray-matter';
import { fetchFeed, looksLikeFeed, ts, fmtDate, mapLimit, type FeedItem } from './lib/feeds.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SITE_ROOT = join(__dirname, '..');
const CONFIG = join(SITE_ROOT, 'config', 'veille-sources.json');
const ARTICLES_DIR = join(SITE_ROOT, 'src', 'content', 'articles');
const OUT_DIR = join(SITE_ROOT, 'veille');

const ITEMS_PER_FEED = 20; // on ratisse large, on filtrera par récence
const RECENT_DAYS = 10;
const CONCURRENCY = 8;
const MAX_HAUTE = 12;
const MAX_MOYENNE = 12;
const MAX_SURVEILLER = 15;

const TYPE_LABEL: Record<string, string> = {
  musique_urbaine: 'musique', anime_manga: 'anime', jeux_video: 'jeu',
  cinema_series: 'ciné/série', sport: 'sport', mode_lifestyle: 'mode', culture_web: 'culture web',
};

// Titres qui « claquent » : marqueurs sensationnels.
const HOT_KW = /\b(sortie|sort\b|date|annonce|annonc|d[ée]voile|r[ée]v[èe]le|trailer|bande[- ]annonce|teaser|leak|gratuit|record|classement|top\s?\d|million|milliard|clash|vs\b|retour|premi[èe]re|exclusi|officiel|remake|remaster|saison\s?\d|\b\d{1,3}\s?(?:ans|millions|milliards)\b)/i;

const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[«»"“”']/g, ' ').replace(/\s+/g, ' ').trim();

const STOP = new Set([
  'the','les','des','une','avec','pour','dans','sur','par','sans','plus','tout','tous','sont','leur','cette','son','ses',
  'comment','pourquoi','quand','notre','votre','entre','apres','avant','deja','encore','fait','fais','cette','celui',
  'jeu','jeux','film','films','serie','series','manga','anime','sortie','sorties','test','avis','nouveau','nouvelle',
  'semaine','video','videos','bande','annonce','critique','critiques','staff','recap','news','actu','edition','saison',
]);

interface Item extends FeedItem {
  feed: string;
  category: string;
  type: string;
  entities: string[];
}

/** Extrait des entités d'un titre : d'abord ce qui est entre guillemets, puis
 *  les séquences de mots capitalisés (noms propres probables). */
function extractEntities(title: string): string[] {
  const set = new Set<string>();
  for (const m of title.matchAll(/[«"“][^«»"“”]{2,60}[»"”]/g)) {
    const e = norm(m[0]);
    if (e.length >= 3) set.add(e);
  }
  for (const m of title.matchAll(/([A-ZÀ-Ý][\wÀ-ÿ’'-]{1,}(?:\s+[A-ZÀ-Ý0-9][\wÀ-ÿ’'-]*){0,4})/g)) {
    const raw = m[1].trim();
    if (raw.split(/\s+/).length < 2) continue; // au moins 2 mots pour un nom propre
    const e = norm(raw).split(' ').filter((w) => w.length > 1 && !STOP.has(w)).join(' ');
    if (e.length >= 4) set.add(e);
  }
  return [...set];
}

function collectConfirmed(config: Record<string, any>) {
  const out: { nom: string; url: string; category: string; type: string }[] = [];
  const walk = (node: any, category: string, type: string) => {
    if (Array.isArray(node)) return node.forEach((n) => walk(n, category, type));
    if (!node || typeof node !== 'object') return;
    const url = typeof node.url === 'string' ? node.url : '';
    if (node.statut === 'confirme' && url.startsWith('http') && looksLikeFeed(url) && typeof node.nom === 'string')
      out.push({ nom: node.nom, url, category, type });
    for (const v of Object.values(node)) walk(v, category, type);
  };
  for (const [category, val] of Object.entries(config)) {
    if (!category.startsWith('_')) walk(val, category, TYPE_LABEL[category] ?? category);
  }
  return out;
}

interface Pub { titre: string; ents: string[]; category: string; published: number; modified: number; }
const toMs = (x: any) => (x ? new Date(x).getTime() || 0 : 0);

/** Articles publiés (pour la dédup ET le contrôle de fraîcheur, 5.4). */
function readPublished(): Pub[] {
  const out: Pub[] = [];
  const walk = (d: string) => {
    if (!existsSync(d)) return;
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!/\.mdx?$/.test(e.name)) continue;
      try {
        const { data } = matter(readFileSync(p, 'utf8'));
        if (data?.draft === true) continue;
        const slugTokens = norm(basename(e.name).replace(/\.mdx?$/, '').replace(/-/g, ' '));
        const ents = [norm(String(data?.titre_h1 ?? '')), slugTokens].filter((s) => s.length >= 3);
        out.push({
          titre: String(data?.titre_h1 ?? basename(e.name)),
          ents,
          category: String(data?.category ?? ''),
          published: toMs(data?.publishDate ?? data?.datePublished),
          modified: toMs(data?.dateModified),
        });
      } catch { /* ignore */ }
    }
  };
  walk(ARTICLES_DIR);
  return out;
}

const ageDays = (d?: string) => {
  const n = ts(d);
  return n ? Math.floor((Date.now() - n) / 86400000) : null;
};
const recencyBonus = (d?: string) => {
  const a = ageDays(d);
  if (a === null) return 0;
  if (a <= 0) return 3;
  if (a <= 1) return 2;
  if (a <= 3) return 1;
  if (a <= 7) return 0;
  return -3;
};

async function main() {
  const config = JSON.parse(readFileSync(CONFIG, 'utf8'));
  const sources = collectConfirmed(config);
  const today = new Date();
  const iso = today.toISOString().slice(0, 10);
  const titreDate = today.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

  // 1. Récupération parallèle + collecte des items récents.
  const fetched = await mapLimit(sources, CONCURRENCY, async (src) => {
    try {
      const raw = (await fetchFeed(src.url, 12000)).slice(0, ITEMS_PER_FEED);
      return { src, items: raw, ok: true };
    } catch {
      return { src, items: [] as FeedItem[], ok: false };
    }
  });
  const unreachable = fetched.filter((f) => !f.ok).map((f) => f.src.nom);

  const items: Item[] = [];
  for (const { src, items: raw } of fetched) {
    for (const it of raw) {
      const a = ageDays(it.date);
      if (a !== null && a > RECENT_DAYS) continue; // trop vieux
      items.push({ ...it, feed: src.nom, category: src.category, type: src.type, entities: extractEntities(it.title) });
    }
  }

  // 2. Chaleur : entité citée par plusieurs FLUX distincts = pic de buzz.
  const entityFeeds = new Map<string, Set<string>>();
  for (const it of items)
    for (const e of it.entities) {
      if (!entityFeeds.has(e)) entityFeeds.set(e, new Set());
      entityFeeds.get(e)!.add(it.feed);
    }

  const pubs = readPublished();
  const published = pubs.flatMap((a) => a.ents);
  const isPublished = (ents: string[]) => ents.some((e) => published.some((p) => p.includes(e) || e.includes(p)));

  // 5.4 — contrôle de fraîcheur : articles publiés depuis +6 mois, non retouchés.
  const FRESH_DAYS = 180;
  const now = Date.now();
  const aRafraichir = pubs
    .filter((a) => a.published && a.published <= now && a.modified && (now - a.modified) / 86400000 > FRESH_DAYS)
    .map((a) => ({ ...a, age: Math.floor((now - a.modified) / 86400000) }))
    .sort((a, b) => b.age - a.age);

  // Score de chaque item.
  const scored = items.map((it) => {
    const heat = Math.max(0, ...it.entities.map((e) => entityFeeds.get(e)!.size)); // nb de flux distincts
    const kw = HOT_KW.test(it.title) ? 2 : 0;
    const score = heat * 3 + kw + recencyBonus(it.date);
    const topEntity = it.entities.slice().sort((a, b) => entityFeeds.get(b)!.size - entityFeeds.get(a)!.size)[0];
    return { it, heat, kw, score, topEntity, deja: isPublished(it.entities) };
  });

  // 3. PRIORITÉ HAUTE : entités citées par ≥2 flux, groupées (une par sujet chaud).
  const hotEntities = [...entityFeeds.entries()].filter(([, feeds]) => feeds.size >= 2).map(([e]) => e);
  const usedItems = new Set<Item>();
  const haute = hotEntities
    .map((ent) => {
      const group = scored.filter((s) => s.it.entities.includes(ent) && !s.deja);
      const feeds = [...new Set(group.map((g) => g.it.feed))];
      const best = group.sort((a, b) => b.score - a.score)[0];
      return { ent, feeds, group, best };
    })
    .filter((g) => g.feeds.length >= 2 && g.best)
    .sort((a, b) => b.feeds.length - a.feeds.length || b.best.score - a.best.score)
    .slice(0, MAX_HAUTE);
  for (const g of haute) g.group.forEach((s) => usedItems.add(s.it));

  // 4. Reste : moyenne (score fort, mot-clé) puis à surveiller.
  const rest = scored.filter((s) => !usedItems.has(s.it) && !s.deja).sort((a, b) => b.score - a.score);
  const moyenne = rest.filter((s) => s.score >= 3).slice(0, MAX_MOYENNE);
  const usedMoy = new Set(moyenne.map((s) => s.it));
  const surveiller = rest.filter((s) => !usedMoy.has(s.it)).slice(0, MAX_SURVEILLER);

  // 5. PDF.
  mkdirSync(OUT_DIR, { recursive: true });
  const outFile = join(OUT_DIR, `${iso}.pdf`);
  await new Promise<void>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: `Veille du ${titreDate}`, Author: 'Brainrot Veille' } });
    const stream = createWriteStream(outFile);
    stream.on('finish', () => resolve());
    stream.on('error', reject);
    doc.pipe(stream);
    const INK = '#141024', SOFT = '#6b6684', HOT = '#dc2626', ACCENT = '#7c3aed', LINK = '#2563eb';

    doc.font('Helvetica-Bold').fontSize(22).fillColor(INK).text(`Veille du ${titreDate}`);
    doc.moveDown(0.25);
    doc.font('Helvetica').fontSize(9).fillColor(SOFT)
      .text(`${sources.length - unreachable.length}/${sources.length} flux · ${items.length} items récents · le plus chaud en haut · aucun appel IA.`);
    doc.moveDown(0.7);

    const section = (t: string, color: string) => { doc.moveDown(0.5); doc.font('Helvetica-Bold').fontSize(15).fillColor(color).text(t); doc.moveDown(0.35); };
    const link = (t: string, url: string, indent: number) => doc.font('Helvetica').fontSize(8).fillColor(LINK).text(t, { indent, link: url, underline: true });

    section('🔥  Priorité haute — ça buzze (cité par plusieurs sources)', HOT);
    if (!haute.length) doc.font('Helvetica-Oblique').fontSize(10).fillColor(SOFT).text('Rien de multi-sources aujourd\'hui.');
    for (const g of haute) {
      doc.font('Helvetica-Bold').fontSize(12).fillColor(INK).text(`${g.best.it.title}`, { indent: 4 });
      doc.font('Helvetica').fontSize(8.5).fillColor(HOT).text(`Chaud : cité par ${g.feeds.length} sources (${g.feeds.join(', ')})  ·  ${g.best.it.type}  ·  ${fmtDate(g.best.it.date)}`, { indent: 14 });
      link(g.best.it.link, g.best.it.link, 14);
      doc.moveDown(0.35);
    }

    section('Priorité moyenne — récent + accrocheur', ACCENT);
    if (!moyenne.length) doc.font('Helvetica-Oblique').fontSize(10).fillColor(SOFT).text('—');
    for (const s of moyenne) {
      doc.font('Helvetica-Bold').fontSize(10.5).fillColor(INK).text(`•  ${s.it.title}`, { indent: 4 });
      doc.font('Helvetica').fontSize(8).fillColor(SOFT).text(`${s.it.feed}  ·  ${s.it.type}  ·  ${fmtDate(s.it.date)}${s.kw ? '  ·  mot-clé accrocheur' : ''}`, { indent: 16 });
      link(s.it.link, s.it.link, 16);
      doc.moveDown(0.25);
    }

    section('À surveiller — remontées du jour', SOFT);
    for (const s of surveiller) {
      doc.font('Helvetica').fontSize(9.5).fillColor(INK).text(`•  ${s.it.title}`, { indent: 4, continued: true });
      doc.fillColor(SOFT).text(`  — ${s.it.feed}, ${fmtDate(s.it.date)}`);
    }

    // 5.4 — tes articles à rafraîchir.
    section('Tes articles à rafraîchir (+6 mois sans retouche)', ACCENT);
    if (!aRafraichir.length) {
      doc.font('Helvetica-Oblique').fontSize(10).fillColor(SOFT).text('Aucun — ton contenu est à jour.');
    } else {
      for (const a of aRafraichir) {
        doc.font('Helvetica-Bold').fontSize(10).fillColor(INK).text(`•  ${a.titre}`, { indent: 4 });
        doc.font('Helvetica').fontSize(8.5).fillColor(SOFT).text(`${a.category}  ·  dernière retouche il y a ${a.age} jours`, { indent: 16 });
        doc.moveDown(0.15);
      }
    }

    if (unreachable.length) {
      section('Sources injoignables aujourd\'hui', SOFT);
      doc.font('Helvetica').fontSize(9).fillColor(SOFT).text(unreachable.join(', '));
    }
    doc.end();
  });

  console.log(`\nVeille écrite : veille/${iso}.pdf`);
  console.log(`  Flux lus        : ${sources.length - unreachable.length}/${sources.length}`);
  console.log(`  Items récents   : ${items.length}`);
  console.log(`  🔥 Priorité haute (multi-sources) : ${haute.length}`);
  haute.forEach((g) => console.log(`     - ${g.best.it.title.slice(0, 70)}  [${g.feeds.length} sources : ${g.feeds.join(', ')}]`));
  console.log(`  Moyenne : ${moyenne.length}  ·  À surveiller : ${surveiller.length}  ·  Injoignables : ${unreachable.length}\n`);
}

main().catch((e) => {
  console.error('Erreur veille :', e);
  process.exit(1);
});
