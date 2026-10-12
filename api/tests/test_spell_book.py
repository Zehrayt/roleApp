import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

API_ROOT = Path(__file__).resolve().parents[1]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))

from services.spell_book import (  # noqa: E402
    WordEventData,
    build_spell_book,
    status_for,
    struggle_score,
)

NOW = datetime(2026, 10, 12, 12, 0, tzinfo=timezone.utc)


def ev(lemma, event_type, days_ago=0.0, **kwargs):
    return WordEventData(lemma=lemma, event_type=event_type, created_at=NOW - timedelta(days=days_ago), **kwargs)


class StruggleScoreTests(unittest.TestCase):
    def test_spec_example_is_yellow_then_red(self):
        # roleApp 4.2: meaning_fail + pronunciation_fail today -> 45 (yellow)
        events = [ev("abundant", "meaning_fail"), ev("abundant", "pronunciation_fail")]
        self.assertEqual(struggle_score(events, NOW), 45.0)
        # one day later another meaning_fail -> ~68 (red)
        later = NOW + timedelta(days=1)
        events.append(WordEventData("abundant", "meaning_fail", later))
        score = struggle_score(events, later)
        self.assertAlmostEqual(score, 45 * 2 ** (-1 / 14) + 25, delta=0.1)
        self.assertEqual(status_for(score, 0), "red")

    def test_half_life_is_fourteen_days(self):
        self.assertEqual(struggle_score([ev("bread", "meaning_fail", days_ago=14)], NOW), 12.5)

    def test_score_is_clamped(self):
        self.assertEqual(struggle_score([ev("x", "meaning_fail")] * 10, NOW), 100.0)
        self.assertEqual(struggle_score([ev("x", "active_success")] * 3, NOW), 0.0)

    def test_unknown_event_types_are_ignored(self):
        self.assertEqual(struggle_score([ev("x", "something_else")], NOW), 0.0)


class StatusTests(unittest.TestCase):
    def test_thresholds(self):
        self.assertEqual(status_for(60, 0), "red")
        self.assertEqual(status_for(30, 5), "yellow")
        self.assertEqual(status_for(10, 2), "green")
        self.assertEqual(status_for(10, 1), "new")
        self.assertEqual(status_for(0, 0), "new")


class BuildSpellBookTests(unittest.TestCase):
    def test_groups_by_normalized_lemma_and_sorts_hardest_first(self):
        events = [
            ev("Croissant ", "meaning_fail", location="bakery"),
            ev("croissant", "meaning_fail", location="bakery"),
            ev("croissant", "usage_fail", location="cafe", example="I want croissant."),
            ev("plant", "active_success", location="bakery"),
            ev("plant", "active_success", location="bakery"),
            ev("shelf", "usage_fail", days_ago=1),
        ]
        book = build_spell_book(events, NOW)
        self.assertEqual([e["lemma"] for e in book], ["croissant", "shelf", "plant"])
        croissant = book[0]
        self.assertEqual(croissant["status"], "red")
        self.assertEqual(croissant["meaning_fails"], 2)
        self.assertEqual(croissant["usage_fails"], 1)
        self.assertEqual(croissant["sources"], ["bakery", "cafe"])
        self.assertEqual(croissant["example"], "I want croissant.")
        self.assertEqual(book[2]["status"], "green")

    def test_empty(self):
        self.assertEqual(build_spell_book([], NOW), [])


if __name__ == "__main__":
    unittest.main()
