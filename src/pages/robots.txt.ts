import type { APIRoute } from 'astro';
import { brand } from '@/config/brand';

// On laisse EXPLICITEMENT passer les crawlers IA (dont Google-Extended,
// que beaucoup bloquent par réflexe) : on veut être cité, pas protégé.
const AI_AGENTS = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'PerplexityBot',
  'ClaudeBot',
  'Google-Extended',
  'Bingbot',
];

export const GET: APIRoute = () => {
  const lines: string[] = ['User-agent: *', 'Allow: /', ''];
  for (const agent of AI_AGENTS) {
    lines.push(`User-agent: ${agent}`, 'Allow: /', '');
  }
  lines.push(
    `Sitemap: ${brand.siteUrl}/sitemap-index.xml`,
    `Sitemap: ${brand.siteUrl}/sitemap-images.xml`,
    '',
  );

  return new Response(lines.join('\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
