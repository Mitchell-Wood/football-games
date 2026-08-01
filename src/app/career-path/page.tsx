import CareerPathGame from "@/components/CareerPathGame";
import { fetchRandomPlayer, getLastCareerStintsDebug } from "@/lib/data-source";

export const metadata = {
  title: "Career Path | Football Games",
};

// Picking a random player server-side means it must not be cached as static
// output, otherwise every visitor gets the same answer until redeploy.
export const dynamic = "force-dynamic";

export default async function CareerPathPage() {
  const answer = await fetchRandomPlayer();
  const debug = getLastCareerStintsDebug();
  return (
    <>
      <CareerPathGame key={answer.id} answer={answer} />
      {/* TEMPORARY diagnostic — remove once the production stats issue is resolved */}
      <div style={{ display: "none" }} id="career-stints-debug">
        {JSON.stringify(debug)}
      </div>
    </>
  );
}
