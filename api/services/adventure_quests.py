"""Familiar item labels and explicit completion rules for adventure quests."""

ITEM_CATALOG = {
    "bread": {"name": "Bread", "description": "a loaf or piece of bread"},
    "pastry": {"name": "Pastry", "description": "a pastry, bun or cake"},
    "drink": {"name": "Drink", "description": "water, juice or another drink"},
    "sandwich": {"name": "Sandwich", "description": "a sandwich"},
    "fruit": {"name": "Fruit", "description": "an apple, banana or other fruit"},
    "boat_building_manual": {"name": "Boat-Building Handbook", "description": "a handbook on building a small boat"},
}

# The quest is broad: any food or drink actually received from Maya counts.
# ITEM_CATALOG only supplies familiar labels and is not an allowed-item list.
MAYA_PROVISIONS_QUEST = {
    "id": "maya_provisions",
    "title": "Supplies for the Road",
    "completion": "receive_food_or_drink",
}

LINA_MANUAL_QUEST = {
    "id": "lina_boat_manual",
    "title": "Boat-Building Handbook",
    "item_id": "boat_building_manual",
    "completion": "receive_item",
}


def completes_inventory_quest(stage: int, location: str, npc_role: str, item_id: str, delta: int, category: str) -> bool:
    """Quest rules consume confirmed inventory events; NPCs receive none of these rules."""
    if delta <= 0:
        return False
    if stage == 0:
        return location == "bakery" and npc_role == "baker" and category in ("food", "drink")
    if stage == 1:
        return location == "library" and npc_role == "librarian" and item_id == LINA_MANUAL_QUEST["item_id"]
    return False
