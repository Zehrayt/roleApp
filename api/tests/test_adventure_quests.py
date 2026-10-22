import json
import sys
import tempfile
import unittest
from pathlib import Path

from pydantic import ValidationError

API_ROOT = Path(__file__).resolve().parents[1]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))

from services.adventure_quests import (
    SCENARIOS_DIR,
    completes_inventory_quest,
    completes_talk_quest,
    load_adventure,
)


class AdventureContentFileTest(unittest.TestCase):
    """api/game_data/adventure.json is the single quest source; keep it valid."""

    def test_content_loads_and_rules_point_at_real_scenarios(self):
        content = load_adventure()
        self.assertGreater(len(content.quests), 0)
        for quest in content.quests:
            rule = quest.complete_when
            scenario = Path(SCENARIOS_DIR) / f"{rule.location}.json"
            self.assertTrue(scenario.exists(), f"{quest.id}: no scenario for {rule.location}")
            self.assertEqual(json.loads(scenario.read_text(encoding="utf-8"))["npc_role"], rule.npc_role, quest.id)

    def test_invalid_content_is_rejected(self):
        broken = {
            "chapter": {"id": "x", "label": "x", "title": "x", "intro": "x", "complete_title": "x", "complete_text": "x"},
            "items": [],
            "quests": [{
                "id": "q", "title": "q", "place": "q", "detail": "q",
                "complete_when": {"type": "receive_item", "location": "bakery", "npc_role": "baker", "item_id": "missing_item"},
            }],
        }
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as handle:
            json.dump(broken, handle)
        with self.assertRaises(ValidationError):
            load_adventure.__wrapped__(handle.name)
        Path(handle.name).unlink()


class QuestRuleTest(unittest.TestCase):
    def test_rules_follow_the_content_order(self):
        self.assertTrue(completes_inventory_quest(0, "bakery", "baker", "apple", 1, "food"))
        self.assertFalse(completes_inventory_quest(0, "bakery", "baker", "map", 1, "other"))
        self.assertFalse(completes_inventory_quest(0, "bakery", "baker", "bread", -1, "food"))
        self.assertTrue(completes_inventory_quest(1, "library", "librarian", "boat_building_manual", 1, "other"))
        self.assertFalse(completes_inventory_quest(1, "bakery", "baker", "boat_building_manual", 1, "other"))
        self.assertFalse(completes_talk_quest(1, "cafe", "barista"))
        self.assertTrue(completes_talk_quest(2, "cafe", "barista"))
        self.assertFalse(completes_talk_quest(2, "library", "librarian"))

    def test_finished_chapter_completes_nothing(self):
        done = len(load_adventure().quests)
        self.assertFalse(completes_talk_quest(done, "cafe", "barista"))
        self.assertFalse(completes_inventory_quest(done, "bakery", "baker", "bread", 1, "food"))


if __name__ == "__main__":
    unittest.main()
