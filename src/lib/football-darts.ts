import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { teams, leagues, players, playerStints } from "@/lib/db/schema";
import { matchesPlayerName } from "@/lib/text-match";

/**
 * Data layer for Football Darts: real 501-style darts scoring where each
 * turn's "score" is a named player's real appearances/goals within a
 * category, instead of a freely declared number. Player pool is the same
 * tier 1-2 set Career Path draws from — the only players with real
 * player_stints data (see scripts/build-career-stats.ts).
 */

// Every total from 1-180 that no combination of exactly 3 darts can
// produce — verified by brute-force enumeration over every real dartboard
// segment (1-20 single/double/treble, 25/50 bull), not recalled from
// memory. 1 and 2 are impossible too: the minimum 3-dart total is 1+1+1=3.
export const IMPOSSIBLE_DART_SCORES = new Set([1, 2, 163, 166, 169, 172, 173, 175, 176, 178, 179]);

export type DartsCategoryType = "club" | "league";
export type DartsCategory = { type: DartsCategoryType; id: string; label: string };

export async function loadDartsCategoryPool(): Promise<DartsCategory[]> {
  const db = getDb();
  const [clubRows, leagueRows] = await Promise.all([
    db.select({ id: teams.id, name: teams.name }).from(teams).where(eq(teams.isCategory, true)),
    db.select({ id: leagues.id, name: leagues.name }).from(leagues),
  ]);

  return [
    ...clubRows.map((c) => ({ type: "club" as const, id: c.id, label: c.name })),
    ...leagueRows.map((l) => ({ type: "league" as const, id: l.id, label: l.name })),
  ];
}

export type DartsGuessResult = { valid: boolean; playerName?: string; score?: number };

export async function checkDartsGuess(
  guess: string,
  category: DartsCategory,
  stat: "appearances" | "goals"
): Promise<DartsGuessResult> {
  if (!guess.trim()) return { valid: false };

  const db = getDb();
  const candidates = await db
    .select({ id: players.id, name: players.name })
    .from(players)
    .where(inArray(players.rarityTier, [1, 2]));
  const nameMatches = candidates.filter((p) => matchesPlayerName(guess, p.name));
  if (nameMatches.length === 0) return { valid: false };

  for (const p of nameMatches) {
    const stints = await db
      .select({ teamId: playerStints.teamId, appearances: playerStints.appearances, goals: playerStints.goals })
      .from(playerStints)
      .where(eq(playerStints.playerId, p.id));

    const stintTeamIds = stints
      .map((s) => s.teamId)
      .filter((id): id is string => id !== null);
    if (stintTeamIds.length === 0) continue;

    let relevantTeamIds: Set<string>;
    if (category.type === "club") {
      relevantTeamIds = new Set([category.id]);
    } else {
      // Scoped to just this player's own stint teams — no need to pull
      // every team in the league, only whichever of their real clubs (if
      // any) belong to it.
      const teamRows = await db
        .select({ id: teams.id })
        .from(teams)
        .where(and(inArray(teams.id, stintTeamIds), eq(teams.leagueId, category.id)));
      relevantTeamIds = new Set(teamRows.map((t) => t.id));
    }

    const relevantStints = stints.filter((s) => s.teamId && relevantTeamIds.has(s.teamId));
    if (relevantStints.length === 0) continue;

    const total = relevantStints.reduce((sum, s) => sum + (stat === "appearances" ? s.appearances : s.goals), 0);
    if (total > 0 && total <= 180 && !IMPOSSIBLE_DART_SCORES.has(total)) {
      return { valid: true, playerName: p.name, score: total };
    }
  }

  return { valid: false };
}
