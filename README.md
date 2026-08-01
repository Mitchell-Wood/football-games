# Football Games

A hub of daily football guessing games, inspired by
[playfootball.games](https://playfootball.games/). Built with Next.js
(App Router) + TypeScript + Tailwind CSS.

## Games

- **Career Path** (`/career-path`) — guess the player from their club
  career, revealed one stop at a time. Currently playing off a small
  hardcoded dataset in `src/data/players.ts`; see
  [`docs/transfermarkt-api.md`](docs/transfermarkt-api.md) for the plan to
  swap in real data from
  [transfermarkt-api](https://github.com/felipeall/transfermarkt-api).

More games coming later.

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Project structure

```
src/
  app/                # routes (App Router)
    page.tsx           # game hub / homepage
    career-path/        # Career Path game route
  components/          # game UI components
  data/                # placeholder/mock datasets
  lib/
    types.ts            # shared data types (Player, CareerStop)
    data-source.ts       # the seam between game code and player data —
                          # swap the mock dataset for a live API here
docs/
  transfermarkt-api.md  # how to run transfermarkt-api and wire it in
```

## Data source

Real player data is meant to come from a self-hosted instance of
[transfermarkt-api](https://github.com/felipeall/transfermarkt-api) (a
FastAPI service that scrapes Transfermarkt — it's not a hosted API, you run
it yourself, e.g. via Docker). See
[`docs/transfermarkt-api.md`](docs/transfermarkt-api.md) for setup and how
it plugs into `src/lib/data-source.ts`.

## Deploy

Deploys cleanly to [Vercel](https://vercel.com/new) like any Next.js app.
