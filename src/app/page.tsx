import Link from "next/link";

type Game = {
  name: string;
  href: string;
  description: string;
  available: boolean;
};

const games: Game[] = [
  {
    name: "Career Path",
    href: "/career-path",
    description:
      "Guess the player from their club career, revealed one stop at a time.",
    available: true,
  },
  {
    name: "Guess the Player",
    href: "/guess-the-player",
    description: "Guess the player from their photo, which sharpens with every guess.",
    available: true,
  },
  {
    name: "Rarity Duel",
    href: "/rarity-duel",
    description: "Head-to-head. Claim and steal squares by naming rarer and rarer players.",
    available: true,
  },
];

export default function Home() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-16">
      <h1 className="text-3xl font-bold tracking-tight mb-2">
        Football Games
      </h1>
      <p className="text-black/60 dark:text-white/60 mb-10">
        Daily football guessing games.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {games.map((game) =>
          game.available ? (
            <Link
              key={game.name}
              href={game.href}
              className="rounded-lg border border-black/10 dark:border-white/15 p-5 hover:border-black/30 dark:hover:border-white/30 transition-colors"
            >
              <h2 className="font-semibold mb-1">{game.name}</h2>
              <p className="text-sm text-black/60 dark:text-white/60">
                {game.description}
              </p>
            </Link>
          ) : (
            <div
              key={game.name}
              className="rounded-lg border border-dashed border-black/10 dark:border-white/15 p-5 opacity-50"
            >
              <h2 className="font-semibold mb-1">{game.name}</h2>
              <p className="text-sm text-black/60 dark:text-white/60">
                {game.description}
              </p>
            </div>
          ),
        )}
      </div>
    </div>
  );
}
