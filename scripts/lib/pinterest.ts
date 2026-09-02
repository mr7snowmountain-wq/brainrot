/**
 * Moteur Pinterest maison — construit le pin d'un article (image verticale
 * 2:3 + texte propre + lien vers le site) et le poste via l'API Pinterest v5.
 *
 * Le TEXTE DU PIN doit rester propre — Pinterest rejette le lexique adulte.
 * PIN_BANNED est la source unique, partagée avec le validateur.
 */

// Mots qui font rejeter un pin / mettre le compte en revue sur Pinterest.
export const PIN_BANNED = [
  'porno', 'pornographie', 'porn',
  'masturbation', 'masturber', 'branler', 'branlette',
  'ejaculation', 'ejaculer', 'ejacule', 'jouir', 'orgasme',
  'penis', 'bite', 'queue', 'testicule', 'couilles', 'sperme',
  'sexe', 'sexuel', 'sexuelle', 'bander', 'nofap', 'death grip', 'deepthroat',
];

const deaccentLower = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Renvoie les mots interdits présents dans un texte (vide = propre). */
export function findPinBannedWords(text: string): string[] {
  const hay = deaccentLower(text);
  return PIN_BANNED.filter((w) => new RegExp(`(^|[^a-z])${deaccentLower(w).replace(/ /g, '[ -]')}([^a-z]|$)`).test(hay));
}

export interface PinPayload {
  slug: string;
  board_id: string;
  title: string;
  description: string;
  link: string;
  media_source: { source_type: 'image_url'; url: string };
}

export interface PinDraft {
  slug: string;
  title: string;
  description: string;
  link: string;
  imageUrl: string;
  publishDate: string;
  skipped?: string; // raison si non postable (mots interdits, pas d'image…)
}

/**
 * Construit le brouillon de pin d'un article à partir de son frontmatter.
 * Ne poste rien : validation + assemblage. Marque `skipped` si non postable.
 */
export function buildPinDraft(data: any, file: string, siteUrl: string): PinDraft {
  const base = file.replace(/\\/g, '/').split('/').pop()!.replace(/\.mdx?$/, '');
  const link = `${siteUrl}/${data.category}/${base}`;
  const hero = data.heroImage ? (data.images || []).find((i: any) => i.id === data.heroImage) : undefined;

  const description = (hero?.pinDescription || data.meta_description || '').trim();
  // Titre : première phrase de la description propre, ≤ 100 caractères.
  let title = description.split(/(?<=[.?!])\s/)[0] || description;
  if (title.length > 100) title = title.slice(0, 97).trimEnd() + '…';

  const draft: PinDraft = {
    slug: base,
    title,
    description,
    link,
    imageUrl: hero?.pinImage ? `${siteUrl}${hero.pinImage}` : '',
    publishDate: (data.publishDate instanceof Date ? data.publishDate.toISOString().slice(0, 10) : String(data.publishDate)),
  };

  if (!hero?.pinImage) draft.skipped = 'pas de variante Pinterest (hero sans pinImage)';
  else if (hero.pinnable === false) draft.skipped = 'hero marqué pinnable: false';
  else {
    const bad = findPinBannedWords(`${title} ${description}`);
    if (bad.length) draft.skipped = `mots interdits Pinterest : ${bad.join(', ')}`;
  }
  return draft;
}

/** Poste un pin via l'API Pinterest v5. Lève en cas d'échec HTTP. */
export async function postPin(draft: PinDraft, boardId: string, token: string): Promise<string> {
  const body = {
    board_id: boardId,
    title: draft.title,
    description: draft.description,
    link: draft.link,
    media_source: { source_type: 'image_url', url: draft.imageUrl },
  };
  const res = await fetch('https://api.pinterest.com/v5/pins', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Pinterest ${res.status} : ${await res.text()}`);
  const json: any = await res.json();
  return json.id as string;
}
