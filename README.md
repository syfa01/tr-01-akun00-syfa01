# Token Radar — token-radar-01

A token launch radar: reads the frozen DefiLlama snapshot and builds the watchlist of
protocols with TVL at or above the floor, no token, no version marker, and not a
wrapped/staked/bridged/parent product — then presents them in a sortable, filterable board.

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/syfa01/tr-01-akun00-syfa01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/syfa01/tr-01-akun00-syfa01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

## Run

    node ../token-radar-01-kit/cli/makefun.mjs check --kit ../token-radar-01-kit --repo .

Entry point: `main.ts`. Data: the frozen snapshot only.

Built for [make.fun](https://make.fun)'s bounty: Build the best token launch radar.
