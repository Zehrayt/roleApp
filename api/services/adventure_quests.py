"""Adventure content: chapter text, familiar items and quest completion rules.

Everything here is loaded from api/game_data/adventure.json, the single source
for quests. The client receives the same content from GET /api/adventure/state,
so adding or editing a quest is a content change, not a code change.

NPCs never receive these rules; they only consume confirmed game events
(an item that actually entered the inventory, or an accepted conversation).
"""

import json
import os
from functools import lru_cache
from typing import Annotated, Literal, Optional, Union

from pydantic import BaseModel, Field, model_validator

ADVENTURE_FILE = os.path.join(os.path.dirname(__file__), "..", "game_data", "adventure.json")
SCENARIOS_DIR = os.path.join(os.path.dirname(__file__), "..", "game_data", "scenarios")

ItemCategory = Literal["food", "drink", "other"]
ITEM_ID_PATTERN = r"^[a-z][a-z0-9_]{0,79}$"


class Chapter(BaseModel):
    id: str
    label: str
    title: str
    intro: str
    complete_title: str
    complete_text: str


class AdventureItem(BaseModel):
    item_id: str = Field(pattern=ITEM_ID_PATTERN)
    name: str
    description: str
    category: ItemCategory
    aliases: list[str] = Field(default_factory=list)


class ReceiveItemRule(BaseModel):
    """Complete when the player actually receives a matching item from this NPC."""

    type: Literal["receive_item"]
    location: str
    npc_role: str
    item_id: Optional[str] = Field(default=None, pattern=ITEM_ID_PATTERN)
    categories: list[ItemCategory] = Field(default_factory=list)

    @model_validator(mode="after")
    def _needs_a_target(self):
        if not self.item_id and not self.categories:
            raise ValueError("receive_item needs item_id or categories")
        return self


class TalkRule(BaseModel):
    """Complete after an accepted conversation turn with this NPC."""

    type: Literal["talk"]
    location: str
    npc_role: str


CompletionRule = Annotated[Union[ReceiveItemRule, TalkRule], Field(discriminator="type")]


class Quest(BaseModel):
    id: str
    title: str
    place: str
    detail: str
    complete_when: CompletionRule


class AdventureContent(BaseModel):
    chapter: Chapter
    items: list[AdventureItem]
    quests: list[Quest] = Field(min_length=1)

    @model_validator(mode="after")
    def _consistent(self):
        item_ids = [item.item_id for item in self.items]
        if len(item_ids) != len(set(item_ids)):
            raise ValueError("duplicate item_id in adventure items")
        quest_ids = [quest.id for quest in self.quests]
        if len(quest_ids) != len(set(quest_ids)):
            raise ValueError("duplicate quest id")
        for quest in self.quests:
            rule = quest.complete_when
            if isinstance(rule, ReceiveItemRule) and rule.item_id and rule.item_id not in item_ids:
                raise ValueError(f"quest {quest.id} needs unknown item {rule.item_id}")
        return self


@lru_cache(maxsize=1)
def load_adventure(path: str = ADVENTURE_FILE) -> AdventureContent:
    with open(path, encoding="utf-8") as handle:
        return AdventureContent.model_validate(json.load(handle))


def adventure_content_for_client() -> dict:
    return load_adventure().model_dump(mode="json")


def item_catalog() -> dict[str, AdventureItem]:
    return {item.item_id: item for item in load_adventure().items}


def current_quest(stage: int) -> Optional[Quest]:
    quests = load_adventure().quests
    return quests[stage] if 0 <= stage < len(quests) else None


def completes_inventory_quest(stage: int, location: str, npc_role: str, item_id: str, delta: int, category: str) -> bool:
    """True when this confirmed item handover finishes the active quest."""
    quest = current_quest(stage)
    if delta <= 0 or quest is None:
        return False
    rule = quest.complete_when
    if not isinstance(rule, ReceiveItemRule):
        return False
    if (location, npc_role) != (rule.location, rule.npc_role):
        return False
    return item_id == rule.item_id or category in rule.categories


def completes_talk_quest(stage: int, location: str, npc_role: str) -> bool:
    """True when an accepted conversation turn finishes the active quest."""
    quest = current_quest(stage)
    if quest is None:
        return False
    rule = quest.complete_when
    return isinstance(rule, TalkRule) and (location, npc_role) == (rule.location, rule.npc_role)
