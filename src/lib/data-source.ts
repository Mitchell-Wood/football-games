import type { Player } from "@/lib/types";
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
  citizenship?: string[];
};

type TransfermarktTransfer = {
  clubTo: { name: string };
  date: string;
};

type TransfermarktTransfers = {
  transfers: TransfermarktTransfer[];
};

function seasonLabel(startYear: number, endYear: number | null) {
  if (endYear === null) return `${startYear}–`;
  if (endYear === startYear) return `${startYear}`;
  return `${startYear}–${endYear}`;
}

function buildCareerPath(transfers: TransfermarktTransfer[]) {
  // API returns most-recent-first; oldest-first makes the stint math easier.
  const chronological = [...transfers].reverse();
  return chronological.map((transfer, i) => {
    const startYear = new Date(transfer.date).getFullYear();
    const next = chronological[i + 1];
    const endYear = next ? new Date(next.date).getFullYear() : null;
    return { club: transfer.clubTo.name, seasons: seasonLabel(startYear, endYear) };
  });
}

async function fetchPlayerDetails(id: string): Promise<Player | null> {
  const [profileRes, transfersRes, achievements] = await Promise.all([
    fetch(`${API_BASE_URL}/players/${id}/profile`),
    fetch(`${API_BASE_URL}/players/${id}/transfers`),
    getPlayerAchievements(id).catch(() => []),
  ]);
  if (!profileRes.ok || !transfersRes.ok) return null;

  const profile = (await profileRes.json()) as TransfermarktProfile;
  const transfers = (await transfersRes.json()) as TransfermarktTransfers;
  const careerPath = buildCareerPath(transfers.transfers);
  if (careerPath.length === 0) return null;

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
// era-robust fame proxy for seasons that have it.
const GUESSABLE_SQUAD_SIZE = 15;

// Pre-2004 seasons have no market value at all, so instead: probe a random
// sample of the squad for trophy count (achievements endpoint goes back
// decades) and draw from whoever scored highest in that sample. Capped
// small since each probe is its own scrape request.
const ACHIEVEMENT_SAMPLE_SIZE = 6;
const ACHIEVEMENT_GUESSABLE_SIZE = 3;

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
    cached = getPlayerAchievements(playerId)
      .then((achievements) => achievements.reduce((sum, a) => sum + a.count, 0))
      .catch(() => 0);
    achievementScoreCache.set(playerId, cached);
  }
  return cached;
}

async function guessablePlayers(
  squad: SquadPlayerRef[],
  seasonYear: number
): Promise<SquadPlayerRef[]> {
  if (seasonYear >= MARKET_VALUE_SEASON_YEAR) {
    return [...squad]
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
