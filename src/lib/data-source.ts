import type { CareerStop, Player } from "@/lib/types";
import { players as mockPlayers } from "@/data/players";
import {
  USE_LIVE_DATA,
  API_BASE_URL,
  TOP_LEAGUE_COMPETITION_IDS,
  getCompetitionClubs,
  getClubSquad,
  getPlayerAchievements,
  type ClubRef,
  type SquadPlayerRef,
} from "@/lib/transfermarkt";
import { findWikipediaTitle } from "@/lib/wikidata";
import { fetchWikipediaSeniorCareer, type InfoboxStint } from "@/lib/wikipedia";
import { foldDiacritics } from "@/lib/text-match";

/**
 * Single seam between game logic and player data. Every game should read
 * the daily answer through fetchRandomPlayer() rather than importing the
 * mock dataset directly, so the mock dataset can be swapped for a live
 * transfermarkt-api-backed source later without touching game code.
 *
 * Set DATA_SOURCE=transfermarkt (and optionally TRANSFERMARKT_API_URL,
 * default http://localhost:8000) to pick a random big-five-league squad
 * player — past or present — instead of the mock dataset — see
 * docs/transfermarkt-api.md.
 */

type TransfermarktProfile = {
  id: string;
  name: string;
  description: string;
  citizenship?: string[];
};

type TransfermarktTransfer = {
  clubTo: { name: string };
  date: string;
};

type TransfermarktTransfers = {
  transfers: TransfermarktTransfer[];
};

type CareerPathDraft = {
  club: string;
  seasons: string;
  startYear: number;
  endYear: number | null;
};

function seasonLabel(startYear: number, endYear: number | null) {
  if (endYear === null) return `${startYear}–`;
  if (endYear === startYear) return `${startYear}`;
  return `${startYear}–${endYear}`;
}

function buildCareerPath(transfers: TransfermarktTransfer[]): CareerPathDraft[] {
  // API returns most-recent-first; oldest-first makes the stint math easier.
  const chronological = [...transfers].reverse();
  return chronological.map((transfer, i) => {
    const startYear = new Date(transfer.date).getFullYear();
    const next = chronological[i + 1];
    const endYear = next ? new Date(next.date).getFullYear() : null;
    return { club: transfer.clubTo.name, startYear, endYear, seasons: seasonLabel(startYear, endYear) };
  });
}

// transfermarkt-api's profile.dateOfBirth field is broken (comes back
// missing for every player tested), but the free-text description always
// has it in "* DD/MM/YYYY in City, Country" form.
function extractDob(description: string): string | null {
  const match = description.match(/\*\s*(\d{2})\/(\d{2})\/(\d{4})/);
  if (!match) return null;
  const [, day, month, year] = match;
  return `${year}-${month}-${day}`;
}

function overlapYears(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart) + 1);
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
// correctly doesn't.
function tokensSimilar(a: string, b: string): boolean {
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  const prefix = shorter.slice(0, 4);
  return longer.startsWith(prefix);
}

function namesLikelyMatch(a: string, b: string): boolean {
  const tokensA = significantTokens(a);
  const tokensB = significantTokens(b);
  return tokensA.some((ta) => tokensB.some((tb) => tokensSimilar(ta, tb)));
}

// Attaches Wikidata appearances/goals to whichever careerPath stop overlaps
// a stint the most, in years — restricted to stints whose club name is at
// least plausibly the same club, requiring a clear single best match (no
// tie), AND requiring the overlap to cover at least half of the stop's own
// duration. All three checks earned their place from real bugs found while
// testing against Messi's actual career:
//   - name check: without it, his Newell's Old Boys youth-team stats (176
//     apps / 234 goals, genuinely his — as a child) matched his separate
//     Barça youth spell, purely because the date ranges shared one calendar
//     year at a transfer boundary.
//   - duration-coverage check: without it, that same kind of 1-year
//     boundary overlap matched his 16-year senior Barcelona career (2005-
//     2021) to Barcelona's reserve team (Barça Atlètic), showing ~22 apps
//     for a stint that should show ~778 — a single stray year of overlap
//     was "the best score" simply because nothing else overlapped at all.
// Attaching stats to the wrong stop is a confidently wrong answer, not just
// a missing one, so all three have to pass.
function attachClubStats(draft: CareerPathDraft[], stints: InfoboxStint[]): CareerStop[] {
  const currentYear = new Date().getFullYear();
  return draft.map(({ club, seasons, startYear, endYear }) => {
    const stopEnd = endYear ?? currentYear;
    const minRequiredOverlap = Math.ceil((stopEnd - startYear + 1) / 2);
    let best: InfoboxStint | null = null;
    let bestScore = 0;
    let secondBestScore = 0;
    for (const stint of stints) {
      if (!namesLikelyMatch(club, stint.club)) continue;
      const stintEnd = stint.endYear ?? currentYear;
      const score = overlapYears(startYear, stopEnd, stint.startYear, stintEnd);
      if (score > bestScore) {
        secondBestScore = bestScore;
        bestScore = score;
        best = stint;
      } else if (score > secondBestScore) {
        secondBestScore = score;
      }
    }
    if (best && bestScore >= minRequiredOverlap && bestScore > secondBestScore) {
      return { club, seasons, appearances: best.appearances, goals: best.goals };
    }
    return { club, seasons };
  });
}

type CareerStintsResult = { title: string | null; stints: InfoboxStint[] };

const careerStintsCache = new Map<string, Promise<CareerStintsResult>>();

async function lookupCareerStints(name: string, dob: string): Promise<CareerStintsResult> {
  const title = await findWikipediaTitle(name, dob);
  if (!title) return { title: null, stints: [] };
  const stints = await fetchWikipediaSeniorCareer(title);
  return { title, stints };
}

function cachedCareerStints(name: string, dob: string): Promise<CareerStintsResult> {
  const key = `${name}:${dob}`;
  let cached = careerStintsCache.get(key);
  if (!cached) {
    cached = lookupCareerStints(name, dob);
    careerStintsCache.set(key, cached);
  }
  // A failed lookup is not cached — it's usually a transient network hiccup
  // (same Cloudflare flakiness noted elsewhere in this file), and caching
  // it would turn one bad request into a permanent miss for this player on
  // this server process until the next redeploy.
  return cached.catch((err) => {
    careerStintsCache.delete(key);
    console.error(`Wikipedia career-stats lookup failed for "${name}" (${dob}):`, err);
    return { title: null, stints: [] };
  });
}

async function fetchPlayerDetails(id: string): Promise<Player | null> {
  const [profileRes, transfersRes, achievements] = await Promise.all([
    fetch(`${API_BASE_URL}/players/${id}/profile`),
    fetch(`${API_BASE_URL}/players/${id}/transfers`),
    getPlayerAchievements(id).catch((err) => {
      console.error(`Achievements fetch failed for player ${id}:`, err);
      return [];
    }),
  ]);
  if (!profileRes.ok || !transfersRes.ok) return null;

  const profile = (await profileRes.json()) as TransfermarktProfile;
  const transfers = (await transfersRes.json()) as TransfermarktTransfers;
  const draft = buildCareerPath(transfers.transfers);
  if (draft.length === 0) return null;

  const dob = extractDob(profile.description);
  const result = dob ? await cachedCareerStints(profile.name, dob) : { title: null, stints: [] };
  const careerPath = result.stints.length > 0 ? attachClubStats(draft, result.stints) : draft;

  return {
    id: profile.id,
    name: profile.name,
    nationality: profile.citizenship?.[0] ?? "Unknown",
    careerPath,
    achievements,
  };
}

function pickRandom<T>(items: T[]): T | undefined {
  if (items.length === 0) return undefined;
  return items[Math.floor(Math.random() * items.length)];
}

// Fisher-Yates-ish partial shuffle: pick `count` distinct random items.
function pickRandomSample<T>(items: T[], count: number): T[] {
  const pool = [...items];
  const sample: T[] = [];
  while (pool.length > 0 && sample.length < count) {
    const index = Math.floor(Math.random() * pool.length);
    sample.push(pool.splice(index, 1)[0]);
  }
  return sample;
}

// How far back random seasons can go. Squad and competition-membership data
// stays reliable this far back; older than this gets sparse.
const OLDEST_SEASON_YEAR = 1980;

// Transfermarkt only has market-value data from roughly this season onward
// (verified: a player whose whole career predates this has an empty
// market-value history even on the dedicated endpoint). Seasons at or after
// this use the value-based fame filter; older ones fall back to trophies.
const MARKET_VALUE_SEASON_YEAR = 2004;

function pickRandomSeasonYear(): number {
  const maxYear = new Date().getFullYear();
  return OLDEST_SEASON_YEAR + Math.floor(Math.random() * (maxYear - OLDEST_SEASON_YEAR + 1));
}

// A squad snapshot has ~25-40 players including fringe/reserve names
// nobody will recognise. Market value (as of that season) is a decent,
// era-robust fame proxy for seasons that have it. Started at 15 (roughly
// "top half of the squad") but that still let through squad-depth players
// who are good enough to be valuable without being recognisable — tightened
// to the players who were genuinely first-choice.
const GUESSABLE_SQUAD_SIZE = 8;

// A young player can carry a big valuation on potential alone, well before
// they're actually known — excluded from the market-value ranking so a
// highly-rated teenager doesn't crowd out established first-teamers.
const MIN_GUESSABLE_AGE = 20;

// Pre-2004 seasons have no market value at all, so instead: probe a random
// sample of the squad for trophy count (achievements endpoint goes back
// decades) and draw from whoever scored highest in that sample. Sample
// size capped since each probe is its own scrape request; the final draw
// is narrower than the sample so it's the clearly-most-decorated, not just
// above-average.
const ACHIEVEMENT_SAMPLE_SIZE = 8;
const ACHIEVEMENT_GUESSABLE_SIZE = 2;

// Trophy count only means something if the club was actually competitive
// that season — a random member of a mid-table club's squad usually has
// zero achievements same as a random big-club fringe player, so "most
// decorated of a sample" can still land on a nobody. Restricting old-era
// picks to clubs that were realistically title-contending across most of
// the last ~45 years keeps the achievement filter meaningful, and skips
// the competition->clubs lookup entirely (one less scrape per attempt).
const HISTORICAL_POWERHOUSE_CLUBS: ClubRef[] = [
  { id: "985", name: "Manchester United" },
  { id: "31", name: "Liverpool FC" },
  { id: "11", name: "Arsenal FC" },
  { id: "631", name: "Chelsea FC" },
  { id: "418", name: "Real Madrid" },
  { id: "131", name: "FC Barcelona" },
  { id: "13", name: "Atlético de Madrid" },
  { id: "506", name: "Juventus FC" },
  { id: "5", name: "AC Milan" },
  { id: "46", name: "Inter Milan" },
  { id: "27", name: "Bayern Munich" },
  { id: "16", name: "Borussia Dortmund" },
  { id: "583", name: "Paris Saint-Germain" },
  { id: "244", name: "Olympique Marseille" },
  { id: "1041", name: "Olympique Lyon" },
];

const achievementScoreCache = new Map<string, Promise<number>>();

function cachedAchievementScore(playerId: string): Promise<number> {
  let cached = achievementScoreCache.get(playerId);
  if (!cached) {
    cached = getPlayerAchievements(playerId).then((achievements) =>
      achievements.reduce((sum, a) => sum + a.count, 0)
    );
    achievementScoreCache.set(playerId, cached);
  }
  // Same reasoning as cachedCareerStints: don't let a transient failure
  // permanently zero out this player's fame score for the rest of the
  // server process's lifetime.
  return cached.catch((err) => {
    achievementScoreCache.delete(playerId);
    console.error(`Achievement score lookup failed for player ${playerId}:`, err);
    return 0;
  });
}

async function guessablePlayers(
  squad: SquadPlayerRef[],
  seasonYear: number
): Promise<SquadPlayerRef[]> {
  if (seasonYear >= MARKET_VALUE_SEASON_YEAR) {
    const establishedPlayers = squad.filter(
      (p) => p.age === undefined || p.age >= MIN_GUESSABLE_AGE
    );
    const pool = establishedPlayers.length > 0 ? establishedPlayers : squad;
    return [...pool]
      .sort((a, b) => (b.marketValue ?? 0) - (a.marketValue ?? 0))
      .slice(0, GUESSABLE_SQUAD_SIZE);
  }

  const sample = pickRandomSample(squad, ACHIEVEMENT_SAMPLE_SIZE);
  const scored = await Promise.all(
    sample.map(async (player) => ({ player, score: await cachedAchievementScore(player.id) }))
  );
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, ACHIEVEMENT_GUESSABLE_SIZE)
    .map((s) => s.player);
}

// Competition->clubs and club->squad are both keyed by season since squad
// membership (and even which clubs are in the competition) changes year to
// year, but are otherwise stable, so cache them in memory.
const clubsByCompetitionSeason = new Map<string, Promise<ClubRef[]>>();
const squadByClubSeason = new Map<string, Promise<SquadPlayerRef[]>>();

function cachedCompetitionClubs(competitionId: string, seasonYear: number): Promise<ClubRef[]> {
  const key = `${competitionId}:${seasonYear}`;
  let cached = clubsByCompetitionSeason.get(key);
  if (!cached) {
    cached = getCompetitionClubs(competitionId, seasonYear).catch(() => []);
    clubsByCompetitionSeason.set(key, cached);
  }
  return cached;
}

function cachedClubSquad(clubId: string, seasonYear: number): Promise<SquadPlayerRef[]> {
  const key = `${clubId}:${seasonYear}`;
  let cached = squadByClubSeason.get(key);
  if (!cached) {
    cached = getClubSquad(clubId, seasonYear).catch(() => []);
    squadByClubSeason.set(key, cached);
  }
  return cached;
}

const MAX_RANDOM_ATTEMPTS = 5;

async function pickRandomClub(seasonYear: number): Promise<ClubRef | undefined> {
  if (seasonYear < MARKET_VALUE_SEASON_YEAR) {
    return pickRandom(HISTORICAL_POWERHOUSE_CLUBS);
  }
  const competitionId = pickRandom([...TOP_LEAGUE_COMPETITION_IDS]);
  if (!competitionId) return undefined;
  const clubs = await cachedCompetitionClubs(competitionId, seasonYear);
  return pickRandom(clubs);
}

async function fetchRandomLivePlayer(): Promise<Player | null> {
  for (let attempt = 0; attempt < MAX_RANDOM_ATTEMPTS; attempt++) {
    const seasonYear = pickRandomSeasonYear();

    const club = await pickRandomClub(seasonYear);
    if (!club) continue;

    const squad = await cachedClubSquad(club.id, seasonYear);
    if (squad.length === 0) continue;

    const candidates = await guessablePlayers(squad, seasonYear);
    const squadPlayer = pickRandom(candidates);
    if (!squadPlayer) continue;

    const player = await fetchPlayerDetails(squadPlayer.id);
    if (player) return player;
  }
  return null;
}

export async function fetchRandomPlayer(): Promise<Player> {
  if (USE_LIVE_DATA) {
    const live = await fetchRandomLivePlayer();
    if (live) return live;
  }
  return mockPlayers[Math.floor(Math.random() * mockPlayers.length)];
}
