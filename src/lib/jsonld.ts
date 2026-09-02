import type { CollectionEntry } from 'astro:content';
import { brand, NODE_IDS, resolvedSameAs } from '@/config/brand';

type ArticleData = CollectionEntry<'articles'>['data'];

/** URL absolue d'un article à partir de sa catégorie + slug. */
export function articleUrl(category: string, slug: string): string {
  return `${brand.siteUrl}/${category}/${slug}`;
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Construit le @graph schema.org d'un article.
 *  - Le nœud principal prend le @type de `jsonld_type` (Article par défaut ;
 *    Review, ItemList, HowTo, VideoObject selon le contenu).
 *  - Un nœud FAQPage est ajouté AUTOMATIQUEMENT dès qu'une FAQ est présente.
 *  - Les sources deviennent des `citation` (CreativeWork + url). Jamais de
 *    citation vide, jamais de reviewedBy / lastReviewed (fausse caution).
 */
export function buildArticleGraph(data: ArticleData, url: string) {
  const hasSources = data.sources.length > 0;

  const main: Record<string, unknown> = {
    '@type': data.jsonld_type,
    '@id': `${url}#main`,
    url,
    name: data.title_tag,
    headline: data.titre_h1,
    description: data.meta_description,
    inLanguage: 'fr-FR',
    datePublished: isoDay(data.datePublished),
    dateModified: isoDay(data.dateModified),
    isPartOf: { '@id': NODE_IDS.website },
    author: { '@id': NODE_IDS.organization },
    publisher: { '@id': NODE_IDS.organization },
    articleSection: data.category,
  };

  // Review → note /10 + objet évalué.
  if (data.jsonld_type === 'Review' && typeof data.note === 'number') {
    main.reviewRating = {
      '@type': 'Rating',
      ratingValue: data.note,
      bestRating: 10,
      worstRating: 0,
    };
    main.itemReviewed = { '@type': 'Thing', name: data.titre_h1 };
  }

  if (data.faq.length > 0) {
    main.mainEntity = { '@id': `${url}#faq` };
  }

  if (hasSources) {
    main.citation = data.sources.map((s) => {
      const cite: Record<string, unknown> = { '@type': 'CreativeWork', name: s.titre, url: s.url };
      if (s.auteur) cite.author = s.auteur;
      if (s.editeur) cite.publisher = { '@type': 'Organization', name: s.editeur };
      if (s.annee) cite.datePublished = String(s.annee);
      if (s.identifiant) {
        cite.identifier = {
          '@type': 'PropertyValue',
          propertyID: s.identifiant.type,
          value: s.identifiant.value,
        };
      }
      return cite;
    });
  }

  const graph: Record<string, unknown>[] = [main];

  if (data.faq.length > 0) {
    graph.push({
      '@type': 'FAQPage',
      '@id': `${url}#faq`,
      mainEntity: data.faq.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    });
  }

  graph.push(organizationNode(), websiteNode());

  return { '@context': 'https://schema.org', '@graph': graph };
}

export function organizationNode() {
  return {
    '@type': 'Organization',
    '@id': NODE_IDS.organization,
    name: brand.name,
    url: brand.siteUrl,
    logo: `${brand.siteUrl}${brand.logoPath}`,
    description: brand.tagline,
    sameAs: resolvedSameAs(),
  };
}

export function websiteNode() {
  return {
    '@type': 'WebSite',
    '@id': NODE_IDS.website,
    url: brand.siteUrl,
    name: brand.name,
    inLanguage: 'fr-FR',
    publisher: { '@id': NODE_IDS.organization },
  };
}

/** Graphe des pages non-article (accueil, à propos) : entité seule. */
export function buildEntityGraph() {
  return { '@context': 'https://schema.org', '@graph': [organizationNode(), websiteNode()] };
}
