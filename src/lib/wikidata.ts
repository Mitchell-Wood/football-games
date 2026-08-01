// Used only to find the right English Wikipedia article for a Career Path
// answer, matched by full name + exact date of birth — see
// docs/transfermarkt-api.md for how the matching was validated. The actual
// club-by-club stats come from parsing that Wikipedia article's infobox
// (src/lib/wikipedia.ts), not from Wikidata's own structured claims:
// Wikidata's P54 (member of sports team) data turned out to be incomplete
// for major stints (e.g. it was missing Messi's entire 16-year, 520-
// appearance senior Barcelona career, while still having his reserve-team
// stints) — Wikipedia's infobox had the real number.
//
// Wikimedia asks API consumers to identify themselves with a descriptive
// User-Agent rather than a generic/default one.
const USER_AGENT =
  "football-games/1.0 (https://github.com/Mitchell-Wood/football-games)";

const WIKIDATA_SEARCH_URL = "https://www.wikidata.org/w/api.php";
const WIKIDATA_SPARQL_URL = "https://query.wikidata.org/sparql";

async function searchWikidataCandidates(name: string): Promise<string[]> {
  const url = new URL(WIKIDATA_SEARCH_URL);
  url.searchParams.set("action", "wbsearchentities");
  url.searchParams.set("search", name);
  url.searchParams.set("language", "en");
  url.searchParams.set("type", "item");
  url.searchParams.set("limit", "10");
  url.searchParams.set("format", "json");

  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) {
    throw new Error(`Wikidata search failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
  }
  const data = (await res.json()) as { search?: { id: string }[] };
  return (data.search ?? []).map((r) => r.id);
}

type SparqlBinding = { article?: { value: string } };

// schema:about / schema:isPartOf is how Wikidata records Wikipedia
// sitelinks — this asks for whichever DOB-matched candidate has an English
// Wikipedia article.
function buildSitelinkQuery(candidateIds: string[], isoDob: string): string {
  const values = candidateIds.map((id) => `wd:${id}`).join(" ");
  return `
    SELECT ?article WHERE {
      VALUES ?person { ${values} }
      ?person wdt:P569 ?dob .
      FILTER(YEAR(?dob) = ${isoDob.slice(0, 4)} && MONTH(?dob) = ${Number(isoDob.slice(5, 7))} && DAY(?dob) = ${Number(isoDob.slice(8, 10))})
      ?article schema:about ?person ;
               schema:isPartOf <https://en.wikipedia.org/> .
    }
  `;
}

async function fetchWikipediaTitle(
  candidateIds: string[],
  isoDob: string
): Promise<string | null> {
  if (candidateIds.length === 0) return null;
  const query = buildSitelinkQuery(candidateIds, isoDob);
  const url = `${WIKIDATA_SPARQL_URL}?query=${encodeURIComponent(query)}&format=json`;

  const res = await fetch(url, {
    headers: { Accept: "application/sparql-results+json", "User-Agent": USER_AGENT },
  });
  if (!res.ok) {
    throw new Error(
      `Wikidata SPARQL query failed: ${res.status} ${(await res.text()).slice(0, 300)}`
    );
  }
  const data = (await res.json()) as { results: { bindings: SparqlBinding[] } };
  const articleUrl = data.results.bindings[0]?.article?.value;
  if (!articleUrl) return null;

  // e.g. "https://en.wikipedia.org/wiki/Lionel_Messi" -> "Lionel Messi"
  const encodedTitle = articleUrl.split("/wiki/")[1];
  return encodedTitle ? decodeURIComponent(encodedTitle).replace(/_/g, " ") : null;
}

// Matches by full name + exact (day-precision) date of birth only — no
// looser fallback. A wrong match would silently attach one real person's
// stats to a different person's career stop, which is worse than showing
// no stats at all in a game about factual accuracy.
export async function findWikipediaTitle(name: string, isoDob: string): Promise<string | null> {
  const candidateIds = await searchWikidataCandidates(name);
  return fetchWikipediaTitle(candidateIds, isoDob);
}
