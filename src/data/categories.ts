import { foldDiacritics } from "@/lib/text-match";

// Category bank for Rarity Duel. As of the normalized-schema rewrite,
// clubs are matched by real transfermarkt id (transfers[].clubTo.id),
// not name — transfermarkt-api's own club names are inconsistent ("PSG",
// "Man Utd", "Milan") in a way plain name/alias matching could never fully
// cover, but every transfer record carries a stable numeric club id, so
// there's no need to match on names at all anymore for players imported
// via the big-5 squad pipeline (scripts/import-squads.ts).

function norm(s: string) {
  return foldDiacritics(s.toLowerCase()).replace(/[^a-z0-9]/g, "");
}

function slugify(s: string): string {
  return foldDiacritics(s.toLowerCase())
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+|-+$)/g, "");
}

// The 5 leagues scripts/import-squads.ts pulls full current + historical
// rosters from. Every club discovered this way is flagged is_category —
// with ~96 real clubs and deep squads, there's no need for a hand-picked
// subset the way the old alias-based club bank needed to be kept small.
export const BIG_FIVE_LEAGUES = [
  { id: "GB1", name: "Premier League" },
  { id: "ES1", name: "La Liga" },
  { id: "L1", name: "Bundesliga" },
  { id: "IT1", name: "Serie A" },
  { id: "FR1", name: "Ligue 1" },
] as const;

// Clubs/leagues outside the big 5 needed only for the hand-entered legends'
// categories (Cruyff/Beckenbauer → Ajax, Eusébio → Benfica, Puskás/di
// Stéfano → still Real Madrid, already covered by La Liga). Resolved once
// by hand against the live API and hardcoded here rather than resolved at
// import time — club search results aren't reliably "the actual club
// first": searching "porto" returns the Portugal national team (id 3300)
// ranked above FC Porto (id 720), so trusting the top search result would
// have been a real correctness bug.
export const extraLeagues = [
  { id: "NL1", name: "Eredivisie" },
  { id: "PO1", name: "Primeira Liga" },
] as const;

export const extraClubs = [
  { id: "610", name: "Ajax", leagueId: "NL1" },
  { id: "720", name: "Porto", leagueId: "PO1" },
  { id: "294", name: "Benfica", leagueId: "PO1" },
] as const;

// Youth/reserve stints shouldn't count toward "played for X" — a brief
// academy spell isn't what a trivia player means by that. Matches things
// like "Barcelona B", "Sporting U19", "Nacional Yth.", "Malmö FF U17".
export function isYouthOrReserveEntry(rawClubName: string): boolean {
  return /\b(u1[0-9]|u2[0-9]|yth\.?|youth|sub-1[0-9]|reserves?|\bb\b|\bc\b)\b/i.test(rawClubName);
}

export type NationalityCategory = { id: string; name: string; aliases: string[] };

// Nationality still isn't id-matched — transfermarkt's citizenship field is
// just plain country-name strings, no id, so this stays a small curated
// list with alias handling for countries with more than one common name.
export const nationalities: NationalityCategory[] = [
  { id: slugify("Brazil"), name: "Brazil", aliases: [] },
  { id: slugify("Argentina"), name: "Argentina", aliases: [] },
  { id: slugify("France"), name: "France", aliases: [] },
  { id: slugify("Germany"), name: "Germany", aliases: [] },
  { id: slugify("Spain"), name: "Spain", aliases: [] },
  { id: slugify("England"), name: "England", aliases: [] },
  { id: slugify("Italy"), name: "Italy", aliases: [] },
  { id: slugify("Portugal"), name: "Portugal", aliases: [] },
  { id: slugify("Netherlands"), name: "Netherlands", aliases: ["Holland"] },
  { id: slugify("Uruguay"), name: "Uruguay", aliases: [] },
  { id: slugify("Belgium"), name: "Belgium", aliases: [] },
  { id: slugify("Croatia"), name: "Croatia", aliases: [] },
  { id: slugify("Sweden"), name: "Sweden", aliases: [] },
  { id: slugify("Wales"), name: "Wales", aliases: [] },
  { id: slugify("Ivory Coast"), name: "Ivory Coast", aliases: ["Côte d'Ivoire"] },
  { id: slugify("Cameroon"), name: "Cameroon", aliases: [] },
  { id: slugify("Senegal"), name: "Senegal", aliases: [] },
  { id: slugify("Japan"), name: "Japan", aliases: [] },
];

export function matchesNationality(rawCitizenship: string, nat: NationalityCategory): boolean {
  const normalized = norm(rawCitizenship);
  return normalized === norm(nat.name) || nat.aliases.some((a) => norm(a) === normalized);
}

export type TrophyCategory = {
  id: string;
  name: string;
  matches: (title: string) => boolean;
};

// Matching rules were built by sampling real achievement titles from the
// live API (transfermarkt-api /players/{id}/achievements), not guessed —
// e.g. domestic league titles come back as "English Champion", "Spanish
// champion", etc. (country-of-the-club adjective, not the player's own
// nationality, and casing is inconsistent), and youth/U21 versions of
// continental titles ("European Under-21 champion", "German Under-17
// Bundesliga champion") have to be explicitly excluded so they don't get
// confused with the senior trophy. England's domestic super cup is
// literally the Community Shield, but transfermarkt titles it "English
// Super Cup winner" same as every other country's super cup.
const rawTrophies: { name: string; matches: (title: string) => boolean }[] = [
  { name: "World Cup", matches: (t) => /world cup/i.test(t) && !/club/i.test(t) },
  { name: "UEFA Champions League", matches: (t) => /champions league/i.test(t) },
  { name: "UEFA Europa League", matches: (t) => /europa league/i.test(t) },
  { name: "Ballon d'Or", matches: (t) => /ballon\s*d.?or/i.test(t) },
  {
    name: "UEFA European Championship",
    matches: (t) => /european champion/i.test(t) && !/u-?21|under|youth/i.test(t),
  },
  { name: "Copa América", matches: (t) => norm(t).includes("copaamerica") },
  { name: "Premier League Winner", matches: (t) => /english champion/i.test(t) },
  { name: "La Liga Winner", matches: (t) => /spanish champion/i.test(t) },
  {
    name: "Bundesliga Winner",
    matches: (t) => /german champion/i.test(t) && !/u-?1[0-9]|u-?2[0-9]|under|youth/i.test(t),
  },
  { name: "Serie A Winner", matches: (t) => /italian champion/i.test(t) },
  { name: "Ligue 1 Winner", matches: (t) => /french champion/i.test(t) },
  { name: "FA Cup", matches: (t) => /english fa cup/i.test(t) },
  { name: "League Cup", matches: (t) => /english league cup/i.test(t) },
  { name: "Community Shield", matches: (t) => /english super cup/i.test(t) },
  { name: "Copa del Rey", matches: (t) => /spanish cup/i.test(t) },
  { name: "Spanish Super Cup", matches: (t) => /spanish super cup/i.test(t) },
  { name: "Coppa Italia", matches: (t) => /italian cup/i.test(t) },
  { name: "Italian Super Cup", matches: (t) => /italian super cup/i.test(t) },
  { name: "DFB-Pokal", matches: (t) => /german cup/i.test(t) },
  { name: "German Super Cup", matches: (t) => /german super cup/i.test(t) },
  { name: "Coupe de France", matches: (t) => /french cup/i.test(t) },
  { name: "French Super Cup", matches: (t) => /french super cup/i.test(t) },
  { name: "FIFA Club World Cup", matches: (t) => /club world cup/i.test(t) },
];

export const trophies: TrophyCategory[] = rawTrophies.map((t) => ({ id: slugify(t.name), ...t }));

export type ManagerTenure = {
  managerId: string;
  manager: string;
  teamId: string; // real transfermarkt club id, hand-resolved (see below)
  startYear: number;
  endYear: number; // use current year for still-ongoing tenures
};

// The least reliable category — no API gives us manager history, so this
// is fully hand-curated and deliberately kept small and well-checked
// rather than exhaustive. Club ids were hand-resolved against the live
// competitions/{id}/clubs endpoints (not guessed) so tenure matching can
// be a plain id comparison against a player's real player_teams rows, no
// name matching involved. Only a player's real club stint needs to
// *overlap* the given range (see scripts/import-players.ts), not match it
// exactly, so short loan-spell edge cases are the main risk here, not date
// precision.
const rawManagerTenures: Omit<ManagerTenure, "managerId">[] = [
  { manager: "Sir Alex Ferguson", teamId: "985", startYear: 1986, endYear: 2013 }, // Manchester United
  { manager: "Pep Guardiola", teamId: "131", startYear: 2008, endYear: 2012 }, // Barcelona
  { manager: "Pep Guardiola", teamId: "27", startYear: 2013, endYear: 2016 }, // Bayern Munich
  { manager: "Pep Guardiola", teamId: "281", startYear: 2016, endYear: 2026 }, // Manchester City
  { manager: "Arsène Wenger", teamId: "11", startYear: 1996, endYear: 2018 }, // Arsenal
  { manager: "José Mourinho", teamId: "631", startYear: 2004, endYear: 2007 }, // Chelsea
  { manager: "José Mourinho", teamId: "46", startYear: 2008, endYear: 2010 }, // Inter Milan
  { manager: "José Mourinho", teamId: "418", startYear: 2010, endYear: 2013 }, // Real Madrid
  { manager: "Carlo Ancelotti", teamId: "5", startYear: 2001, endYear: 2009 }, // AC Milan
  { manager: "Carlo Ancelotti", teamId: "418", startYear: 2013, endYear: 2015 }, // Real Madrid
  { manager: "Diego Simeone", teamId: "13", startYear: 2011, endYear: 2026 }, // Atlético Madrid
  { manager: "Jürgen Klopp", teamId: "16", startYear: 2008, endYear: 2015 }, // Borussia Dortmund
  { manager: "Jürgen Klopp", teamId: "31", startYear: 2015, endYear: 2024 }, // Liverpool
  { manager: "Antonio Conte", teamId: "506", startYear: 2011, endYear: 2014 }, // Juventus
  { manager: "Antonio Conte", teamId: "631", startYear: 2016, endYear: 2018 }, // Chelsea
  { manager: "Massimiliano Allegri", teamId: "506", startYear: 2014, endYear: 2019 }, // Juventus
  { manager: "Zinédine Zidane", teamId: "418", startYear: 2016, endYear: 2018 }, // Real Madrid
  { manager: "Fabio Capello", teamId: "5", startYear: 1991, endYear: 1996 }, // AC Milan
];

export const managerTenures: ManagerTenure[] = rawManagerTenures.map((t) => ({
  managerId: slugify(t.manager),
  ...t,
}));

export const managers: { id: string; name: string }[] = [
  ...new Map(managerTenures.map((t) => [t.managerId, t.manager])),
].map(([id, name]) => ({ id, name }));
