import GuessThePlayerGame from "@/components/GuessThePlayerGame";
import { fetchRandomPlayerPhoto } from "@/lib/data-source";

export const metadata = {
  title: "Guess the Player | Football Games",
};

// Picking a random player server-side means it must not be cached as static
// output, otherwise every visitor gets the same answer until redeploy.
export const dynamic = "force-dynamic";

export default async function GuessThePlayerPage() {
  const answer = await fetchRandomPlayerPhoto();
  return <GuessThePlayerGame key={answer.id} answer={answer} />;
}
