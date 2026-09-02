/**
 * Moteur média partagé (cf. docs/SPECS-MEDIAS.md) : nommage SEO, conversion
 * WebP + variantes srcset, variante Pinterest 2:3, rejet des SVG lourds.
 */
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import sharp from 'sharp';

export const SRCSET_WIDTHS = [400, 800, 1200, 1600];
export const MAX_WIDTH = 1600;
export const MAX_BYTES = 200 * 1024;
export const PIN_W = 1000;
export const PIN_H = 1500; // 2:3 vertical Pinterest

export const NAME_TYPES = ['schema', 'photo', 'thumb', 'illustration', 'graphique'];
const STOPWORDS = new Set([
  'le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'et', 'ou', 'a', 'au', 'aux',
  'pour', 'avec', 'en', 'the', 'of', 'and', 'sur', 'dans', 'ce', 'que', 'qui', 'img', 'image',
]);

/** Enlève les accents. */
export function deaccent(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * Construit un nom de fichier SEO : minuscules, tirets, sans accent, 3-6 mots,
 * sans stop-word, sans doublon de mot-clé, suffixe de type optionnel.
 */
function toWords(s: string): string[] {
  return deaccent(s)
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, '') // extension
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter((w) => !STOPWORDS.has(w) && w.length > 1);
}

export function slugifyName(raw: string, opts: { type?: string; context?: string } = {}): string {
  // Priorité : nom d'origine ; le contexte ne complète QUE si le nom est trop court
  // (cf. docs/SPECS-MEDIAS.md : contenu > nom d'origine > contexte).
  let words = toWords(raw);
  if (words.length < 3 && opts.context) words = [...toWords(opts.context), ...words];

  // dédoublonnage (garde l'ordre)
  const seen = new Set<string>();
  words = words.filter((w) => (seen.has(w) ? false : (seen.add(w), true)));

  if (opts.type) words = words.filter((w) => w !== opts.type);
  words = words.slice(0, opts.type ? 5 : 6);
  let name = words.join('-');
  if (opts.type && NAME_TYPES.includes(opts.type)) name += `-${opts.type}`;
  return name;
}

const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+){2,6}$/;
export function isValidName(name: string): { ok: boolean; reason?: string } {
  const parts = name.split('-');
  if (!NAME_RE.test(name)) return { ok: false, reason: 'format (minuscules, tirets, 3-6 mots)' };
  if (parts.some((p) => STOPWORDS.has(p))) return { ok: false, reason: 'contient un stop-word' };
  const noType = parts.filter((p) => !NAME_TYPES.includes(p));
  if (new Set(noType).size !== noType.length) return { ok: false, reason: 'mot-clé en double' };
  return { ok: true };
}

/** Nom unique dans un dossier (suffixe -2, -3… si collision). */
export function uniqueName(dir: string, name: string): { name: string; collided: boolean } {
  if (!existsSync(`${dir}/${name}.webp`)) return { name, collided: false };
  let i = 2;
  while (existsSync(`${dir}/${name}-${i}.webp`)) i++;
  return { name: `${name}-${i}`, collided: true };
}

/** Analyse un SVG : rejette >300 Ko ou contenant une image raster embarquée. */
export function inspectSvg(path: string): { ok: boolean; reason?: string } {
  const buf = readFileSync(path);
  if (buf.length > 300 * 1024) return { ok: false, reason: `SVG ${Math.round(buf.length / 1024)} Ko > 300 Ko` };
  if (/data:image\/(png|jpe?g|webp|gif)/i.test(buf.toString('latin1'))) {
    return { ok: false, reason: 'SVG avec image raster embarquée' };
  }
  return { ok: true };
}

async function writeWebpUnder(pipeline: sharp.Sharp, outPath: string) {
  let q = 82;
  let buf = await pipeline.clone().webp({ quality: q }).toBuffer();
  while (buf.length > MAX_BYTES && q > 40) {
    q -= 5;
    buf = await pipeline.clone().webp({ quality: q }).toBuffer();
  }
  const { writeFileSync } = await import('node:fs');
  writeFileSync(outPath, buf);
  return { bytes: buf.length, quality: q, tooBig: buf.length > MAX_BYTES };
}

export interface IngestResult {
  src: string;
  widths: number[];
  pinImage: string;
  width: number;
  height: number;
  baseBytes: number;
  warnings: string[];
}

/**
 * Convertit une image en jeu WebP (repli + variantes srcset) + variante
 * Pinterest 2:3, dans `outDir` (public/img). Retourne les chemins publics.
 */
export async function ingestImage(inputPath: string, outDir: string, baseName: string): Promise<IngestResult> {
  if (/\.svg$/i.test(inputPath)) {
    const svg = inspectSvg(inputPath);
    if (!svg.ok) throw new Error(`SVG refusé : ${svg.reason}`);
  }
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  const src = sharp(inputPath, { failOn: 'none' });
  const meta = await src.metadata();
  const W = Math.min(meta.width || MAX_WIDTH, MAX_WIDTH);
  const warnings: string[] = [];

  let targets = SRCSET_WIDTHS.filter((w) => w <= W);
  if (targets.length === 0) targets = [W];
  const maxTarget = targets[targets.length - 1];

  // variantes
  for (const w of targets) {
    const r = await writeWebpUnder(sharp(inputPath, { failOn: 'none' }).resize({ width: w }), `${outDir}/${baseName}-${w}.webp`);
    if (r.tooBig) warnings.push(`${baseName}-${w}.webp reste > 200 Ko (q${r.quality})`);
  }
  // repli = plus grande variante
  const baseRes = await writeWebpUnder(sharp(inputPath, { failOn: 'none' }).resize({ width: maxTarget }), `${outDir}/${baseName}.webp`);
  // variante Pinterest 2:3
  await writeWebpUnder(
    sharp(inputPath, { failOn: 'none' }).resize(PIN_W, PIN_H, { fit: 'cover', position: 'attention' }),
    `${outDir}/${baseName}-pin.webp`,
  );

  const baseMeta = await sharp(`${outDir}/${baseName}.webp`).metadata();
  return {
    src: `/img/${baseName}.webp`,
    widths: targets,
    pinImage: `/img/${baseName}-pin.webp`,
    width: baseMeta.width || maxTarget,
    height: baseMeta.height || 0,
    baseBytes: baseRes.bytes,
    warnings,
  };
}
