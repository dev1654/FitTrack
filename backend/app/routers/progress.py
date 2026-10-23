"""Progress data: "last time" + next target (live), and dashboard stats (from the nightly job)."""

from datetime import date, timedelta
from typing import Literal

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import Date, cast, desc, func, select
from sqlalchemy.dialects.postgresql import distinct_on

from app.deps import CurrentUser, DbSession
from app.models import Exercise, ExerciseStat, PipelineRun, SetEntry, WorkoutSession
from app.schemas import (
    ExerciseStatOut,
    LastSet,
    LastTimeOut,
    PersonalRecordOut,
    PipelineRunOut,
    PlateauOut,
    Suggestion,
    WeeklyVolumeOut,
)

router = APIRouter(tags=["progress"])

LOWER_BODY = {"quads", "hamstrings", "glutes"}
# Deadlifts are often filed under "back" but progress like leg lifts.
LOWER_BODY_WORDS = ("squat", "deadlift", "leg press", "lunge", "hip thrust")


def _fmt(kg: float) -> str:
    return f"{kg:g} kg"


def suggest_next(exercise: Exercise, sets: list[SetEntry], target_reps: int | None) -> Suggestion | None:
    """Simple progressive overload.

    - Weighted: if every set at the top weight reached the goal reps, add 2.5 kg (5 kg for
      lower body); otherwise stay at that weight and aim for the goal reps on every set.
    - Bodyweight: one more rep than the best set.
    """
    if exercise.category != "strength" or not sets:
        return None
    weighted = [s for s in sets if s.weight_kg and s.weight_kg > 0 and s.reps]
    if weighted:
        top = max(float(s.weight_kg) for s in weighted)
        top_sets = [s for s in weighted if float(s.weight_kg) == top]
        goal = target_reps or top_sets[0].reps
        if all(s.reps >= goal for s in top_sets):
            lower = exercise.muscle_group in LOWER_BODY or any(
                w in exercise.name.lower() for w in LOWER_BODY_WORDS
            )
            step = 5.0 if lower else 2.5
            return Suggestion(
                weight_kg=top + step,
                reps=goal,
                reason=f"Every set hit {goal} reps at {_fmt(top)}, so add {_fmt(step)}.",
            )
        return Suggestion(
            weight_kg=top,
            reps=goal,
            reason=f"Stay at {_fmt(top)} and aim for {goal} reps on every set.",
        )
    reps = [s.reps for s in sets if s.reps]
    if reps:
        best = max(reps)
        return Suggestion(weight_kg=None, reps=best + 1, reason=f"Beat last time's best of {best} reps.")
    return None


@router.get("/exercises/{exercise_id}/last", response_model=LastTimeOut)
def last_time(
    exercise_id: int,
    db: DbSession,
    user: CurrentUser,
    target_reps: int | None = Query(default=None, gt=0, le=100),
    before: date | None = Query(
        default=None, description="Ignore sessions on or after this date (e.g. today's)"
    ),
) -> LastTimeOut:
    """The sets from the most recent session that included this exercise, plus a next target."""
    exercise = db.get(Exercise, exercise_id)
    if exercise is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Exercise not found")

    q = (
        select(WorkoutSession.id, WorkoutSession.date)
        .join(SetEntry, SetEntry.session_id == WorkoutSession.id)
        .where(WorkoutSession.user_id == user.id, SetEntry.exercise_id == exercise_id)
    )
    if before is not None:
        q = q.where(WorkoutSession.date < before)
    last = db.execute(
        q.order_by(desc(WorkoutSession.date), desc(WorkoutSession.id)).limit(1)
    ).first()
    if last is None:
        return LastTimeOut(exercise_id=exercise_id, last_date=None, sets=[], suggestion=None)

    sets = list(
        db.scalars(
            select(SetEntry)
            .where(SetEntry.session_id == last.id, SetEntry.exercise_id == exercise_id)
            .order_by(SetEntry.set_number, SetEntry.id)
        )
    )
    return LastTimeOut(
        exercise_id=exercise_id,
        last_date=last.date,
        sets=[LastSet.model_validate(s) for s in sets],
        suggestion=suggest_next(exercise, sets, target_reps),
    )


@router.get("/stats/exercises/{exercise_id}", response_model=list[ExerciseStatOut])
def exercise_stats(
    exercise_id: int,
    db: DbSession,
    user: CurrentUser,
    date_from: date | None = Query(default=None, alias="from"),
    date_to: date | None = Query(default=None, alias="to"),
) -> list[ExerciseStat]:
    """Daily 1RM, volume and plateau flag for one exercise, oldest first (for trend charts)."""
    q = select(ExerciseStat).where(
        ExerciseStat.user_id == user.id, ExerciseStat.exercise_id == exercise_id
    )
    if date_from:
        q = q.where(ExerciseStat.date >= date_from)
    if date_to:
        q = q.where(ExerciseStat.date <= date_to)
    return list(db.scalars(q.order_by(ExerciseStat.date)))


@router.get("/stats/weekly-volume", response_model=list[WeeklyVolumeOut])
def weekly_volume(
    db: DbSession,
    user: CurrentUser,
    weeks: int = Query(default=12, ge=1, le=104),
) -> list[WeeklyVolumeOut]:
    """Total volume per week (weeks start Monday) and muscle group, for volume and balance charts."""
    since = date.today() - timedelta(weeks=weeks)
    week = cast(func.date_trunc("week", ExerciseStat.date), Date).label("week_start")
    rows = db.execute(
        select(week, Exercise.muscle_group, func.sum(ExerciseStat.total_volume_kg))
        .join(Exercise, Exercise.id == ExerciseStat.exercise_id)
        .where(ExerciseStat.user_id == user.id, ExerciseStat.date >= since)
        .group_by(week, Exercise.muscle_group)
        .order_by(week, Exercise.muscle_group)
    )
    return [
        WeeklyVolumeOut(week_start=w, muscle_group=m, total_volume_kg=float(v or 0))
        for w, m, v in rows
    ]


@router.get("/stats/prs", response_model=list[PersonalRecordOut])
def personal_records(db: DbSession, user: CurrentUser) -> list[PersonalRecordOut]:
    """Best estimated 1RM (nightly stats) and heaviest set (live) for every exercise trained."""
    best_1rm = (
        select(ExerciseStat.exercise_id, ExerciseStat.est_1rm_kg, ExerciseStat.date)
        .where(ExerciseStat.user_id == user.id, ExerciseStat.est_1rm_kg.is_not(None))
        .order_by(ExerciseStat.exercise_id, desc(ExerciseStat.est_1rm_kg), ExerciseStat.date)
        .ext(distinct_on(ExerciseStat.exercise_id))
    )
    heaviest = (
        select(SetEntry.exercise_id, SetEntry.weight_kg, WorkoutSession.date)
        .join(WorkoutSession, WorkoutSession.id == SetEntry.session_id)
        .where(WorkoutSession.user_id == user.id, SetEntry.weight_kg > 0)
        .order_by(SetEntry.exercise_id, desc(SetEntry.weight_kg), WorkoutSession.date)
        .ext(distinct_on(SetEntry.exercise_id))
    )
    records: dict[int, dict] = {}
    for ex_id, value, day in db.execute(best_1rm):
        records.setdefault(ex_id, {})["best"] = (float(value), day)
    for ex_id, value, day in db.execute(heaviest):
        records.setdefault(ex_id, {})["heaviest"] = (float(value), day)
    if not records:
        return []
    names = dict(db.execute(select(Exercise.id, Exercise.name).where(Exercise.id.in_(records))).all())
    out = []
    for ex_id, rec in records.items():
        best = rec.get("best", (None, None))
        heavy = rec.get("heaviest", (None, None))
        out.append(
            PersonalRecordOut(
                exercise_id=ex_id,
                exercise_name=names[ex_id],
                best_est_1rm_kg=best[0],
                best_est_1rm_date=best[1],
                heaviest_weight_kg=heavy[0],
                heaviest_weight_date=heavy[1],
            )
        )
    return sorted(out, key=lambda r: r.exercise_name)


@router.get("/stats/plateaus", response_model=list[PlateauOut])
def plateaus(db: DbSession, user: CurrentUser) -> list[PlateauOut]:
    """Exercises whose most recent session is flagged as a plateau."""
    latest = (
        select(ExerciseStat)
        .where(ExerciseStat.user_id == user.id)
        .order_by(ExerciseStat.exercise_id, desc(ExerciseStat.date))
        .ext(distinct_on(ExerciseStat.exercise_id))
        .subquery()
    )
    best = (
        select(ExerciseStat.exercise_id, func.max(ExerciseStat.est_1rm_kg).label("best"))
        .where(ExerciseStat.user_id == user.id)
        .group_by(ExerciseStat.exercise_id)
        .subquery()
    )
    rows = db.execute(
        select(latest.c.exercise_id, Exercise.name, latest.c.date, latest.c.est_1rm_kg, best.c.best)
        .join(Exercise, Exercise.id == latest.c.exercise_id)
        .join(best, best.c.exercise_id == latest.c.exercise_id)
        .where(latest.c.is_plateau.is_(True))
        .order_by(Exercise.name)
    )
    return [
        PlateauOut(
            exercise_id=ex_id,
            exercise_name=name,
            last_session=day,
            est_1rm_kg=None if e1rm is None else float(e1rm),
            best_est_1rm_kg=None if top is None else float(top),
        )
        for ex_id, name, day, e1rm, top in rows
    ]


@router.get("/pipeline/runs", response_model=list[PipelineRunOut], tags=["pipeline"])
def pipeline_runs(
    db: DbSession,
    _: CurrentUser,
    job: Literal["catalog_sync", "analytics"] | None = None,
    limit: int = Query(default=20, ge=1, le=100),
) -> list[PipelineRun]:
    """Recent pipeline runs, newest first: what each job did and whether it failed."""
    q = select(PipelineRun).order_by(desc(PipelineRun.started_at), desc(PipelineRun.id))
    if job:
        q = q.where(PipelineRun.job == job)
    return list(db.scalars(q.limit(limit)))
