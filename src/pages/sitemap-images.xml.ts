import type { APIRoute } from 'astro';
import { brand } from '@/config/brand';
import { getPublishedArticles, shortSlug, categoryOf } from '@/lib/articles';

// Sitemap images généré DEPUIS LE FRONTMATTER (source unique). Déclenche
// l'indexation Google Images, où la concurrence du créneau est quasi nulle.

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const abs = (src: string) => (/^https?:\/\//.test(src) ? src : `${brand.siteUrl}${src.startsWith('/') ? '' : '/'}${src}`);

export const GET: APIRoute = async () => {
  const articles = await getPublishedArticles();
  const blocks = articles
    .map((a) => {
      const imgs = (a.data.images ?? []).filter((i) => i.src);
      if (!imgs.length) return '';
      const loc = `${brand.siteUrl}/${categoryOf(a)}/${shortSlug(a)}`;
      const images = imgs
        .map(
          (i) =>
            `    <image:image>\n      <image:loc>${esc(abs(i.src!))}</image:loc>\n      <image:caption>${esc(i.caption || i.alt)}</image:caption>\n    </image:image>`,
        )
        .join('\n');
      return `  <url>\n    <loc>${esc(loc)}</loc>\n${images}\n  </url>`;
    })
    .filter(Boolean)
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${blocks}\n</urlset>\n`;

  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
