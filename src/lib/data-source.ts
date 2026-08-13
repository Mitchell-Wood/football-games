import { and, asc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import type { Achievement, CareerStop, Player, PhotoPlayer } from "@/lib/types";
import { players as mockPlayers } from "@/data/players";
import { photoPlayers as mockPhotoPlayers } from "@/data/photo-players";
import { USE_LIVE_DATA } from "@/lib/transfermarkt";
import { getDb } from "@/lib/db/client";
import { players, playerStints, playerTrophies, trophies } from "@/lib/db/schema";

/**
 * Single seam between game logic and player data. Every game should read
 * the daily answer through fetchRandomPlayer()/fetchRandomPlayerPhoto()
 * rather than importing the mock dataset directly.
 *
 * Set DATA_SOURCE=transfermarkt to read from the Neon database instead of
 * the small mock dataset — see the Rarity Duel data-layer docs/memory for
 * how that database was built (scripts/import-players.ts,
 * scripts/import-squads.ts, scripts/build-career-stats.ts). This used to
 * mean live-fetching from transfermarkt-api/Wikipedia on every game load;
 * now it's a single fast DB query, since that data is precomputed and
 * stored rather than fetched fresh each time.
 */

function seasonLabel(startYear: number, endYear: number | null): string {
  if (endYear === null) return `${startYear}–`;
  if (endYear === startYear) return `${startYear}`;
  return `${startYear}–${endYear}`;
}

const MAX_RANDOM_ATTEMPTS = 5;

// Career Path draws only from tier 1-2 players with career-stats already
// built (see scripts/build-career-stats.ts) — same reasoning the original
// curated-523 pool existed for: obscure players make for an unguessable
// game. A player can have career_stats_fetched = true but zero real
// player_stints rows (no Wikidata/Wikipedia match was found for them), so
// this still retries a few times rather than trusting one query to always
// return a usable answer.
async function fetchRandomLivePlayer(): Promise<Player | null> {
  const db = getDb();
  for (let attempt = 0; attempt < MAX_RANDOM_ATTEMPTS; attempt++) {
    const [row] = await db
      .select({ id: players.id, name: players.name, nationality: players.nationality })
      .from(players)
      .where(and(inArray(players.rarityTier, [1, 2]), eq(players.careerStatsFetched, true)))
      .orderBy(sql`RANDOM()`)
      .limit(1);
    if (!row) return null;

    const stintRows = await db
      .select({
        clubName: playerStints.clubName,
        startYear: playerStints.startYear,
        endYear: playerStints.endYear,
        appearances: playerStints.appearances,
        goals: playerStints.goals,
      })
      .from(playerStints)
      .where(eq(playerStints.playerId, row.id))
      .orderBy(asc(playerStints.startYear));
    if (stintRows.length === 0) continue; // no real career data for this pick — try another

    const careerPath: CareerStop[] = stintRows.map((s) => ({
      club: s.clubName,
      seasons: seasonLabel(s.startYear, s.endYear),
      appearances: s.appearances,
      goals: s.goals,
    }));

    const trophyRows = await db
      .select({ title: trophies.name, count: playerTrophies.count })
      .from(playerTrophies)
      .innerJoin(trophies, eq(playerTrophies.trophyId, trophies.id))
      .where(eq(playerTrophies.playerId, row.id));
    const achievements: Achievement[] = trophyRows.map((t) => ({ title: t.title, count: t.count }));

    return { id: row.id, name: row.name, nationality: row.nationality, careerPath, achievements };
  }
  return null;
}

export async function fetchRandomPlayer(): Promise<Player> {
  if (USE_LIVE_DATA) {
    try {
      const live = await fetchRandomLivePlayer();
      if (live) return live;
    } catch (err) {
      // A DB failure (e.g. DATABASE_URL misconfigured) should degrade to
      // mock data, not crash the page — same resilience contract this
      // function has always had, just against a database now instead of
      // live transfermarkt-api/Wikipedia calls.
      console.error("fetchRandomLivePlayer failed:", err);
    }
  }
  return mockPlayers[Math.floor(Math.random() * mockPlayers.length)];
}

// Guess the Player only needs a name/nationality/photo, and only players
// with a real imageUrl are usable — currently that's the original 523
// curated legends (the much larger squad-import pool skipped fetching
// images to keep that pipeline shorter; see project memory).
async function fetchRandomLivePlayerPhoto(): Promise<PhotoPlayer | null> {
  const db = getDb();
  const [row] = await db
    .select({ id: players.id, name: players.name, nationality: players.nationality, imageUrl: players.imageUrl })
    .from(players)
    .where(isNotNull(players.imageUrl))
    .orderBy(sql`RANDOM()`)
    .limit(1);
  if (!row || !row.imageUrl) return null;
  return { id: row.id, name: row.name, nationality: row.nationality, imageUrl: row.imageUrl };
}

export async function fetchRandomPlayerPhoto(): Promise<PhotoPlayer> {
  if (USE_LIVE_DATA) {
    try {
      const live = await fetchRandomLivePlayerPhoto();
      if (live) return live;
    } catch (err) {
      console.error("fetchRandomLivePlayerPhoto failed:", err);
    }
  }
  return mockPhotoPlayers[Math.floor(Math.random() * mockPhotoPlayers.length)];
}
