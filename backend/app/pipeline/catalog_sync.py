"""Weekly catalog sync: wger exercises and equipment -> the exercises and equipment tables.

    python -m app.pipeline.catalog_sync            # fetch, validate, upsert
    python -m app.pipeline.catalog_sync --dry-run  # fetch and validate only, write nothing

Safe to re-run: rows are matched on (source, external_id), so nothing is duplicated, and
rows whose values didn't change aren't touched. Exercises removed from wger are kept,
because users' logged sets may point at them.
"""

import argparse
import logging
from collections import Counter

import httpx
from sqlalchemy import func, literal_column, select, tuple_
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.models import Equipment, Exercise
from app.pipeline import wger
from app.pipeline.runs import setup_logging, track_run

log = logging.getLogger("fittrack.pipeline.catalog_sync")

JOB = "catalog_sync"
SOURCE = "wger"
# If wger suddenly returns far fewer exercises than usual, stop instead of syncing a broken feed.
MIN_EXPECTED_EXERCISES = 200


class TooFewExercises(RuntimeError):
    pass


def transform(raw_items: list[dict], seed_names: set[str]) -> tuple[list, Counter]:
    """Normalizes raw wger exercises and drops the ones that fail validation."""
    kept: list[wger.NormalizedExercise] = []
    skipped: Counter = Counter()
    seen_names: set[str] = set()
    for raw in sorted(raw_items, key=lambda r: r.get("id") or 0):
        result = wger.normalize(raw)
        if isinstance(result, str):
            skipped[result] += 1
            continue
        key = result.name.casefold()
        if key in seed_names:
            skipped["duplicates_seed_exercise"] += 1
            continue
        if key in seen_names:
            skipped["duplicate_name"] += 1
            continue
        seen_names.add(key)
        kept.append(result)
    return kept, skipped


def _upsert(db: Session, model, rows: list[dict], compare: list[str]) -> Counter:
    """Inserts new rows, updates changed ones, leaves identical ones alone."""
    counts: Counter = Counter()
    if not rows:
        return counts
    stmt = insert(model).values(rows)
    changed = tuple_(*[getattr(model, c) for c in compare]).is_distinct_from(
        tuple_(*[stmt.excluded[c] for c in compare])
    )
    stmt = stmt.on_conflict_do_update(
        index_elements=["source", "external_id"],
        set_={c: stmt.excluded[c] for c in compare},
        where=changed,
    ).returning(literal_column("xmax = 0").label("inserted"))
    for (inserted,) in db.execute(stmt):
        counts["inserted" if inserted else "updated"] += 1
    counts["unchanged"] = len(rows) - counts["inserted"] - counts["updated"]
    return counts


def sync_equipment(db: Session, exercises: list) -> tuple[dict[tuple[str, str], int], Counter]:
    """Makes sure every piece of equipment the exercises use exists; returns id lookup."""
    new_rows = {}
    for ex in exercises:
        eq = ex.equipment
        if eq is not None and eq.seed_external_id is None:
            new_rows[str(eq.wger_id)] = {
                "source": SOURCE,
                "external_id": str(eq.wger_id),
                "name": eq.name,
                "type": eq.type,
                "muscle_groups": [],
            }
    counts = _upsert(db, Equipment, list(new_rows.values()), ["name", "type"])
    ids = {
        (source, ext): id_
        for source, ext, id_ in db.execute(
            select(Equipment.source, Equipment.external_id, Equipment.id)
        )
    }
    return ids, counts


def _equipment_id(ex, ids: dict[tuple[str, str], int]) -> int | None:
    eq = ex.equipment
    if eq is None:
        return None
    if eq.seed_external_id is not None:
        return ids.get(("seed", eq.seed_external_id))
    return ids[(SOURCE, str(eq.wger_id))]


def sync(db: Session, raw_items: list[dict], min_expected: int = MIN_EXPECTED_EXERCISES) -> dict:
    """Validates and writes one batch of raw wger exercises. Caller commits."""
    if len(raw_items) < min_expected:
        raise TooFewExercises(
            f"wger returned {len(raw_items)} exercises, expected at least {min_expected}; "
            "nothing was written"
        )
    seed_names = {
        n.casefold() for n in db.scalars(select(Exercise.name).where(Exercise.source == "seed"))
    }
    exercises, skipped = transform(raw_items, seed_names)

    equipment_ids, equipment_counts = sync_equipment(db, exercises)
    rows = [
        {
            "source": SOURCE,
            "external_id": ex.external_id,
            "name": ex.name,
            "muscle_group": ex.muscle_group,
            "category": ex.category,
            "instructions": ex.instructions,
            "equipment_id": _equipment_id(ex, equipment_ids),
        }
        for ex in exercises
    ]
    compare = ["name", "muscle_group", "category", "instructions", "equipment_id"]
    exercise_counts: Counter = Counter()
    for start in range(0, len(rows), 500):
        exercise_counts += _upsert(db, Exercise, rows[start : start + 500], compare)
    exercise_counts["unchanged"] = (
        len(rows) - exercise_counts["inserted"] - exercise_counts["updated"]
    )

    total = db.scalar(select(func.count()).select_from(Exercise).where(Exercise.source == SOURCE))
    return {
        "fetched": len(raw_items),
        "valid": len(exercises),
        "skipped": dict(sorted(skipped.items())),
        "exercises": {k: exercise_counts[k] for k in ("inserted", "updated", "unchanged")},
        "equipment": {k: equipment_counts[k] for k in ("inserted", "updated", "unchanged")},
        "wger_exercises_in_catalog": total,
    }


def run(client: httpx.Client, min_expected: int = MIN_EXPECTED_EXERCISES) -> dict:
    with track_run(JOB) as stats:
        raw_items = list(wger.fetch_exercises(client))
        stats["fetched"] = len(raw_items)
        with SessionLocal() as db:
            stats.update(sync(db, raw_items, min_expected))
            db.commit()
    return stats


def dry_run(client: httpx.Client) -> dict:
    raw_items = list(wger.fetch_exercises(client))
    with SessionLocal() as db:
        seed_names = {
            n.casefold()
            for n in db.scalars(select(Exercise.name).where(Exercise.source == "seed"))
        }
    exercises, skipped = transform(raw_items, seed_names)
    return {"fetched": len(raw_items), "valid": len(exercises), "skipped": dict(skipped)}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--base-url", default=wger.WGER_BASE_URL)
    parser.add_argument("--dry-run", action="store_true", help="fetch and validate only")
    args = parser.parse_args()
    setup_logging()
    with wger.make_client(args.base_url) as client:
        result = dry_run(client) if args.dry_run else run(client)
    log.info("done: %s", result)


if __name__ == "__main__":
    main()
