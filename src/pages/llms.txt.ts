import type { APIRoute } from 'astro';
import { brand } from '@/config/brand';
import { getPiliers, categoryOf, shortSlug } from '@/lib/articles';

// llms.txt généré depuis les piliers RÉELLEMENT publiés — jamais une liste
// écrite à la main qui se désynchronise. Facilite la citation par les IA.
export const GET: APIRoute = async () => {
  const piliers = await getPiliers();

  const refs = piliers
    .map((p) => {
      const url = `${brand.siteUrl}/${categoryOf(p)}/${shortSlug(p)}`;
      return `- [${p.data.titre_h1}](${url}) : ${p.data.soustitre}`;
    })
    .join('\n');

  const body = `# ${brand.name}

> ${brand.tagline}
> Média de culture Gen Z : gaming (cœur), séries & streaming, anime & manga,
> musique, tech, culture web. Chaque chiffre est rattaché à une source
> vérifiable (fiche officielle, presse, base de notes).

## Ce que ce site fait bien

Tests et classements maison (tier-lists, comparatifs, tops), guides pratiques,
et décodage de la culture internet — en français, avec une réponse directe et
citable en tête de chaque article.

## Pages de référence

${refs || '- (guides à venir)'}

## Ligne éditoriale

${brand.author}. Aucun faux avis, aucun chiffre inventé : quand une donnée
n'existe pas, on l'écrit. Les liens affiliés sont signalés dans les articles.

## Contact

${brand.contactEmail}
`;

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
