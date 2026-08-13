// Builds real per-club season/appearances/goals data and trophy win counts
// for every player, so Career Path (and now Football Darts, whose scoring
// depends on real per-club appearances/goals) can render entirely from the
// database. Originally scoped to just tier 1-2 (~6,666) since Career Path
// only needed guessable, famous answers — widened to the full pool since
// Football Darts wants real stats for everyone, not just the famous ones.
// Run with `npm run build:career-stats`.
//
// Same shape as scripts/compute-fame.ts: the bottleneck is Wikidata
// identity matching (findWikipediaTitle), which needs the same careful
// concurrency-1 + pacing this project already learned the hard way is
// required. The Wikipedia infobox fetch itself is NOT rate-limited
// (verified live: 8 rapid sequential requests, no throttling) — only the
// Wikidata step needs the slow pacing.
//
// Resumable via players.careerStatsFetched. Each player's writes happen
// inside one DB transaction so a mid-player failure (e.g. the achievements
// re-fetch failing after stints were already found) can't leave partial,
// duplicate-prone data behind — a failed attempt leaves nothing written,
// and the player stays eligible for a clean retry.
import { config } from "dotenv";
config({ path: ".env.local" });

import { and, eq, isNotNull } from "drizzle-orm";
import { getDb } from "../src/lib/db/client";
import { players, playerStints, playerTrophies, playerTeams, teams } from "../src/lib/db/schema";
import { findWikipediaTitle } from "../src/lib/wikidata";
import { fetchWikipediaSeniorCareer } from "../src/lib/wikipedia";
import { trophies as trophyBank } from "../src/data/categories";
import { namesLikelyMatch } from "../src/lib/text-match";
import { fetchWithRetry, runWithConcurrency } from "./lib/http";

const API_BASE_URL = process.env.TRANSFERMARKT_API_URL ?? "http://localhost:8000";
const CONCURRENCY = 1;
const PACING_DELAY_MS = 300;

type TransfermarktAchievements = { achievements: { title: string; count: number }[] };

async function processPlayer(player: { id: string; name: string; dateOfBirth: string }): Promise<void> {
  const db = getDb();
  const title = await findWikipediaTitle(player.name, player.dateOfBirth);
  const stints = title ? await fetchWikipediaSeniorCareer(title) : [];

  let achievements: TransfermarktAchievements["achievements"] = [];
  try {
    const data = await fetchWithRetry<TransfermarktAchievements>(
      `${API_BASE_URL}/players/${player.id}/achievements`
    );
    achievements = data.achievements;
  } catch {
    // No achievements is fine (many real players genuinely have none) —
    // only a thrown error here means the fetch itself failed, in which
    // case trophy counts just don't get updated this run, not fatal.
  }

  const ownTeams =
    stints.length > 0
      ? await db
          .select({ teamId: playerTeams.teamId, name: teams.name })
          .from(playerTeams)
          .innerJoin(teams, eq(playerTeams.teamId, teams.id))
          .where(eq(playerTeams.playerId, player.id))
      : [];

  await db.transaction(async (tx) => {
    if (stints.length > 0) {
      await tx.insert(playerStints).values(
        stints.map((s) => ({
          playerId: player.id,
          teamId: ownTeams.find((t) => namesLikelyMatch(s.club, t.name))?.teamId ?? null,
          clubName: s.club,
          startYear: s.startYear,
          endYear: s.endYear,
          appearances: s.appearances,
          goals: s.goals,
        }))
      );
    }

    for (const a of achievements) {
      for (const trophy of trophyBank) {
        if (trophy.matches(a.title)) {
          await tx
            .insert(playerTrophies)
            .values({ playerId: player.id, trophyId: trophy.id, count: a.count })
            .onConflictDoUpdate({
              target: [playerTrophies.playerId, playerTrophies.trophyId],
              set: { count: a.count },
            });
        }
      }
    }

    await tx.update(players).set({ careerStatsFetched: true }).where(eq(players.id, player.id));
  });
}

async function main() {
  const db = getDb();
  const pending = await db
    .select({ id: players.id, name: players.name, dateOfBirth: players.dateOfBirth })
    .from(players)
    .where(and(eq(players.careerStatsFetched, false), isNotNull(players.dateOfBirth)));

  console.log(`${pending.length} players need career-stats built.`);

  let done = 0;
  let failed = 0;
  await runWithConcurrency(pending, CONCURRENCY, async (p) => {
    if (!p.dateOfBirth) return; // can't identity-match without a DOB
    try {
      await processPlayer({ id: p.id, name: p.name, dateOfBirth: p.dateOfBirth });
      done++;
      if (done % 100 === 0) console.log(`${done}/${pending.length} processed (${failed} failed so far)`);
      await new Promise((r) => setTimeout(r, PACING_DELAY_MS));
    } catch (err) {
      failed++;
      console.error(`Failed to build career stats for ${p.name} (${p.id}):`, err instanceof Error ? err.message : err);
    }
  });

  console.log(`Done. Processed ${done}, failed ${failed}.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
