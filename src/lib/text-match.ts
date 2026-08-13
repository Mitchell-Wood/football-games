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

// A guess counts as correct if it matches the full name, or just the
// surname (last word) — so "Ronaldo" is accepted for "Cristiano Ronaldo".
export function matchesPlayerName(guess: string, answerName: string) {
  const normalizedGuess = normalize(guess);
  if (normalizedGuess === normalize(answerName)) return true;
  const surname = answerName.trim().split(/\s+/).at(-1);
  return surname !== undefined && normalizedGuess === normalize(surname);
}

// Pure organizational suffixes that appear across huge numbers of unrelated
// clubs — kept out of the token set so e.g. "CD" doesn't bridge two
// completely different Spanish clubs.
const CLUB_NAME_STOPWORDS = new Set(["fc", "cf", "sc", "ac", "afc", "cd", "ud", "sd", "ss"]);

function significantTokens(name: string): string[] {
  return foldDiacritics(name.toLowerCase())
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !CLUB_NAME_STOPWORDS.has(t));
}

// Loose on purpose (prefix match on the shorter token, not exact equality)
// so "Barça"/"Barcelona" or "Man"/"Manchester" style abbreviations still
// match, while nothing at all in common (e.g. two unrelated club names)
// correctly doesn't. Used to match a free-text club name (e.g. from a
// Wikipedia infobox) against a smaller, known set of a specific player's
// real clubs — low ambiguity risk since it's only ever compared against
// that one player's own small set of teams, not a global list.
function tokensSimilar(a: string, b: string): boolean {
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  const prefix = shorter.slice(0, 4);
  return longer.startsWith(prefix);
}

export function namesLikelyMatch(a: string, b: string): boolean {
  const tokensA = significantTokens(a);
  const tokensB = significantTokens(b);
  return tokensA.some((ta) => tokensB.some((tb) => tokensSimilar(ta, tb)));
}
