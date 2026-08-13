"use client";

import { useState } from "react";
import type { DartsCategory } from "@/lib/football-darts";
import PlayerNameInput from "@/components/PlayerNameInput";

type Owner = "P1" | "P2";
type Stat = "appearances" | "goals";

const DEFAULT_START = 501;
const BUST_TOLERANCE = 10;

function pickRandomCategory(pool: DartsCategory[]): DartsCategory {
  return pool[Math.floor(Math.random() * pool.length)];
}

const RANDOM_OPTION = "random";
const categoryKey = (c: DartsCategory) => `${c.type}:${c.id}`;

export default function FootballDartsGame({ categoryPool }: { categoryPool: DartsCategory[] }) {
  const [phase, setPhase] = useState<"setup" | "playing" | "finished">("setup");
  const [p1Start, setP1Start] = useState(DEFAULT_START);
  const [p2Start, setP2Start] = useState(DEFAULT_START);

  const [remaining, setRemaining] = useState<Record<Owner, number>>({ P1: DEFAULT_START, P2: DEFAULT_START });
  const [currentPlayer, setCurrentPlayer] = useState<Owner>("P1");
  const [categoryChoice, setCategoryChoice] = useState(RANDOM_OPTION);
  // Locked in once the game starts, not re-rolled each turn — both players
  // answer the same category until someone checks out.
  const [category, setCategory] = useState<DartsCategory>(() => pickRandomCategory(categoryPool));
  const [stat, setStat] = useState<Stat>("appearances");

  const [usedNames, setUsedNames] = useState<string[]>([]);
  const [guess, setGuess] = useState("");
  const [checking, setChecking] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [winner, setWinner] = useState<Owner | null>(null);
  const [checkoutScore, setCheckoutScore] = useState<number | null>(null);

  const leagueOptions = categoryPool
    .filter((c) => c.type === "league")
    .sort((a, b) => a.label.localeCompare(b.label));
  const clubOptions = categoryPool
    .filter((c) => c.type === "club")
    .sort((a, b) => a.label.localeCompare(b.label));

  function startGame() {
    if (categoryChoice !== RANDOM_OPTION) {
      const chosen = categoryPool.find((c) => categoryKey(c) === categoryChoice);
      if (chosen) setCategory(chosen);
    } else {
      setCategory(pickRandomCategory(categoryPool));
    }
    setRemaining({ P1: p1Start, P2: p2Start });
    setPhase("playing");
  }

  function nextTurn() {
    setCurrentPlayer((p) => (p === "P1" ? "P2" : "P1"));
    setGuess("");
  }

  function applyScore(playerName: string, score: number) {
    const newRemaining = remaining[currentPlayer] - score;

    if (newRemaining > 0) {
      setRemaining((r) => ({ ...r, [currentPlayer]: newRemaining }));
      setUsedNames((names) => [...names, playerName]);
      setFeedback(`${playerName} — ${score}. ${currentPlayer} has ${newRemaining} left.`);
      nextTurn();
    } else if (newRemaining >= -BUST_TOLERANCE) {
      setUsedNames((names) => [...names, playerName]);
      setCheckoutScore(score);
      setWinner(currentPlayer);
      setPhase("finished");
    } else {
      setFeedback(`${playerName} — ${score}. That's a bust! Turn wasted, ${currentPlayer} stays on ${remaining[currentPlayer]}.`);
      nextTurn();
    }
  }

  async function submitGuess(e: React.FormEvent) {
    e.preventDefault();
    if (checking || !guess.trim()) return;
    setChecking(true);
    try {
      const res = await fetch("/api/football-darts/guess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guess, category, stat }),
      });
      const result = (await res.json()) as { valid: boolean; playerName?: string; score?: number };

      if (result.valid && result.playerName !== undefined && result.score !== undefined) {
        applyScore(result.playerName, result.score);
      } else {
        setFeedback("No valid score there — turn wasted.");
        nextTurn();
      }
    } catch {
      setFeedback("No valid score there — turn wasted.");
      nextTurn();
    } finally {
      setChecking(false);
    }
  }

  function skipTurn() {
    if (checking) return;
    setFeedback(`${currentPlayer} skipped.`);
    nextTurn();
  }

  function playAgain() {
    window.location.reload();
  }

  if (phase === "setup") {
    return (
      <div className="max-w-xl mx-auto px-4 py-10">
        <h1 className="text-2xl font-bold mb-1">Football Darts</h1>
        <p className="text-sm text-black/60 dark:text-white/60 mb-6">
          Real darts scoring, real football stats. Each turn, name a player who fits the
          category — their real appearances or goals within it becomes your score. Checkout
          works like darts: land on exactly 0, or up to 10 under, to win. Overshoot further
          than that and it&apos;s a bust.
        </p>
        <div className="flex gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium mb-2" htmlFor="p1-start">
              Player 1 starting score
            </label>
            <input
              id="p1-start"
              type="number"
              min={1}
              max={1000}
              value={p1Start}
              onChange={(e) => setP1Start(Math.max(1, Number(e.target.value) || DEFAULT_START))}
              className="w-28 rounded-md border border-black/15 dark:border-white/20 bg-transparent px-3 py-2 outline-none focus:border-black/40 dark:focus:border-white/40"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2" htmlFor="p2-start">
              Player 2 starting score
            </label>
            <input
              id="p2-start"
              type="number"
              min={1}
              max={1000}
              value={p2Start}
              onChange={(e) => setP2Start(Math.max(1, Number(e.target.value) || DEFAULT_START))}
              className="w-28 rounded-md border border-black/15 dark:border-white/20 bg-transparent px-3 py-2 outline-none focus:border-black/40 dark:focus:border-white/40"
            />
          </div>
        </div>
        <label className="block text-sm font-medium mb-2" htmlFor="category-choice">
          Category
        </label>
        <select
          id="category-choice"
          value={categoryChoice}
          onChange={(e) => setCategoryChoice(e.target.value)}
          className="w-full rounded-md border border-black/15 dark:border-white/20 bg-transparent px-3 py-2 outline-none focus:border-black/40 dark:focus:border-white/40 mb-6"
        >
          <option value={RANDOM_OPTION}>Random</option>
          <optgroup label="Leagues">
            {leagueOptions.map((c) => (
              <option key={categoryKey(c)} value={categoryKey(c)}>
                {c.label}
              </option>
            ))}
          </optgroup>
          <optgroup label="Clubs">
            {clubOptions.map((c) => (
              <option key={categoryKey(c)} value={categoryKey(c)}>
                {c.label}
              </option>
            ))}
          </optgroup>
        </select>
        <button
          onClick={startGame}
          className="rounded-md bg-foreground text-background px-4 py-2 font-medium"
        >
          Start Game
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold mb-1">Football Darts</h1>

      <div className="flex gap-4 mb-6">
        <div
          className={`flex-1 rounded-md border p-3 text-center ${
            phase === "playing" && currentPlayer === "P1"
              ? "border-black/60 dark:border-white/60"
              : "border-black/10 dark:border-white/15"
          }`}
        >
          <p className="text-xs uppercase tracking-wide text-black/50 dark:text-white/50">Player 1</p>
          <p className="text-2xl font-bold tabular-nums">{remaining.P1}</p>
        </div>
        <div
          className={`flex-1 rounded-md border p-3 text-center ${
            phase === "playing" && currentPlayer === "P2"
              ? "border-black/60 dark:border-white/60"
              : "border-black/10 dark:border-white/15"
          }`}
        >
          <p className="text-xs uppercase tracking-wide text-black/50 dark:text-white/50">Player 2</p>
          <p className="text-2xl font-bold tabular-nums">{remaining.P2}</p>
        </div>
      </div>

      {phase === "playing" && (
        <form onSubmit={submitGuess} className="mb-6">
          <p className="text-sm text-black/60 dark:text-white/60 mb-2">
            {currentPlayer}&apos;s turn — name a player who fits:{" "}
            <span className="font-medium text-black dark:text-white">{category.label}</span>
          </p>

          <div className="flex gap-2 mb-3">
            <button
              type="button"
              onClick={() => setStat("appearances")}
              className={`rounded-md px-3 py-1.5 text-sm border ${
                stat === "appearances"
                  ? "border-black/60 dark:border-white/60 bg-black/5 dark:bg-white/10"
                  : "border-black/15 dark:border-white/20"
              }`}
            >
              Appearances
            </button>
            <button
              type="button"
              onClick={() => setStat("goals")}
              className={`rounded-md px-3 py-1.5 text-sm border ${
                stat === "goals"
                  ? "border-black/60 dark:border-white/60 bg-black/5 dark:bg-white/10"
                  : "border-black/15 dark:border-white/20"
              }`}
            >
              Goals
            </button>
          </div>

          <div className="flex gap-2">
            <PlayerNameInput value={guess} onChange={setGuess} excludeNames={usedNames} disabled={checking} />
            <button
              type="submit"
              disabled={checking}
              className="rounded-md bg-foreground text-background px-4 py-2 font-medium disabled:opacity-50"
            >
              Throw
            </button>
            <button
              type="button"
              onClick={skipTurn}
              disabled={checking}
              className="rounded-md border border-black/15 dark:border-white/20 px-4 py-2 font-medium disabled:opacity-50"
            >
              Skip
            </button>
          </div>
        </form>
      )}

      {feedback && phase === "playing" && (
        <p className="mb-6 text-sm rounded-md bg-black/5 dark:bg-white/10 px-3 py-2">{feedback}</p>
      )}

      {phase === "finished" && (
        <div className="mb-6 rounded-md border border-black/10 dark:border-white/15 p-4">
          <p className="font-semibold mb-2">
            {winner} checks out with {checkoutScore}! 🎯
          </p>
          <button
            onClick={playAgain}
            className="rounded-md border border-black/15 dark:border-white/20 px-3 py-1.5 text-sm"
          >
            Play again
          </button>
        </div>
      )}
    </div>
  );
}
