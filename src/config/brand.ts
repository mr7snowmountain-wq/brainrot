/**
 * Entité de marque, lue depuis l'environnement (jamais en dur).
 * Utilisé par les layouts, le JSON-LD, llms.txt et robots.txt.
 *
 * Côté Astro, les valeurs viennent d'`import.meta.env` (chargé depuis
 * `.env` au build). Le nom de marque reste une variable : changer
 * BRAND_NAME suffit à renommer tout le site.
 */
import { ENTITY_DEFAULTS } from './entity';

const env = import.meta.env as Record<string, string | undefined>;

function read(key: keyof typeof ENTITY_DEFAULTS): string {
  return env[key] ?? ENTITY_DEFAULTS[key];
}

export const brand = {
  name: read('BRAND_NAME'),
  siteUrl: read('SITE_URL').replace(/\/$/, ''),
  author: read('AUTHOR_NAME'),
  contactEmail: read('CONTACT_EMAIL'),
  logoPath: read('LOGO_PATH'),
  tagline:
    env.BRAND_TAGLINE ??
    'Le média de la Gen Z qui joue : gaming, séries, anime, musique et culture web. Repères clairs, tests et classements, sources à l’appui.',
  sameAs: {
    tiktok: read('TIKTOK_URL'),
    instagram: read('INSTAGRAM_URL'),
    youtube: read('YOUTUBE_URL'),
  },
} as const;

/** Liste des sameAs réellement renseignés (les placeholders sont exclus). */
export function resolvedSameAs(): string[] {
  return Object.values(brand.sameAs).filter((u) => u && !u.startsWith('__'));
}

/** Anchors @id stables du graphe JSON-LD. */
export const NODE_IDS = {
  organization: `${brand.siteUrl}#organization`,
  website: `${brand.siteUrl}#website`,
  author: `${brand.siteUrl}#redaction`,
} as const;
