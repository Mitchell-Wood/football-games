// The 12 legends handled here all hit the same transfermarkt-api quirk
// documented in docs/transfermarkt-api.md: the profile endpoint 500s
// outright for these specific (mostly deceased) players — confirmed
// persistent across three separate import runs, not transient. This is
// the exact same issue that required manually resolving them for
// src/data/top-players.ts in the first place.
//
// Rather than skip them from Rarity Duel entirely (they're some of the
// most famous footballers ever — exactly who a rarity-tier-1 answer
// should be), their category tags are hand-entered from well-documented
// historical fact instead of the live API. Kept deliberately conservative:
// only unambiguous facts (which clubs, which nationality, World Cup wins)
// are included. Pre-1992 European Cup wins are NOT tagged as "UEFA
// Champions League" even though it's the same competition renamed — with
// no live API response to check against for these players, there's no way
// to confirm how the automated pipeline would have actually titled it for
// consistency with everyone else's data, so it's left out rather than
// guessed. Run with `npm run import:legends`.
import { config } from "dotenv";
config({ path: ".env.local" });

import { getDb } from "../src/lib/db/client";
import { players, playerCategories } from "../src/lib/db/schema";

type LegendCategory = { categoryType: string; categoryValue: string };
type Legend = {
  id: string;
  name: string;
  fameRank: number;
  nationality: string; // primary, for the players.nationality column
  categories: LegendCategory[];
};

const club = (name: string, league: string): LegendCategory[] => [
  { categoryType: "club", categoryValue: name },
  { categoryType: "league", categoryValue: league },
];

const legends: Legend[] = [
  {
    id: "8024",
    name: "Diego Maradona",
    fameRank: 0,
    nationality: "Argentina",
    categories: [
      { categoryType: "nationality", categoryValue: "Argentina" },
      { categoryType: "trophy", categoryValue: "World Cup" },
      ...club("Barcelona", "La Liga"),
      ...club("Napoli", "Serie A"),
    ],
  },
  {
    id: "17121",
    name: "Pelé",
    fameRank: 4,
    nationality: "Brazil",
    categories: [
      { categoryType: "nationality", categoryValue: "Brazil" },
      { categoryType: "trophy", categoryValue: "World Cup" },
    ],
  },
  {
    id: "8021",
    name: "Johan Cruyff",
    fameRank: 2,
    nationality: "Netherlands",
    categories: [
      { categoryType: "nationality", categoryValue: "Netherlands" },
      ...club("Ajax", "Eredivisie"),
      ...club("Barcelona", "La Liga"),
    ],
  },
  {
    id: "72347",
    name: "Franz Beckenbauer",
    fameRank: 3,
    nationality: "Germany",
    categories: [
      { categoryType: "nationality", categoryValue: "Germany" },
      { categoryType: "trophy", categoryValue: "World Cup" },
      { categoryType: "trophy", categoryValue: "UEFA European Championship" },
      ...club("Bayern Munich", "Bundesliga"),
    ],
  },
  {
    id: "103092",
    name: "Ferenc Puskás",
    fameRank: 5,
    nationality: "Unknown", // Hungary isn't in the curated nationality bank
    categories: [...club("Real Madrid", "La Liga")],
  },
  {
    id: "35604",
    name: "Gerd Müller",
    fameRank: 8,
    nationality: "Germany",
    categories: [
      { categoryType: "nationality", categoryValue: "Germany" },
      { categoryType: "trophy", categoryValue: "World Cup" },
      ...club("Bayern Munich", "Bundesliga"),
    ],
  },
  {
    id: "89230",
    name: "Eusébio",
    fameRank: 7,
    nationality: "Portugal",
    categories: [{ categoryType: "nationality", categoryValue: "Portugal" }, ...club("Benfica", "Primeira Liga")],
  },
  {
    id: "135778",
    name: "Alfredo di Stéfano",
    fameRank: 9,
    nationality: "Argentina", // dual Argentina/Spain internationally capped for both — historical fact
    categories: [
      { categoryType: "nationality", categoryValue: "Argentina" },
      { categoryType: "nationality", categoryValue: "Spain" },
      ...club("Real Madrid", "La Liga"),
    ],
  },
  {
    id: "174987",
    name: "Lev Yashin",
    fameRank: 10,
    nationality: "Unknown", // Soviet Union isn't in the curated nationality bank; Dynamo Moscow isn't in the club bank
    categories: [],
  },
  {
    id: "174986",
    name: "George Best",
    fameRank: 11,
    nationality: "Unknown", // Northern Ireland isn't in the curated nationality bank
    categories: [...club("Manchester United", "Premier League")],
  },
  {
    id: "174874",
    name: "Sir Bobby Charlton",
    fameRank: 13,
    nationality: "England",
    categories: [
      { categoryType: "nationality", categoryValue: "England" },
      { categoryType: "trophy", categoryValue: "World Cup" },
      ...club("Manchester United", "Premier League"),
    ],
  },
  {
    id: "151263",
    name: "Mané Garrincha",
    fameRank: 14,
    nationality: "Brazil",
    categories: [
      { categoryType: "nationality", categoryValue: "Brazil" },
      { categoryType: "trophy", categoryValue: "World Cup" },
    ],
  },
];

async function main() {
  const db = getDb();
  const existing = await db.select({ id: players.id }).from(players);
  const existingIds = new Set(existing.map((p) => p.id));

  for (const legend of legends) {
    if (existingIds.has(legend.id)) {
      console.log(`Skipping ${legend.name} — already imported.`);
      continue;
    }
    await db.insert(players).values({
      id: legend.id,
      name: legend.name,
      nationality: legend.nationality,
      imageUrl: null,
      fameRank: legend.fameRank,
      rarityTier: 1,
    });
    if (legend.categories.length > 0) {
      await db
        .insert(playerCategories)
        .values(legend.categories.map((c) => ({ playerId: legend.id, ...c })));
    }
    console.log(`Inserted ${legend.name} (${legend.categories.length} category tags).`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
