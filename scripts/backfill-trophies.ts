// Re-tags already-imported players against the current src/data/categories.ts
// trophies list, without re-running the full import (profile + transfers +
// achievements). Needed because the DB only stores derived category tags,
// not raw achievement titles — so growing the trophy bank (e.g. adding
// domestic cups) requires re-fetching achievements to pick up anything
// newly matchable. Only hits the achievements endpoint, so it's much
// faster than a full import:players run. Skips the 12 hand-entered
// legends (scripts/import-legends-manual.ts) — their achievements
// endpoint 500s the same way their profile endpoint does.
// Run with `npm run backfill:trophies`.
import { config } from "dotenv";
config({ path: ".env.local" });

import { getDb } from "../src/lib/db/client";
import { players, playerCategories } from "../src/lib/db/schema";
import { trophies } from "../src/data/categories";

const API_BASE_URL = process.env.TRANSFERMARKT_API_URL ?? "http://localhost:8000";
const CONCURRENCY = 5;

type TransfermarktAchievement = { title: string };
type TransfermarktAchievements = { achievements: TransfermarktAchievement[] };

async function fetchWithRetry(url: string): Promise<TransfermarktAchievements> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${url} -> ${res.status}`);
      return (await res.json()) as TransfermarktAchievements;
    } catch (err) {
      if (attempt === 1) throw err;
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  throw new Error("unreachable");
}

async function runWithConcurrency<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const item = items[cursor++];
      await fn(item);
    }
  }
  await Promise.all(Array.from({ length: limit }, worker));
}

async function main() {
  const db = getDb();
  const allPlayers = await db.select({ id: players.id, name: players.name }).from(players);
  const existingTags = await db
    .select({ playerId: playerCategories.playerId, categoryValue: playerCategories.categoryValue })
    .from(playerCategories);
  const existingTrophyTags = new Map<string, Set<string>>();
  for (const row of existingTags) {
    if (!existingTrophyTags.has(row.playerId)) existingTrophyTags.set(row.playerId, new Set());
    existingTrophyTags.get(row.playerId)!.add(row.categoryValue);
  }

  let added = 0;
  let failed = 0;
  let checked = 0;

  await runWithConcurrency(allPlayers, CONCURRENCY, async (p) => {
    try {
      const data = await fetchWithRetry(`${API_BASE_URL}/players/${p.id}/achievements`);
      const titles = data.achievements.map((a) => a.title);
      const already = existingTrophyTags.get(p.id) ?? new Set();
      const newTags = trophies
        .filter((trophy) => titles.some((t) => trophy.matches(t)))
        .filter((trophy) => !already.has(trophy.name))
        .map((trophy) => ({ playerId: p.id, categoryType: "trophy", categoryValue: trophy.name }));

      if (newTags.length > 0) {
        await db.insert(playerCategories).values(newTags);
        added += newTags.length;
      }
      checked++;
      if (checked % 50 === 0) console.log(`${checked}/${allPlayers.length} checked, ${added} new tags so far`);
    } catch (err) {
      failed++;
      console.error(`Failed to backfill ${p.name} (${p.id}):`, err instanceof Error ? err.message : err);
    }
  });

  console.log(`Done. Checked ${checked}, added ${added} new trophy tags, ${failed} failed (skipped).`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
