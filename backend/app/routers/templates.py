"""Built-in programs (shared, read-only) and each user's custom workouts."""

from fastapi import APIRouter, HTTPException, Response, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session, selectinload

from app.deps import CurrentUser, DbSession
from app.models import Exercise, TemplateExercise, User, WorkoutTemplate
from app.schemas import TemplateExerciseIn, TemplateIn, TemplateOut, TemplateSummary

router = APIRouter(prefix="/templates", tags=["templates"])


def _with_exercises():
    return selectinload(WorkoutTemplate.exercises).selectinload(TemplateExercise.exercise)


def get_visible_template(db: Session, template_id: int, user: User) -> WorkoutTemplate:
    """A template the user may read: a built-in or one of their own."""
    t = db.scalar(
        select(WorkoutTemplate)
        .where(WorkoutTemplate.id == template_id)
        .where(or_(WorkoutTemplate.user_id.is_(None), WorkoutTemplate.user_id == user.id))
        .options(_with_exercises())
    )
    if t is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Template not found")
    return t


def _own_template(db: Session, template_id: int, user: User) -> WorkoutTemplate:
    t = get_visible_template(db, template_id, user)
    if t.user_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Built-in programs can't be changed")
    return t


def check_exercises_exist(db: Session, exercise_ids: set[int]) -> None:
    found = set(db.scalars(select(Exercise.id).where(Exercise.id.in_(exercise_ids))))
    missing = exercise_ids - found
    if missing:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, f"Unknown exercise ids: {sorted(missing)}"
        )


def build_template_exercises(items: list[TemplateExerciseIn]) -> list[TemplateExercise]:
    return [
        TemplateExercise(
            exercise_id=i.exercise_id,
            position=pos,
            target_sets=i.target_sets,
            target_reps=i.target_reps,
        )
        for pos, i in enumerate(items, start=1)
    ]


@router.get("", response_model=list[TemplateSummary])
def list_templates(
    db: DbSession, user: CurrentUser, builtin: bool | None = None
) -> list[WorkoutTemplate]:
    q = select(WorkoutTemplate).order_by(
        WorkoutTemplate.is_builtin.desc(), WorkoutTemplate.category, WorkoutTemplate.name
    )
    if builtin is True:
        q = q.where(WorkoutTemplate.user_id.is_(None))
    elif builtin is False:
        q = q.where(WorkoutTemplate.user_id == user.id)
    else:
        q = q.where(or_(WorkoutTemplate.user_id.is_(None), WorkoutTemplate.user_id == user.id))
    return list(db.scalars(q))


@router.get("/{template_id}", response_model=TemplateOut)
def get_template(template_id: int, db: DbSession, user: CurrentUser) -> WorkoutTemplate:
    return get_visible_template(db, template_id, user)


@router.post("", response_model=TemplateOut, status_code=status.HTTP_201_CREATED)
def create_template(body: TemplateIn, db: DbSession, user: CurrentUser) -> WorkoutTemplate:
    check_exercises_exist(db, {e.exercise_id for e in body.exercises})
    t = WorkoutTemplate(
        name=body.name,
        description=body.description,
        category=body.category,
        is_builtin=False,
        user_id=user.id,
        exercises=build_template_exercises(body.exercises),
    )
    db.add(t)
    db.commit()
    return get_visible_template(db, t.id, user)


@router.put("/{template_id}", response_model=TemplateOut)
def replace_template(
    template_id: int, body: TemplateIn, db: DbSession, user: CurrentUser
) -> WorkoutTemplate:
    t = _own_template(db, template_id, user)
    check_exercises_exist(db, {e.exercise_id for e in body.exercises})
    t.name, t.description, t.category = body.name, body.description, body.category
    t.exercises.clear()
    db.flush()
    t.exercises.extend(build_template_exercises(body.exercises))
    db.commit()
    db.expire_all()
    return get_visible_template(db, t.id, user)


@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_template(template_id: int, db: DbSession, user: CurrentUser) -> Response:
    t = _own_template(db, template_id, user)
    db.delete(t)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
