import type { Player } from "@/lib/types";
import { players as mockPlayers } from "@/data/players";

/**
 * Single seam between game logic and player data. Every game should read
 * players through these functions rather than importing `data/players`
 * directly, so the mock dataset can be swapped for a live
 * transfermarkt-api-backed source later without touching game code.
 *
 * To switch: implement fetchPlayers()/fetchPlayerById() against a running
 * transfermarkt-api instance (see docs/transfermarkt-api.md) behind the
 * same signatures, e.g. by setting DATA_SOURCE=transfermarkt and branching
 * here.
 */

export async function fetchPlayers(): Promise<Player[]> {
  return mockPlayers;
}

export async function fetchPlayerById(id: string): Promise<Player | undefined> {
  return mockPlayers.find((p) => p.id === id);
}
