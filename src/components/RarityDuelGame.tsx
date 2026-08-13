"use client";

import { useEffect, useState } from "react";
import type { Grid } from "@/lib/rarity-duel";
import PlayerNameInput from "@/components/PlayerNameInput";

type Owner = "P1" | "P2";
type Square = { playerName: string; tier: number; owner: Owner } | null;

const DEFAULT_TIME_LIMIT = 30;
const TIER_COUNT = 5;

// Standard tic-tac-toe lines over a flattened 0-8 grid (row-major).
const LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

function hasWinningLine(squares: Square[], owner: Owner): boolean {
  const owned = new Set(squares.map((s, i) => (s?.owner === owner ? i : -1)).filter((i) => i >= 0));
  return LINES.some((line) => line.every((i) => owned.has(i)));
}

export default function RarityDuelGame({ grid }: { grid: Grid }) {
  const [phase, setPhase] = useState<"setup" | "playing" | "finished">("setup");
  const [timeLimit, setTimeLimit] = useState(DEFAULT_TIME_LIMIT);

  const [squares, setSquares] = useState<Square[]>(Array(9).fill(null));
  const [currentPlayer, setCurrentPlayer] = useState<Owner>("P1");
  const [winner, setWinner] = useState<Owner | "draw" | null>(null);

  const [selected, setSelected] = useState<{ row: number; col: number } | null>(null);
  const [guess, setGuess] = useState("");
  const [checking, setChecking] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Countdown while a square is being attempted.
  useEffect(() => {
    if (selected === null || timeRemaining === null) return;
    if (timeRemaining <= 0) {
      resolveTurn(false);
      return;
    }
    const timer = setTimeout(() => setTimeRemaining((t) => (t === null ? null : t - 1)), 1000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, timeRemaining]);

  function selectSquare(row: number, col: number) {
    if (phase !== "playing" || checking) return;
    const square = squares[row * 3 + col];
    if (square && (square.owner === currentPlayer || square.tier >= TIER_COUNT)) return;
    setSelected({ row, col });
    setGuess("");
    setTimeRemaining(timeLimit);
    setFeedback(null);
  }

  function resolveTurn(claimed: boolean, playerName?: string, tier?: number) {
    if (!selected) return;
    const index = selected.row * 3 + selected.col;
    const existing = squares[index];

    if (claimed && playerName !== undefined && tier !== undefined) {
      const next = [...squares];
      next[index] = { playerName, tier, owner: currentPlayer };
      setSquares(next);
      setFeedback(`${playerName} (tier ${tier}) claimed by ${currentPlayer}`);

      if (hasWinningLine(next, currentPlayer)) {
        setWinner(currentPlayer);
        setPhase("finished");
      } else if (next.every((s) => s !== null)) {
        setWinner("draw");
        setPhase("finished");
      } else {
        setCurrentPlayer(currentPlayer === "P1" ? "P2" : "P1");
      }
    } else {
      setFeedback(
        existing ? "Steal failed — not a rarer answer. Turn wasted." : "No valid answer found. Turn wasted."
      );
      setCurrentPlayer(currentPlayer === "P1" ? "P2" : "P1");
    }

    setSelected(null);
    setGuess("");
    setTimeRemaining(null);
  }

  async function submitGuess(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || checking || !guess.trim()) return;
    setChecking(true);
    try {
      const res = await fetch("/api/rarity-duel/guess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guess, row: grid.rows[selected.row], col: grid.cols[selected.col] }),
      });
      const result = (await res.json()) as { valid: boolean; playerName?: string; tier?: number };

      const existing = squares[selected.row * 3 + selected.col];
      const isClaimable = !existing;
      const isSuccessfulSteal =
        existing && result.valid && result.tier !== undefined && result.tier > existing.tier;

      if (result.valid && (isClaimable || isSuccessfulSteal)) {
        resolveTurn(true, result.playerName, result.tier);
      } else {
        resolveTurn(false);
      }
    } catch {
      resolveTurn(false);
    } finally {
      setChecking(false);
    }
  }

  function skipTurn() {
    if (!selected || checking) return;
    resolveTurn(false);
  }

  function playAgain() {
    window.location.reload();
  }

  if (phase === "setup") {
    return (
      <div className="max-w-xl mx-auto px-4 py-10">
        <h1 className="text-2xl font-bold mb-1">Rarity Duel</h1>
        <p className="text-sm text-black/60 dark:text-white/60 mb-6">
          Head-to-head. Claim a square by naming a player who fits both its row and column.
          Steal an opponent&apos;s square by naming someone with a rarer answer. Get 3 in a
          row to win — but nothing&apos;s safe until it hits tier 5.
        </p>
        <label className="block text-sm font-medium mb-2" htmlFor="time-limit">
          Seconds per guess
        </label>
        <div className="flex gap-2 mb-6">
          <input
            id="time-limit"
            type="number"
            min={5}
            max={300}
            value={timeLimit}
            onChange={(e) => setTimeLimit(Math.max(5, Number(e.target.value) || DEFAULT_TIME_LIMIT))}
            className="w-24 rounded-md border border-black/15 dark:border-white/20 bg-transparent px-3 py-2 outline-none focus:border-black/40 dark:focus:border-white/40"
          />
          <button
            onClick={() => setPhase("playing")}
            className="rounded-md bg-foreground text-background px-4 py-2 font-medium"
          >
            Start Game
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold mb-1">Rarity Duel</h1>

      {phase === "playing" && (
        <p className="text-sm text-black/60 dark:text-white/60 mb-6">
          {selected ? `${currentPlayer}, name your answer` : `${currentPlayer}'s turn — pick a square`}
        </p>
      )}

      <div className="mb-6 overflow-x-auto">
        <div className="grid grid-cols-4 gap-1 min-w-[480px]">
          <div />
          {grid.cols.map((col, c) => (
            <div key={c} className="text-xs text-center font-medium px-2 py-2 flex items-center justify-center">
              {col.label}
            </div>
          ))}

          {grid.rows.map((row, r) => (
            <div key={r} className="contents">
              <div className="text-xs text-right font-medium px-2 py-2 flex items-center justify-end">
                {row.label}
              </div>
              {grid.cols.map((_, c) => {
                const index = r * 3 + c;
                const square = squares[index];
                const isSelected = selected?.row === r && selected?.col === c;
                const selectable =
                  phase === "playing" &&
                  !checking &&
                  !selected &&
                  !(square && (square.owner === currentPlayer || square.tier >= TIER_COUNT));

                return (
                  <button
                    key={c}
                    type="button"
                    disabled={!selectable}
                    onClick={() => selectSquare(r, c)}
                    className={`aspect-square rounded-md border p-1 text-[11px] leading-tight flex flex-col items-center justify-center text-center transition-colors ${
                      isSelected
                        ? "border-black/60 dark:border-white/60"
                        : "border-black/10 dark:border-white/15"
                    } ${
                      square?.owner === "P1"
                        ? "bg-blue-500/15"
                        : square?.owner === "P2"
                          ? "bg-red-500/15"
                          : ""
                    } ${selectable ? "cursor-pointer hover:border-black/40 dark:hover:border-white/40" : "cursor-default"}`}
                  >
                    {square ? (
                      <>
                        <span className="font-medium">{square.playerName}</span>
                        <span className="text-black/50 dark:text-white/50">
                          {square.owner} · tier {square.tier}
                          {square.tier >= TIER_COUNT ? " 🔒" : ""}
                        </span>
                      </>
                    ) : (
                      <span className="text-black/30 dark:text-white/30">—</span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {phase === "playing" && selected && (
        <form onSubmit={submitGuess} className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-black/60 dark:text-white/60">
              {grid.rows[selected.row].label} × {grid.cols[selected.col].label}
            </span>
            {timeRemaining !== null && (
              <span className="text-sm font-medium tabular-nums">{timeRemaining}s</span>
            )}
          </div>
          <div className="flex gap-2">
            <PlayerNameInput value={guess} onChange={setGuess} excludeNames={[]} disabled={checking} />
            <button
              type="submit"
              disabled={checking}
              className="rounded-md bg-foreground text-background px-4 py-2 font-medium disabled:opacity-50"
            >
              Guess
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

      {feedback && phase === "playing" && !selected && (
        <p className="mb-6 text-sm rounded-md bg-black/5 dark:bg-white/10 px-3 py-2">{feedback}</p>
      )}

      {phase === "finished" && (
        <div className="mb-6 rounded-md border border-black/10 dark:border-white/15 p-4">
          <p className="font-semibold mb-2">
            {winner === "draw" ? "It's a draw!" : `${winner} wins! 🎉`}
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
