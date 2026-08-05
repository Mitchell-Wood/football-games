import { foldDiacritics } from "@/lib/text-match";

// Hand-curated category bank for Rarity Duel — same spirit as
// src/data/top-players.ts: a small, checked-in list rather than something
// generated fresh each run, chosen for good coverage across the curated
// 523-player pool (see docs/transfermarkt-api.md).
//
// A real gotcha found while building this: transfermarkt-api's own transfer
// records use short, inconsistent club names rather than official ones —
// e.g. "Man Utd" not "Manchester United", "PSG" not "Paris Saint-Germain",
// sometimes "Milan" and sometimes "AC Milan" for the same club. Plain fuzzy
// prefix-matching (the tokensSimilar/namesLikelyMatch approach used for
// Wikipedia club names in data-source.ts) does NOT catch acronyms like
// "PSG", so every club entry here carries an explicit alias list of the
// shorthand forms actually observed from the live API, rather than relying
// on fuzzy matching alone.

function norm(s: string) {
  return foldDiacritics(s.toLowerCase()).replace(/[^a-z0-9]/g, "");
}

export type ClubCategory = {
  name: string; // canonical display value, stored as categoryValue
  aliases: string[]; // known shorthand forms transfermarkt actually returns
  league: string; // must match a value below in `leagues`
};

export const clubs: ClubCategory[] = [
  // Premier League
  { name: "Manchester United", aliases: ["Man Utd", "Man United", "Manchester Utd"], league: "Premier League" },
  { name: "Manchester City", aliases: ["Man City"], league: "Premier League" },
  { name: "Liverpool", aliases: [], league: "Premier League" },
  { name: "Chelsea", aliases: [], league: "Premier League" },
  { name: "Arsenal", aliases: [], league: "Premier League" },
  { name: "Tottenham Hotspur", aliases: ["Tottenham", "Spurs"], league: "Premier League" },
  { name: "Everton", aliases: [], league: "Premier League" },
  { name: "Newcastle United", aliases: ["Newcastle"], league: "Premier League" },
  { name: "West Ham United", aliases: ["West Ham"], league: "Premier League" },
  { name: "Leicester City", aliases: ["Leicester"], league: "Premier League" },
  // La Liga
  { name: "Real Madrid", aliases: [], league: "La Liga" },
  { name: "Barcelona", aliases: ["FC Barcelona", "Barça"], league: "La Liga" },
  { name: "Atlético Madrid", aliases: ["Atlético", "Atletico Madrid", "Atleti"], league: "La Liga" },
  { name: "Valencia", aliases: [], league: "La Liga" },
  { name: "Sevilla", aliases: [], league: "La Liga" },
  // Bundesliga
  { name: "Bayern Munich", aliases: ["FC Bayern München", "Bayern München", "FC Bayern"], league: "Bundesliga" },
  { name: "Borussia Dortmund", aliases: ["BVB", "Dortmund"], league: "Bundesliga" },
  { name: "Schalke 04", aliases: ["Schalke"], league: "Bundesliga" },
  // Serie A
  { name: "Juventus", aliases: ["Juve"], league: "Serie A" },
  { name: "AC Milan", aliases: ["Milan"], league: "Serie A" },
  { name: "Inter Milan", aliases: ["Inter", "Internazionale", "Inter Milano"], league: "Serie A" },
  { name: "AS Roma", aliases: ["Roma"], league: "Serie A" },
  { name: "Napoli", aliases: ["SSC Napoli"], league: "Serie A" },
  // Ligue 1
  { name: "Paris Saint-Germain", aliases: ["PSG"], league: "Ligue 1" },
  { name: "Marseille", aliases: ["Olympique Marseille", "OM"], league: "Ligue 1" },
  { name: "Monaco", aliases: ["AS Monaco"], league: "Ligue 1" },
  { name: "Lyon", aliases: ["Olympique Lyonnais", "OL"], league: "Ligue 1" },
  // Eredivisie
  { name: "Ajax", aliases: ["AFC Ajax"], league: "Eredivisie" },
  // Primeira Liga
  { name: "Porto", aliases: ["FC Porto"], league: "Primeira Liga" },
  { name: "Benfica", aliases: ["SL Benfica"], league: "Primeira Liga" },
];

export const leagues: string[] = [...new Set(clubs.map((c) => c.league))];

// Youth/reserve stints shouldn't count toward "played for X" — a brief
// academy spell isn't what a trivia player means by that. Matches things
// like "Barcelona B", "Sporting U19", "Nacional Yth.", "Malmö FF U17".
export function isYouthOrReserveEntry(rawClubName: string): boolean {
  return /\b(u1[0-9]|u2[0-9]|yth\.?|youth|sub-1[0-9]|reserves?|\bb\b|\bc\b)\b/i.test(rawClubName);
}

// A real transfer record's club name matches a bank entry if it equals the
// canonical name or a known alias, ignoring case/punctuation/diacritics.
export function matchesClub(rawClubName: string, club: ClubCategory): boolean {
  if (isYouthOrReserveEntry(rawClubName)) return false;
  const normalized = norm(rawClubName);
  return normalized === norm(club.name) || club.aliases.some((a) => norm(a) === normalized);
}

export type NationalityCategory = { name: string; aliases: string[] };

export const nationalities: NationalityCategory[] = [
  { name: "Brazil", aliases: [] },
  { name: "Argentina", aliases: [] },
  { name: "France", aliases: [] },
  { name: "Germany", aliases: [] },
  { name: "Spain", aliases: [] },
  { name: "England", aliases: [] },
  { name: "Italy", aliases: [] },
  { name: "Portugal", aliases: [] },
  { name: "Netherlands", aliases: ["Holland"] },
  { name: "Uruguay", aliases: [] },
  { name: "Belgium", aliases: [] },
  { name: "Croatia", aliases: [] },
  { name: "Sweden", aliases: [] },
  { name: "Wales", aliases: [] },
  { name: "Ivory Coast", aliases: ["Côte d'Ivoire"] },
  { name: "Cameroon", aliases: [] },
  { name: "Senegal", aliases: [] },
  { name: "Japan", aliases: [] },
];

export function matchesNationality(rawCitizenship: string, nat: NationalityCategory): boolean {
  const normalized = norm(rawCitizenship);
  return normalized === norm(nat.name) || nat.aliases.some((a) => norm(a) === normalized);
}

export type TrophyCategory = {
  name: string; // canonical display value, stored as categoryValue
  matches: (title: string) => boolean;
};

// Matching rules were built by sampling real achievement titles from the
// live API (transfermarkt-api /players/{id}/achievements), not guessed —
// e.g. domestic league titles come back as "English Champion", "Spanish
// champion", etc. (country-of-the-club adjective, not the player's own
// nationality, and casing is inconsistent), and youth/U21 versions of
// continental titles ("European Under-21 champion", "German Under-17
// Bundesliga champion") have to be explicitly excluded so they don't get
// confused with the senior trophy.
export const trophies: TrophyCategory[] = [
  {
    name: "World Cup",
    matches: (t) => /world cup/i.test(t) && !/club/i.test(t),
  },
  {
    name: "UEFA Champions League",
    matches: (t) => /champions league/i.test(t),
  },
  {
    name: "UEFA Europa League",
    matches: (t) => /europa league/i.test(t),
  },
  {
    name: "Ballon d'Or",
    matches: (t) => /ballon\s*d.?or/i.test(t),
  },
  {
    name: "UEFA European Championship",
    matches: (t) => /european champion/i.test(t) && !/u-?21|under|youth/i.test(t),
  },
  {
    name: "Copa América",
    matches: (t) => norm(t).includes("copaamerica"),
  },
  {
    name: "Premier League Winner",
    matches: (t) => /english champion/i.test(t),
  },
  {
    name: "La Liga Winner",
    matches: (t) => /spanish champion/i.test(t),
  },
  {
    name: "Bundesliga Winner",
    matches: (t) => /german champion/i.test(t) && !/u-?1[0-9]|u-?2[0-9]|under|youth/i.test(t),
  },
  {
    name: "Serie A Winner",
    matches: (t) => /italian champion/i.test(t),
  },
  {
    name: "Ligue 1 Winner",
    matches: (t) => /french champion/i.test(t),
  },
  // Domestic cups and super cups — verified against real achievement
  // titles pulled live from the API (transfermarkt-api's naming is
  // consistent: "{Country} cup winner" / "{Country} Super Cup winner").
  // England's domestic super cup is literally called the Community
  // Shield, but transfermarkt titles it "English Super Cup winner" same
  // as everywhere else, so that's what this matches against.
  {
    name: "FA Cup",
    matches: (t) => /english fa cup/i.test(t),
  },
  {
    name: "League Cup",
    matches: (t) => /english league cup/i.test(t),
  },
  {
    name: "Community Shield",
    matches: (t) => /english super cup/i.test(t),
  },
  {
    name: "Copa del Rey",
    matches: (t) => /spanish cup/i.test(t),
  },
  {
    name: "Spanish Super Cup",
    matches: (t) => /spanish super cup/i.test(t),
  },
  {
    name: "Coppa Italia",
    matches: (t) => /italian cup/i.test(t),
  },
  {
    name: "Italian Super Cup",
    matches: (t) => /italian super cup/i.test(t),
  },
  {
    name: "DFB-Pokal",
    matches: (t) => /german cup/i.test(t),
  },
  {
    name: "German Super Cup",
    matches: (t) => /german super cup/i.test(t),
  },
  {
    name: "Coupe de France",
    matches: (t) => /french cup/i.test(t),
  },
  {
    name: "French Super Cup",
    matches: (t) => /french super cup/i.test(t),
  },
  {
    name: "FIFA Club World Cup",
    matches: (t) => /club world cup/i.test(t),
  },
];

export type ManagerTenure = {
  manager: string; // canonical display value, stored as categoryValue
  club: string; // must match a `name` in `clubs` above
  startYear: number;
  endYear: number; // use current year for still-ongoing tenures
};

// The least reliable category — no API gives us manager history, so this
// is fully hand-curated and deliberately kept small and well-checked
// rather than exhaustive. Only a player's real club stint needs to
// *overlap* the given range (see scripts/import-players.ts), not match it
// exactly, so short loan-spell edge cases are the main risk here, not date
// precision.
export const managerTenures: ManagerTenure[] = [
  { manager: "Sir Alex Ferguson", club: "Manchester United", startYear: 1986, endYear: 2013 },
  { manager: "Pep Guardiola", club: "Barcelona", startYear: 2008, endYear: 2012 },
  { manager: "Pep Guardiola", club: "Bayern Munich", startYear: 2013, endYear: 2016 },
  { manager: "Pep Guardiola", club: "Manchester City", startYear: 2016, endYear: 2026 },
  { manager: "Arsène Wenger", club: "Arsenal", startYear: 1996, endYear: 2018 },
  { manager: "José Mourinho", club: "Chelsea", startYear: 2004, endYear: 2007 },
  { manager: "José Mourinho", club: "Inter Milan", startYear: 2008, endYear: 2010 },
  { manager: "José Mourinho", club: "Real Madrid", startYear: 2010, endYear: 2013 },
  { manager: "Carlo Ancelotti", club: "AC Milan", startYear: 2001, endYear: 2009 },
  { manager: "Carlo Ancelotti", club: "Real Madrid", startYear: 2013, endYear: 2015 },
  { manager: "Diego Simeone", club: "Atlético Madrid", startYear: 2011, endYear: 2026 },
  { manager: "Jürgen Klopp", club: "Borussia Dortmund", startYear: 2008, endYear: 2015 },
  { manager: "Jürgen Klopp", club: "Liverpool", startYear: 2015, endYear: 2024 },
  { manager: "Antonio Conte", club: "Juventus", startYear: 2011, endYear: 2014 },
  { manager: "Antonio Conte", club: "Chelsea", startYear: 2016, endYear: 2018 },
  { manager: "Massimiliano Allegri", club: "Juventus", startYear: 2014, endYear: 2019 },
  { manager: "Zinédine Zidane", club: "Real Madrid", startYear: 2016, endYear: 2018 },
  { manager: "Fabio Capello", club: "AC Milan", startYear: 1991, endYear: 1996 },
];
