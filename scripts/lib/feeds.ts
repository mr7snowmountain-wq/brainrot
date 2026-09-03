/**
 * Lecture de flux RSS/Atom — logique partagée par la veille et le testeur de flux.
 * Aucune dépendance externe : fetch natif (Node 20+) + parsing par regex.
 * ZÉRO appel LLM (cf. SPEC-VEILLE) : que du HTTP et du texte.
 */

export interface FeedItem {
  title: string;
  link: string;
  date?: string;
}

const UA = 'BrainrotVeille/1.0 (+https://brainrotstudio.app)';

/** Un URL ressemble-t-il à un flux (et pas à une simple page) ? */
export function looksLikeFeed(url: string): boolean {
  return /\.xml($|\?)|\/rss|\/feed|\/atom|outboundfeeds/i.test(url);
}

const stripCdata = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
const decode = (s: string) =>
  s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#8217;/g, '’')
    .trim();
const firstMatch = (re: RegExp, s: string) => {
  const m = re.exec(s);
  return m ? decode(stripCdata(m[1])).replace(/\s+/g, ' ').trim() : '';
};

/** Parse un corps RSS ou Atom en une liste d'items (titre + lien + date). */
export function parseFeed(xml: string): FeedItem[] {
  const blocks =
    xml.match(/<item[\s\S]*?<\/item>/gi) ?? xml.match(/<entry[\s\S]*?<\/entry>/gi) ?? [];
  const items: FeedItem[] = [];
  for (const b of blocks) {
    const title = firstMatch(/<title[^>]*>([\s\S]*?)<\/title>/i, b);
    let link = firstMatch(/<link[^>]*>([\s\S]*?)<\/link>/i, b);
    if (!link) {
      const m = /<link[^>]*href="([^"]+)"/i.exec(b);
      link = m ? decode(m[1]) : '';
    }
    const date =
      firstMatch(/<pubDate>([\s\S]*?)<\/pubDate>/i, b) ||
      firstMatch(/<published>([\s\S]*?)<\/published>/i, b) ||
      firstMatch(/<updated>([\s\S]*?)<\/updated>/i, b) ||
      firstMatch(/<dc:date>([\s\S]*?)<\/dc:date>/i, b) ||
      undefined;
    if (title && link) items.push({ title, link, date });
  }
  return items;
}

/** Récupère et parse un flux. Lève en cas d'échec HTTP / réseau / timeout. */
export async function fetchFeed(url: string, timeoutMs = 15000): Promise<FeedItem[]> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'application/rss+xml, application/xml, text/xml, */*' },
      signal: ctrl.signal,
      redirect: 'follow',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    if (!/<rss|<feed|<rdf:RDF|<\?xml/i.test(xml)) throw new Error('pas du XML/flux');
    return parseFeed(xml);
  } finally {
    clearTimeout(t);
  }
}

export const ts = (d?: string): number => {
  if (!d) return 0;
  const n = Date.parse(d);
  return isNaN(n) ? 0 : n;
};

export const fmtDate = (d?: string): string => {
  const n = ts(d);
  return n ? new Date(n).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';
};

/** Âge (en jours) de l'item le plus récent d'un flux. null si aucune date. */
export function newestAgeDays(items: FeedItem[]): number | null {
  const dates = items.map((i) => ts(i.date)).filter((n) => n > 0);
  if (!dates.length) return null;
  const newest = Math.max(...dates);
  return Math.floor((Date.now() - newest) / 86400000);
}

/** Limite de concurrence pour les fetch parallèles (respecte les serveurs). */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}
