// Parses the "Senior career" table out of a Wikipedia football biography's
// infobox (via its raw wikitext), for a Career Path answer whose Wikipedia
// article was already identified by src/lib/wikidata.ts.
//
// {{Infobox football biography}} lists senior clubs as numbered parameters
// — years1/clubs1/caps1/goals1, years2/..., in career order — separately
// from youthyearsN/youthclubsN (no stats) and nationalyearsN/nationalteamN/
// nationalcapsN/nationalgoalsN (international caps, not club career). This
// is deliberately more reliable than Wikidata's own structured P54 claims,
// which were found to be missing major stints entirely (see wikidata.ts).
const USER_AGENT =
  "football-games/1.0 (https://github.com/Mitchell-Wood/football-games)";

const WIKIPEDIA_API_URL = "https://en.wikipedia.org/w/api.php";

async function fetchWikitext(title: string): Promise<string | null> {
  const url = new URL(WIKIPEDIA_API_URL);
  url.searchParams.set("action", "query");
  url.searchParams.set("titles", title);
  url.searchParams.set("prop", "revisions");
  url.searchParams.set("rvprop", "content");
  url.searchParams.set("rvslots", "main");
  url.searchParams.set("format", "json");

  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) {
    throw new Error(`Wikipedia fetch failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
  }
  const data = (await res.json()) as {
    query?: { pages?: Record<string, { revisions?: { slots: { main: { "*": string } } }[] }> };
  };
  const page = Object.values(data.query?.pages ?? {})[0];
  return page?.revisions?.[0]?.slots.main["*"] ?? null;
}

export type InfoboxStint = {
  club: string;
  startYear: number;
  endYear: number | null;
  appearances: number;
  goals: number;
};

// [[Target|Display]] or [[Target]] -> the readable name (Display, or
// Target if there's no pipe). Also strips stray {{templates}} and
// <tags> that occasionally show up in these fields (footnote markers etc).
function stripWikiMarkup(raw: string): string {
  return raw
    .replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, (_m, _target, display: string) => display)
    .replace(/\{\{[^}]*\}\}/g, "")
    .replace(/<[^>]*>/g, "")
    .trim();
}

function parseLeadingInt(raw: string): number {
  const match = raw.match(/\d+/);
  return match ? Number(match[0]) : 0;
}

function parseYearsRange(raw: string): { startYear: number; endYear: number | null } | null {
  const startMatch = raw.match(/\d{4}/);
  if (!startMatch) return null;
  const startYear = Number(startMatch[0]);
  if (!/[–-]/.test(raw)) return { startYear, endYear: startYear };
  const rest = raw.slice(raw.indexOf(startMatch[0]) + 4);
  const endMatch = rest.match(/\d{4}/);
  return { startYear, endYear: endMatch ? Number(endMatch[0]) : null };
}

function extractIndexedParam(wikitext: string, param: string): Map<number, string> {
  const map = new Map<number, string>();
  const regex = new RegExp(`\\|\\s*${param}(\\d+)\\s*=\\s*([^\\n]*)`, "g");
  let match: RegExpExecArray | null;
  while ((match = regex.exec(wikitext))) {
    map.set(Number(match[1]), match[2].trim());
  }
  return map;
}

export function parseSeniorCareer(wikitext: string): InfoboxStint[] {
  const years = extractIndexedParam(wikitext, "years");
  const clubs = extractIndexedParam(wikitext, "clubs");
  const caps = extractIndexedParam(wikitext, "caps");
  const goals = extractIndexedParam(wikitext, "goals");

  const stints: InfoboxStint[] = [];
  for (const index of [...years.keys()].sort((a, b) => a - b)) {
    const clubRaw = clubs.get(index);
    const range = years.get(index) ? parseYearsRange(years.get(index)!) : null;
    if (!clubRaw || !range) continue;
    stints.push({
      club: stripWikiMarkup(clubRaw),
      startYear: range.startYear,
      endYear: range.endYear,
      appearances: caps.has(index) ? parseLeadingInt(caps.get(index)!) : 0,
      goals: goals.has(index) ? parseLeadingInt(goals.get(index)!) : 0,
    });
  }
  return stints;
}

export async function fetchWikipediaSeniorCareer(title: string): Promise<InfoboxStint[]> {
  const wikitext = await fetchWikitext(title);
  if (!wikitext) return [];
  return parseSeniorCareer(wikitext);
}
