import { defineCollection, z } from 'astro:content';
import { CATEGORY_SLUGS, ARTICLE_TYPES, JSONLD_TYPES } from '@/config/taxonomy';

/**
 * Contrat de frontmatter des articles. Zod le valide au build :
 * un article mal formé casse la compilation (première barrière).
 * Les règles éditoriales fines (H2 = requête, comptage de mots, liens,
 * FAQ, sources chiffrées, alt) sont vérifiées par
 * scripts/validate-articles.ts (seconde barrière, lancée en prebuild).
 */

/**
 * Une source = une URL VÉRIFIABLE (fiche Play Store/éditeur, presse, base de
 * notes). L'identifiant est OPTIONNEL (ex. package Play Store, IMDb, MAL id) :
 * il enrichit le JSON-LD mais n'est plus obligatoire (plus de PMID médical).
 */
const source = z.object({
  titre: z.string().min(1),
  url: z.string().url(), // toujours vérifiable
  auteur: z.string().optional(),
  editeur: z.string().optional(), // studio, chaîne, plateforme, média
  annee: z.union([z.number(), z.string()]).optional(),
  identifiant: z
    .object({
      type: z.string().min(1), // ex. 'PlayStore', 'IMDb', 'MAL', 'Metacritic'
      value: z.string().min(1),
    })
    .optional(),
});

const faqItem = z.object({
  q: z.string().min(1),
  a: z.string().min(1),
});

const lien = z.object({
  href: z.string().min(1),
  label: z.string().min(1),
});

// Bloc de pied d'article (promo app / affiliation) — générique et optionnel.
const cta = z.object({
  label: z.string().min(1),
  href: z.string().min(1),
  soustitre: z.string().optional(),
  track: z.string().min(1), // identifiant de tracking distinct par CTA
});

// Déclaration d'image = SOURCE UNIQUE DE VÉRITÉ.
// <Media id="…" /> ne fait que la placer ; le sitemap images se génère d'ici.
const imageDecl = z.object({
  id: z.string().min(1),
  src: z.string().optional(), // absent → placeholder réservant la place
  alt: z.string().min(1),
  caption: z.string().optional(),
  section: z.string().optional(), // slug de H2 pour placement auto (articles .md)
  eager: z.boolean().default(false), // un seul eager par page
  ratio: z.string().default('16/9'),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  widths: z.array(z.number().int().positive()).optional(), // variantes srcset (media:ingest)
  // Pinterest
  pinnable: z.boolean().default(true),
  pinDescription: z.string().optional(),
  pinImage: z.string().optional(), // variante verticale 2:3 (1000×1500)
  label: z.string().optional(), // libellé du placeholder tant qu'il n'y a pas de src
});

const articles = defineCollection({
  type: 'content',
  schema: z
    .object({
      // Identité éditoriale
      titre_h1: z.string().min(1),
      // Sous-titre (dek) sous le H1, AVANT la réponse. Rendu en <p class="dek">.
      soustitre: z.string().min(1),
      title_tag: z.string().min(1).max(70),
      meta_description: z.string().min(50).max(200),

      // Rangement & GEO
      category: z.enum(CATEGORY_SLUGS),
      type: z.enum(ARTICLE_TYPES),
      cluster: z.string().optional(), // hub thématique (pilier + satellites)
      // Type de JSON-LD principal. FAQPage est ajouté en plus, automatiquement,
      // dès qu'une FAQ est présente (cf. lib/jsonld.ts).
      jsonld_type: z.enum(JSONLD_TYPES).default('Article'),
      // Note /10 pour un article de test (jsonld_type: Review) — facultatif.
      note: z.number().min(0).max(10).optional(),

      // Réponse extraite par les IA — 40 à 60 mots (comptage dans le script)
      reponse: z.string().min(1),

      // Dates
      datePublished: z.coerce.date(),
      dateModified: z.coerce.date(),
      publishDate: z.coerce.date(), // diffusion échelonnée

      // Sources : URL vérifiable. Règle « aucun chiffre sans source » (script).
      sources: z.array(source).default([]),

      // FAQ (5 à 9) — questions telles qu'on les tape.
      faq: z.array(faqItem).default([]),

      // Maillage
      liens_internes: z.array(lien).default([]),
      pilier_ref: lien.optional(),

      // Pied d'article (promo app / affiliation) — 0 ou 1.
      cta: cta.optional(),

      // Média — toutes les images déclarées ici (source unique de vérité)
      images: z.array(imageDecl).default([]),
      heroImage: z.string().optional(), // id d'une image de `images`, affichée en tête

      draft: z.boolean().default(false),
    })
    .refine((d) => d.dateModified >= d.datePublished, {
      message: 'dateModified doit être postérieure ou égale à datePublished.',
      path: ['dateModified'],
    })
    .refine((d) => new Set(d.images.map((i) => i.id)).size === d.images.length, {
      message: 'Deux images partagent le même id.',
      path: ['images'],
    })
    .refine((d) => !d.heroImage || d.images.some((i) => i.id === d.heroImage), {
      message: 'heroImage référence un id absent de images[].',
      path: ['heroImage'],
    })
    .refine((d) => d.images.filter((i) => i.eager).length <= 1, {
      message: 'Une seule image peut être en eager par page.',
      path: ['images'],
    }),
});

export const collections = { articles };
