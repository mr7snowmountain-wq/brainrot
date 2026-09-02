/**
 * Utilitaires partagés par les scripts (validation, diffusion, tableau de bord).
 * Aucun import Astro : exécutables directement via tsx.
 */
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import matter from 'gray-matter';
import { ENTITY_DEFAULTS } from '../../src/config/entity.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const SITE_ROOT = join(__dirname, '..', '..');
export const ARTICLES_DIR = join(SITE_ROOT, 'src', 'content', 'articles');

/** Charge .env (tsx ne le fait pas), process.env prioritaire, défauts en repli. */
export function loadEnv(): Record<string, string> {
  const out: Record<string, string> = { ...ENTITY_DEFAULTS } as Record<string, string>;
  const envFile = join(SITE_ROOT, '.env');
  if (existsSync(envFile)) {
    for (const line of readFileSync(envFile, 'utf8').split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq === -1) continue;
      out[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
    }
  }
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined) out[k] = v;
  return out;
}

/** Liste récursive des .md / .mdx sous un dossier. */
export function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (/\.mdx?$/.test(e.name)) out.push(p);
  }
  return out;
}

export interface ArticleFile {
  file: string;
  raw: string;
  data: Record<string, any>;
  content: string;
}

export function readArticle(file: string): ArticleFile {
  const raw = readFileSync(file, 'utf8');
  const { data, content } = matter(raw);
  return { file, raw, data: data as Record<string, any>, content };
}

export function listArticles(): ArticleFile[] {
  return walk(ARTICLES_DIR).map(readArticle);
}

/** Formatte une date en ISO local naïf (sans Z) : AAAA-MM-JJTHH:mm:ss. */
export function toLocalIso(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
    `T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  );
}

/**
 * Écrit/écrase la valeur de publishDate DANS le frontmatter, de façon
 * chirurgicale : on ne réécrit pas tout le YAML (préserve commentaires,
 * ordre, guillemets). Retourne true si le fichier a été modifié.
 */
export function setPublishDate(file: string, date: Date): boolean {
  const raw = readFileSync(file, 'utf8');
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw);
  if (!m) throw new Error(`Frontmatter introuvable dans ${file}`);
  const fm = m[1];
  const iso = toLocalIso(date);
  const line = `publishDate: ${iso}`;

  let newFm: string;
  if (/^publishDate:.*$/m.test(fm)) {
    newFm = fm.replace(/^publishDate:.*$/m, line);
  } else if (/^dateModified:.*$/m.test(fm)) {
    newFm = fm.replace(/^(dateModified:.*)$/m, `$1\n${line}`);
  } else {
    newFm = `${fm}\n${line}`;
  }
  if (newFm === fm) return false;
  const next = raw.replace(fm, newFm);
  writeFileSync(file, next);
  return true;
}

/** true si ce module est le point d'entrée exécuté (et non importé). */
export function isMain(metaUrl: string): boolean {
  const entry = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
  return metaUrl === entry;
}

/** PRNG déterministe (mulberry32) à partir d'une graine entière. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Graine entière à partir d'une chaîne (djb2). */
export function seedFrom(str: string): number {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = (h * 33) ^ str.charCodeAt(i);
  return h >>> 0;
}
