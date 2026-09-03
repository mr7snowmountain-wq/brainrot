/**
 * Veille quotidienne — détection de sujets (Étape 5).
 *
 *   pnpm veille
 *
 * Lit des flux RSS/Atom publics et écrit `veille/AAAA-MM-JJ.md` : la liste des
 * candidats du jour. AUCUN appel à un modèle de langage — que du HTTP + parsing,
 * coût nul (cf. SPEC-VEILLE). Sources configurées dans `config/veille-sources.json`.
 *
 * SOUS-ÉTAPE 5.1 : on se limite à quelques flux pour VALIDER LE FORMAT de sortie.
 * Le test de tous les flux (5.2), le tri par priorité + comparaison aux slugs
 * (5.3) et la fraîcheur (5.4) viennent ensuite.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SITE_ROOT = join(__dirname, '..');
const CONFIG = join(SITE_ROOT, 'config', 'veille-sources.json');
const OUT_DIR = join(SITE_ROOT, 'veille');

// 5.1 : plafond volontairement bas pour valider le format. Levé en 5.2.
const MAX_SOURCES = 3;
const ITEMS_PER_FEED = 5;
const FETCH_TIMEOUT_MS = 15000;
const UA = 'BrainrotVeille/1.0 (+https://brainrotstudio.app)';

/** Libellé « Type » par catégorie de la config (pour la sortie). */
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

interface FeedItem {
  title: string;
  link: string;
  date?: string;
}

/** Un URL ressemble-t-il à un flux (et pas à une simple page) ? */
function looksLikeFeed(url: string): boolean {
  return /\.xml($|\?)|\/rss|\/feed/i.test(url);
}

/** Parcourt la config et collecte les sources CONFIRMÉES qui sont des flux. */
function collectSources(config: Record<string, any>): Source[] {
  const out: Source[] = [];
  for (const [key, val] of Object.entries(config)) {
    if (key.startsWith('_') || typeof val !== 'object' || val === null) continue;
    const type = TYPE_LABEL[key] ?? key;
    const visit = (node: any) => {
      if (Array.isArray(node)) return node.forEach(visit);
      if (node && typeof node === 'object') {
        const url = typeof node.url === 'string' ? node.url : '';
        if (url.startsWith('http') && node.statut === 'confirme' && looksLikeFeed(url)) {
          out.push({ nom: node.nom ?? url, url, category: key, type });
        }
        for (const v of Object.values(node)) visit(v);
      }
    };
    visit(val);
  }
  return out;
}

const stripCdata = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
const decode = (s: string) =>
  s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#8217;/g, '’')
    .trim();
const firstMatch = (re: RegExp, s: string) => {
  const m = re.exec(s);
  return m ? decode(stripCdata(m[1])).replace(/\s+/g, ' ').trim() : '';
};

/** Parse un corps RSS ou Atom en une liste d'items (titre + lien + date). */
function parseFeed(xml: string): FeedItem[] {
  const blocks =
    xml.match(/<item[\s\S]*?<\/item>/gi) ?? xml.match(/<entry[\s\S]*?<\/entry>/gi) ?? [];
  const items: FeedItem[] = [];
  for (const b of blocks) {
    const title = firstMatch(/<title[^>]*>([\s\S]*?)<\/title>/i, b);
    // lien : RSS <link>URL</link> ; Atom <link href="URL" .../>
    let link = firstMatch(/<link[^>]*>([\s\S]*?)<\/link>/i, b);
    if (!link) {
      const m = /<link[^>]*href="([^"]+)"/i.exec(b);
      link = m ? decode(m[1]) : '';
    }
    const date =
      firstMatch(/<pubDate>([\s\S]*?)<\/pubDate>/i, b) ||
      firstMatch(/<published>([\s\S]*?)<\/published>/i, b) ||
      firstMatch(/<updated>([\s\S]*?)<\/updated>/i, b) ||
      firstMatch(/<dc:date>([\s\S]*?)<\/dc:date>/i, b) ||
      undefined;
    if (title && link) items.push({ title, link, date });
  }
  return items;
}

async function fetchFeed(url: string): Promise<FeedItem[]> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/rss+xml, application/xml, text/xml, */*' }, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    return parseFeed(xml);
  } finally {
    clearTimeout(t);
  }
}

const ts = (d?: string) => {
  if (!d) return 0;
  const n = Date.parse(d);
  return isNaN(n) ? 0 : n;
};
const fmtDate = (d?: string) => {
  const n = ts(d);
  return n ? new Date(n).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';
};

async function main() {
  const config = JSON.parse(readFileSync(CONFIG, 'utf8'));
  // 5.1 : une source par catégorie (diversité de la démo), plafonnée. En 5.2 on
  // lèvera le plafond et on testera TOUS les flux.
  const seenCat = new Set<string>();
  const sources: Source[] = [];
  for (const s of collectSources(config)) {
    if (seenCat.has(s.category)) continue;
    seenCat.add(s.category);
    sources.push(s);
    if (sources.length >= MAX_SOURCES) break;
  }

  const today = new Date();
  const iso = today.toISOString().slice(0, 10);
  const titreDate = today.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

  const reachable: { src: Source; items: FeedItem[] }[] = [];
  const unreachable: { src: Source; raison: string }[] = [];

  for (const src of sources) {
    try {
      const items = (await fetchFeed(src.url))
        .sort((a, b) => ts(b.date) - ts(a.date))
        .slice(0, ITEMS_PER_FEED);
      if (items.length) reachable.push({ src, items });
      else unreachable.push({ src, raison: 'aucun item lisible (format inattendu ?)' });
    } catch (e: any) {
      unreachable.push({ src, raison: e?.message ?? 'injoignable' });
    }
  }

  // Rédaction du fichier de veille.
  const L: string[] = [];
  L.push(`# Veille du ${titreDate}`, '');
  L.push(`_Généré automatiquement le ${today.toLocaleString('fr-FR')}. Sources lues : ${reachable.length}/${sources.length}. Aucun appel IA._`, '');
  L.push('> Sous-étape 5.1 — validation du format. Le tri par priorité, la comparaison aux articles existants et la fraîcheur arrivent en 5.3/5.4.', '');

  L.push('## À surveiller — dernières remontées des flux', '');
  if (reachable.length === 0) {
    L.push('_Aucun item récupéré._', '');
  }
  for (const { src, items } of reachable) {
    L.push(`### ${src.nom} — _${src.type}_`, '');
    for (const it of items) {
      L.push(`- **${it.title}**`);
      L.push(`  - Type : ${src.type}`);
      L.push(`  - Source : ${it.link}`);
      L.push(`  - Publié le : ${fmtDate(it.date)}`);
    }
    L.push('');
  }

  L.push('## Sources injoignables', '');
  if (unreachable.length === 0) {
    L.push('_Aucune — tous les flux ont répondu._', '');
  } else {
    for (const { src, raison } of unreachable) {
      L.push(`- ${src.nom} (${src.url}) — ${raison}`);
    }
    L.push('');
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const outFile = join(OUT_DIR, `${iso}.md`);
  writeFileSync(outFile, L.join('\n'), 'utf8');

  console.log(`\nVeille écrite : veille/${iso}.md`);
  console.log(`  Sources lues     : ${reachable.length}/${sources.length}`);
  console.log(`  Items remontés   : ${reachable.reduce((n, r) => n + r.items.length, 0)}`);
  console.log(`  Injoignables     : ${unreachable.length}`);
  if (unreachable.length) unreachable.forEach((u) => console.log(`     ⚠ ${u.src.nom} — ${u.raison}`));
  console.log('');
}

main().catch((e) => {
  console.error('Erreur veille :', e);
  process.exit(1);
});
