/**
 * media:ingest — traite visuels/inbox/ : renomme (SEO), convertit en WebP +
 * variantes srcset + variante Pinterest 2:3, écrit le bloc image dans le
 * frontmatter de l'article, déplace l'original, log l'opération.
 *
 *   pnpm media:ingest --article=<slug|cluster>
 *   pnpm media:ingest --auto --article=<slug> [--type=schema] [--context="périnée homme"]
 */
import { readdirSync, existsSync, mkdirSync, renameSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, basename, relative } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { SITE_ROOT, walk, readArticle, isMain } from './lib/util.ts';
import { slugifyName, uniqueName, inspectSvg, ingestImage, deaccent } from './lib/media.ts';

const ROOT = join(SITE_ROOT, '..');
const INBOX = join(ROOT, 'visuels', 'inbox');
const PROCESSED = join(ROOT, 'visuels', 'processed');
const IMG_DIR = join(SITE_ROOT, 'public', 'img');
const LOG = join(ROOT, 'visuels', 'media-log.json');
const ARTICLES = join(SITE_ROOT, 'src', 'content', 'articles');

function parseArgs(argv: string[]) {
  const a: any = { auto: false };
  for (const x of argv) {
    if (x === '--auto') a.auto = true;
    else if (x.startsWith('--article=')) a.article = x.slice(10);
    else if (x.startsWith('--type=')) a.type = x.slice(7);
    else if (x.startsWith('--context=')) a.context = x.slice(10);
  }
  return a;
}

function findArticle(key: string): { file: string; title: string } | null {
  for (const a of walk(ARTICLES).map(readArticle)) {
    const bn = basename(a.file).replace(/\.mdx?$/, '');
    if (bn === key || a.data.cluster === key || bn.includes(key)) {
      return { file: a.file, title: a.data.titre_h1 || bn };
    }
  }
  return null;
}

function humanAlt(base: string): string {
  return base.replace(/-(schema|photo|thumb|illustration|graphique)$/, '').replace(/-/g, ' ');
}

function itemYaml(e: any): string[] {
  const l = [
    `  - id: ${e.id}`,
    `    src: ${e.src}`,
    `    widths: [${e.widths.join(', ')}]`,
    `    pinImage: ${e.pinImage}`,
    `    ratio: "${e.ratio}"`,
    `    width: ${e.width}`,
    `    height: ${e.height}`,
    `    alt: "${e.alt.replace(/"/g, "'")}"`,
  ];
  if (e.caption) l.push(`    caption: "${e.caption.replace(/"/g, "'")}"`);
  return l;
}

function insertImage(file: string, itemLines: string[]) {
  const raw = readFileSync(file, 'utf8');
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw);
  if (!m) throw new Error(`Frontmatter introuvable dans ${file}`);
  const fm = m[1];
  const lines = fm.split('\n');
  const imgIdx = lines.findIndex((l) => /^images:\s*$/.test(l));
  if (imgIdx >= 0) {
    let end = lines.length;
    for (let i = imgIdx + 1; i < lines.length; i++) {
      if (/^[^\s#]/.test(lines[i])) {
        end = i;
        break;
      }
    }
    lines.splice(end, 0, ...itemLines);
  } else {
    lines.push('images:', ...itemLines);
  }
  writeFileSync(file, raw.replace(fm, lines.join('\n')));
}

function appendLog(entry: any) {
  let log: any[] = [];
  if (existsSync(LOG)) {
    try {
      log = JSON.parse(readFileSync(LOG, 'utf8'));
    } catch {
      log = [];
    }
  }
  log.push(entry);
  writeFileSync(LOG, JSON.stringify(log, null, 2));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  for (const d of [INBOX, PROCESSED, IMG_DIR]) if (!existsSync(d)) mkdirSync(d, { recursive: true });

  const files = readdirSync(INBOX).filter((f) => /\.(png|jpe?g|webp|svg|gif|tiff?)$/i.test(f));
  if (!files.length) {
    console.log('\nvisuels/inbox/ est vide. Dépose des visuels puis relance.\n');
    return;
  }
  const article = args.article ? findArticle(args.article) : null;
  if (args.article && !article) {
    console.error(`Article introuvable pour --article=${args.article}.`);
    process.exit(2);
  }
  if (!article) {
    console.error('Précise --article=<slug|cluster> : le frontmatter cible où écrire.');
    process.exit(2);
  }

  const rl = args.auto ? null : createInterface({ input: process.stdin, output: process.stdout });
  const ask = async (q: string, def: string) => {
    if (!rl) return def;
    const a = (await rl.question(`${q} [${def}] `)).trim();
    return a || def;
  };

  console.log(`\nmedia:ingest → ${relative(ROOT, article.file)}  (${files.length} fichier(s))\n`);

  for (const f of files) {
    const input = join(INBOX, f);
    if (/\.svg$/i.test(f)) {
      const svg = inspectSvg(input);
      if (!svg.ok) {
        console.log(`⏭  ${f} — SVG refusé : ${svg.reason}`);
        continue;
      }
    }
    const proposed = uniqueName(IMG_DIR, slugifyName(f, { type: args.type, context: deaccent(article.title) })).name;
    const name = await ask(`Nom pour "${f}" ?`, proposed);
    const finalName = uniqueName(IMG_DIR, name).name;
    const altDefault = humanAlt(finalName);
    const alt = await ask('alt (5-20 mots) ?', altDefault.charAt(0).toUpperCase() + altDefault.slice(1));

    let res;
    try {
      res = await ingestImage(input, IMG_DIR, finalName);
    } catch (e: any) {
      console.log(`⏭  ${f} — ${e.message}`);
      continue;
    }
    res.warnings.forEach((w) => console.log(`   ⚠ ${w}`));

    insertImage(article.file, itemYaml({ id: finalName, ...res, ratio: '16/9', alt }));
    renameSync(input, join(PROCESSED, f));
    appendLog({ original: f, name: finalName, article: relative(ROOT, article.file), bytes: res.baseBytes, widths: res.widths });
    console.log(`✓ ${f} → /img/${finalName}.webp  (${Math.round(res.baseBytes / 1024)} Ko, ${res.widths.length} variantes + pin)`);
  }

  if (rl) rl.close();
  console.log('\nTerminé. Place les images dans le corps avec <Media id="…" images={frontmatter.images} />.\n');
}

if (isMain(import.meta.url)) main();
