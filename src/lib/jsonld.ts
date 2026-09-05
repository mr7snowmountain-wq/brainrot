import type { CollectionEntry } from 'astro:content';
import { brand, NODE_IDS, resolvedSameAs } from '@/config/brand';
import { categoryLabel } from '@/config/taxonomy';

type ArticleData = CollectionEntry<'articles'>['data'];

/** URL absolue d'un article à partir de sa catégorie + slug. */
export function articleUrl(category: string, slug: string): string {
  return `${brand.siteUrl}/${category}/${slug}`;
}

/**
 * Date au format ISO 8601 AVEC fuseau Europe/Paris (ex. 2026-08-26T00:00:00+02:00).
 * Google réclame un décalage horaire sur datePublished/dateModified ; l'offset
 * (+02:00 été / +01:00 hiver) est calculé pour la date, sans dépendance externe.
 */
function isoDateTimeParis(d: Date): string {
  const day = d.toISOString().slice(0, 10);
  const tzName =
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'Europe/Paris',
      timeZoneName: 'longOffset',
    })
      .formatToParts(d)
      .find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+01:00';
  const offset = tzName.replace('GMT', '') || '+01:00';
  return `${day}T00:00:00${offset}`;
}

/** URL absolue à partir d'un chemin `/…` (laisse les URLs déjà absolues). */
function absUrl(src: string): string {
  return /^https?:\/\//.test(src) ? src : `${brand.siteUrl}${src.startsWith('/') ? '' : '/'}${src}`;
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
    datePublished: isoDateTimeParis(data.datePublished),
    dateModified: isoDateTimeParis(data.dateModified),
    isPartOf: { '@id': NODE_IDS.website },
    author: { '@id': NODE_IDS.organization },
    publisher: { '@id': NODE_IDS.organization },
    articleSection: data.category,
  };

  // Champ `image` (vignette rich result) : le hero de l'article, en absolu.
  // Deux ratios quand ils existent : 16/9 (src) + 2/3 Pinterest (pinImage).
  const hero = data.heroImage ? (data.images ?? []).find((i) => i.id === data.heroImage) : undefined;
  if (hero?.src) {
    main.image = [absUrl(hero.src), ...(hero.pinImage ? [absUrl(hero.pinImage)] : [])];
  }

  // `about` fourni dans le frontmatter (TVSeason / Movie / VideoGame…) : injecté tel quel.
  if ((data as { about?: unknown }).about) main.about = (data as { about?: unknown }).about;

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

  // Fil d'Ariane : Accueil → Catégorie → Article (aide SEO/GEO à situer la page).
  graph.push({
    '@type': 'BreadcrumbList',
    '@id': `${url}#breadcrumb`,
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Accueil', item: brand.siteUrl },
      { '@type': 'ListItem', position: 2, name: categoryLabel(data.category), item: `${brand.siteUrl}/${data.category}` },
      { '@type': 'ListItem', position: 3, name: data.titre_h1, item: url },
    ],
  });

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

  // VideoObject (vidéo YouTube) : entrée de recherche vidéo qui pointe vers la page.
  const v = (data as { video?: Record<string, any> }).video;
  if (v?.youtubeId) {
    const vid: Record<string, unknown> = {
      '@type': 'VideoObject',
      '@id': `${url}#video`,
      name: v.title,
      description: v.description || data.meta_description,
      thumbnailUrl: [`https://i.ytimg.com/vi/${v.youtubeId}/hqdefault.jpg`],
      uploadDate: isoDateTimeParis(v.uploadDate ? new Date(v.uploadDate) : data.datePublished),
      contentUrl: `https://www.youtube.com/watch?v=${v.youtubeId}`,
      embedUrl: `https://www.youtube.com/embed/${v.youtubeId}`,
      publisher: { '@id': NODE_IDS.organization },
      isPartOf: { '@id': `${url}#main` },
    };
    if (v.duration) vid.duration = v.duration;
    if (v.transcript) vid.transcript = v.transcript;
    graph.push(vid);
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
