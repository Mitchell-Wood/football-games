// One-off (but re-runnable) import: tags every player in the curated
// src/data/top-players.ts pool with the categories they satisfy (club,
// nationality, trophy, league, manager) and their rarity tier, for Rarity
// Duel. Run with `npm run import:players`.
//
// Resumable by design — players already in the DB are skipped, so a run
// that gets interrupted (network blip, scraper rate limit) can just be
// re-run rather than restarted from scratch.
//
// Deliberately skips the Wikidata/Wikipedia stats pipeline that
// src/lib/data-source.ts uses for Career Path — category tagging only
// needs club names/dates, citizenships, and achievement titles, all of
// which come straight from transfermarkt-api.
import { config } from "dotenv";
config({ path: ".env.local" });

import { getDb } from "../src/lib/db/client";
import { players, playerCategories } from "../src/lib/db/schema";
import { topPlayers } from "../src/data/top-players";
import {
  clubs,
  matchesClub,
  nationalities,
  matchesNationality,
  trophies,
  managerTenures,
  isYouthOrReserveEntry,
} from "../src/data/categories";

const API_BASE_URL = process.env.TRANSFERMARKT_API_URL ?? "http://localhost:8000";
const TIER_BAND_SIZE = Math.ceil(topPlayers.length / 5);
const CONCURRENCY = 5;

type TransfermarktProfile = {
  id: string;
  name: string;
  citizenship?: string[];
  imageUrl?: string;
};
type TransfermarktTransfer = { clubTo: { name: string }; date: string };
type TransfermarktTransfers = { transfers: TransfermarktTransfer[] };
type TransfermarktAchievement = { title: string };
type TransfermarktAchievements = { achievements: TransfermarktAchievement[] };

type Stint = { club: string; startYear: number; endYear: number | null };

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return (await res.json()) as T;
}

// One retry after a short delay — transient network/scraper hiccups
// shouldn't sink an otherwise-good player, but we don't want to loop
// forever against a genuinely broken profile either (see the Maradona
// 500-response case documented in docs/transfermarkt-api.md).
async function fetchWithRetry<T>(url: string): Promise<T> {
  try {
    return await fetchJson<T>(url);
  } catch {
    await new Promise((r) => setTimeout(r, 1500));
    return await fetchJson<T>(url);
  }
}

function buildStints(transfers: TransfermarktTransfer[]): Stint[] {
  const currentYear = new Date().getFullYear();
  const chronological = [...transfers].reverse();
  return chronological
    .map((t, i) => {
      const startYear = new Date(t.date).getFullYear();
      const next = chronological[i + 1];
      const endYear = next ? new Date(next.date).getFullYear() : null;
      return { club: t.clubTo.name, startYear, endYear };
    })
    .filter((s) => !isYouthOrReserveEntry(s.club) && !/^(retired|without club)$/i.test(s.club.trim()))
    .map((s) => ({ ...s, endYear: s.endYear ?? currentYear }));
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

type CategoryTag = { categoryType: string; categoryValue: string };

function tagCategories(
  stints: Stint[],
  citizenships: string[],
  achievementTitles: string[]
): CategoryTag[] {
  const tags = new Map<string, CategoryTag>(); // dedupe by "type:value"
  const add = (categoryType: string, categoryValue: string) =>
    tags.set(`${categoryType}:${categoryValue}`, { categoryType, categoryValue });

  for (const stint of stints) {
    for (const club of clubs) {
      if (matchesClub(stint.club, club)) {
        add("club", club.name);
        add("league", club.league);
      }
    }
  }

  for (const citizenship of citizenships) {
    for (const nat of nationalities) {
      if (matchesNationality(citizenship, nat)) add("nationality", nat.name);
    }
  }

  for (const title of achievementTitles) {
    for (const trophy of trophies) {
      if (trophy.matches(title)) add("trophy", trophy.name);
    }
  }

  for (const tenure of managerTenures) {
    const club = clubs.find((c) => c.name === tenure.club);
    if (!club) continue;
    for (const stint of stints) {
      if (
        matchesClub(stint.club, club) &&
        overlaps(stint.startYear, stint.endYear ?? tenure.endYear, tenure.startYear, tenure.endYear)
      ) {
        add("manager", tenure.manager);
      }
    }
  }

  return [...tags.values()];
}

async function importPlayer(id: string, fameRank: number): Promise<void> {
  const [profile, transfersData, achievementsData] = await Promise.all([
    fetchWithRetry<TransfermarktProfile>(`${API_BASE_URL}/players/${id}/profile`),
    fetchWithRetry<TransfermarktTransfers>(`${API_BASE_URL}/players/${id}/transfers`),
    fetchWithRetry<TransfermarktAchievements>(`${API_BASE_URL}/players/${id}/achievements`).catch(
      () => ({ achievements: [] })
    ),
  ]);

  const stints = buildStints(transfersData.transfers);
  const citizenships = profile.citizenship ?? [];
  const achievementTitles = achievementsData.achievements.map((a) => a.title);
  const tags = tagCategories(stints, citizenships, achievementTitles);
  const rarityTier = Math.min(5, Math.floor(fameRank / TIER_BAND_SIZE) + 1);

  const db = getDb();
  await db.insert(players).values({
    id,
    name: profile.name,
    nationality: citizenships[0] ?? "Unknown",
    imageUrl: profile.imageUrl ?? null,
    fameRank,
    rarityTier,
  });

  if (tags.length > 0) {
    await db.insert(playerCategories).values(tags.map((t) => ({ playerId: id, ...t })));
  }
}

// Simple fixed-concurrency runner — no external dependency needed for
// this one-off script.
async function runWithConcurrency<T>(items: T[], limit: number, fn: (item: T, i: number) => Promise<void>) {
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: limit }, worker));
}

async function main() {
  const db = getDb();
  const existing = await db.select({ id: players.id }).from(players);
  const existingIds = new Set(existing.map((p) => p.id));
  const remaining = topPlayers
    .map((p, index) => ({ ...p, fameRank: index }))
    .filter((p) => !existingIds.has(p.id));

  console.log(
    `${existingIds.size} already imported, ${remaining.length} remaining of ${topPlayers.length} total.`
  );

  let done = 0;
  let failed = 0;
  await runWithConcurrency(remaining, CONCURRENCY, async (p) => {
    try {
      await importPlayer(p.id, p.fameRank);
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
