/**
 * Source unique de vérité pour les clés d'entité et la détection de
 * placeholders. Ce module ne contient QUE des constantes (aucun accès
 * à import.meta / process) afin d'être importable côté Astro comme
 * côté scripts Node.
 */

/** Préfixe qui marque une valeur non renseignée. */
export const PLACEHOLDER_PREFIX = '__';

/** Une valeur est-elle encore un placeholder ? */
export function isPlaceholder(value: string | undefined | null): boolean {
  return !value || value.startsWith(PLACEHOLDER_PREFIX);
}

/** Clés d'environnement dont l'absence/placeholder bloque le build prod. */
export const REQUIRED_ENTITY_KEYS = [
  'BRAND_NAME',
  'SITE_URL',
  'AUTHOR_NAME',
  'CONTACT_EMAIL',
  'LOGO_PATH',
  'INSTAGRAM_URL',
  'TIKTOK_URL',
  'YOUTUBE_URL',
] as const;

export type EntityKey = (typeof REQUIRED_ENTITY_KEYS)[number];

/** Valeurs de repli en développement (jamais utilisées en prod). */
export const ENTITY_DEFAULTS: Record<EntityKey, string> = {
  BRAND_NAME: 'Brainrot',
  SITE_URL: 'https://brainrotstudio.app',
  AUTHOR_NAME: 'La rédaction Brainrot',
  CONTACT_EMAIL: '__CONTACT_EMAIL__',
  LOGO_PATH: '/logo.png',
  INSTAGRAM_URL: '__INSTAGRAM_URL__',
  TIKTOK_URL: '__TIKTOK_URL__',
  YOUTUBE_URL: '__YOUTUBE_URL__',
};
