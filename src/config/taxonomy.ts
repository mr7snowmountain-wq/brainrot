/**
 * Taxonomie du site — SOURCE UNIQUE DE VÉRITÉ.
 * Ce module ne contient QUE des constantes (aucun import Astro / Node) afin
 * d'être importable côté Astro (schéma Zod, pages) comme côté scripts.
 *
 * Ajouter une catégorie = ajouter un slug ici + son entrée CATEGORY_META.
 * Le schéma des articles, la navigation et le routing s'y branchent tout seuls.
 */

/** Slugs de catégorie (tuple figé pour z.enum). L'ordre = l'ordre de la nav. */
export const CATEGORY_SLUGS = [
  'jeux-video',
  'anime',
  'streaming-series',
  'musique',
  'tech',
  'culture-web',
] as const;

export type Category = (typeof CATEGORY_SLUGS)[number];

export interface CategoryMeta {
  label: string; // libellé de nav
  titre: string; // H1 de la page hub
  description: string; // meta_description du hub
}

export const CATEGORY_META: Record<Category, CategoryMeta> = {
  'jeux-video': {
    label: 'Jeux vidéo',
    titre: 'Jeux vidéo',
    description:
      'Jeux mobiles, gacha, RPG, tier-lists et guides : les meilleurs jeux du moment, testés et classés.',
  },
  anime: {
    label: 'Anime & manga',
    titre: 'Anime & manga',
    description:
      'Anime de la saison, sorties manga, où regarder en VOSTFR : les repères pour ne rien rater.',
  },
  'streaming-series': {
    label: 'Séries & streaming',
    titre: 'Séries & streaming',
    description:
      'Netflix, Prime, Disney+ : quoi regarder, quand ça sort, ce qui vaut le coup. Séries, films, plateformes.',
  },
  musique: {
    label: 'Musique',
    titre: 'Musique',
    description:
      'Sorties, artistes et tendances qui font bouger la Gen Z, du rap au hyperpop.',
  },
  tech: {
    label: 'Tech',
    titre: 'Tech',
    description:
      'Applis, consoles, matériel et astuces : la tech qui sert vraiment à jouer et à créer.',
  },
  'culture-web': {
    label: 'Culture web',
    titre: 'Culture web',
    description:
      'Memes, tendances, brainrot et lexique internet expliqués : comprendre ce dont tout le monde parle.',
  },
};

/** Le libellé de nav d'une catégorie (repli sur le slug si inconnue). */
export function categoryLabel(slug: string): string {
  return (CATEGORY_META as Record<string, CategoryMeta>)[slug]?.label ?? slug;
}

/** Types éditoriaux d'article (tuple figé pour z.enum). */
export const ARTICLE_TYPES = ['pilier', 'court', 'liste', 'review', 'actu'] as const;
export type ArticleType = (typeof ARTICLE_TYPES)[number];

/**
 * Types de JSON-LD posables sur un article. `FAQPage` n'est PAS listé ici :
 * il est ajouté AUTOMATIQUEMENT dès qu'un article porte une FAQ (cf. jsonld.ts).
 */
export const JSONLD_TYPES = ['Article', 'Review', 'ItemList', 'HowTo', 'VideoObject'] as const;
export type JsonLdType = (typeof JSONLD_TYPES)[number];

/**
 * Gabarits d'entité (REGLES §3) = grilles de structure figées. Le validateur
 * s'en sert notamment pour EXIGER le bloc contradiction là où il est obligatoire.
 */
export const GABARITS = ['artiste', 'film', 'jeu', 'sport', 'mode'] as const;
export type Gabarit = (typeof GABARITS)[number];

/**
 * Gabarits sur lesquels le BLOC CONTRADICTION est OBLIGATOIRE (REGLES §3 :
 * « obligatoire sur 4 gabarits sur 5 »). Le sport en est exempté.
 */
export const GABARITS_CONTRADICTION: readonly Gabarit[] = ['artiste', 'film', 'jeu', 'mode'];
