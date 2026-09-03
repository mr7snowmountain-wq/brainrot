# CLAUDE.md — Brainrot · média lifestyle Gen Z (SEO + GEO first)

Média de culture Gen Z : **gaming (cœur)** + séries/streaming, musique, anime/manga, tech, culture web.
Objectif n°1 : ranker sur Google ET être cité par les IA (GEO). Les jeux (Play Store) = une verticale + le tunnel de monétisation.
Domaine : **brainrotstudio.app**. DA : Y2K / hype pastel-vif, dark-native, mobile-first.

## Stack (identique au template, ne pas dévier)
Astro 4 (content collections) · Zod · @astrojs/sitemap PINNÉ 3.2.1 · pnpm ·
pipeline média WebP/srcset/pin · validateur 2 barrières en prebuild · JSON-LD auto · moteur Pinterest.

## Taxonomie — SOURCE UNIQUE : `src/config/taxonomy.ts`
Catégories : `gaming`, `streaming-series`, `anime-manga`, `musique`, `tech`, `culture-web`.
Types : `pilier` (hub), `court` (question précise), `liste` (top/tier-list), `review` (test), `actu` (news datée).
Ajouter une catégorie = un slug + son entrée `CATEGORY_META` (la nav, le routing et le schéma s'y branchent seuls).

## Règles éditoriales BLOQUANTES (validateur — `scripts/validate-articles.ts`)
- Réponse directe 40-60 mots en tête (`reponse`).
- H2 : jamais à l'impératif (ordre au lecteur) = BLOQUANT. Un H2 nominal (sans verbe ni « ? ») est signalé (idéal GEO = question), non bloquant.
- FAQ 5-9 items. ≥3 liens internes.
- **BLOC CONTRADICTION obligatoire** (règle GEO n°1) sur les gabarits `artiste`/`film`/`jeu`/`mode` : un H2 qui démonte une idée reçue (« Ce qu'on raconte de faux sur … » → « On lit souvent X. C'est faux : … »). Le champ `gabarit` (artiste/film/jeu/sport/mode) est optionnel ; s'il est posé, il déclenche cette règle.
- **`dateModified` obligatoire et réel** (≥ `datePublished`, à mettre à jour à chaque retouche).
- AUCUN chiffre sans source. Hiérarchie de sources : **N1** officiel (fiche Play Store/éditeur, communiqué), **N2** base de référence (IMDb, Metacritic, Discogs, Sherdog…), **N3** presse établie datée. Source = URL vérifiable ; identifiant optionnel. Blog perso/plateforme (blogspot, medium…) = signalé.
- alt d'image 5-20 mots. Un seul hero eager par page. Aucune image brute dans le corps (passe par `images[]` + `<Media id>`).
- pinDescription sans lexique interdit Pinterest.
- category cohérente avec le dossier de rangement `src/content/articles/<category>/`.
- Aucune règle sur le CTA (champ `cta` libre : quiz, lien app, ou rien). CTA placé au-dessus des sources.

## GEO (priorité)
Chaque article répond à UNE question en une phrase citable, entité-riche (noms/dates précis),
données sourcées, JSON-LD adapté via `jsonld_type` (Article défaut / Review / ItemList / HowTo / VideoObject ;
FAQPage ajouté automatiquement dès qu'une FAQ est présente), `dateModified` à jour. `llms.txt` généré depuis les piliers.

## Sourcing
Pas de médical. Source = fiche officielle (Play Store/éditeur), presse, base de notes. Jamais de faux chiffre / faux avis.

## Distribution
Pinterest = auto (moteur `pin:publish`). Short vidéo (TikTok/Shorts/Reels) = pipeline de repurposing, vrai levier.
Reddit/Quora = drafts à poster À LA MAIN (jamais d'auto-post = ban).

## Publication
publishDate échelonnée (`pnpm schedule --launch AAAA-MM-JJ`) + rebuild quotidien automatique. Zéro action manuelle sur l'hébergeur.

## Monétisation
Promo des apps du studio + AdMob/display + affiliation (gift cards, matériel, abos). Champ `cta` du frontmatter
= bloc de fin d'article (label/href/soustitre/track). Liens affiliés → `rel="sponsored"` (géré par le composant) + divulgation.

## Workflow d'intégration
Le user dépose les articles en bloc → intégration `.mdx` en parallèle (agents) → auto-validation 0 erreur → build.
Ne jamais réécrire le fond d'un article en douce : signaler les violations de règle.

## Commandes
`pnpm dev` · `pnpm validate` (dev) · `pnpm build` (prebuild = validate:prod) · `pnpm status` (dashboard) ·
`pnpm schedule` · `pnpm media:ingest` · `pnpm pin:publish`.

## Variables d'environnement (`.env`, jamais commit)
BRAND_NAME, SITE_URL, AUTHOR_NAME, CONTACT_EMAIL, LOGO_PATH, TIKTOK_URL, INSTAGRAM_URL, YOUTUBE_URL, BRAND_TAGLINE,
PINTEREST_ACCESS_TOKEN, PINTEREST_BOARD_ID. Placeholder (préfixe `__`) → build PROD refusé.
