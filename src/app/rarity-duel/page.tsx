import RarityDuelGame from "@/components/RarityDuelGame";
import { generateGrid } from "@/lib/rarity-duel";

export const metadata = {
  title: "Rarity Duel | Football Games",
};

// A fresh grid every load, not cached as static output — same reasoning as
// the other games' dynamic random answer.
export const dynamic = "force-dynamic";

export default async function RarityDuelPage() {
  const grid = await generateGrid();
  return <RarityDuelGame key={`${grid.rows[0].id}-${grid.cols[0].id}`} grid={grid} />;
}
