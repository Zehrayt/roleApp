"""Raw word events behind the Spell Book (roleApp spec 4.1).

Every signal about a word is stored as one row; the Spell Book view is always
recomputed from these rows by services/spell_book.py.
"""

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session

from models.models import WordEvent
from services.spell_book import WordEventData, build_spell_book, normalize_lemma
from shared.schemas import ExtractionResult

# Extraction error types that mean the word's meaning was not understood.
MEANING_ERROR_TYPES = {"sense", "lexical_choice"}


def record_word_event(
    db: Session,
    *,
    user_id: int,
    lemma: str,
    event_type: str,
    location: Optional[str] = None,
    surface_form: Optional[str] = None,
    example: Optional[str] = None,
) -> None:
    normalized = normalize_lemma(lemma)
    if not normalized:
        return
    db.add(
        WordEvent(
            user_id=user_id,
            lemma=normalized,
            surface_form=surface_form,
            event_type=event_type,
            location=location,
            example=example,
        )
    )


def record_extraction_words(
    db: Session,
    *,
    user_id: int,
    location: Optional[str],
    result: ExtractionResult,
    utterance: str,
) -> None:
    """Correct turns -> active_success per word; rejected turns -> usage/meaning fail.

    Rejected utterances are never stored as examples (same privacy rule as
    LearningAnalyticsService.record_extraction).
    """
    if result.outcome == "correct":
        for finding in result.vocabulary:
            record_word_event(
                db,
                user_id=user_id,
                lemma=finding.lemma,
                event_type="active_success",
                location=location,
                surface_form=finding.surface_form,
                example=utterance,
            )
        return
    for finding in result.vocabulary:
        record_word_event(
            db,
            user_id=user_id,
            lemma=finding.lemma,
            event_type="meaning_fail" if finding.error_type in MEANING_ERROR_TYPES else "usage_fail",
            location=location,
            surface_form=finding.surface_form,
        )


def load_spell_book(db: Session, user_id: int, now: Optional[datetime] = None) -> list[dict]:
    rows = db.query(WordEvent).filter(WordEvent.user_id == user_id).all()
    events = [
        WordEventData(
            lemma=row.lemma,
            event_type=row.event_type,
            created_at=row.created_at or datetime.now(timezone.utc),
            location=row.location,
            surface_form=row.surface_form,
            example=row.example,
        )
        for row in rows
    ]
    return build_spell_book(events, now or datetime.now(timezone.utc))
