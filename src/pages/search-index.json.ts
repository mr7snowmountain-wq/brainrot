import type { APIRoute } from 'astro';
import { getPublishedArticles, categoryOf, shortSlug } from '@/lib/articles';
import { categoryLabel } from '@/config/taxonomy';

// Index de recherche léger (JSON) : lu côté client par la barre de recherche.
// Régénéré à chaque build — reste synchro avec les articles publiés.
export const GET: APIRoute = async () => {
  const arts = await getPublishedArticles();
  const index = arts.map((a) => ({
    t: a.data.titre_h1,
    d: a.data.soustitre,
    c: categoryLabel(categoryOf(a)),
    u: `/${categoryOf(a)}/${shortSlug(a)}`,
    k: [a.data.cluster, categoryOf(a)].filter(Boolean).join(' '),
  }));
  return new Response(JSON.stringify(index), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
