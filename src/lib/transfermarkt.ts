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

export type PlayerAchievement = { title: string; count: number };

// Transfermarkt has no market-value data before ~2004, so for older seasons
// this is the fame proxy instead: trophies/awards go back much further.
export async function getPlayerAchievements(playerId: string): Promise<PlayerAchievement[]> {
  const res = await fetch(`${API_BASE_URL}/players/${playerId}/achievements`);
  if (!res.ok) throw new Error(`transfermarkt-api player achievements failed: ${res.status}`);
  const data = (await res.json()) as { achievements: PlayerAchievement[] };
  return data.achievements;
}
