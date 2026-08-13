// The 12 legends handled here all hit the same transfermarkt-api quirk
// documented in docs/transfermarkt-api.md: the profile endpoint 500s
// outright for these specific (mostly deceased) players — confirmed
// persistent across multiple import runs, not transient. This is the same
// issue that required manually resolving them for src/data/top-players.ts
// in the first place.
//
// Category tags are hand-entered from well-documented historical fact
// instead of the live API, deliberately conservative (nationality, real
// clubs, World Cup wins only — no pre-1992 European Cup wins, since
// there's no live achievements response to check exact title wording
// against for these players). Dates of birth are also hardcoded
// (well-documented public facts) so these 12 can flow through the same
// Wikidata sitelinks fame ranking as everyone else instead of needing a
// special-cased tier. Run with `npm run import:legends`.
import { config } from "dotenv";
config({ path: ".env.local" });

import { getDb } from "../src/lib/db/client";
import { players, playerTeams, playerTrophies, playerNationalities } from "../src/lib/db/schema";
import { trophies, nationalities } from "../src/data/categories";
import { seedLookupTables, upsertTeamSeen, existingPlayerIds } from "./lib/db-helpers";

function trophyId(name: string): string {
  const t = trophies.find((t) => t.name === name);
  if (!t) throw new Error(`Unknown trophy: ${name}`);
  return t.id;
}
function nationalityId(name: string): string {
  const n = nationalities.find((n) => n.name === name);
  if (!n) throw new Error(`Unknown nationality: ${name}`);
  return n.id;
}

type Legend = {
  id: string;
  name: string;
  dateOfBirth: string; // YYYY-MM-DD
  nationalityDisplay: string;
  nationalityIds: string[];
  trophyIds: string[];
  teams: { id: string; name: string }[];
};

const legends: Legend[] = [
  {
    id: "8024",
    name: "Diego Maradona",
    dateOfBirth: "1960-10-30",
    nationalityDisplay: "Argentina",
    nationalityIds: [nationalityId("Argentina")],
    trophyIds: [trophyId("World Cup")],
    teams: [
      { id: "131", name: "Barcelona" },
      { id: "6195", name: "Napoli" },
    ],
  },
  {
    id: "17121",
    name: "Pelé",
    dateOfBirth: "1940-10-23",
    nationalityDisplay: "Brazil",
    nationalityIds: [nationalityId("Brazil")],
    trophyIds: [trophyId("World Cup")],
    teams: [],
  },
  {
    id: "8021",
    name: "Johan Cruyff",
    dateOfBirth: "1947-04-25",
    nationalityDisplay: "Netherlands",
    nationalityIds: [nationalityId("Netherlands")],
    trophyIds: [],
    teams: [
      { id: "610", name: "Ajax" },
      { id: "131", name: "Barcelona" },
    ],
  },
  {
    id: "72347",
    name: "Franz Beckenbauer",
    dateOfBirth: "1945-09-11",
    nationalityDisplay: "Germany",
    nationalityIds: [nationalityId("Germany")],
    trophyIds: [trophyId("World Cup"), trophyId("UEFA European Championship")],
    teams: [{ id: "27", name: "Bayern Munich" }],
  },
  {
    id: "103092",
    name: "Ferenc Puskás",
    dateOfBirth: "1927-04-02",
    nationalityDisplay: "Unknown", // Hungary isn't in the curated nationality bank
    nationalityIds: [],
    trophyIds: [],
    teams: [{ id: "418", name: "Real Madrid" }],
  },
  {
    id: "35604",
    name: "Gerd Müller",
    dateOfBirth: "1945-11-03",
    nationalityDisplay: "Germany",
    nationalityIds: [nationalityId("Germany")],
    trophyIds: [trophyId("World Cup")],
    teams: [{ id: "27", name: "Bayern Munich" }],
  },
  {
    id: "89230",
    name: "Eusébio",
    dateOfBirth: "1942-01-25",
    nationalityDisplay: "Portugal",
    nationalityIds: [nationalityId("Portugal")],
    trophyIds: [],
    teams: [{ id: "294", name: "Benfica" }],
  },
  {
    id: "135778",
    name: "Alfredo di Stéfano",
    dateOfBirth: "1926-07-04",
    nationalityDisplay: "Argentina", // dual Argentina/Spain internationally capped for both — historical fact
    nationalityIds: [nationalityId("Argentina"), nationalityId("Spain")],
    trophyIds: [],
    teams: [{ id: "418", name: "Real Madrid" }],
  },
  {
    id: "174987",
    name: "Lev Yashin",
    dateOfBirth: "1929-10-22",
    nationalityDisplay: "Unknown", // Soviet Union isn't in the curated nationality bank; Dynamo Moscow isn't a tracked club
    nationalityIds: [],
    trophyIds: [],
    teams: [],
  },
  {
    id: "174986",
    name: "George Best",
    dateOfBirth: "1946-05-22",
    nationalityDisplay: "Unknown", // Northern Ireland isn't in the curated nationality bank
    nationalityIds: [],
    trophyIds: [],
    teams: [{ id: "985", name: "Manchester United" }],
  },
  {
    id: "174874",
    name: "Sir Bobby Charlton",
    dateOfBirth: "1937-10-11",
    nationalityDisplay: "England",
    nationalityIds: [nationalityId("England")],
    trophyIds: [trophyId("World Cup")],
    teams: [{ id: "985", name: "Manchester United" }],
  },
  {
    id: "151263",
    name: "Mané Garrincha",
    dateOfBirth: "1933-10-28",
    nationalityDisplay: "Brazil",
    nationalityIds: [nationalityId("Brazil")],
    trophyIds: [trophyId("World Cup")],
    teams: [],
  },
];

async function main() {
  await seedLookupTables();
  const db = getDb();
  const existingIds = await existingPlayerIds();

  for (const legend of legends) {
    if (existingIds.has(legend.id)) {
      console.log(`Skipping ${legend.name} — already imported.`);
      continue;
    }
    await db.insert(players).values({
      id: legend.id,
      name: legend.name,
      nationality: legend.nationalityDisplay,
      imageUrl: null,
      dateOfBirth: legend.dateOfBirth,
    });
    for (const team of legend.teams) {
      await upsertTeamSeen(team.id, team.name);
      await db.insert(playerTeams).values({ playerId: legend.id, teamId: team.id }).onConflictDoNothing();
    }
    for (const nationalityId_ of legend.nationalityIds) {
      await db
        .insert(playerNationalities)
        .values({ playerId: legend.id, nationalityId: nationalityId_ })
        .onConflictDoNothing();
    }
    for (const trophyId_ of legend.trophyIds) {
      await db.insert(playerTrophies).values({ playerId: legend.id, trophyId: trophyId_ }).onConflictDoNothing();
    }
    console.log(`Inserted ${legend.name} (${legend.teams.length} teams, ${legend.trophyIds.length} trophies).`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
