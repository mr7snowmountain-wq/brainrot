/**
 * Règles éditoriales BLOQUANTES, sous forme de fonctions pures (aucun import
 * Astro) pour être réutilisées par le script de validation ET, au besoin, par
 * l'app. Orientation GEO : un H2 doit être une requête (question qu'on tape),
 * pas un ordre donné au lecteur.
 */

/**
 * Tokenisation Unicode-safe : on découpe sur tout ce qui n'est pas une lettre,
 * en conservant les apostrophes (pour garder « c'est », « j'arrête »).
 * \b classique ne gère pas les lettres accentuées (ça, où) → on l'évite.
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFC')
    .split(/[^\p{L}'’]+/u)
    .filter(Boolean);
}

const FIRST = new Set(['je', 'me', 'moi', 'mon', 'ma', 'mes', 'suis']);
const SUBJ = new Set(['il', 'elle', 'on', 'ils', 'elles', 'ça', 'ca', 'ce', 'cela', 'ni']);
const INTERRO = new Set([
  'comment', 'pourquoi', 'combien', 'quel', 'quelle', 'quels', 'quelles',
  'où', 'ou', 'quand', 'qui', 'quoi', 'lequel', 'laquelle', 'est',
]);

/**
 * Verbes à l'IMPÉRATIF (2e pers., tu/vous) fréquents.
 * Un H2 qui COMMENCE par l'un d'eux donne un ordre au lecteur → bloqué.
 * (La 2e personne en accroche non injonctive, elle, est tolérée.)
 */
const IMPERATIFS = new Set([
  'fais', 'faites', 'arrête', 'arrete', 'arrêtez', 'arretez', 'vérifie', 'verifie', 'vérifiez', 'verifiez',
  'commence', 'commencez', 'teste', 'testez', 'essaie', 'essaye', 'essayez', 'lis', 'lisez',
  'prends', 'prenez', 'mets', 'mettez', 'va', 'allez', 'choisis', 'choisissez', 'garde', 'gardez',
  'ajoute', 'ajoutez', 'évite', 'evite', 'évitez', 'evitez', 'oublie', 'oubliez', 'note', 'notez',
  'imagine', 'imaginez', 'pense', 'pensez', 'regarde', 'regardez', 'cherche', 'cherchez',
  'découvre', 'decouvre', 'découvrez', 'decouvrez', 'clique', 'cliquez', 'télécharge', 'telecharge',
  'téléchargez', 'telechargez', 'installe', 'installez', 'joue', 'jouez', 'suis', 'suivez',
]);

const startsWithElided = (t: string, pref: string) => t.startsWith(pref + "'") || t.startsWith(pref + '’');

function isFirstPersonTokens(tokens: string[]): boolean {
  return tokens.some((t) => FIRST.has(t) || startsWithElided(t, 'j') || startsWithElided(t, 'm'));
}

/** Le H2 commence-t-il par un impératif (ordre donné au lecteur) ? */
export function isImperative(h: string): boolean {
  const first = tokenize(h)[0];
  return !!first && IMPERATIFS.has(first);
}

/**
 * Un H2 porte une « clause » (verbe conjugué / marque interrogative) s'il se
 * termine par « ? », contient un mot interrogatif, un pronom sujet (relatif
 * inclus), ou une marque de 1re personne. Un chiffre seul, un mot seul ou une
 * formule nominale ne passe pas.
 */
function porteUneClause(h: string): boolean {
  const t = h.trim();
  if (t.endsWith('?')) return true;
  const tokens = tokenize(t);
  if (isFirstPersonTokens(tokens)) return true;
  return tokens.some(
    (tok) => INTERRO.has(tok) || SUBJ.has(tok) || startsWithElided(tok, 'c') || startsWithElided(tok, 'qu'),
  );
}

export type H2Verdict = 'ok' | 'imperative' | 'nominal';

/**
 * Verdict d'un H2 : bloque sur l'IMPÉRATIF (ordre au lecteur). Un titre NOMINAL
 * (sans verbe ni interrogation) est signalé comme non idéal pour le GEO — mais
 * toléré (les listicles gaming ont des sections nommées légitimes). Le validateur
 * décide de la sévérité selon le type d'article.
 */
export function classifyH2(h: string): H2Verdict {
  if (isImperative(h)) return 'imperative';
  if (!porteUneClause(h)) return 'nominal';
  return 'ok';
}

/** Nombre de mots d'un bloc de texte (après nettoyage markdown léger). */
export function countWords(text: string): number {
  const clean = text
    .replace(/\*\*|__|\*|`/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return 0;
  return clean.split(' ').filter(Boolean).length;
}

/** Extrait le texte des titres de niveau 2 d'un corps markdown. */
export function extractH2(markdown: string): string[] {
  const out: string[] = [];
  let inFence = false;
  for (const raw of markdown.split('\n')) {
    const line = raw.trimEnd();
    if (/^```/.test(line.trim())) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = /^##\s+(.*\S)\s*$/.exec(line);
    if (m) out.push(m[1].trim());
  }
  return out;
}

/** Contient-il un chiffre « de contenu » (pourcentage, nombre) ? */
export function hasNumericClaim(text: string): boolean {
  // %  |  nombres à 2+ chiffres  |  "X sur Y"  |  notes "4,6" / "4.6"
  return /\d\s?%|\b\d{2,}\b|\bune?\s+sur\s+\w+|\b\d[.,]\d\b/i.test(text);
}

/** Compte les liens internes (href relatif ou vers le domaine du site). */
export function countInternalLinks(hrefs: string[], siteUrl: string): number {
  const host = safeHost(siteUrl);
  return hrefs.filter((h) => {
    if (!h) return false;
    if (h.startsWith('/')) return true;
    const hh = safeHost(h);
    return hh !== '' && hh === host;
  }).length;
}

function safeHost(u: string): string {
  try {
    return new URL(u).host;
  } catch {
    return '';
  }
}

/** Mentions interdites (fausse caution) — recherche insensible à la casse. */
export const FORBIDDEN_REVIEW_MENTIONS = ['relu par', 'reviewedby', 'lastreviewed', 'relecture par'];

export function findForbiddenMentions(haystack: string): string[] {
  const low = haystack.toLowerCase();
  return FORBIDDEN_REVIEW_MENTIONS.filter((m) => low.includes(m));
}

/** Stop-words FR à éviter dans un slug. */
export const SLUG_STOPWORDS = [
  'le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'et', 'ou',
  'a', 'au', 'aux', 'ce', 'que', 'qui', 'pour', 'sur', 'dans', 'mon', 'ma',
];

export function slugStopwords(slug: string): string[] {
  const parts = slug.split('-');
  return parts.filter((p) => SLUG_STOPWORDS.includes(p));
}
