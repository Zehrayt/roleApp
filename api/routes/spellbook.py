from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from core.database import get_db
from models.models import User
from services.word_events import load_spell_book

router = APIRouter()


@router.get("/{user_id}")
def get_spell_book(user_id: int, db: Session = Depends(get_db)):
    """The player's Spell Book: one entry per word, hardest (red) first."""
    if not db.query(User).filter(User.id == user_id).first():
        raise HTTPException(status_code=404, detail="User not found")
    return load_spell_book(db, user_id)
