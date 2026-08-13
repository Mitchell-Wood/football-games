// Imports current + historical (2025/2020/2015/2010/2005/2000/1995/1990)
// squads for every club across the big-5 leagues, deduped by player id
// against each other and against the existing curated pool. Run with
// `npm run import:squads`.
//
// Two phases:
//   1. Discovery — walk every (club, season) pair, collecting the unique
//      set of real players encountered (id/name/dateOfBirth/nationality
//      all come straight from the squad listing, no extra profile fetch
//      needed). Cheap-ish: 96 clubs x 8 seasons = 768 requests.
//   2. Detail import — for genuinely new players only, fetch transfers +
//      achievements (2 calls, not 3 — no profile fetch needed, unlike
//      scripts/import-players.ts) and tag categories the same way.
//
// This is the slow, big one — expect this to take a long time and need
// several runs. Resumable: already-imported players are skipped in phase
// 2 on every run; phase 1 (discovery) is cheap enough to just redo.
import { config } from "dotenv";
config({ path: ".env.local" });

import { getDb } from "../src/lib/db/client";
import { players } from "../src/lib/db/schema";
import { BIG_FIVE_LEAGUES } from "../src/data/categories";
import { seedLookupTables, upsertKnownTeam, existingPlayerIds } from "./lib/db-helpers";
import { buildStints, tagPlayer, type TransfermarktTransfer } from "./lib/tag-player";
import { fetchWithRetry, runWithConcurrency } from "./lib/http";

const API_BASE_URL = process.env.TRANSFERMARKT_API_URL ?? "http://localhost:8000";
const SEASONS = [2025, 2020, 2015, 2010, 2005, 2000, 1995, 1990];
const DISCOVERY_CONCURRENCY = 5;
const DETAIL_CONCURRENCY = 5;

type Club = { id: string; name: string };
type CompetitionClubs = { clubs: Club[] };
type SquadPlayer = { id: string; name: string; dateOfBirth?: string; nationality?: string[] };
type ClubPlayers = { players: SquadPlayer[] };
type TransfermarktTransfers = { transfers: TransfermarktTransfer[] };
type TransfermarktAchievements = { achievements: { title: string }[] };

async function discoverPlayers(): Promise<Map<string, SquadPlayer>> {
  const discovered = new Map<string, SquadPlayer>();
  let clubCount = 0;

  for (const league of BIG_FIVE_LEAGUES) {
    const { clubs } = await fetchWithRetry<CompetitionClubs>(`${API_BASE_URL}/competitions/${league.id}/clubs`);
    console.log(`${league.name}: ${clubs.length} clubs`);

    await runWithConcurrency(clubs, DISCOVERY_CONCURRENCY, async (club) => {
      await upsertKnownTeam(club.id, club.name, league.id);

      for (const season of SEASONS) {
        try {
          const { players: squad } = await fetchWithRetry<ClubPlayers>(
            `${API_BASE_URL}/clubs/${club.id}/players?season_id=${season}`
          );
          for (const p of squad) discovered.set(p.id, p);
        } catch {
          // Club didn't exist / wasn't in this competition for that season
          // — expected for promoted/relegated/newer clubs, not an error.
        }
      }
      clubCount++;
      if (clubCount % 10 === 0) console.log(`${clubCount} clubs scanned, ${discovered.size} unique players so far`);
    });
  }

  return discovered;
}

async function importOneSquadPlayer(p: SquadPlayer): Promise<void> {
  const db = getDb();
  const [transfersData, achievementsData] = await Promise.all([
    fetchWithRetry<TransfermarktTransfers>(`${API_BASE_URL}/players/${p.id}/transfers`),
    fetchWithRetry<TransfermarktAchievements>(`${API_BASE_URL}/players/${p.id}/achievements`).catch(() => ({
      achievements: [],
    })),
  ]);

  const stints = buildStints(transfersData.transfers);
  const citizenships = p.nationality ?? [];
  const achievementTitles = achievementsData.achievements.map((a) => a.title);

  await db.insert(players).values({
    id: p.id,
    name: p.name,
    nationality: citizenships[0] ?? "Unknown",
    imageUrl: null,
    dateOfBirth: p.dateOfBirth ?? null,
  });

  await tagPlayer(p.id, stints, citizenships, achievementTitles);
}

async function main() {
  await seedLookupTables();

  console.log("Phase 1: discovering players across all club/season combinations...");
  const discovered = await discoverPlayers();
  console.log(`Discovery complete: ${discovered.size} unique players found.`);

  const existingIds = await existingPlayerIds();
  const newPlayers = [...discovered.values()].filter((p) => !existingIds.has(p.id));
  console.log(`${existingIds.size} already in DB, ${newPlayers.length} new players to import.`);

  let done = 0;
  let failed = 0;
  await runWithConcurrency(newPlayers, DETAIL_CONCURRENCY, async (p) => {
    try {
      await importOneSquadPlayer(p);
      done++;
      if (done % 100 === 0) console.log(`${done}/${newPlayers.length} imported (${failed} failed so far)`);
    } catch (err) {
      failed++;
      console.error(`Failed to import ${p.name} (${p.id}):`, err instanceof Error ? err.message : err);
    }
  });

  console.log(`Done. Imported ${done}, failed ${failed}.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
