#!/usr/bin/env python3
"""Render the iCxin profile stats panel (assets/stats-dark.svg, assets/stats-light.svg).

The panel is a 1600x300 instrument readout with three zones:
  (a) big numbers      PUBLIC REPOS / STARS / COMMITS (90d)
  (b) language mix     stacked byte bar + 4 legend rows
  (c) 90-day activity  90 daily contribution bars with month marks

Design contract: _gh/DESIGN.md "Stats panel" (palette tokens only, mono type,
20px intrinsic minimum, geometry identical across themes, no external refs).

Data:
  live   REST /users/<login>, /users/<login>/repos?type=owner, per-repo
         /languages, plus GraphQL contributionsCollection (90-day window).
  local  --input <json> renders from a committed/checked-in snapshot instead.

Python 3 standard library only. Output is deterministic for a given snapshot.
On any network/API failure the script warns on stderr and exits 0 without
touching the committed SVG; files are written to a temp name and atomically
replaced, so a half-written or invalid SVG can never land on disk.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import sys
import tempfile
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from collections import Counter

# --------------------------------------------------------------------------- #
# constants
# --------------------------------------------------------------------------- #

LOGIN = "iCxin"
SCHEMA = "icxin-profile-stats/1"
API_ROOT = "https://api.github.com"
API_VERSION = "2022-11-28"
WINDOW_DAYS = 90
USER_AGENT = "icxin-profile-stats (+https://github.com/iCxin)"

# Repositories whose bytes are a vendored copy of an upstream project. One
# 38.5 MB bundled HTML mirror would otherwise flatten the language bar to a
# single 93% HTML slab and hide every hand-written language behind it. Fork
# detection already covers the other upstream copies; this one is a plain
# re-upload of SingleFile and has to be excluded by name. Keep this list
# explicit and short: it is a judgement call, not a statistic.
EXCLUDED_VENDORED = frozenset({"SingleFile-scau"})

CANVAS_W, CANVAS_H = 1600, 300
PAD = 56

# type
MONO = ("ui-monospace, 'SF Mono', 'Cascadia Code', Consolas, "
        "'Liberation Mono', monospace")

# zone geometry (intrinsic px)
DIVIDER_TOP, DIVIDER_BOTTOM = 96, 282
DIV_X1, DIV_X2 = 656, 1104
ZONE_A_X = (56, 644)
ZONE_B_X = (684, 1080)
ZONE_C_X = (1132, 1544)
OVERLINE_Y = 118

BAR_W, BAR_H, BAR_Y = 380, 22, 136
LEGEND_TOP, LEGEND_PITCH = 174, 21
ACTIVITY_BASE, ACTIVITY_TOP = 244, 132
SERIES_COUNT = 5          # ramp slots s1..s5 in the bar
LEGEND_ROWS = SERIES_COUNT + 1   # five series plus the folded remainder

THEMES = {
    "dark": {
        "bg": "#0B1020",
        "bg2": "#121A2E",
        "grid": "#1E2A45",
        "ink": "#F3F6FA",
        "muted": "#93A2BC",
        "brass": "#E8B44A",
        "brassDeep": "#8A5F16",
        "signal": "#5BE2D0",
        "steel": "#2B3852",
        "steelHi": "#3C4C6B",
        "steelLo": "#1A2438",
        # data-series ramp (DESIGN.md) + neutral remainder
        "s1": "#E8B44A",
        "s2": "#5BE2D0",
        "s3": "#8C9AC0",
        "s4": "#4E5F86",
        "s5": "#33415F",
        "other": "#1E2A45",
    },
    "light": {
        "bg": "#F7F5F0",
        "bg2": "#FFFFFF",
        "grid": "#E4DFD4",
        "ink": "#131922",
        "muted": "#5B6675",
        "brass": "#A9701A",
        "brassDeep": "#7A4E10",
        "signal": "#0E8F80",
        "steel": "#D9D3C7",
        "steelHi": "#EFEAE0",
        "steelLo": "#C4BDAD",
        # data-series ramp (DESIGN.md) + neutral remainder
        "s1": "#A9701A",
        "s2": "#0E8F80",
        "s3": "#5C6E96",
        "s4": "#3E4E70",
        "s5": "#96A0B4",
        "other": "#E4DFD4",
    },
}

# "Data-series ramp" from DESIGN.md: five theme-safe series colours, used in
# order from the largest language down; the remainder always uses `grid`.
SERIES_TOKENS = ("s1", "s2", "s3", "s4", "s5")

# Languages whose bytes are markup/styling rather than authored program logic.
# They still count in every percentage (which is a share of ALL language bytes)
# but they fold into the neutral remainder instead of occupying a ramp slot:
# HTML alone would otherwise outrank Rust and push the native work off the
# panel, which is the opposite of what the profile is about.
MARKUP_LANGUAGES = frozenset({
    "HTML", "CSS", "Less", "SCSS", "Sass", "Stylus", "Markdown", "CSS-Tailwind",
})
MONTHS = ("JAN", "FEB", "MAR", "APR", "MAY", "JUN",
          "JUL", "AUG", "SEP", "OCT", "NOV", "DEC")


class ApiError(RuntimeError):
    pass


# --------------------------------------------------------------------------- #
# small helpers
# --------------------------------------------------------------------------- #

def warn(msg: str) -> None:
    sys.stderr.write("warning: " + msg + "\n")


def esc(value: str) -> str:
    return (str(value).replace("&", "&amp;").replace("<", "&lt;")
            .replace(">", "&gt;").replace('"', "&quot;"))


def num(value: int) -> str:
    """Group digits with commas; stable across platforms."""
    return "{:,}".format(int(value))


def number_size(text: str) -> int:
    """Shrink the 64px readout when a value gets long, keeping one fixed grid."""
    if len(text) <= 3:
        return 64
    if len(text) == 4:
        return 56
    if len(text) == 5:
        return 48
    return 40


def svg_text(x, y, body, size, fill, *, anchor="start", weight=None,
             spacing=None, opacity=None, family=MONO) -> str:
    attrs = ['x="%s"' % fmt(x), 'y="%s"' % fmt(y),
             'font-family="%s"' % esc(family), 'font-size="%d"' % size,
             'fill="%s"' % fill]
    if anchor != "start":
        attrs.append('text-anchor="%s"' % anchor)
    if weight is not None:
        attrs.append('font-weight="%s"' % weight)
    if spacing is not None:
        attrs.append('letter-spacing="%s"' % fmt(spacing))
    if opacity is not None:
        attrs.append('opacity="%s"' % fmt(opacity))
    return "<text %s>%s</text>" % (" ".join(attrs), esc(body))


def fmt(value) -> str:
    """Deterministic decimal formatting: no exponent, no trailing zero noise."""
    if isinstance(value, str):
        return value  # already-formatted literal (opacity, dash arrays)
    if isinstance(value, int):
        return str(value)
    text = "%.2f" % value
    text = text.rstrip("0").rstrip(".")
    return "0" if text in ("", "-0") else text


def rect(x, y, w, h, fill, *, rx=None, opacity=None, stroke=None, sw=None,
         extra="") -> str:
    attrs = ['x="%s"' % fmt(x), 'y="%s"' % fmt(y), 'width="%s"' % fmt(w),
             'height="%s"' % fmt(h), 'fill="%s"' % fill]
    if rx is not None:
        attrs.append('rx="%s"' % fmt(rx))
    if opacity is not None:
        attrs.append('opacity="%s"' % fmt(opacity))
    if stroke is not None:
        attrs.append('stroke="%s"' % stroke)
        attrs.append('stroke-width="%s"' % fmt(sw if sw is not None else 1))
    if extra:
        attrs.append(extra)
    return "<rect %s/>" % " ".join(attrs)


def line(x1, y1, x2, y2, stroke, *, sw=1, opacity=None) -> str:
    attrs = ['x1="%s"' % fmt(x1), 'y1="%s"' % fmt(y1),
             'x2="%s"' % fmt(x2), 'y2="%s"' % fmt(y2),
             'stroke="%s"' % stroke, 'stroke-width="%s"' % fmt(sw)]
    if opacity is not None:
        attrs.append('opacity="%s"' % fmt(opacity))
    return "<line %s/>" % " ".join(attrs)


# --------------------------------------------------------------------------- #
# data collection
# --------------------------------------------------------------------------- #

def _request(url, token, *, method="GET", payload=None):
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": USER_AGENT,
        "X-GitHub-Api-Version": API_VERSION,
    }
    if token:
        headers["Authorization"] = "Bearer " + token
    data = None
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=45) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:  # includes 4xx/5xx bodies
        detail = ""
        try:
            detail = exc.read().decode("utf-8", "replace")[:300]
        except Exception:
            pass
        raise ApiError("HTTP %s for %s %s" % (exc.code, method, url)) from exc
    except urllib.error.URLError as exc:
        raise ApiError("cannot reach %s: %s" % (url, exc.reason)) from exc
    except (ValueError, OSError) as exc:
        raise ApiError("bad response from %s: %s" % (url, exc)) from exc


def collect_live(token: str):
    """Fetch everything the panel needs from the GitHub API."""
    user = _request(API_ROOT + "/users/" + LOGIN, token)

    repos, page = [], 1
    while page <= 10:  # hard stop; the profile has ~25 repos
        batch = _request(
            "%s/users/%s/repos?per_page=100&type=owner&page=%d"
            % (API_ROOT, LOGIN, page), token)
        if not isinstance(batch, list):
            raise ApiError("unexpected repos payload (page %d)" % page)
        repos.extend(batch)
        if len(batch) < 100:
            break
        page += 1

    languages = {}
    for repo in repos:
        if repo.get("fork") or int(repo.get("size") or 0) == 0:
            continue  # forks are upstream copies; empty repos have no bytes
        name = repo.get("name")
        if not name:
            continue
        url = ("%s/repos/%s/languages" % (API_ROOT, repo.get("full_name")))
        try:
            languages[name] = _request(url, token)
        except ApiError as exc:
            # A single repo failing must not lose the whole panel.
            warn("skipping languages for %r: %s" % (name, exc))

    today = dt.datetime.now(dt.timezone.utc).date()
    start = today - dt.timedelta(days=WINDOW_DAYS - 1)
    query = """
    query($login: String!, $from: DateTime!, $to: DateTime!) {
      user(login: $login) {
        contributionsCollection(from: $from, to: $to) {
          totalCommitContributions
          restrictedContributionsCount
          contributionCalendar {
            totalContributions
            weeks { contributionDays { date contributionCount } }
          }
        }
      }
    }
    """.strip()
    _, to_edge = _utc_bounds(today)
    gql = _request(API_ROOT + "/graphql", token, method="POST", payload={
        "query": query,
        "variables": {
            "login": LOGIN,
            "from": _iso_utc(start),
            "to": to_edge,
        },
    })
    if gql.get("errors"):
        raise ApiError("GraphQL: " + json.dumps(gql["errors"])[:300])
    try:
        collection = gql["data"]["user"]["contributionsCollection"]
    except (KeyError, TypeError):
        raise ApiError("GraphQL: unexpected contributions payload")

    return {
        "user": user,
        "login": user.get("login") or LOGIN,
        "public_repos": user.get("public_repos"),
        "repos": repos,
        "languages": languages,
        "contributions": collection,
        "generated_at": dt.datetime.now(dt.timezone.utc)
                              .replace(microsecond=0),
        "window": (start, today),
    }


def _iso_utc(day) -> str:
    return day.strftime("%Y-%m-%dT00:00:00Z")


def _utc_bounds(day):
    start = dt.datetime.combine(day, dt.time(0, 0))
    end = dt.datetime.combine(day, dt.time(23, 59, 59))
    return start, end.strftime("%Y-%m-%dT%H:%M:%SZ")


# --------------------------------------------------------------------------- #
# normalization: raw API payloads -> one deterministic snapshot
# --------------------------------------------------------------------------- #

def normalize(raw) -> dict:
    """Reduce raw payloads (live or replayed) to the snapshot the renderer uses."""
    repos = raw.get("repos") or []
    if not isinstance(repos, list):
        raise ValueError("snapshot: 'repos' must be a list")

    stars = sum(int(r.get("stargazers_count") or 0) for r in repos)
    own = [r for r in repos if not r.get("fork")]

    bytes_by_lang = Counter()
    for name, langs in (raw.get("languages") or {}).items():
        if name in EXCLUDED_VENDORED:
            continue
        if not isinstance(langs, dict):
            continue
        for lang, count in langs.items():
            try:
                value = int(count)
            except (TypeError, ValueError):
                continue
            if value > 0:
                bytes_by_lang[lang] += value

    # deterministic order: bytes desc, then name asc for exact ties
    language_items = [
        {"name": name, "bytes": count}
        for name, count in sorted(bytes_by_lang.items(),
                                  key=lambda kv: (-kv[1], kv[0]))
    ]

    collection = raw.get("contributions") or {}
    calendar = (collection.get("contributionCalendar") or {})
    per_day = {}
    for week in calendar.get("weeks") or []:
        for day in week.get("contributionDays") or []:
            stamp = day.get("date")
            if stamp:
                per_day[stamp] = int(day.get("contributionCount") or 0)

    start, today = _read_window(raw.get("window"))
    if start is None or today is None:
        start, today = _window_from_args(None)
    start = _as_date(start)
    today = _as_date(today)
    if today < start:
        start = today

    daily = []
    for offset in range(WINDOW_DAYS):
        stamp = (start + dt.timedelta(days=offset)).isoformat()
        daily.append({"date": stamp, "count": per_day.get(stamp, 0)})

    generated = raw.get("generated_at")
    if isinstance(generated, dt.datetime):
        generated = generated.replace(microsecond=0).strftime("%Y-%m-%dT%H:%M:%SZ")
    elif not isinstance(generated, str):
        generated = today.isoformat()

    return {
        "schema": SCHEMA,
        "login": raw.get("login") or LOGIN,
        "generated_at": generated,
        "window": {"from": start.isoformat(), "to": today.isoformat(),
                   "days": WINDOW_DAYS},
        "totals": {
            "repos": int(raw.get("public_repos") or len(repos)),
            "stars": stars,
            "commits_90d": int(collection.get("totalCommitContributions") or 0),
            "contributions_90d": int(calendar.get("totalContributions") or 0),
            "active_days": sum(1 for d in daily if d["count"] > 0),
            "languages": len(language_items),
        },
        "languages": {
            "total_bytes": sum(item["bytes"] for item in language_items),
            "items": language_items,
        },
        "daily": daily,
    }


def _read_window(window):
    """Accept {"from","to"}, [from, to] or (from, to); None stays None."""
    if isinstance(window, dict):
        return window.get("from"), window.get("to")
    if isinstance(window, (list, tuple)) and len(window) == 2:
        return window[0], window[1]
    return None, None


def _as_date(value):
    if isinstance(value, dt.date):
        return value
    return dt.date.fromisoformat(str(value))


def _window_from_args(today):
    day = today or dt.datetime.now(dt.timezone.utc).date()
    return day - dt.timedelta(days=WINDOW_DAYS - 1), day


def snapshot_from_raw(raw, overrides=None) -> dict:
    """Accept either a raw API bundle or an already-normalized snapshot."""
    if raw.get("schema") == SCHEMA:
        return _validate_snapshot(raw)
    if "contributions" not in raw and "daily" in raw:
        raise ValueError("snapshot: contributions/daily missing")
    snap = normalize(raw)
    if overrides:
        snap.update(overrides)
    return snap


def _validate_snapshot(snap):
    for key in ("totals", "languages", "daily", "window"):
        if key not in snap:
            raise ValueError("snapshot: missing %r" % key)
    daily = snap["daily"]
    if not isinstance(daily, list) or not daily:
        raise ValueError("snapshot: 'daily' must be a non-empty list")
    if len(daily) != WINDOW_DAYS:
        raise ValueError("snapshot: expected %d daily points, got %d"
                         % (WINDOW_DAYS, len(daily)))
    return snap


# --------------------------------------------------------------------------- #
# derived values
# --------------------------------------------------------------------------- #

def language_slices(snapshot):
    """Five ramp series plus the folded remainder, in tenths of a percent.

    Series are the five largest authoring languages by bytes. Markup bytes fold
    into the remainder, but the percentages stay shares of ALL language bytes,
    so the five rows plus `other` always sum to 100.0%.
    """
    items = [item for item in snapshot["languages"]["items"]
             if int(item.get("bytes") or 0) > 0]
    total = int(snapshot["languages"].get("total_bytes") or 0)
    if not items or total <= 0:
        return [], 0
    ranked = [item for item in items if item["name"] not in MARKUP_LANGUAGES]
    ranked = (ranked or items)[:SERIES_COUNT]
    tenths = [int(round(int(item["bytes"]) * 1000.0 / total)) for item in ranked]
    tail_tenths = max(0, 1000 - sum(tenths))
    slices = [{"name": item["name"], "bytes": int(item["bytes"]),
               "tenths": t} for item, t in zip(ranked, tenths)]
    return slices, tail_tenths


def activity_bars(snapshot):
    counts = [max(0, int(day.get("count") or 0)) for day in snapshot["daily"]]
    peak = max(counts) if counts else 0
    return counts, peak


# --------------------------------------------------------------------------- #
# renderer
# --------------------------------------------------------------------------- #

def render(snapshot, theme_name: str, stamp: str | None = None) -> str:
    palette = THEMES[theme_name]
    totals = snapshot["totals"]
    window = snapshot["window"]
    slices, tail_tenths = language_slices(snapshot)
    counts, peak = activity_bars(snapshot)
    updated = stamp or str(snapshot.get("generated_at", ""))[:10] or window["to"]

    body = []
    # ---- canvas ---------------------------------------------------------- #
    body.append('<g id="frame">')
    body.append(rect(0, 0, CANVAS_W, CANVAS_H, palette["bg"], rx=16))
    body.append(rect(0.5, 0.5, CANVAS_W - 1, CANVAS_H - 1,
                     "none", rx=16, stroke=palette["grid"]))
    body.append("</g>")

    # ---- header ---------------------------------------------------------- #
    body.append('<g id="header">')
    body.append(rect(PAD, 38, 18, 3, palette["brass"], rx=1.5))
    body.append(svg_text(PAD + 30, 50, "BENCH \u00b7 INSTRUMENT READOUT",
                         20, palette["muted"], spacing=3))
    body.append(svg_text(CANVAS_W - PAD, 50, "updated " + updated,
                         20, palette["muted"], anchor="end"))
    body.append("</g>")

    # ---- zone separators ------------------------------------------------- #
    body.append('<g id="rules">')
    for x in (DIV_X1, DIV_X2):
        body.append(line(x, DIVIDER_TOP, x, DIVIDER_BOTTOM, palette["grid"]))
    body.append("</g>")

    # ---- (a) big numbers ------------------------------------------------- #
    body.append('<g id="zone-a">')
    cells = (
        ("01", "PUBLIC REPOS", num(totals["repos"])),
        ("02", "STARS", num(totals["stars"])),
        # same contributionCalendar sum as the activity bars: one source of truth
        ("03", "CONTRIBUTIONS \u00b7 90D", num(totals["contributions_90d"])),
    )
    cell_x = (ZONE_A_X[0], 236, 416)
    for (index, caption, value), x in zip(cells, cell_x):
        body.append(svg_text(x, OVERLINE_Y, index, 20, palette["brass"],
                             spacing=2))
        body.append(svg_text(x, 146, caption, 20, palette["muted"]))
        size = number_size(value)
        body.append(svg_text(x, 224, value, size, palette["ink"],
                             weight="600", spacing=-1 if size >= 56 else 0))
        body.append(rect(x, 242, 42, 3, palette["brass"], rx=1.5))
    body.append("</g>")

    # ---- (b) language mix ------------------------------------------------ #
    body.append('<g id="zone-b">')
    lang_total = int(snapshot["languages"].get("total_bytes") or 0)
    body.append(svg_text(ZONE_B_X[0], OVERLINE_Y, "LANGUAGE MIX", 20,
                         palette["muted"], spacing=2))
    body.append(svg_text(ZONE_B_X[1] - 16, OVERLINE_Y,
                         "BY BYTES \u00b7 %d" % int(totals.get("languages") or 0),
                         20, palette["muted"], anchor="end", spacing=1,
                         opacity="0.7"))
    body.append(rect(ZONE_B_X[0], BAR_Y, BAR_W, BAR_H,
                     palette["bg2"], rx=2, stroke=palette["grid"]))

    tokens = SERIES_TOKENS
    if slices and lang_total > 0:
        edges = [float(ZONE_B_X[0])]
        for item in slices:
            edges.append(edges[-1] + item["bytes"] * BAR_W / float(lang_total))
        edges.append(float(ZONE_B_X[0] + BAR_W))
        # segments sit 2px inside the rounded track and are separated by 1px
        # gaps, so neighbouring neutral tones stay readable in both themes
        inner_y, inner_h = BAR_Y + 2, BAR_H - 4
        plan = [(edges[i], edges[i + 1], palette[tokens[i]])
                for i in range(len(slices))]
        plan.append((edges[len(slices)], edges[-1], palette["other"]))
        for index, (x0, x1, color) in enumerate(plan):
            gap_l = 1.0 if index > 0 else 0.0
            gap_r = 1.0 if index < len(plan) - 1 else 0.0
            width = x1 - x0 - gap_l - gap_r
            if width <= 0:
                continue
            body.append(rect(x0 + gap_l, inner_y, width, inner_h, color))
        # label the remainder inline when the neutral track is wide enough
        tail_x, tail_w = edges[len(slices)], edges[-1] - edges[len(slices)]
        if tail_w >= 54:
            body.append(svg_text(tail_x + tail_w / 2.0, BAR_Y + 16,
                                 "other", 20, palette["muted"],
                                 anchor="middle"))
        body.append(rect(ZONE_B_X[0], BAR_Y, BAR_W, BAR_H, "none", rx=2,
                         stroke=palette["grid"]))

        legend = [(item["name"], palette[tokens[row]], item["tenths"],
                   palette["ink"]) for row, item in enumerate(slices)]
        legend.append(("other", palette["other"], tail_tenths,
                       palette["muted"]))
        for row, (name, color, tenths, ink) in enumerate(legend):
            y = LEGEND_TOP + row * LEGEND_PITCH
            body.append(rect(ZONE_B_X[0], y - 9, 13, 13, color, rx=2))
            body.append(rect(ZONE_B_X[0], y - 9, 13, 13, "none", rx=2,
                             stroke=palette["muted"], sw=0.75,
                             opacity="0.45"))
            body.append(svg_text(ZONE_B_X[0] + 24, y + 6, name, 22, ink))
            body.append(svg_text(ZONE_B_X[1] - 16, y + 6,
                                 "%.1f%%" % (tenths / 10.0), 22,
                                 palette["muted"], anchor="end"))
    else:
        body.append(svg_text(ZONE_B_X[0], BAR_Y + 16,
                             "language data unavailable", 20,
                             palette["muted"]))
    body.append("</g>")

    # ---- (c) 90-day activity -------------------------------------------- #
    body.append('<g id="zone-c">')
    # no second total here: the big number and these bars are the same series
    body.append(svg_text(ZONE_C_X[0], OVERLINE_Y, "ACTIVITY \u00b7 90 DAYS",
                         20, palette["muted"], spacing=3))
    span = float(ZONE_C_X[1] - ZONE_C_X[0])
    pitch = span / float(WINDOW_DAYS)
    bar_w = max(2.4, pitch - 1.5)
    body.append(line(ZONE_C_X[0], ACTIVITY_BASE, ZONE_C_X[1], ACTIVITY_BASE,
                     palette["grid"]))
    height_span = float(ACTIVITY_BASE - ACTIVITY_TOP)
    labels = []
    for index, count in enumerate(counts):
        x = ZONE_C_X[0] + index * pitch + (pitch - bar_w) / 2.0
        if count <= 0:
            body.append(rect(x, ACTIVITY_BASE - 4, bar_w, 4, palette["grid"]))
        else:
            ratio = count / float(peak) if peak else 1.0
            height = 12 + (height_span - 12) * ratio
            body.append(rect(x, ACTIVITY_BASE - height, bar_w, height,
                             palette["brass"]))
        stamp_day = _as_date(snapshot["daily"][index]["date"])
        if stamp_day.day == 1 or index == 0:
            labels.append((x + bar_w / 2.0, MONTHS[stamp_day.month - 1]))
            body.append(line(x + bar_w / 2.0, ACTIVITY_BASE,
                             x + bar_w / 2.0, ACTIVITY_BASE + 5,
                             palette["muted"], opacity="0.8"))
    # month marks: 20px, nudged apart so neighbours never collide
    right_limit = ZONE_C_X[1]
    previous_right = None
    for x, label in labels:
        width = len(label) * 12.0
        start = max(x - 1.0, 0.0)
        if previous_right is not None and start < previous_right + 12.0:
            start = previous_right + 12.0
        if start + width > right_limit:
            start = right_limit - width
        body.append(svg_text(start, 274, label, 20, palette["muted"],
                             spacing=1))
        previous_right = start + width
    body.append("</g>")

    desc = ("%s's GitHub snapshot: %s public repositories, %s stars, %s "
            "contributions in the last 90 days; language mix and daily "
            "activity bars. Source: https://github.com/%s (api.github.com)."
            % (LOGIN, num(totals["repos"]), num(totals["stars"]),
               num(totals["contributions_90d"]), LOGIN))
    svg = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" '
        'viewBox="0 0 %d %d" role="img">' % (CANVAS_W, CANVAS_H, CANVAS_W, CANVAS_H),
        "<title>iCxin \u00b7 profile stats (%s)</title>" % theme_name,
        "<desc>%s</desc>" % esc(desc),
        "\n".join(body),
        "</svg>",
        "",
    ]
    return "\n".join(svg)


def write_atomic(path: str, text: str) -> bool:
    """Validate then atomically replace; never leaves a partial file behind."""
    ET.fromstring(text.encode("utf-8"))  # raises if the SVG is malformed
    directory = os.path.dirname(os.path.abspath(path)) or "."
    os.makedirs(directory, exist_ok=True)
    handle, tmp = tempfile.mkstemp(prefix=".stats-", suffix=".svg.tmp",
                                   dir=directory)
    try:
        with os.fdopen(handle, "w", encoding="utf-8", newline="\n") as fh:
            fh.write(text)
            fh.flush()
            os.fsync(fh.fileno())
        os.replace(tmp, path)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise
    return True


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #

def parse_args(argv=None):
    parser = argparse.ArgumentParser(
        description="Render assets/stats-{dark,light}.svg for the iCxin profile.")
    parser.add_argument("--out", default="assets",
                        help="output directory for stats-*.svg (default: assets)")
    parser.add_argument("--input", default=None,
                        help="render from a local JSON snapshot (or raw API "
                             "bundle) instead of the network")
    parser.add_argument("--token", default=None,
                        help="GitHub token (default: $GITHUB_TOKEN)")
    parser.add_argument("--date", default=None,
                        help="stamp shown in the header, YYYY-MM-DD (default: "
                             "snapshot date)")
    parser.add_argument("--dump", default=None,
                        help="also write the normalized snapshot JSON here")
    parser.add_argument("--theme", action="append", choices=("dark", "light"),
                        help="render only the given theme (repeatable)")
    return parser.parse_args(argv)


def main(argv=None) -> int:
    args = parse_args(argv)
    stamp = None
    if args.date:
        try:
            stamp = _as_date(args.date).isoformat()
        except ValueError:
            sys.stderr.write("error: --date must be YYYY-MM-DD\n")
            return 1

    if args.input:
        # A caller-supplied snapshot is a local error, not an API hiccup:
        # fail loudly so a broken file is never mistaken for fresh stats.
        try:
            with open(args.input, "r", encoding="utf-8") as fh:
                raw = json.load(fh)
            snapshot = snapshot_from_raw(raw)
        except (OSError, ValueError) as exc:
            sys.stderr.write("error: cannot use --input %s: %s\n"
                             % (args.input, exc))
            return 2
    else:
        token = args.token or os.environ.get("GITHUB_TOKEN") \
            or os.environ.get("GH_TOKEN")
        if not token:
            warn("no GitHub token (--token / GITHUB_TOKEN); nothing written")
            return 0
        try:
            snapshot = snapshot_from_raw(collect_live(token))
        except ApiError as exc:
            # A stats hiccup must never break the profile build.
            warn("%s: %s -- keeping the committed SVG untouched"
                 % (type(exc).__name__, exc))
            return 0
        except (OSError, ValueError) as exc:
            warn("could not normalize GitHub data: %s -- keeping the "
                 "committed SVG untouched" % exc)
            return 0

    # Render every theme before touching the worktree, so a failure in one
    # theme cannot leave the pair half-updated.
    themes = args.theme or ["dark", "light"]
    try:
        rendered = [(os.path.join(args.out, "stats-%s.svg" % theme),
                     render(snapshot, theme, stamp=stamp)) for theme in themes]
    except (ET.ParseError, OSError, ValueError) as exc:
        warn("could not render %s: %s -- keeping the committed SVG untouched"
             % (", ".join(themes), exc))
        return 1

    written = []
    try:
        for path, svg in rendered:
            write_atomic(path, svg)
            written.append(path)
    except (ET.ParseError, OSError) as exc:
        warn("could not write %s: %s" % (args.out, exc))
        return 1

    if args.dump:
        payload = json.dumps(snapshot, indent=2, sort_keys=True,
                             ensure_ascii=False)
        try:
            with open(args.dump, "w", encoding="utf-8", newline="\n") as fh:
                fh.write(payload + "\n")
        except OSError as exc:
            warn("could not write %s: %s" % (args.dump, exc))

    totals = snapshot["totals"]
    print("rendered %s for %s: repos=%d stars=%d commits90=%d langs=%d"
          % (", ".join(written), LOGIN, totals["repos"], totals["stars"],
             totals["commits_90d"], totals["languages"]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
