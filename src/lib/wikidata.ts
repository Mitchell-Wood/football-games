// Wikidata-backed enrichment: per-club appearances/goals for a Career Path
// answer, matched by full name + exact date of birth. See
// docs/transfermarkt-api.md for why (transfermarkt-api's own stats endpoint
// is broken) and how the matching was validated.
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
  if (!res.ok) throw new Error(`Wikidata search failed: ${res.status}`);
  const data = (await res.json()) as { search?: { id: string }[] };
  return (data.search ?? []).map((r) => r.id);
}

export type ClubStint = {
  teamLabel: string;
  startYear: number | null;
  endYear: number | null;
  appearances: number;
  goals: number;
};

type SparqlBinding = {
  teamLabel?: { value: string };
  start?: { value: string };
  end?: { value: string };
  apps?: { value: string };
  goals?: { value: string };
};

// P54 = member of sports team, P580/P582 = start/end time, P1350/P1351 =
// matches played / goals scored (qualifiers on the P54 statement). The
// wdt:P31/wdt:P279* Q476028 filter restricts to association football clubs
// so national-team caps don't get mixed into club career stats.
function buildStintsQuery(candidateIds: string[], isoDob: string): string {
  const values = candidateIds.map((id) => `wd:${id}`).join(" ");
  return `
    SELECT ?teamLabel ?start ?end ?apps ?goals WHERE {
      VALUES ?person { ${values} }
      ?person wdt:P569 ?dob .
      FILTER(YEAR(?dob) = ${isoDob.slice(0, 4)} && MONTH(?dob) = ${Number(isoDob.slice(5, 7))} && DAY(?dob) = ${Number(isoDob.slice(8, 10))})
      ?person p:P54 ?stmt .
      ?stmt ps:P54 ?team .
      ?team wdt:P31/wdt:P279* wd:Q476028 .
      OPTIONAL { ?stmt pq:P580 ?start }
      OPTIONAL { ?stmt pq:P582 ?end }
      OPTIONAL { ?stmt pq:P1350 ?apps }
      OPTIONAL { ?stmt pq:P1351 ?goals }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    }
  `;
}

async function fetchClubStints(candidateIds: string[], isoDob: string): Promise<ClubStint[]> {
  if (candidateIds.length === 0) return [];
  const query = buildStintsQuery(candidateIds, isoDob);
  const url = `${WIKIDATA_SPARQL_URL}?query=${encodeURIComponent(query)}&format=json`;

  const res = await fetch(url, {
    headers: { Accept: "application/sparql-results+json", "User-Agent": USER_AGENT },
  });
  if (!res.ok) throw new Error(`Wikidata SPARQL query failed: ${res.status}`);
  const data = (await res.json()) as { results: { bindings: SparqlBinding[] } };

  return data.results.bindings.map((b) => ({
    teamLabel: b.teamLabel?.value ?? "Unknown",
    startYear: b.start ? new Date(b.start.value).getUTCFullYear() : null,
    endYear: b.end ? new Date(b.end.value).getUTCFullYear() : null,
    appearances: b.apps ? Number(b.apps.value) : 0,
    goals: b.goals ? Number(b.goals.value) : 0,
  }));
}

// Matches by full name + exact (day-precision) date of birth only — no
// looser fallback. A wrong match would silently attach one real person's
// stats to a different person's career stop, which is worse than showing
// no stats at all in a game about factual accuracy.
export async function fetchWikidataClubStints(
  name: string,
  isoDob: string
): Promise<ClubStint[]> {
  const candidateIds = await searchWikidataCandidates(name);
  return fetchClubStints(candidateIds, isoDob);
}
