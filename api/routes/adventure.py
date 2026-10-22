from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from core.auth import authenticated_user
from core.database import get_db
from models.models import User
from services.adventure_inventory import inventory_snapshot
from services.adventure_quests import adventure_content_for_client


router = APIRouter()


@router.get("/state")
def get_adventure_state(
    db: Session = Depends(get_db),
    user: User = Depends(authenticated_user),
):
    return {
        "stage": user.adventure_stage,
        "inventory": inventory_snapshot(db, user.id),
        "adventure": adventure_content_for_client(),
    }
