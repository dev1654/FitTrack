"""Nightly analytics: raw set entries -> one exercise_stats row per user, exercise and day.

    python -m app.pipeline.analytics

For every strength exercise a user trained on a given day it stores:
  - est_1rm_kg: the best estimated one-rep max of that day's sets (Epley formula)
  - total_volume_kg: sum of reps x weight across that day's sets
  - is_plateau: no new best estimated 1RM in the last PLATEAU_WINDOW sessions

The table is rebuilt in one transaction, so the dashboard never sees a half-written result
and edits or deletions of old sets are always reflected.
"""

import logging
from datetime import date

import pandas as pd
from sqlalchemy import delete, insert, select
from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.models import Exercise, ExerciseStat, SetEntry, WorkoutSession
from app.pipeline.runs import setup_logging, track_run

log = logging.getLogger("fittrack.pipeline.analytics")

JOB = "analytics"
PLATEAU_WINDOW = 3  # sessions without a new best before an exercise is flagged

STAT_COLUMNS = ["user_id", "exercise_id", "date", "est_1rm_kg", "total_volume_kg", "is_plateau"]


def epley_1rm(weight_kg: float, reps: int) -> float:
    """Estimated one-rep max. A single rep is the max itself."""
    if reps <= 0 or weight_kg <= 0:
        return 0.0
    if reps == 1:
        return float(weight_kg)
    return float(weight_kg) * (1 + reps / 30)


def compute_stats(sets: pd.DataFrame, plateau_window: int = PLATEAU_WINDOW) -> pd.DataFrame:
    """Pure transform. `sets` has user_id, exercise_id, date, reps, weight_kg (one row per set)."""
    if sets.empty:
        return pd.DataFrame(columns=STAT_COLUMNS)

    df = sets.copy()
    df["reps"] = pd.to_numeric(df["reps"], errors="coerce").fillna(0)
    df["weight_kg"] = pd.to_numeric(df["weight_kg"], errors="coerce").fillna(0.0)
    lifted = (df["reps"] > 0) & (df["weight_kg"] > 0)

    df["volume"] = (df["reps"] * df["weight_kg"]).where(lifted, 0.0)
    df["e1rm"] = (df["weight_kg"] * (1 + df["reps"] / 30)).where(lifted)
    df.loc[lifted & (df["reps"] == 1), "e1rm"] = df["weight_kg"]

    daily = (
        df.groupby(["user_id", "exercise_id", "date"], as_index=False)
        .agg(est_1rm_kg=("e1rm", "max"), total_volume_kg=("volume", "sum"))
        .sort_values(["user_id", "exercise_id", "date"], ignore_index=True)
    )

    def flag_plateaus(group: pd.DataFrame) -> pd.Series:
        e1rm = group["est_1rm_kg"]
        best_before = e1rm.cummax().shift(1)
        # A session sets a new best when it beats every earlier session (the first always does).
        new_best = e1rm.notna() & (best_before.isna() | (e1rm > best_before + 1e-9))
        recent_new_best = new_best.astype(int).rolling(plateau_window, min_periods=plateau_window).sum()
        enough_history = pd.Series(range(len(group)), index=group.index) >= plateau_window
        return (enough_history & (recent_new_best == 0) & e1rm.notna()).astype(bool)

    daily["is_plateau"] = False
    for _, group in daily.groupby(["user_id", "exercise_id"], sort=False):
        daily.loc[group.index, "is_plateau"] = flag_plateaus(group)

    daily["est_1rm_kg"] = daily["est_1rm_kg"].round(2)
    daily["total_volume_kg"] = daily["total_volume_kg"].round(2)
    return daily[STAT_COLUMNS]


def load_sets(db: Session) -> pd.DataFrame:
    query = (
        select(
            WorkoutSession.user_id,
            SetEntry.exercise_id,
            WorkoutSession.date,
            SetEntry.reps,
            SetEntry.weight_kg,
        )
        .join(WorkoutSession, SetEntry.session_id == WorkoutSession.id)
        .join(Exercise, SetEntry.exercise_id == Exercise.id)
        .where(Exercise.category == "strength")
    )
    rows = db.execute(query).all()
    return pd.DataFrame(rows, columns=["user_id", "exercise_id", "date", "reps", "weight_kg"])


def _records(stats: pd.DataFrame) -> list[dict]:
    out = []
    for row in stats.itertuples(index=False):
        out.append(
            {
                "user_id": int(row.user_id),
                "exercise_id": int(row.exercise_id),
                "date": row.date if isinstance(row.date, date) else pd.Timestamp(row.date).date(),
                "est_1rm_kg": None if pd.isna(row.est_1rm_kg) else float(row.est_1rm_kg),
                "total_volume_kg": float(row.total_volume_kg),
                "is_plateau": bool(row.is_plateau),
            }
        )
    return out


def rebuild(db: Session) -> dict:
    """Recomputes exercise_stats from scratch. Caller commits."""
    sets = load_sets(db)
    stats = compute_stats(sets)
    records = _records(stats)
    db.execute(delete(ExerciseStat))
    if records:
        db.execute(insert(ExerciseStat), records)
    latest = stats.sort_values("date").groupby(["user_id", "exercise_id"]).tail(1)
    return {
        "sets_read": len(sets),
        "users": int(sets["user_id"].nunique()) if not sets.empty else 0,
        "rows_written": len(records),
        "exercises_plateaued_now": int(latest["is_plateau"].sum()) if not latest.empty else 0,
    }


def run() -> dict:
    with track_run(JOB) as stats:
        with SessionLocal() as db:
            stats.update(rebuild(db))
            db.commit()
    return stats


def main() -> None:
    setup_logging()
    log.info("done: %s", run())


if __name__ == "__main__":
    main()
