"""Read-only exercise and equipment catalog (seeded now, synced from wger in week 2)."""

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.deps import CurrentUser, DbSession
from app.models import Equipment, Exercise
from app.schemas import Category, EquipmentDetail, EquipmentOut, EquipmentType, ExerciseOut

router = APIRouter(tags=["catalog"])


@router.get("/exercises", response_model=list[ExerciseOut])
def list_exercises(
    db: DbSession,
    _: CurrentUser,
    search: str | None = Query(default=None, max_length=80),
    muscle_group: str | None = None,
    category: Category | None = None,
    equipment_id: int | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
) -> list[Exercise]:
    q = select(Exercise).options(selectinload(Exercise.equipment)).order_by(Exercise.name)
    if search:
        q = q.where(Exercise.name.ilike(f"%{search}%"))
    if muscle_group:
        q = q.where(Exercise.muscle_group == muscle_group)
    if category:
        q = q.where(Exercise.category == category)
    if equipment_id is not None:
        q = q.where(Exercise.equipment_id == equipment_id)
    return list(db.scalars(q.limit(limit).offset(offset)))


@router.get("/exercises/{exercise_id}", response_model=ExerciseOut)
def get_exercise(exercise_id: int, db: DbSession, _: CurrentUser) -> Exercise:
    ex = db.get(Exercise, exercise_id)
    if ex is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Exercise not found")
    return ex


@router.get("/equipment", response_model=list[EquipmentOut])
def list_equipment(
    db: DbSession, _: CurrentUser, type: EquipmentType | None = None
) -> list[Equipment]:
    q = select(Equipment).order_by(Equipment.name)
    if type:
        q = q.where(Equipment.type == type)
    return list(db.scalars(q))


@router.get("/equipment/{equipment_id}", response_model=EquipmentDetail)
def get_equipment(equipment_id: int, db: DbSession, _: CurrentUser) -> Equipment:
    eq = db.scalar(
        select(Equipment)
        .where(Equipment.id == equipment_id)
        .options(selectinload(Equipment.exercises))
    )
    if eq is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Equipment not found")
    return eq
