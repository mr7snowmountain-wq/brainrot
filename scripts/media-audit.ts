/**
 * media:audit — passe public/img en revue : noms non conformes, > 200 Ko,
 * SVG interdits, et fichiers orphelins (présents mais référencés nulle part).
 * Recoupe avec les images déclarées dans le frontmatter (source unique).
 */
import { readdirSync, existsSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { SITE_ROOT, walk, readArticle, isMain } from './lib/util.ts';
import { isValidName, inspectSvg, MAX_BYTES } from './lib/media.ts';

const IMG_DIR = join(SITE_ROOT, 'public', 'img');
const ARTICLES = join(SITE_ROOT, 'src', 'content', 'articles');

/** Toutes les bases d'images référencées dans le frontmatter (src + pinImage). */
function referencedBases(): Set<string> {
  const set = new Set<string>();
  for (const a of walk(ARTICLES).map(readArticle)) {
    for (const im of (a.data.images ?? []) as any[]) {
      for (const s of [im?.src, im?.pinImage]) {
        if (typeof s === 'string') {
          const m = /\/img\/(.+?)(?:-\d+|-pin)?\.webp$/.exec(s);
          if (m) set.add(m[1]);
        }
      }
    }
  }
  return set;
}

function baseOf(file: string): string {
  return file.replace(/\.(webp|svg|png|jpe?g)$/i, '').replace(/(-\d+|-pin)$/, '');
}

function main() {
  console.log('\nmedia:audit — public/img\n');
  if (!existsSync(IMG_DIR)) {
    console.log('   (public/img/ est vide — rien à auditer)\n');
    return;
  }
  const refs = referencedBases();
  const files = readdirSync(IMG_DIR).filter((f) => /\.(webp|svg|png|jpe?g)$/i.test(f));
  let issues = 0;

  for (const f of files) {
    const p = join(IMG_DIR, f);
    const problems: string[] = [];
    const base = baseOf(f);

    if (/\.(png|jpe?g)$/i.test(f)) problems.push('format non-WebP (passe par media:ingest)');
    if (/\.svg$/i.test(f)) {
      const svg = inspectSvg(p);
      if (!svg.ok) problems.push(svg.reason!);
    }
    if (/\.webp$/i.test(f)) {
      const bytes = statSync(p).size;
      if (bytes > MAX_BYTES) problems.push(`${Math.round(bytes / 1024)} Ko > 200 Ko`);
      const nm = isValidName(base);
      if (!nm.ok) problems.push(`nom : ${nm.reason}`);
    }
    if (!refs.has(base)) problems.push('orphelin (référencé nulle part)');

    if (problems.length) {
      console.log(`✗ ${f}`);
      problems.forEach((x) => console.log(`   · ${x}`));
      issues += problems.length;
    }
  }

  // Références cassées : frontmatter pointe vers un fichier absent
  for (const a of walk(ARTICLES).map(readArticle)) {
    for (const im of (a.data.images ?? []) as any[]) {
      for (const s of [im?.src, im?.pinImage]) {
        if (typeof s === 'string') {
          const abs = join(SITE_ROOT, 'public', s.replace(/^\//, ''));
          if (!existsSync(abs)) {
            console.log(`✗ ${relative(SITE_ROOT, a.file)} → ${s} (fichier absent)`);
            issues++;
          }
        }
      }
    }
  }

  console.log(`\n${issues} problème(s). ${files.length} fichier(s) dans public/img.\n`);
  if (issues > 0) process.exit(1);
}

if (isMain(import.meta.url)) main();
