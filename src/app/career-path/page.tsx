import CareerPathGame from "@/components/CareerPathGame";
import { fetchPlayers } from "@/lib/data-source";

export const metadata = {
  title: "Career Path | Football Games",
};

// Picking a random player server-side means it must not be cached as static
// output, otherwise every visitor gets the same answer until redeploy.
export const dynamic = "force-dynamic";

export default async function CareerPathPage() {
  const players = await fetchPlayers();
  // This is a Server Component: it runs once per request (see `dynamic =
  // "force-dynamic"` above), not re-rendered/memoized by the React
  // Compiler, so a fresh random pick per request is intentional here.
  // eslint-disable-next-line react-hooks/purity
  const answer = players[Math.floor(Math.random() * players.length)];
  return <CareerPathGame key={answer.id} answer={answer} />;
}
