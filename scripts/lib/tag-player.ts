// Shared tagging logic used by both scripts/import-players.ts (curated
// legends) and scripts/import-squads.ts (big-5 league squads) — the two
// differ in how they source a player's name/DOB/nationality (profile
// endpoint + description parsing vs. the squad listing's structured
// fields), but tagging real career data against the category bank is
// identical either way.
import { getDb } from "../../src/lib/db/client";
import { playerTeams, playerTrophies, playerNationalities, playerManagers } from "../../src/lib/db/schema";
import { trophies, nationalities, matchesNationality, managerTenures, isYouthOrReserveEntry } from "../../src/data/categories";
import { upsertTeamSeen } from "./db-helpers";

export type TransfermarktTransfer = { clubTo: { id: string; name: string }; date: string };

export type Stint = { teamId: string; teamName: string; startYear: number; endYear: number };

export function buildStints(transfers: TransfermarktTransfer[]): Stint[] {
  const currentYear = new Date().getFullYear();
  const chronological = [...transfers].reverse();
  return chronological
    .map((t, i) => {
      const startYear = new Date(t.date).getFullYear();
      const next = chronological[i + 1];
      const endYear = next ? new Date(next.date).getFullYear() : currentYear;
      return { teamId: t.clubTo.id, teamName: t.clubTo.name, startYear, endYear };
    })
    .filter((s) => !isYouthOrReserveEntry(s.teamName) && !/^(retired|without club)$/i.test(s.teamName.trim()));
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

export async function tagPlayer(
  playerId: string,
  stints: Stint[],
  citizenships: string[],
  achievementTitles: string[]
): Promise<void> {
  const db = getDb();

  for (const stint of stints) {
    await upsertTeamSeen(stint.teamId, stint.teamName);
    await db.insert(playerTeams).values({ playerId, teamId: stint.teamId }).onConflictDoNothing();
  }

  for (const citizenship of citizenships) {
    for (const nat of nationalities) {
      if (matchesNationality(citizenship, nat)) {
        await db.insert(playerNationalities).values({ playerId, nationalityId: nat.id }).onConflictDoNothing();
      }
    }
  }

  for (const title of achievementTitles) {
    for (const trophy of trophies) {
      if (trophy.matches(title)) {
        await db.insert(playerTrophies).values({ playerId, trophyId: trophy.id }).onConflictDoNothing();
      }
    }
  }

  for (const tenure of managerTenures) {
    const overlapsTenure = stints.some(
      (s) => s.teamId === tenure.teamId && overlaps(s.startYear, s.endYear, tenure.startYear, tenure.endYear)
    );
    if (overlapsTenure) {
      await db.insert(playerManagers).values({ playerId, managerId: tenure.managerId }).onConflictDoNothing();
    }
  }
}
