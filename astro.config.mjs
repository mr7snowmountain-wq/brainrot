import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import mdx from '@astrojs/mdx';

// L'URL du site pilote le sitemap, les URLs canoniques et le JSON-LD.
// Elle vient de l'environnement pour ne jamais être écrite en dur (cf. INPI + multi-env).
const SITE_URL = process.env.SITE_URL || 'https://brainrotgame.fr';

// https://astro.build/config
export default defineConfig({
  site: SITE_URL,
  trailingSlash: 'never',
  integrations: [
    mdx(),
    sitemap(),
  ],
  markdown: {
    // github-slugger génère les ancres des H2 → utilisées par le sommaire.
    shikiConfig: { theme: 'github-dark', wrap: true },
  },
  image: {
    // Formats servis par défaut : WebP en priorité (perf / Lighthouse).
    domains: [],
  },
});
