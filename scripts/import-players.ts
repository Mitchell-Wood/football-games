// Imports the curated src/data/top-players.ts pool (all-time fame-ranked
// legends) into the normalized schema. Run with `npm run import:players`.
//
// Resumable — players already in the DB are skipped. Doesn't compute
// rarityTier/fameRank (that now happens separately once every player,
// curated and squad-sourced alike, has a Wikidata sitelinks count — see
// scripts/compute-fame.ts and scripts/recompute-tiers.ts).
import { config } from "dotenv";
config({ path: ".env.local" });

import { getDb } from "../src/lib/db/client";
import { players } from "../src/lib/db/schema";
import { topPlayers } from "../src/data/top-players";
import { seedLookupTables, existingPlayerIds } from "./lib/db-helpers";
import { buildStints, tagPlayer, type TransfermarktTransfer } from "./lib/tag-player";
import { fetchWithRetry, runWithConcurrency } from "./lib/http";

const API_BASE_URL = process.env.TRANSFERMARKT_API_URL ?? "http://localhost:8000";
const CONCURRENCY = 5;

type TransfermarktProfile = { id: string; name: string; description: string; citizenship?: string[]; imageUrl?: string };
type TransfermarktTransfers = { transfers: TransfermarktTransfer[] };
type TransfermarktAchievements = { achievements: { title: string }[] };

// transfermarkt-api's profile.dateOfBirth field is broken (confirmed still
// undefined live) — the free-text description always has it in
// "* DD/MM/YYYY in City, Country" form. Same regex data-source.ts uses.
function extractDob(description: string): string | null {
  const match = description.match(/\*\s*(\d{2})\/(\d{2})\/(\d{4})/);
  if (!match) return null;
  const [, day, month, year] = match;
  return `${year}-${month}-${day}`;
}

async function importOnePlayer(id: string): Promise<void> {
  const db = getDb();
  const [profile, transfersData, achievementsData] = await Promise.all([
    fetchWithRetry<TransfermarktProfile>(`${API_BASE_URL}/players/${id}/profile`),
    fetchWithRetry<TransfermarktTransfers>(`${API_BASE_URL}/players/${id}/transfers`),
    fetchWithRetry<TransfermarktAchievements>(`${API_BASE_URL}/players/${id}/achievements`).catch(() => ({
      achievements: [],
    })),
  ]);

  const stints = buildStints(transfersData.transfers);
  const citizenships = profile.citizenship ?? [];
  const achievementTitles = achievementsData.achievements.map((a) => a.title);

  await db.insert(players).values({
    id,
    name: profile.name,
    nationality: citizenships[0] ?? "Unknown",
    imageUrl: profile.imageUrl ?? null,
    dateOfBirth: extractDob(profile.description),
  });

  await tagPlayer(id, stints, citizenships, achievementTitles);
}

async function main() {
  await seedLookupTables();

  const existingIds = await existingPlayerIds();
  const remaining = topPlayers.filter((p) => !existingIds.has(p.id));
  console.log(`${existingIds.size} already imported, ${remaining.length} remaining of ${topPlayers.length} total.`);

  let done = 0;
  let failed = 0;
  await runWithConcurrency(remaining, CONCURRENCY, async (p) => {
    try {
      await importOnePlayer(p.id);
      done++;
      if (done % 25 === 0) console.log(`${done}/${remaining.length} imported (${failed} failed so far)`);
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
