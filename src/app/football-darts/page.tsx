import FootballDartsGame from "@/components/FootballDartsGame";
import { loadDartsCategoryPool } from "@/lib/football-darts";

export const metadata = {
  title: "Football Darts | Football Games",
};

// The category pool itself barely changes, but a fresh server render keeps
// this consistent with the other three games rather than being cached.
export const dynamic = "force-dynamic";

export default async function FootballDartsPage() {
  const categoryPool = await loadDartsCategoryPool();
  return <FootballDartsGame categoryPool={categoryPool} />;
}
