// Shared name-matching helpers used both for verifying a guess against the
// answer and for filtering player-name suggestions.

export function foldDiacritics(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export function normalize(name: string) {
  return foldDiacritics(name.trim().toLowerCase()).replace(/[^a-z0-9]/g, "");
}

export function matchesQuery(name: string, query: string) {
  return foldDiacritics(name.toLowerCase())
    .split(/\s+/)
    .some((token) => token.startsWith(query));
}
