import { getCollection, type CollectionEntry } from 'astro:content';
import type { Category } from '@/config/taxonomy';

/** Un article est visible si non-brouillon et si sa date de publication est passée. */
export function isPublished(entry: CollectionEntry<'articles'>, now = new Date()): boolean {
  return !entry.data.draft && entry.data.publishDate.getTime() <= now.getTime();
}

/** Catégorie de rangement (source unique : le frontmatter). */
export function categoryOf(entry: CollectionEntry<'articles'>): Category {
  return entry.data.category;
}

/** Slug court, sans le préfixe de dossier de catégorie. */
export function shortSlug(entry: CollectionEntry<'articles'>): string {
  return entry.slug.split('/').pop() ?? entry.slug;
}

/** Chemin canonique d'un article : /<catégorie>/<slug>. */
export function articlePath(entry: CollectionEntry<'articles'>): string {
  return `/${categoryOf(entry)}/${shortSlug(entry)}`;
}

export async function getPublishedArticles(category?: Category) {
  const now = new Date();
  const all = (await getCollection('articles')).filter((e) => isPublished(e, now));
  const filtered = category ? all.filter((e) => categoryOf(e) === category) : all;
  return filtered.sort(
    (a, b) => b.data.datePublished.getTime() - a.data.datePublished.getTime(),
  );
}

export async function getPiliers() {
  const now = new Date();
  const all = (await getCollection('articles')).filter((e) => isPublished(e, now));
  return all.filter((e) => e.data.type === 'pilier');
}
