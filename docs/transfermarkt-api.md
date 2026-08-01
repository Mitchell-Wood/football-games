# transfermarkt-api (data source)

Player data can come from
[felipeall/transfermarkt-api](https://github.com/felipeall/transfermarkt-api),
a self-hosted FastAPI service that scrapes Transfermarkt. It is not a hosted
API — you have to run it yourself.

By default this repo uses a small hardcoded dataset (`src/data/players.ts`)
so the games are playable without any setup. Setting `DATA_SOURCE=transfermarkt`
switches to live data from a running transfermarkt-api instance instead (see
below).

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed
  and running.

## Run it locally

The upstream repo doesn't ship a `docker-compose.yml` — build and run the
image directly:

```bash
git clone https://github.com/felipeall/transfermarkt-api.git .transfermarkt-api
cd .transfermarkt-api
docker build -t transfermarkt-api .
docker run -d -p 8000:8000 --name transfermarkt-api transfermarkt-api
```

(`.transfermarkt-api/` at the repo root is gitignored, so this is a
convenient place to clone it into without polluting this repo.)

The API will be available at `http://localhost:8000`, with interactive docs
at `http://localhost:8000/docs`.

Useful endpoints for Career Path:

- `GET /players/search/{name}` — find a player by name (used for guess
  suggestions — see `src/app/api/players/search/route.ts`).
- `GET /players/{id}/profile` — player bio/nationality.
- `GET /players/{id}/transfers` — full transfer history (club-by-club career
  path), which is the core data this game needs.
- `GET /competitions/{id}/clubs` — clubs in a competition, e.g. `GB1`
  (Premier League).
- `GET /clubs/{id}/players?season_id={year}` — a club's squad for a given
  season (omit `season_id` for the current one). Historical seasons include
  retired players, tagged `currentClub: "Retired"`, with their market value
  as of that season.
- `GET /players/{id}/achievements` — a player's trophies/awards, each with
  a `count`. Used as the fame proxy for seasons where market value doesn't
  exist (see below), and also fetched for the final answer itself to power
  the in-game "bonus clue" (see below) — unlike market value, this goes
  back decades.
- `GET /players/{id}/stats` — **currently broken.** It's meant to return
  per-competition/season appearances, goals, assists etc., but returns an
  empty list for every player tested (Haaland, Llorente, an old legend, even
  an invalid ID). The scraper looks for `<table class="items">` on
  Transfermarkt's stats page, which no longer exists there — the page is
  apparently JS-rendered now and the static HTML this scraper fetches has no
  `<table>` at all. Not fixable without patching the scraper's XPath/parsing
  logic (out of scope here). This is why `careerPath` stops don't show
  appearances/goals.

Note: Transfermarkt sits behind Cloudflare and occasionally returns a
transient `502`/`503` to the scraper. A retry a few seconds later usually
works; this isn't a Docker or networking problem on our end.

## Wiring it into this app

Player data flows through `src/lib/data-source.ts`. The game only calls
`fetchRandomPlayer()` — it never imports the mock dataset directly.

`data-source.ts` already implements the live path: when `DATA_SOURCE=transfermarkt`
is set, `fetchRandomPlayer()` first picks a random *season* between 1980
(`OLDEST_SEASON_YEAR`) and the current year, then branches on it:

**2004 onward** (`MARKET_VALUE_SEASON_YEAR`) — roughly when Transfermarkt's
market-value data starts existing at all:

1. a random competition from the big five leagues
   (`src/lib/transfermarkt.ts` → `TOP_LEAGUE_COMPETITION_IDS`: Premier
   League `GB1`, LaLiga `ES1`, Serie A `IT1`, Bundesliga `L1`, Ligue 1
   `FR1`), scoped to that season (so a club that's since been
   promoted/relegated is only in the pool for seasons it actually played);
2. a random club in it;
3. from that club's squad that season, a random player among the **top 15
   by market value at the time** (`GUESSABLE_SQUAD_SIZE`) — a full squad is
   ~25-40 names including fringe/reserve players nobody would recognise,
   and market value ranked *within* the squad is an era-robust "was a
   first-team regular" proxy (avoids the trap of a fixed cutoff — €30m was
   a superstar in 2007, a squad player today).

**Before 2004** — no market-value data exists to rank by (verified: even
the dedicated `/players/{id}/market_value` endpoint returns an empty
history for a player whose career predates this). Trophy count
(`/players/{id}/achievements`) is the fallback proxy instead, but it only
works if the club itself was competitive that season — a fringe player at
a mid-table club scores 0 same as everyone else on that roster, so "most
decorated of a random sample" can still land on a nobody. So for these
seasons, club selection is restricted to `HISTORICAL_POWERHOUSE_CLUBS` — a
short hardcoded list of ~15 clubs (Man Utd, Liverpool, Arsenal, Real
Madrid, Barcelona, Bayern, AC Milan, Juventus, etc.) that were realistically
title-contending across most of the last ~45 years — instead of any
current big-five club. Then: probe a random sample of 6 squad members'
achievement counts, and draw from the top 3.

If any step comes back empty the whole pick is retried (up to 5 attempts)
with fresh random choices. Competition→clubs and club→squad lookups are
cached in memory per server process, keyed by season, since neither changes
within a session; achievement scores are cached per player. If live
selection fails entirely, it falls back to a random pick from the mock
dataset rather than breaking the page.

Guess suggestions (the autocomplete dropdown) are separate: they search
Transfermarkt's full player database via `/players/search/{name}` — not
restricted to the five leagues above — so you can type any player's name
while guessing, even if they're never the actual answer.

The game grants one guess per `careerPath` stop plus a bonus guess
(`src/components/CareerPathGame.tsx` → `maxGuesses`). Once every stop has
been shown, that bonus round doesn't reveal a new club — there isn't one —
it instead shows the answer's nationality and, if fetched, their
`achievements` (trophy titles + counts) as a final clue. `fetchPlayerDetails`
in `data-source.ts` fetches achievements for every live answer, not just
the pre-2004 candidate-filtering step; the mock dataset has no achievements
data, so the bonus round for mock players just shows nationality.

Retired players' final `careerPath` stop is literally the club name
"Retired" (Transfermarkt's own pseudo-transfer marking career end) — this
is left in deliberately, so it reads like one more entry in their career
list rather than being filtered out.

To enable it locally, create `.env.local`:

```
DATA_SOURCE=transfermarkt
TRANSFERMARKT_API_URL=http://localhost:8000
```

Known limitations:

- Pre-2004 seasons only draw from the 15 curated powerhouse clubs, not the
  full big-five pool — a legend who spent that era at a club outside that
  list won't come up.
- The answer pool only reaches back to 1980 (`OLDEST_SEASON_YEAR`).
- Loan spells aren't distinguished from permanent transfers in `careerPath`.
- No appearances/goals per club stop — the upstream `/players/{id}/stats`
  endpoint is broken (see above).
- Both fame filters are proxies, not guarantees — a very young player who
  was already valuable, or a fringe player who happened to be on a
  trophy-winning squad, can still slip in with a short or unremarkable
  career path.
