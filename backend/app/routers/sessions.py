"""Workout sessions and the sets logged in them."""

from datetime import date

from fastapi import APIRouter, HTTPException, Query, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.deps import CurrentUser, DbSession
from app.models import (
    Exercise,
    SetEntry,
    TemplateExercise,
    User,
    WorkoutSession,
    WorkoutTemplate,
)
from app.routers.templates import get_visible_template
from app.schemas import (
    SaveAsTemplateIn,
    SessionIn,
    SessionOut,
    SessionSummary,
    SessionUpdate,
    SetIn,
    SetOut,
    SetUpdate,
    TemplateOut,
)

router = APIRouter(tags=["sessions"])


def _own_session(db: Session, session_id: int, user: User) -> WorkoutSession:
    s = db.scalar(
        select(WorkoutSession)
        .where(WorkoutSession.id == session_id, WorkoutSession.user_id == user.id)
        .options(selectinload(WorkoutSession.sets))
    )
    if s is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    return s


def _own_set(db: Session, set_id: int, user: User) -> SetEntry:
    entry = db.scalar(
        select(SetEntry)
        .join(WorkoutSession)
        .where(SetEntry.id == set_id, WorkoutSession.user_id == user.id)
    )
    if entry is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Set not found")
    return entry


@router.get("/sessions", response_model=list[SessionSummary])
def list_sessions(
    db: DbSession,
    user: CurrentUser,
    date_from: date | None = Query(default=None, alias="from"),
    date_to: date | None = Query(default=None, alias="to"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> list[WorkoutSession]:
    q = select(WorkoutSession).where(WorkoutSession.user_id == user.id)
    if date_from:
        q = q.where(WorkoutSession.date >= date_from)
    if date_to:
        q = q.where(WorkoutSession.date <= date_to)
    q = q.order_by(WorkoutSession.date.desc(), WorkoutSession.id.desc())
    return list(db.scalars(q.limit(limit).offset(offset)))


@router.post("/sessions", response_model=SessionOut, status_code=status.HTTP_201_CREATED)
def create_session(body: SessionIn, db: DbSession, user: CurrentUser) -> WorkoutSession:
    if body.template_id is not None:
        get_visible_template(db, body.template_id, user)  # 404 if not visible
    s = WorkoutSession(
        user_id=user.id, date=body.date, notes=body.notes, template_id=body.template_id
    )
    db.add(s)
    db.commit()
    return _own_session(db, s.id, user)


@router.get("/sessions/{session_id}", response_model=SessionOut)
def get_session(session_id: int, db: DbSession, user: CurrentUser) -> WorkoutSession:
    return _own_session(db, session_id, user)


@router.patch("/sessions/{session_id}", response_model=SessionOut)
def update_session(
    session_id: int, body: SessionUpdate, db: DbSession, user: CurrentUser
) -> WorkoutSession:
    s = _own_session(db, session_id, user)
    for field, value in body.model_dump(exclude_unset=True).items():
        if field == "date" and value is None:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "date can't be null")
        setattr(s, field, value)
    db.commit()
    return s


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_session(session_id: int, db: DbSession, user: CurrentUser) -> Response:
    db.delete(_own_session(db, session_id, user))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/sessions/{session_id}/sets", response_model=SetOut, status_code=status.HTTP_201_CREATED
)
def add_set(session_id: int, body: SetIn, db: DbSession, user: CurrentUser) -> SetEntry:
    s = _own_session(db, session_id, user)
    if db.get(Exercise, body.exercise_id) is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Unknown exercise id")
    entry = SetEntry(session_id=s.id, **body.model_dump())
    db.add(entry)
    db.commit()
    return entry


@router.patch("/sets/{set_id}", response_model=SetOut)
def update_set(set_id: int, body: SetUpdate, db: DbSession, user: CurrentUser) -> SetEntry:
    entry = _own_set(db, set_id, user)
    for field, value in body.model_dump(exclude_unset=True).items():
        if field == "set_number" and value is None:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "set_number can't be null")
        setattr(entry, field, value)
    db.commit()
    return entry


@router.delete("/sets/{set_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_set(set_id: int, db: DbSession, user: CurrentUser) -> Response:
    db.delete(_own_set(db, set_id, user))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/sessions/{session_id}/save-as-template",
    response_model=TemplateOut,
    status_code=status.HTTP_201_CREATED,
    tags=["templates"],
)
def save_as_template(
    session_id: int, body: SaveAsTemplateIn, db: DbSession, user: CurrentUser
) -> WorkoutTemplate:
    """Turn a logged session into a reusable custom workout.

    Each exercise keeps the order it was first logged in; its targets are the number of
    sets logged and the most reps in any of those sets.
    """

    s = _own_session(db, session_id, user)
    if not s.sets:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, "This session has no sets to save"
        )
    order: list[int] = []
    sets_by_ex: dict[int, list[SetEntry]] = {}
    for entry in s.sets:
        if entry.exercise_id not in sets_by_ex:
            order.append(entry.exercise_id)
            sets_by_ex[entry.exercise_id] = []
        sets_by_ex[entry.exercise_id].append(entry)

    t = WorkoutTemplate(
        name=body.name, description=body.description, is_builtin=False, user_id=user.id
    )
    for pos, ex_id in enumerate(order, start=1):
        entries = sets_by_ex[ex_id]
        best_reps = max((e.reps or 0) for e in entries)
        t.exercises.append(
            TemplateExercise(
                exercise_id=ex_id,
                position=pos,
                target_sets=len(entries),
                target_reps=max(best_reps, 1),
            )
        )
    db.add(t)
    db.commit()
    return get_visible_template(db, t.id, user)
