import type { CareerStop, Player, PhotoPlayer } from "@/lib/types";
import { players as mockPlayers } from "@/data/players";
import { photoPlayers as mockPhotoPlayers } from "@/data/photo-players";
import { topPlayers } from "@/data/top-players";
import { API_BASE_URL, USE_LIVE_DATA, getPlayerAchievements } from "@/lib/transfermarkt";
import { findWikipediaTitle } from "@/lib/wikidata";
import { fetchWikipediaSeniorCareer, type InfoboxStint } from "@/lib/wikipedia";
import { foldDiacritics } from "@/lib/text-match";

/**
 * Single seam between game logic and player data. Every game should read
 * the daily answer through fetchRandomPlayer() rather than importing the
 * mock dataset directly, so the mock dataset can be swapped for a live
 * transfermarkt-api-backed source later without touching game code.
 *
 * Set DATA_SOURCE=transfermarkt (and optionally TRANSFERMARKT_API_URL,
 * default http://localhost:8000) to pick a random player from
 * src/data/top-players.json — see docs/transfermarkt-api.md for how that
 * list was built and why (squad-sampling by market value let through
 * plenty of valuable-but-obscure players).
 */

type TransfermarktProfile = {
  id: string;
  name: string;
  description: string;
  citizenship?: string[];
  imageUrl?: string;
};

type TransfermarktTransfer = {
  clubTo: { name: string };
  date: string;
};

type TransfermarktTransfers = {
  transfers: TransfermarktTransfer[];
};

type CareerPathDraft = {
  club: string;
  seasons: string;
  startYear: number;
  endYear: number | null;
};

function seasonLabel(startYear: number, endYear: number | null) {
  if (endYear === null) return `${startYear}–`;
  if (endYear === startYear) return `${startYear}`;
  return `${startYear}–${endYear}`;
}

function buildCareerPath(transfers: TransfermarktTransfer[]): CareerPathDraft[] {
  // API returns most-recent-first; oldest-first makes the stint math easier.
  const chronological = [...transfers].reverse();
  return chronological.map((transfer, i) => {
    const startYear = new Date(transfer.date).getFullYear();
    const next = chronological[i + 1];
    const endYear = next ? new Date(next.date).getFullYear() : null;
    return { club: transfer.clubTo.name, startYear, endYear, seasons: seasonLabel(startYear, endYear) };
  });
}

// transfermarkt-api's profile.dateOfBirth field is broken (comes back
// missing for every player tested), but the free-text description always
// has it in "* DD/MM/YYYY in City, Country" form.
function extractDob(description: string): string | null {
  const match = description.match(/\*\s*(\d{2})\/(\d{2})\/(\d{4})/);
  if (!match) return null;
  const [, day, month, year] = match;
  return `${year}-${month}-${day}`;
}

function overlapYears(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart) + 1);
}

// Pure organizational suffixes that appear across huge numbers of unrelated
// clubs — kept out of the token set so e.g. "CD" doesn't bridge two
// completely different Spanish clubs.
const CLUB_NAME_STOPWORDS = new Set(["fc", "cf", "sc", "ac", "afc", "cd", "ud", "sd", "ss"]);

function significantTokens(name: string): string[] {
  return foldDiacritics(name.toLowerCase())
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !CLUB_NAME_STOPWORDS.has(t));
}

// Loose on purpose (prefix match on the shorter token, not exact equality)
// so "Barça"/"Barcelona" or "Man"/"Manchester" style abbreviations still
// match, while nothing at all in common (e.g. two unrelated club names)
// correctly doesn't.
function tokensSimilar(a: string, b: string): boolean {
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  const prefix = shorter.slice(0, 4);
  return longer.startsWith(prefix);
}

function namesLikelyMatch(a: string, b: string): boolean {
  const tokensA = significantTokens(a);
  const tokensB = significantTokens(b);
  return tokensA.some((ta) => tokensB.some((tb) => tokensSimilar(ta, tb)));
}

// Attaches Wikidata appearances/goals to whichever careerPath stop overlaps
// a stint the most, in years — restricted to stints whose club name is at
// least plausibly the same club, requiring a clear single best match (no
// tie), AND requiring the overlap to cover at least half of the stop's own
// duration. All three checks earned their place from real bugs found while
// testing against Messi's actual career:
//   - name check: without it, his Newell's Old Boys youth-team stats (176
//     apps / 234 goals, genuinely his — as a child) matched his separate
//     Barça youth spell, purely because the date ranges shared one calendar
//     year at a transfer boundary.
//   - duration-coverage check: without it, that same kind of 1-year
//     boundary overlap matched his 16-year senior Barcelona career (2005-
//     2021) to Barcelona's reserve team (Barça Atlètic), showing ~22 apps
//     for a stint that should show ~778 — a single stray year of overlap
//     was "the best score" simply because nothing else overlapped at all.
// Attaching stats to the wrong stop is a confidently wrong answer, not just
// a missing one, so all three have to pass.
function attachClubStats(draft: CareerPathDraft[], stints: InfoboxStint[]): CareerStop[] {
  const currentYear = new Date().getFullYear();
  return draft.map(({ club, seasons, startYear, endYear }) => {
    const stopEnd = endYear ?? currentYear;
    const minRequiredOverlap = Math.ceil((stopEnd - startYear + 1) / 2);
    let best: InfoboxStint | null = null;
    let bestScore = 0;
    let secondBestScore = 0;
    for (const stint of stints) {
      if (!namesLikelyMatch(club, stint.club)) continue;
      const stintEnd = stint.endYear ?? currentYear;
      const score = overlapYears(startYear, stopEnd, stint.startYear, stintEnd);
      if (score > bestScore) {
        secondBestScore = bestScore;
        bestScore = score;
        best = stint;
      } else if (score > secondBestScore) {
        secondBestScore = score;
      }
    }
    if (best && bestScore >= minRequiredOverlap && bestScore > secondBestScore) {
      return { club, seasons, appearances: best.appearances, goals: best.goals };
    }
    return { club, seasons };
  });
}

type CareerStintsResult = { title: string | null; stints: InfoboxStint[] };

const careerStintsCache = new Map<string, Promise<CareerStintsResult>>();

async function lookupCareerStints(name: string, dob: string): Promise<CareerStintsResult> {
  const title = await findWikipediaTitle(name, dob);
  if (!title) return { title: null, stints: [] };
  const stints = await fetchWikipediaSeniorCareer(title);
  return { title, stints };
}

function cachedCareerStints(name: string, dob: string): Promise<CareerStintsResult> {
  const key = `${name}:${dob}`;
  let cached = careerStintsCache.get(key);
  if (!cached) {
    cached = lookupCareerStints(name, dob);
    careerStintsCache.set(key, cached);
  }
  // A failed lookup is not cached — it's usually a transient network hiccup
  // (same Cloudflare flakiness noted elsewhere in this file), and caching
  // it would turn one bad request into a permanent miss for this player on
  // this server process until the next redeploy.
  return cached.catch((err) => {
    careerStintsCache.delete(key);
    console.error(`Wikipedia career-stats lookup failed for "${name}" (${dob}):`, err);
    return { title: null, stints: [] };
  });
}

async function fetchPlayerDetails(id: string): Promise<Player | null> {
  const [profileRes, transfersRes, achievements] = await Promise.all([
    fetch(`${API_BASE_URL}/players/${id}/profile`),
    fetch(`${API_BASE_URL}/players/${id}/transfers`),
    getPlayerAchievements(id).catch((err) => {
      console.error(`Achievements fetch failed for player ${id}:`, err);
      return [];
    }),
  ]);
  if (!profileRes.ok || !transfersRes.ok) return null;

  const profile = (await profileRes.json()) as TransfermarktProfile;
  const transfers = (await transfersRes.json()) as TransfermarktTransfers;
  const draft = buildCareerPath(transfers.transfers);
  if (draft.length === 0) return null;

  const dob = extractDob(profile.description);
  const result = dob ? await cachedCareerStints(profile.name, dob) : { title: null, stints: [] };
  const careerPath = result.stints.length > 0 ? attachClubStats(draft, result.stints) : draft;

  return {
    id: profile.id,
    name: profile.name,
    nationality: profile.citizenship?.[0] ?? "Unknown",
    careerPath,
    achievements,
  };
}

function pickRandom<T>(items: T[]): T | undefined {
  if (items.length === 0) return undefined;
  return items[Math.floor(Math.random() * items.length)];
}

const MAX_RANDOM_ATTEMPTS = 5;

// The answer pool is a pre-vetted list of ~500 footballers ranked by real
// notability (Wikidata sitelink count — how many different-language
// Wikipedia articles exist about them — verified to have an actual club
// career, cross-checked against transfermarkt-api). See
// docs/transfermarkt-api.md for how it was built and why: squad-based
// sampling (rank a club's current squad by market value) let through
// players who are good enough to be valuable without being recognisable,
// since that's relative to their own squad, not to football fame generally.
async function fetchRandomLivePlayer(): Promise<Player | null> {
  for (let attempt = 0; attempt < MAX_RANDOM_ATTEMPTS; attempt++) {
    const candidate = pickRandom(topPlayers);
    if (!candidate) return null;
    try {
      const player = await fetchPlayerDetails(candidate.id);
      if (player) return player;
    } catch (err) {
      // fetchPlayerDetails only guards against non-ok HTTP responses, not
      // network-level failures (connection refused, DNS, timeout) — those
      // throw. A previous version of this function had that covered
      // incidentally, via try/catch further up a now-removed squad-browsing
      // layer; this is the direct replacement now that nothing upstream
      // catches it.
      console.error(`fetchPlayerDetails failed for player ${candidate.id}:`, err);
    }
  }
  return null;
}

export async function fetchRandomPlayer(): Promise<Player> {
  if (USE_LIVE_DATA) {
    const live = await fetchRandomLivePlayer();
    if (live) return live;
  }
  return mockPlayers[Math.floor(Math.random() * mockPlayers.length)];
}

// Guess the Player (photo) needs far less than Career Path — no transfer
// history, no Wikipedia stats, no achievements — so this fetches just the
// profile, straight from the same curated fame-ranked pool.
async function fetchPlayerPhoto(id: string): Promise<PhotoPlayer | null> {
  const res = await fetch(`${API_BASE_URL}/players/${id}/profile`);
  if (!res.ok) return null;
  const profile = (await res.json()) as TransfermarktProfile;
  if (!profile.imageUrl) return null;
  return {
    id: profile.id,
    name: profile.name,
    nationality: profile.citizenship?.[0] ?? "Unknown",
    imageUrl: profile.imageUrl,
  };
}

async function fetchRandomLivePlayerPhoto(): Promise<PhotoPlayer | null> {
  for (let attempt = 0; attempt < MAX_RANDOM_ATTEMPTS; attempt++) {
    const candidate = pickRandom(topPlayers);
    if (!candidate) return null;
    try {
      const player = await fetchPlayerPhoto(candidate.id);
      if (player) return player;
    } catch (err) {
      console.error(`fetchPlayerPhoto failed for player ${candidate.id}:`, err);
    }
  }
  return null;
}

export async function fetchRandomPlayerPhoto(): Promise<PhotoPlayer> {
  if (USE_LIVE_DATA) {
    const live = await fetchRandomLivePlayerPhoto();
    if (live) return live;
  }
  return mockPhotoPlayers[Math.floor(Math.random() * mockPhotoPlayers.length)];
}
