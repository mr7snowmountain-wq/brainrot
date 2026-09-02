# Brainrot — site (Astro)

Média de culture Gen Z (FR) : **gaming** (cœur) + séries/streaming, anime/manga,
musique, tech, culture web. Optimisé SEO **et** GEO (citation par les moteurs IA).
Rendu 100 % statique. Domaine : **brainrotgame.fr**.

## Démarrer

```bash
pnpm install
cp .env.example .env      # renseigne les variables avant la mise en ligne
pnpm dev                  # http://localhost:4321
```

## Commandes

| Commande | Rôle |
|---|---|
| `pnpm dev` | serveur de développement |
| `pnpm validate` | valide les articles (mode dev : placeholders = avertissement) |
| `pnpm validate:prod` | valide en mode prod (placeholders = erreur) |
| `pnpm build` | **lance `validate:prod` en prebuild**, puis build (un article invalide bloque le build) |
| `pnpm status` | tableau de bord de diffusion (par catégorie) |
| `pnpm schedule --launch AAAA-MM-JJ` | échelonne les `publishDate` |
| `pnpm media:ingest` | ingère les images (WebP + srcset + variante Pinterest) |
| `pnpm pin:publish` | poste les pins Pinterest |
| `pnpm preview` | prévisualise le build |

## Où se trouve quoi

- **Marque / entité** : `.env` (le **nom** est une variable — changer `BRAND_NAME` renomme tout).
- **Taxonomie** (catégories, types, jsonld) : `src/config/taxonomy.ts` (SOURCE UNIQUE).
- **Contrat de frontmatter** : `src/content/config.ts` (validé par Zod au build).
- **Règles éditoriales BLOQUANTES** : `src/lib/rules.ts` + `scripts/validate-articles.ts`.
- **JSON-LD** (Article/Review/ItemList/HowTo/VideoObject + FAQPage auto, jamais `reviewedBy`) : `src/lib/jsonld.ts`.
- **Articles** : `src/content/articles/<catégorie>/` (un exemple : `gaming/genshin-impact-2026-vaut-le-coup.mdx`).
- **Template d'article commenté** : `docs/exemple-article.mdx`.
- **robots.txt / llms.txt / sitemap** : générés (`src/pages/robots.txt.ts`, `llms.txt.ts`, intégration sitemap).
- **Routing** : `/[category]` (hub) et `/[category]/[slug]` (article), générés depuis la taxonomie.
- **À propos** (ligne éditoriale) : `src/pages/a-propos.astro`.

## Règles éditoriales (GEO)

- Réponse directe 40-60 mots en tête (`reponse`) — extraite par les IA.
- H2 = requête (question qu'on tape) ; jamais à l'impératif (BLOQUANT). H2 nominal = signalé.
- FAQ 5-9 items ; ≥3 liens internes ; **aucun chiffre sans source** (source = URL vérifiable).
- alt d'image 5-20 mots ; un seul hero eager ; aucune image brute dans le corps.

## Publication échelonnée

`publishDate` dans le frontmatter : un article n'apparaît pas avant sa date.
`pnpm schedule --launch AAAA-MM-JJ` date les articles ; rebuild quotidien = publication automatique.

## Design

DA « Y2K / hype pastel-vif », dark-native, mobile-first. Tokens et styles : `src/styles/global.css`.
Le logo/favicon dans `public/` sont des placeholders hérités — à remplacer par les assets Brainrot.
