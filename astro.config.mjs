import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import mdx from '@astrojs/mdx';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import matter from 'gray-matter';

// L'URL du site pilote le sitemap, les URLs canoniques et le JSON-LD.
// Elle vient de l'environnement pour ne jamais être écrite en dur.
const SITE_URL = process.env.SITE_URL || 'https://brainrotstudio.app';
// Chemin de base : '/' pour un domaine dédié (brainrotstudio.app), '/brainrot/'
// pour un déploiement GitHub Pages en sous-dossier. Piloté par l'env.
const BASE_PATH = process.env.BASE_PATH || '/';

/**
 * Carte « URL de page → dateModified RÉELLE », lue depuis le frontmatter des
 * articles. Sert au `lastmod` du sitemap. On n'utilise JAMAIS la date du build
 * (ce serait une fausse fraîcheur qui décrédibilise le site auprès de Google).
 */
function buildLastmodMap() {
  const dir = join(process.cwd(), 'src', 'content', 'articles');
  const map = {};
  if (!existsSync(dir)) return map;
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!/\.mdx?$/.test(e.name)) continue;
      try {
        const { data } = matter(readFileSync(p, 'utf8'));
        if (data?.draft === true || !data?.category || !data?.dateModified) continue;
        const slug = e.name.replace(/\.mdx?$/, '');
        map[`/${data.category}/${slug}`] = new Date(data.dateModified).toISOString().slice(0, 10);
      } catch {
        /* frontmatter illisible → pas de lastmod, non bloquant */
      }
    }
  };
  walk(dir);
  return map;
}
const LASTMOD = buildLastmodMap();

// https://astro.build/config
export default defineConfig({
  site: SITE_URL,
  base: BASE_PATH,
  // URLs « fichier » (/gaming au lieu de /gaming/) : évite la redirection 301
  // de GitHub Pages et aligne l'URL servie sur la balise canonical.
  trailingSlash: 'never',
  build: { format: 'file' },
  integrations: [
    mdx(),
    sitemap({
      serialize(item) {
        const path = new URL(item.url).pathname.replace(/\/$/, '') || '/';
        if (LASTMOD[path]) item.lastmod = LASTMOD[path];
        return item;
      },
    }),
  ],
  markdown: {
    // github-slugger génère les ancres des H2 → utilisées par le sommaire.
    shikiConfig: { theme: 'github-dark', wrap: true },
  },
  image: {
    domains: [],
  },
});
