"""Load the starter catalog and built-in programs. Safe to run any number of times.

    python -m app.seed
"""

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.models import Equipment, Exercise, TemplateExercise, WorkoutTemplate
from app.seed_data import EQUIPMENT, EXERCISES, PROGRAMS

SOURCE = "seed"


def seed_equipment(db: Session) -> dict[str, int]:
    for ext_id, name, type_, muscles, how_to in EQUIPMENT:
        stmt = insert(Equipment).values(
            source=SOURCE, external_id=ext_id, name=name, type=type_,
            muscle_groups=muscles, how_to=how_to,
        )
        db.execute(
            stmt.on_conflict_do_update(
                index_elements=["source", "external_id"],
                set_={"name": name, "type": type_, "muscle_groups": muscles, "how_to": how_to},
            )
        )
    rows = db.execute(select(Equipment.external_id, Equipment.id).where(Equipment.source == SOURCE))
    return {ext: id_ for ext, id_ in rows}


def seed_exercises(db: Session, equipment_ids: dict[str, int]) -> dict[str, int]:
    for ext_id, name, muscle, category, eq_ext, instructions in EXERCISES:
        values = {
            "name": name, "muscle_group": muscle, "category": category,
            "equipment_id": equipment_ids[eq_ext], "instructions": instructions,
        }
        stmt = insert(Exercise).values(source=SOURCE, external_id=ext_id, **values)
        db.execute(
            stmt.on_conflict_do_update(index_elements=["source", "external_id"], set_=values)
        )
    rows = db.execute(select(Exercise.external_id, Exercise.id).where(Exercise.source == SOURCE))
    return {ext: id_ for ext, id_ in rows}


def seed_programs(db: Session, exercise_ids: dict[str, int]) -> int:
    count = 0
    for program, description, days in PROGRAMS:
        for day_name, items in days:
            t = db.scalar(
                select(WorkoutTemplate).where(
                    WorkoutTemplate.name == day_name, WorkoutTemplate.user_id.is_(None)
                )
            )
            if t is None:
                t = WorkoutTemplate(name=day_name, is_builtin=True, user_id=None)
                db.add(t)
            t.description = description
            t.category = program
            t.exercises.clear()
            db.flush()
            for pos, (ex_ext, sets, reps) in enumerate(items, start=1):
                t.exercises.append(
                    TemplateExercise(
                        exercise_id=exercise_ids[ex_ext], position=pos,
                        target_sets=sets, target_reps=reps,
                    )
                )
            count += 1
    return count


def run(db: Session) -> dict[str, int]:
    equipment_ids = seed_equipment(db)
    exercise_ids = seed_exercises(db, equipment_ids)
    templates = seed_programs(db, exercise_ids)
    db.commit()
    return {"equipment": len(equipment_ids), "exercises": len(exercise_ids), "templates": templates}


if __name__ == "__main__":
    with SessionLocal() as session:
        result = run(session)
    print(
        f"Seeded {result['equipment']} equipment, {result['exercises']} exercises, "
        f"{result['templates']} built-in program days."
    )
