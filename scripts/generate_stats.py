#!/usr/bin/env python3
"""Render the iCxin stats strip (assets/stats-dark.svg, assets/stats-light.svg).

A flat 1600x260 editorial technical sheet, three fields:
  (a) numerals       PUBLIC REPOS / STARS / CONTRIBUTIONS (last 90 days)
  (b) language mix   14px stacked byte bar on a 0-100 scale + ranked legend
  (c) activity       90 daily contribution ticks with month marks

Design contract: _gh/DESIGN-v2.md "Stats strip" (paper/ink/muted/hairline/
accent only, mono 16px labels, flat fields separated by 1px hairlines, no
radius, no gradient, no shadow, geometry identical across themes).

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

CANVAS_W, CANVAS_H = 1600, 260
PAD_L, PAD_R = 64, 1536          # content trim, both edges

# type
MONO = ("ui-monospace, 'SF Mono', 'Cascadia Code', Consolas, "
        "'Liberation Mono', monospace")
DISPLAY = "'Helvetica Neue', Helvetica, Arial, sans-serif"

# flat editorial grid (intrinsic px). No cards, no radius: fields are
# separated by 1px hairlines and paper only.
EYEBROW_Y = 32
HEAD_RULE_Y = 46
LABEL_Y = 84
ZONE_A_X = (64, 430)
ZONE_B_X = (470, 980)
ZONE_C_X = (1020, 1536)
GROUP_EDGES = (64, 190, 290, 430)   # three numeral fields, rules at the seams
FIELD_X = (64, 204, 304)            # numeral/caption origin inside each field
GROUP_RULE_TOP, GROUP_RULE_BOTTOM = 76, 190
NUM_Y = 136                          # numeral baseline (72px)
CAP_Y = 164                          # mono caption baseline
CAP2_Y = 182                         # second caption line (90-day scope)
BAR_Y, BAR_H = 96, 14
SCALE_Y = 120                        # 0/25/50/75/100 hairline
LEGEND_TOP, LEGEND_PITCH, LEGEND_COL = 152, 22, 255
ACT_BASE, ACT_MAX_H = 202, 76
MONTH_Y = 226
SERIES_COUNT = 5
LABEL_TRACK = 2.24                   # 0.14em at 16px
CAPTION_TRACK = 0.0                  # captions run tight: the fields are narrow

THEMES = {
    "dark": {
        "paper": "#0C0D0F",
        "ink": "#F0EDE6",
        "muted": "#8A857B",
        "hairline": "#23252A",
        "accent": "#FF5C3A",
    },
    "light": {
        "paper": "#F4F1EA",
        "ink": "#101215",
        "muted": "#6E6A62",
        "hairline": "#D5CEC0",
        "accent": "#D93E24",
    },
}

# Series ramp (DESIGN v2): accent first, then ink, then muted steps. The
# remainder of the bar is a flat hairline field - "no data" is a hairline in
# this system, never a lighter colour. Opacities are identical in both themes
# so the two SVGs stay geometrically identical.
SERIES_RAMP = (
    ("accent", None),
    ("ink", None),
    ("muted", None),
    ("muted", "0.70"),
    ("muted", "0.45"),
)

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
    """Keep the 72px numeral unless a value would run out of its field."""
    if len(text) <= 4:
        return 72
    if len(text) == 5:
        return 62
    if len(text) == 6:
        return 54
    return 46


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
    into the remainder, and every percentage stays a share of ALL language
    bytes, so the five series plus the unfilled part of the bar account for
    100.0% of what GitHub counts.
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
    """Draw the flat editorial stats strip; geometry is theme-independent."""
    palette = THEMES[theme_name]
    totals = snapshot["totals"]
    window = snapshot["window"]
    slices, _tail_tenths = language_slices(snapshot)
    counts, peak = activity_bars(snapshot)
    updated = stamp or str(snapshot.get("generated_at", ""))[:10] or window["to"]
    hair = palette["hairline"]

    body = []

    # ---- sheet: one flat field. no card, no radius, no shadow ------------ #
    body.append('<g id="sheet">')
    body.append(rect(0, 0, CANVAS_W, CANVAS_H, palette["paper"]))
    body.append("</g>")

    # ---- header ---------------------------------------------------------- #
    body.append('<g id="header">')
    body.append(svg_text(PAD_L, EYEBROW_Y,
                         "SPECIFICATION \u00b7 UPDATED " + updated,
                         16, palette["ink"], spacing=LABEL_TRACK))
    body.append(svg_text(PAD_R, EYEBROW_Y, "SCALE 1:1", 16, palette["muted"],
                         anchor="end", spacing=LABEL_TRACK))
    body.append(line(0, HEAD_RULE_Y, CANVAS_W, HEAD_RULE_Y, hair))
    body.append("</g>")

    # ---- (a) three numeral fields ---------------------------------------- #
    body.append('<g id="zone-a">')
    cells = (
        ("PUBLIC REPOS", num(totals["repos"]), None),
        ("STARS", num(totals["stars"]), None),
        ("CONTRIBUTIONS", num(totals["contributions_90d"]), "LAST 90 DAYS"),
    )
    for field, (caption, value, second) in zip(FIELD_X, cells):
        size = number_size(value)
        body.append(svg_text(field, NUM_Y, value, size, palette["ink"],
                             weight="700", spacing=-0.04 * size,
                             family=DISPLAY))
        body.append(svg_text(field, CAP_Y, caption, 16, palette["muted"],
                             spacing=CAPTION_TRACK))
        if second:
            body.append(svg_text(field, CAP2_Y, second, 16,
                                 palette["muted"], spacing=CAPTION_TRACK))
    for x in GROUP_EDGES[1:-1]:
        body.append(line(x, GROUP_RULE_TOP, x, GROUP_RULE_BOTTOM, hair))
    body.append("</g>")

    # ---- (b) language mix ------------------------------------------------ #
    body.append('<g id="zone-b">')
    bx0, bx1 = ZONE_B_X
    bw = float(bx1 - bx0)
    body.append(svg_text(bx0, LABEL_Y, "LANGUAGE MIX \u00b7 BY BYTES", 16,
                         palette["muted"], spacing=LABEL_TRACK))
    total_bytes = int(snapshot["languages"].get("total_bytes") or 0)

    if slices and total_bytes > 0:
        edges = [float(bx0)]
        for item in slices:
            edges.append(edges[-1] + item["bytes"] * bw / float(total_bytes))
        edges.append(float(bx1))
        # 1px gaps carved out of the seams; the remainder is a bare hairline
        # field rather than another colour
        for index in range(len(edges) - 1):
            x0, x1 = edges[index], edges[index + 1]
            gap_l = 0.5 if index > 0 else 0.0
            gap_r = 0.5 if index < len(edges) - 2 else 0.0
            width = x1 - x0 - gap_l - gap_r
            if width <= 0:
                continue
            if index < len(slices):
                token, opacity = SERIES_RAMP[index]
                body.append(rect(x0 + gap_l, BAR_Y, width, BAR_H,
                                 palette[token], opacity=opacity))
            else:
                body.append(rect(x0 + gap_l, BAR_Y, width, BAR_H, hair))
        # 0 / 25 / 50 / 75 / 100 scale on a hairline
        body.append(line(bx0, SCALE_Y, bx1, SCALE_Y, hair))
        for pct in (0, 25, 50, 75, 100):
            tx = bx0 + bw * pct / 100.0
            body.append(line(tx, SCALE_Y, tx, SCALE_Y + 4, hair))
        # legend: five ranked entries, two columns, down then across
        rows = (len(slices) + 1) // 2
        for index, item in enumerate(slices):
            token, opacity = SERIES_RAMP[index]
            col, row = index // rows, index % rows
            x = bx0 + col * LEGEND_COL
            y = LEGEND_TOP + row * LEGEND_PITCH
            body.append(rect(x, y - 7, 9, 9, palette[token], opacity=opacity))
            body.append(svg_text(x + 17, y, item["name"], 16, palette["ink"]))
            body.append(svg_text(x + LEGEND_COL - 18, y,
                                 "%.1f%%" % (item["tenths"] / 10.0), 16,
                                 palette["muted"], anchor="end"))
    else:
        body.append(svg_text(bx0, BAR_Y + 12, "LANGUAGE DATA UNAVAILABLE",
                             16, palette["muted"], spacing=CAPTION_TRACK))
    body.append("</g>")

    # ---- (c) 90-day activity --------------------------------------------- #
    body.append('<g id="zone-c">')
    cx0, cx1 = ZONE_C_X
    span = float(cx1 - cx0)
    body.append(svg_text(cx0, LABEL_Y, "CONTRIBUTIONS \u00b7 90 DAYS", 16,
                         palette["muted"], spacing=LABEL_TRACK))
    body.append(line(cx0, ACT_BASE, cx1, ACT_BASE, hair))
    pitch = span / float(WINDOW_DAYS)
    tick_w = 2.0
    for index, count in enumerate(counts):
        # integer x keeps 2px ticks from going grey at 1:1 raster
        x = float(int(round(cx0 + index * pitch + (pitch - tick_w) / 2.0)))
        if count <= 0:
            # a zero day is a 1px hairline sitting on the baseline
            body.append(rect(x, ACT_BASE - 4, 1, 4, hair))
            continue
        ratio = count / float(peak) if peak else 1.0
        height = 4.0 + (ACT_MAX_H - 4.0) * ratio
        if count == peak:
            body.append(rect(x, ACT_BASE - height, tick_w, height,
                             palette["accent"]))
        else:
            body.append(rect(x, ACT_BASE - height, tick_w, height,
                             palette["ink"], opacity="0.55"))
    # month marks, nudged apart so neighbours never collide
    labels = []
    for index, day in enumerate(snapshot["daily"]):
        stamp_day = _as_date(day["date"])
        if stamp_day.day == 1 or index == 0:
            labels.append((cx0 + index * pitch + (pitch - tick_w) / 2.0,
                           MONTHS[stamp_day.month - 1]))
    previous_right = None
    for x, label in labels:
        width = len(label) * 11.2
        start = max(x - 1.0, 0.0)
        if previous_right is not None and start < previous_right + 12.0:
            start = previous_right + 12.0
        if start + width > cx1:
            start = cx1 - width
        body.append(svg_text(start, MONTH_Y, label, 16, palette["muted"],
                             spacing=1.6))
        previous_right = start + width
    body.append("</g>")

    desc = ("%s's GitHub snapshot as a flat specification sheet: %s public "
            "repositories, %s stars, %s contributions in the last 90 days, "
            "the language mix by byte share and the daily contribution "
            "trace. Source: https://github.com/%s (api.github.com)."
            % (LOGIN, num(totals["repos"]), num(totals["stars"]),
               num(totals["contributions_90d"]), LOGIN))
    svg = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" '
        'viewBox="0 0 %d %d" role="img">' % (CANVAS_W, CANVAS_H, CANVAS_W, CANVAS_H),
        "<title>iCxin \u00b7 specification strip (%s)</title>" % theme_name,
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
