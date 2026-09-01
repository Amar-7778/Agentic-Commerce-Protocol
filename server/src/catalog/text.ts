/**
 * Shared text normalization for catalog search, vector ranking, and intent
 * routing.
 *
 * Deliberately contains no product vocabulary. Every domain term the system
 * understands is learned from the catalog at runtime — see `relateTokens` and
 * `VectorEngine.expandQueryTokens`. A synonym table would only ever know about
 * the products someone remembered to add to it.
 */

/** Generic conversational filler. Nothing here is domain-specific. */
export const STOP_WORDS = new Set([
  'a', 'about', 'also', 'am', 'an', 'and', 'any', 'anything', 'are', 'as', 'at',
  'be', 'been', 'but', 'buy', 'by', 'can', 'could', 'did', 'do', 'does', 'find',
  'for', 'from', 'get', 'give', 'good', 'has', 'have', 'help', 'how', 'i', 'if',
  'in', 'into', 'is', 'it', 'its', 'just', 'like', 'looking', 'lot', 'may', 'me',
  'much', 'my', 'need', 'of', 'on', 'one', 'or', 'order', 'out', 'please', 'show',
  'so', 'some', 'something', 'that', 'the', 'their', 'them', 'then', 'there',
  'these', 'they', 'this', 'to', 'up', 'us', 'very', 'want', 'was', 'we', 'well',
  'what', 'when', 'where', 'which', 'who', 'will', 'with', 'would', 'you', 'your',
]);

/** Lowercase, strip punctuation, drop single characters. */
export function tokenize(text: string): string[] {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

/** Tokens that carry search signal — `tokenize` minus the stop list. */
export function contentTokens(text: string): string[] {
  return tokenize(text).filter((t) => !STOP_WORDS.has(t));
}

/**
 * Whether a query token and a catalog token refer to the same thing.
 *
 * Handles the three cases a shopper actually produces without a stemmer:
 * exact ("keyboard" / "keyboard"), plural and inflection ("earbuds" inside
 * "earbud"), and compound ("headphones" inside "over-ear-headphones"). The
 * 4-character floor keeps short fragments from matching half the catalog.
 */
export function tokensRelated(queryToken: string, catalogToken: string): boolean {
  if (queryToken === catalogToken) return true;
  if (queryToken.length >= 4 && catalogToken.includes(queryToken)) return true;
  if (catalogToken.length >= 4 && queryToken.includes(catalogToken)) return true;
  return false;
}

/**
 * Widen query tokens using a vocabulary observed in real data.
 *
 * `vocabulary` is whatever the caller has on hand — catalog titles, categories
 * and tags. A query token pulls in every related vocabulary term, so "earphones"
 * reaches an item the catalog calls "Wireless Earbuds" without anyone writing
 * that mapping down.
 */
export function relateTokens(queryTokens: string[], vocabulary: Iterable<string>): string[] {
  const expanded = new Set<string>();
  const vocab = Array.from(vocabulary);

  for (const q of queryTokens) {
    for (const term of vocab) {
      if (tokensRelated(q, term)) expanded.add(term);
    }
  }

  return Array.from(expanded);
}
