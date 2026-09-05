# TODO — Brainrot (brainrotstudio.app)

> Liste unique extraite des fichiers sources (PLAN-CONSTRUCTION, BRIEF-SITE-GENZ, SPECS-MEDIAS,
> SPEC-VEILLE, SPEC-QUIZ-DEBAT-VOTE). Statut honnête, pas de « c'est fait » de complaisance.
>
> **Statuts** : ✅ fait · 🟡 partiel / à finir · ⛔ pas commencé · 👤 bloqué (dépend de toi : compte, décision, contenu)
>
> Dernière mise à jour : 2026-09-05

---

## 1. Fondations (PLAN-CONSTRUCTION, étapes 1-8)

- ✅ **Étape 1** — Clone du moteur Kiwikini → `genz-site`, vidé du contenu médical
- ✅ **Étape 2** — Publication auto (GitHub Actions rebuild quotidien + tâche git-pull Windows)
- ✅ **Étape 3** — Validateur + schéma adaptés (catégories, jsonld_type, règles GEO)
- ✅ **Étape 4** — DA Y2K pastel-vif (dark, dégradés violet→rose→bleu, verre)
- ✅ **Étape 5** — Veille (heat-ranked PDF, cron, vérif Wikidata, veille sociale)
- 🟡 **Étape 6** — Premier lot d'articles (12 en ligne : 3 JJK, 3 Demon Slayer, 3 Gamescom, 3 cinéma)
- ✅ **Étape 7** — Search Console (propriété domaine, sitemap soumis)
- 🟡 **Étape 8** — Rythme de publication (à tenir dans la durée ; checkpoint mois-4)

---

## 2. Contenu

- ✅ 12 articles en ligne, validateur 0 erreur, tous avec hero image
- ✅ Catégorie **Cinéma** créée (cluster The Dog Stars complet : film + Elordi + Ridley Scott)
- 🟡 **Zéro lien mort** — règle validateur bloquante posée ; liens quiz rebranchés au fur et à mesure
- 👤 **Prochains lots d'articles** — tu déposes en bloc, j'intègre en .mdx (je ne rédige jamais le fond)
- 👤 **Articles satellites manquants** cités en maillage (ex. `the-dog-stars-livre-ou-film`) — à écrire de ton côté

---

## 3. Médias (SPECS-MEDIAS)

- ✅ Pipeline images : WebP + srcset [400/800/1200/1600] + variante Pinterest 2:3 + `sitemap-images.xml`
- ✅ Nommage SEO + `alt` 5-20 mots + `pinDescription` (2 nominations Google/Pinterest) sur chaque image
- ✅ JSON-LD : champ `image` (hero) + dates avec fuseau Europe/Paris
- ⛔ **Vidéo** (YouTube + transcription HTML + Schema VideoObject + façade lite-youtube) — **rien fait, aucune vidéo à ce jour**
- 👤 Convertir tes images en `.jpg`/`.png`/`.webp` avant envoi (jamais `.jfif`)

---

## 4. Distribution (BRIEF §4) — LE GROS DES OUBLIS, à plat

- 🟡 **Pinterest — ON-SITE : fait.** Chaque image porte sa variante 2:3, sa description et un lien retour vers la page (`data-pin-url`) ; sitemap images en place.
- 👤⛔ **Pinterest — POSTER les épingles : NON connecté.** Le script `pin:publish` (`scripts/pinterest-publish.ts`) existe mais **n'est relié à aucun compte Pinterest** → aucune épingle n'est réellement publiée. **Il faut : un compte Pinterest business + un token API.** Tant que tu ne me les donnes pas, rien ne se poste. (Et un vrai auto-post reste une action de publication à cadrer.)
- ⛔ **Short vidéo (TikTok / Shorts / Reels)** — le brief le désigne comme **le vrai levier de croissance**. Pipeline de repurposing (chaque article → 1 script de short : hook + 3 points + CTA) **pas commencé**.
- 🟡 **Reddit / Quora** — le brief dit **explicitement : pas d'auto-post (= ban), drafts à poster À LA MAIN.** Fait : `veille:social` génère les **liens de recherche** pour trouver les fils. Pas fait : un **générateur de brouillons de réponses** adaptés par article (semi-manuel).
- ✅ **Google Discover / indexation** — sitemaps + images 1200px+ + fraîcheur : préparé côté site (se mérite avec le temps, pas une action à « poster »).

---

## 5. Quiz (SPEC-QUIZ-DEBAT-VOTE)

- ✅ `/quiz/jujutsu-kaisen` (débat, 30 questions) — étape 1 : flux de réponses
- ✅ `/quiz/cinema` (connaissance, 30 questions + score) — style verre corrigé
- 👤 `/quiz/demon-slayer` — **en attente de tes 30 questions**
- 👤 **3 questions ⚠ source unique** du quiz cinéma (Q1 Gladiator/Mescal, Q3 Gal Gadot, Q19 Vin Diesel) — à croiser ou retirer
- ⛔ **Quiz — étape 2-3** : backend de vote (Supabase/serverless) + affichage de la répartition (%). **Décision à prendre** (voir §7).
- 🟡 Rebrancher la mention discrète du quiz dans les articles cinéma (maintenant que `/quiz/cinema` existe)

---

## 6. Veille (SPEC-VEILLE)

- ✅ `pnpm veille` (PDF classé par chaleur), `veille:test` (statuts), `verif` (Wikidata/Wikipedia), `veille:social` (liens Reddit/Quora)
- ✅ Cron `.github/workflows/veille.yml` — confirmé opérationnel (commit bot quotidien)

---

## 7. Décisions qui t'appartiennent (👤)

- **Compte + token Pinterest** pour activer `pin:publish` (sinon zéro épingle postée)
- **Backend de vote des quiz** (Supabase gratuit vs serverless) — pour l'étape 2-3
- **URL du bouton « Voir le jeu »** (CTA) — dès que le jeu est sur le Play Store
- **Comptes réseaux** (Instagram / TikTok / YouTube) — les 3 URLs manquent (warnings validateur)
- **Priorité** : on attaque quoi en premier — short vidéo, Pinterest posting, ou prochains articles ?

---

## Notes de tenue de liste

- Ce fichier est la **source de vérité des tâches**. À chaque livraison, on coche ici.
- Il ne remplace pas les specs (règles de rédaction, formats) : il liste les **tâches**, pas les règles.
