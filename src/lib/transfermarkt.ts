// Shared config and raw client for the self-hosted transfermarkt-api
// instance. See docs/transfermarkt-api.md for setup.

export const USE_LIVE_DATA = process.env.DATA_SOURCE === "transfermarkt";
export const API_BASE_URL = process.env.TRANSFERMARKT_API_URL ?? "http://localhost:8000";

export type TransfermarktSearchResult = {
  results: { id: string; name: string }[];
};

export async function searchTransfermarktPlayers(query: string) {
  const res = await fetch(`${API_BASE_URL}/players/search/${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error(`transfermarkt-api search failed: ${res.status}`);
  const data = (await res.json()) as TransfermarktSearchResult;
  return data.results;
}

// Transfermarkt competition IDs for the "big five" European leagues — the
// pool the Career Path answer is drawn from.
export const TOP_LEAGUE_COMPETITION_IDS = ["GB1", "IT1", "L1", "FR1", "ES1"] as const;

export type ClubRef = { id: string; name: string };
export type SquadPlayerRef = { id: string; name: string; marketValue?: number; age?: number };

// season_id scopes the club list to who actually played in that
// competition that season — important for old seasons, since a club
// currently in a big-five league may have been in a lower division (or
// vice versa) decades ago.
export async function getCompetitionClubs(
  competitionId: string,
  seasonYear?: number
): Promise<ClubRef[]> {
  const url = new URL(`${API_BASE_URL}/competitions/${competitionId}/clubs`);
  if (seasonYear !== undefined) url.searchParams.set("season_id", String(seasonYear));
  const res = await fetch(url);
  if (!res.ok) throw new Error(`transfermarkt-api competition clubs failed: ${res.status}`);
  const data = (await res.json()) as { clubs: ClubRef[] };
  return data.clubs;
}

// season_id picks a past squad snapshot (e.g. 2007 -> the 2007/08 season),
// which is how retired players end up in the pool — the squad endpoint
// tags them `currentClub: "Retired"` and reports their market value as of
// that season rather than today's (usually zero/absent for the retired).
export async function getClubSquad(
  clubId: string,
  seasonYear?: number
): Promise<SquadPlayerRef[]> {
  const url = new URL(`${API_BASE_URL}/clubs/${clubId}/players`);
  if (seasonYear !== undefined) url.searchParams.set("season_id", String(seasonYear));
  const res = await fetch(url);
  if (!res.ok) throw new Error(`transfermarkt-api club players failed: ${res.status}`);
  const data = (await res.json()) as { players: SquadPlayerRef[] };
  return data.players;
}

export type PlayerAchievement = { title: string; count: number };

// Transfermarkt has no market-value data before ~2004, so for older seasons
// this is the fame proxy instead: trophies/awards go back much further.
export async function getPlayerAchievements(playerId: string): Promise<PlayerAchievement[]> {
  const res = await fetch(`${API_BASE_URL}/players/${playerId}/achievements`);
  if (!res.ok) throw new Error(`transfermarkt-api player achievements failed: ${res.status}`);
  const data = (await res.json()) as { achievements: PlayerAchievement[] };
  return data.achievements;
}
