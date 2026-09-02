/**
 * media:rename <ancien> <nouveau> — renomme un fichier image ET toutes ses
 * variantes (srcset + pin) DANS public/img, puis met à jour toutes les
 * références dans les articles (src, pinImage, id, <Media id>). Jamais à la main.
 *
 *   pnpm media:rename perinee-schema-vieux perinee-schema-contraction-relachement
 */
import { readdirSync, existsSync, renameSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { SITE_ROOT, walk, isMain } from './lib/util.ts';
import { isValidName } from './lib/media.ts';

const IMG_DIR = join(SITE_ROOT, 'public', 'img');
const ARTICLES = join(SITE_ROOT, 'src', 'content', 'articles');

function main() {
  const [oldName, newName] = process.argv.slice(2);
  if (!oldName || !newName) {
    console.error('Usage : pnpm media:rename <ancien> <nouveau> (noms de base, sans extension)');
    process.exit(2);
  }
  const nm = isValidName(newName);
  if (!nm.ok) {
    console.error(`Nouveau nom invalide : ${nm.reason}`);
    process.exit(2);
  }

  // 1. Fichiers (base + variantes + pin)
  let renamed = 0;
  if (existsSync(IMG_DIR)) {
    for (const f of readdirSync(IMG_DIR)) {
      if (f === `${oldName}.webp` || f.startsWith(`${oldName}-`)) {
        const to = f.replace(oldName, newName);
        renameSync(join(IMG_DIR, f), join(IMG_DIR, to));
        renamed++;
      }
    }
  }

  // 2. Références dans les articles
  let touched = 0;
  for (const file of walk(ARTICLES)) {
    const raw = readFileSync(file, 'utf8');
    const next = raw
      .split(`/img/${oldName}.webp`).join(`/img/${newName}.webp`)
      .split(`/img/${oldName}-`).join(`/img/${newName}-`)
      .split(`id: ${oldName}`).join(`id: ${newName}`)
      .split(`id="${oldName}"`).join(`id="${newName}"`)
      .split(`id='${oldName}'`).join(`id='${newName}'`);
    if (next !== raw) {
      writeFileSync(file, next);
      touched++;
      console.log(`  maj ${relative(SITE_ROOT, file)}`);
    }
  }

  console.log(`\n${renamed} fichier(s) renommé(s), ${touched} article(s) mis à jour.\n`);
}

if (isMain(import.meta.url)) main();
