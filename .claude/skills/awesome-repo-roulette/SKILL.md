---
name: awesome-repo-roulette
description: Pick a random repo from an awesome-list (default avelino/awesome-go), filtered by minimum stars, minimum open issues, and minimum PRs merged per week over the last 4 weeks. Thresholds default to a percentile of the list itself. Use when the user wants a random Go/other project to explore or contribute to, or wants the activity distribution for a curated list.
---

# Awesome repo roulette

Draws a random repository out of a curated "awesome" list, keeping only repos
that are actually alive: enough stars, enough open issues to work on, and a real
rate of merged pull requests.

Thresholds are relative to the list, not hardcoded. By default every floor is the
**median (p50)** of the list's own distribution. Raise `--percentile` to get a
pickier draw, or override any single metric.

## Parameters

| Parameter | Flag | Default | Meaning |
|---|---|---|---|
| List repo | `--repo owner/name` | `avelino/awesome-go` | Which awesome-list to draw from. Any list whose README links to GitHub repos works. |
| Percentile | `--percentile P` | `50` | Derives all three floors from this percentile of the list. 70/80/90 = progressively pickier. |
| Minimum stars | `--min-stars N` | percentile | Stargazer floor. |
| Minimum open issues | `--min-open-issues N` | percentile | Open issues, pull requests excluded. |
| Minimum merged PRs per week | `--min-merged-prs-per-week N` | percentile | PRs merged in the last 4 weeks divided by 4. |

Any `--min-*` flag overrides just that metric; the rest still come from
`--percentile`. Output labels overridden metrics so it's clear what applied.

Extras: `--count` (pick more than one), `--include-archived`, `--seed` (reproducible
pick), `--json`, `--stats`, `--cache FILE`, `--refresh`.

## How to run it

Requires the `gh` CLI, authenticated. A full crawl of awesome-go is roughly
2,800 repos and takes about three minutes, so always pass `--cache` and reuse it.

The script lives in this repo at
`.claude/skills/awesome-repo-roulette/scripts/awesome_roulette.py`, so run it from
the repo root.

```bash
S=.claude/skills/awesome-repo-roulette/scripts/awesome_roulette.py

# Median thresholds, one pick (the default)
python $S --cache .cache/awesome-go.json

# Pickier
python $S --cache .cache/awesome-go.json --percentile 80 --count 3

# p70 for stars and issues, but demand real PR throughput
python $S --cache .cache/awesome-go.json --percentile 70 --min-merged-prs-per-week 2

# See the whole distribution before choosing a percentile
python $S --cache .cache/awesome-go.json --stats
```

`.cache` is already gitignored, so the crawl snapshot stays out of version control.

## Guidance

- The three floors are ANDed, so the qualifying pool shrinks much faster than the
  percentile suggests. On awesome-go, p50 leaves 42% of repos and p80 leaves 7%.
  Run `--stats` if the user wants to aim at a pool size.
- Curated lists have long dead tails. On awesome-go only 22% of repos merged a
  single PR in the last four weeks, so `merged_prs_per_week` sits at 0 for every
  percentile below about 78. If the user wants repos that are actually moving,
  say so and either go to `--percentile 80`+ or override
  `--min-merged-prs-per-week` directly.
- Archived repos are excluded from both the percentile calculation and the draw
  unless `--include-archived` is passed.
- The cache is a plain JSON snapshot. Filtering and picking read only the cache,
  so re-rolling at a different percentile is instant. Pass `--refresh` when the
  data is a week or more old.
- The crawl fetches repos in GraphQL batches of 20 across 10 threads. One dead or
  renamed repo fails its whole batch, so a failed batch bisects down to the
  culprit and reports how many it had to skip. A handful of skips is normal.
- Merged PR counts come from the last 100 merged PRs per repo ordered by update
  time. A repo merging more than 100 PRs in four weeks gets a floor rather than
  an exact rate (`pr_sample_saturated` marks these in the cache), so don't
  present those numbers as exact.
