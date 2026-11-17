# Token Radar — token-radar-01

A token launch radar: reads the frozen DefiLlama snapshot and builds the watchlist of
protocols with TVL at or above the floor, no token, no version marker, and not a
wrapped/staked/bridged/parent product — then presents them in a sortable, filterable board.

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/syfa01/tr-01-akun00-syfa01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/syfa01/tr-01-akun00-syfa01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

## The radar

The board covers every slug on the snapshot's watchlist and adds pre-token protocols below
its floor and ones the house list leaves out. Ranks come from one model, `radar-3`, applied to
every protocol alike with no name special-cased:

    implied = round( tvl_usd × comparable × growth × maturity × breadth )

- `comparable` — the median `mcap_usd/tvl_usd` of the snapshot's token-bearing protocols in the
  protocol's own category, shrunk toward the whole-index median and held in a sane band.
- `growth` — `1 + clamp(change_7d, −60, 120)/100 × 0.6`.
- `maturity` — `0.55 + min(age_days, 1460)/1460 × 0.45`, age being the time since `listed_at`.
- `breadth` — a second, independent signal: `1 + 0.28 × log2(min(chains, 16))/log2(16)`.

The board separates pre-token protocols from the live-token ones it sets aside, and every row
carries a six-step farm plan with a cost and a time per step and a total cost/time summary.

## Run

    node ../token-radar-01-kit/cli/makefun.mjs check --kit ../token-radar-01-kit --repo .

Entry point: `main.ts`. Data: the frozen snapshot only.

Built for [make.fun](https://make.fun)'s bounty: Build the best token launch radar.
