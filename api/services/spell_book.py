"""Spell Book scoring (roleApp spec, section 4).

Pure functions only: no database or web imports, so the formula can be unit
tested and recomputed from raw word events whenever the weights change.

    S = min(100, max(0, sum(w(e) * 2 ** (-age_days(e) / 14))))

Status: red S >= 60, yellow 30 <= S < 60, green S < 30 with >= 2 successes,
otherwise new.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Iterable, Optional

HALF_LIFE_DAYS = 14.0
RED_THRESHOLD = 60.0
YELLOW_THRESHOLD = 30.0
GREEN_MIN_SUCCESSES = 2

# Event type -> weight. Positive = struggle, negative = progress.
WEIGHTS: dict[str, float] = {
    "meaning_fail": 25.0,
    "pronunciation_fail": 20.0,
    "usage_fail": 15.0,
    "passive_encounter": -3.0,
    "context_success": -10.0,
    "active_success": -15.0,
}

FAIL_TYPES = {"meaning_fail", "pronunciation_fail", "usage_fail"}
SUCCESS_TYPES = {"context_success", "active_success"}


@dataclass(frozen=True)
class WordEventData:
    lemma: str
    event_type: str
    created_at: datetime
    location: Optional[str] = None
    surface_form: Optional[str] = None
    example: Optional[str] = None


def normalize_lemma(text: str) -> str:
    return " ".join(text.strip().lower().split())


def _as_utc(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def decay(age_days: float) -> float:
    return 2.0 ** (-max(0.0, age_days) / HALF_LIFE_DAYS)


def struggle_score(events: Iterable[WordEventData], now: datetime) -> float:
    now_utc = _as_utc(now)
    total = 0.0
    for event in events:
        weight = WEIGHTS.get(event.event_type)
        if weight is None:
            continue
        age_days = (now_utc - _as_utc(event.created_at)).total_seconds() / 86400.0
        total += weight * decay(age_days)
    return round(min(100.0, max(0.0, total)), 1)


def status_for(score: float, successes: int) -> str:
    if score >= RED_THRESHOLD:
        return "red"
    if score >= YELLOW_THRESHOLD:
        return "yellow"
    if successes >= GREEN_MIN_SUCCESSES:
        return "green"
    return "new"


_STATUS_ORDER = {"red": 0, "yellow": 1, "new": 2, "green": 3}


def build_spell_book(events: Iterable[WordEventData], now: datetime) -> list[dict]:
    """Groups raw events by lemma and returns one entry per word, hardest first."""
    by_lemma: dict[str, list[WordEventData]] = {}
    for event in events:
        lemma = normalize_lemma(event.lemma)
        if lemma:
            by_lemma.setdefault(lemma, []).append(event)

    entries = []
    for lemma, word_events in by_lemma.items():
        word_events.sort(key=lambda e: _as_utc(e.created_at))
        score = struggle_score(word_events, now)
        counts = {t: 0 for t in WEIGHTS}
        for e in word_events:
            if e.event_type in counts:
                counts[e.event_type] += 1
        successes = sum(counts[t] for t in SUCCESS_TYPES)
        sources = sorted({e.location for e in word_events if e.location})
        examples = [e.example for e in word_events if e.example]
        last = word_events[-1]
        entries.append(
            {
                "lemma": lemma,
                "status": status_for(score, successes),
                "struggle_score": score,
                "meaning_fails": counts["meaning_fail"],
                "pronunciation_fails": counts["pronunciation_fail"],
                "usage_fails": counts["usage_fail"],
                "active_successes": successes,
                "sources": sources,
                "example": examples[-1] if examples else None,
                "last_event_at": _as_utc(last.created_at).isoformat(),
            }
        )

    entries.sort(key=lambda e: (_STATUS_ORDER[e["status"]], -e["struggle_score"], e["lemma"]))
    return entries
