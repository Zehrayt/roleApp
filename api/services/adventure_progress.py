"""What happens when quests complete: NPC memories and scripted phone texts.

Every path that advances users.adventure_stage (inventory, talk, scene, plan,
place) calls after_quests() with the quests it just finished.
"""

from typing import Optional

from sqlalchemy.orm import Session

from models.models import User
from services import npc_memory, phone
from services.adventure_quests import PlanRule, Quest, ReceiveItemRule, TalkRule, load_adventure


def quest_npc(quest: Quest) -> Optional[npc_memory.NpcDef]:
    """The NPC who helped with a quest, for its memory of it."""
    rule = quest.complete_when
    if isinstance(rule, (ReceiveItemRule, TalkRule)):
        return npc_memory.npc_for(rule.location, rule.npc_role)
    if isinstance(rule, PlanRule):
        return npc_memory.npc_by_id(rule.npc_id)
    return None


def after_quests(db: Session, user: User, stage_before: int, stage_after: int) -> list[tuple[str, str]]:
    """Record memories and send on_complete texts. Returns (npc_id, player-facing memory) pairs."""
    lines: list[tuple[str, str]] = []
    for quest in load_adventure().quests[stage_before:stage_after]:
        helper = quest_npc(quest)
        if helper is not None:
            text = npc_memory.record_quest_completed(db, user.id, helper, quest_id=quest.id, quest_title=quest.title)
            if text:
                lines.append((helper.id, text))
        for message in quest.on_complete.phone:
            sender = npc_memory.npc_by_id(message.npc_id)
            if sender is not None:
                phone.send_from_npc(db, user, sender, message.text)
    return lines
