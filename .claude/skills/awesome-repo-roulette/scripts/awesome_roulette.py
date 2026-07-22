#!/usr/bin/env python3
"""Pick a random repo from an "awesome" list, filtered by liveness metrics.

Two modes:

  stats  - fetch every repo linked from the list and print the median of each
           metric (use these as sensible default thresholds)
  pick   - pick N random repos that meet the thresholds

Metrics per candidate repo:
  stars                 - stargazer count
  open_issues           - open issues (pull requests excluded)
  merged_prs_per_week   - PRs merged in the last 4 weeks, divided by 4

Requires the `gh` CLI, authenticated (`gh auth status`).
"""

from __future__ import annotations

import argparse
import json
import math
import random
import re
import subprocess
import sys
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path

GITHUB_LINK = re.compile(
    r"https?://github\.com/([A-Za-z0-9._-]+)/([A-Za-z0-9._-]+)", re.IGNORECASE
)

# Paths under github.com that look like owner/repo but are not.
NOT_OWNERS = {
    "topics", "features", "about", "sponsors", "collections", "orgs",
    "settings", "marketplace", "explore", "apps", "site", "readme",
    "search", "login", "join", "pricing", "trending", "events", "users",
}

PR_WINDOW_WEEKS = 4


def gh(args: list[str], stdin: str | None = None) -> str:
    proc = subprocess.run(
        ["gh", *args],
        input=stdin,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    if proc.returncode != 0:
        raise RuntimeError(f"gh {' '.join(args)} failed:\n{proc.stderr.strip()}")
    return proc.stdout


def fetch_readme(repo: str) -> str:
    """Return the decoded README of `owner/name`."""
    return gh(["api", f"repos/{repo}/readme", "--jq", ".content"]).replace("\n", "")


def extract_repos(readme_b64: str, exclude: str) -> list[str]:
    import base64

    text = base64.b64decode(readme_b64).decode("utf-8", "replace")
    seen: dict[str, None] = {}
    for owner, name in GITHUB_LINK.findall(text):
        if owner.lower() in NOT_OWNERS:
            continue
        name = name.removesuffix(".git")
        if not name or name in {".", ".."}:
            continue
        slug = f"{owner}/{name}"
        if slug.lower() == exclude.lower():
            continue
        seen.setdefault(slug, None)
    return list(seen)


QUERY_FRAGMENT = """
  r%(i)d: repository(owner: %(owner)s, name: %(name)s) {
    nameWithOwner
    stargazerCount
    isArchived
    issues(states: OPEN) { totalCount }
    pullRequests(states: MERGED, first: %(prs)d, orderBy: {field: UPDATED_AT, direction: DESC}) {
      nodes { mergedAt }
    }
  }
"""

BATCH = 20
WORKERS = 10
PR_SAMPLE = 100


def _parse_repo(repo: dict, cutoff: datetime) -> dict:
    merged = sum(
        1
        for n in repo["pullRequests"]["nodes"]
        if n["mergedAt"]
        and datetime.fromisoformat(n["mergedAt"].replace("Z", "+00:00")) >= cutoff
    )
    return {
        "repo": repo["nameWithOwner"],
        "stars": repo["stargazerCount"],
        "archived": repo["isArchived"],
        "open_issues": repo["issues"]["totalCount"],
        "merged_prs_per_week": round(merged / PR_WINDOW_WEEKS, 2),
        "pr_sample_saturated": merged >= PR_SAMPLE,
    }


def _fetch_chunk(chunk: list[str], cutoff: datetime, skipped: list[str]) -> list[dict]:
    """Fetch one batch. A dead repo errors the whole query, so bisect on failure."""
    parts = []
    for i, slug in enumerate(chunk):
        owner, name = slug.split("/", 1)
        parts.append(
            QUERY_FRAGMENT
            % {
                "i": i,
                "owner": json.dumps(owner),
                "name": json.dumps(name),
                "prs": PR_SAMPLE,
            }
        )
    try:
        raw = gh(["api", "graphql", "-f", "query=" + "query {\n" + "".join(parts) + "\n}"])
    except RuntimeError:
        if len(chunk) == 1:
            skipped.append(chunk[0])
            return []
        mid = len(chunk) // 2
        return _fetch_chunk(chunk[:mid], cutoff, skipped) + _fetch_chunk(
            chunk[mid:], cutoff, skipped
        )
    payload = json.loads(raw)
    return [
        _parse_repo(repo, cutoff)
        for repo in (payload.get("data") or {}).values()
        if repo
    ]


def fetch_metrics(slugs: list[str], progress=None) -> tuple[list[dict], list[str]]:
    """Fetch metrics for every slug, running GraphQL batches concurrently."""
    cutoff = datetime.now(timezone.utc) - timedelta(weeks=PR_WINDOW_WEEKS)
    chunks = [slugs[i : i + BATCH] for i in range(0, len(slugs), BATCH)]
    out: list[dict] = []
    skipped: list[str] = []
    lock = threading.Lock()
    done = 0

    def run(chunk):
        nonlocal done
        rows = _fetch_chunk(chunk, cutoff, skipped)
        with lock:
            out.extend(rows)
            done += len(chunk)
            if progress:
                progress(done, len(slugs))

    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        list(pool.map(run, chunks))
    return out, skipped


def load_or_fetch(list_repo: str, cache: Path | None, refresh: bool) -> list[dict]:
    if cache and cache.exists() and not refresh:
        return json.loads(cache.read_text(encoding="utf-8"))["repos"]

    print(f"Reading {list_repo} README...", file=sys.stderr)
    slugs = extract_repos(fetch_readme(list_repo), exclude=list_repo)
    print(f"Found {len(slugs)} linked repos. Fetching metrics...", file=sys.stderr)

    def progress(done, total):
        print(f"  {done}/{total}", end="\r", file=sys.stderr)

    data, skipped = fetch_metrics(slugs, progress=progress)
    print(f"\nGot {len(data)} repos; skipped {len(skipped)} dead/renamed.", file=sys.stderr)
    if cache:
        cache.parent.mkdir(parents=True, exist_ok=True)
        cache.write_text(
            json.dumps(
                {
                    "list_repo": list_repo,
                    "fetched_at": datetime.now(timezone.utc).isoformat(),
                    "repos": data,
                },
                indent=1,
            ),
            encoding="utf-8",
        )
    return data


METRICS = ("stars", "open_issues", "merged_prs_per_week")


def percentile(values: list[float], pct: float) -> float:
    """Nearest-rank percentile. pct=50 is the median."""
    ordered = sorted(values)
    if not ordered:
        return 0
    rank = max(1, math.ceil(pct / 100 * len(ordered)))
    return ordered[min(rank, len(ordered)) - 1]


def thresholds_at(data: list[dict], pct: float) -> dict:
    return {m: percentile([d[m] for d in data], pct) for m in METRICS}


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        "--repo",
        default="avelino/awesome-go",
        help="the awesome-list repo to draw from (default: avelino/awesome-go)",
    )
    p.add_argument(
        "--percentile",
        type=float,
        default=50,
        help="derive every threshold from this percentile of the list itself "
        "(default: 50, the median). 70 or 80 gives a pickier draw.",
    )
    p.add_argument(
        "--min-stars",
        type=float,
        help="override the percentile-derived star floor",
    )
    p.add_argument(
        "--min-open-issues",
        type=float,
        help="override the percentile-derived open-issue floor",
    )
    p.add_argument(
        "--min-merged-prs-per-week",
        type=float,
        help="override the percentile-derived merged-PR rate floor",
    )
    p.add_argument("--count", type=int, default=1, help="how many repos to pick")
    p.add_argument(
        "--include-archived", action="store_true", help="allow archived repos"
    )
    p.add_argument(
        "--stats",
        action="store_true",
        help="print the metric distribution and exit without picking",
    )
    p.add_argument("--cache", type=Path, help="JSON cache file for fetched metrics")
    p.add_argument("--refresh", action="store_true", help="ignore an existing cache")
    p.add_argument("--seed", type=int, help="seed for a reproducible pick")
    p.add_argument("--json", action="store_true", help="machine-readable output")
    args = p.parse_args()

    data = load_or_fetch(args.repo, args.cache, args.refresh)
    if not data:
        print("No repos found.", file=sys.stderr)
        return 1

    # Archived repos would drag every percentile down, so cut them before
    # deriving thresholds as well as before picking.
    if not args.include_archived:
        data = [d for d in data if not d["archived"]]

    if args.stats:
        table = {
            f"p{int(pct)}": thresholds_at(data, pct)
            for pct in (10, 25, 50, 70, 75, 80, 90, 95)
        }
        if args.json:
            print(
                json.dumps(
                    {"list_repo": args.repo, "sampled": len(data), "percentiles": table},
                    indent=2,
                )
            )
        else:
            print(f"{args.repo}: {len(data)} repos sampled")
            print(f"  {'pct':>5}  {'stars':>8}  {'open issues':>12}  {'PRs/week':>9}")
            for label, t in table.items():
                print(
                    f"  {label:>5}  {t['stars']:>8g}  {t['open_issues']:>12g}"
                    f"  {t['merged_prs_per_week']:>9g}"
                )
        return 0

    derived = thresholds_at(data, args.percentile)
    overrides = {
        "stars": args.min_stars,
        "open_issues": args.min_open_issues,
        "merged_prs_per_week": args.min_merged_prs_per_week,
    }
    limits = {m: derived[m] if overrides[m] is None else overrides[m] for m in METRICS}

    pool = [
        d for d in data if all(d[m] >= limits[m] for m in METRICS)
    ]
    if not pool:
        print("No repo meets those thresholds.", file=sys.stderr)
        return 1

    rng = random.Random(args.seed)
    picks = rng.sample(pool, min(args.count, len(pool)))
    if args.json:
        print(
            json.dumps(
                {
                    "percentile": args.percentile,
                    "thresholds": limits,
                    "overridden": [m for m in METRICS if overrides[m] is not None],
                    "pool_size": len(pool),
                    "picks": picks,
                },
                indent=2,
            )
        )
    else:
        parts = [
            f"{m.replace('_', ' ')} >= {limits[m]:g}"
            + ("" if overrides[m] is None else " (override)")
            for m in METRICS
        ]
        print(f"p{args.percentile:g} thresholds: " + ", ".join(parts))
        print(f"{len(pool)}/{len(data)} repos qualify. Picked:")
        for d in picks:
            print(
                f"  https://github.com/{d['repo']}"
                f"  ({d['stars']} stars, {d['open_issues']} open issues, "
                f"{d['merged_prs_per_week']} merged PRs/week)"
            )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
