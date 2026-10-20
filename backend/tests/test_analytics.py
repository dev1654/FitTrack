"""Nightly analytics: Epley 1RM, volume, plateau flags, and the rebuild job."""

from datetime import date

import pandas as pd
import pytest
from sqlalchemy import select

from app.db import SessionLocal
from app.models import ExerciseStat, PipelineRun
from app.pipeline import analytics


def sets_frame(rows):
    return pd.DataFrame(rows, columns=["user_id", "exercise_id", "date", "reps", "weight_kg"])


@pytest.mark.parametrize(
    ("weight", "reps", "expected"),
    [(100, 1, 100.0), (100, 5, 116.67), (60, 10, 80.0), (100, 0, 0.0), (0, 10, 0.0)],
)
def test_epley(weight, reps, expected):
    assert analytics.epley_1rm(weight, reps) == pytest.approx(expected, abs=0.01)


def test_daily_best_1rm_and_volume():
    stats = analytics.compute_stats(
        sets_frame(
            [
                (1, 10, date(2026, 10, 1), 5, 100),  # e1rm 116.67
                (1, 10, date(2026, 10, 1), 3, 110),  # e1rm 121.0  <- best
                (1, 10, date(2026, 10, 1), 8, 80),  # e1rm 101.33
            ]
        )
    )
    row = stats.iloc[0]
    assert row["est_1rm_kg"] == pytest.approx(121.0)
    assert row["total_volume_kg"] == pytest.approx(5 * 100 + 3 * 110 + 8 * 80)
    assert not row["is_plateau"]


def test_bodyweight_sets_have_no_1rm_and_no_volume():
    stats = analytics.compute_stats(sets_frame([(1, 10, date(2026, 10, 1), 12, None)]))
    assert pd.isna(stats.iloc[0]["est_1rm_kg"])
    assert stats.iloc[0]["total_volume_kg"] == 0


def test_plateau_after_three_sessions_without_a_new_best():
    # Best 1RM by session: 100, 105, 105, 104, 105, 110
    weights = [100, 105, 105, 104, 105, 110]
    rows = [(1, 10, date(2026, 10, d + 1), 1, w) for d, w in enumerate(weights)]
    flags = analytics.compute_stats(sets_frame(rows))["is_plateau"].tolist()
    #        new best  new best  same   lower  same   new best
    assert flags == [False, False, False, False, True, False]


def test_plateau_is_tracked_per_user_and_exercise():
    rows = []
    for d in range(5):  # user 1 is stuck, user 2 keeps improving on the same exercise
        rows.append((1, 10, date(2026, 10, d + 1), 1, 100))
        rows.append((2, 10, date(2026, 10, d + 1), 1, 100 + d))
    stats = analytics.compute_stats(sets_frame(rows))
    latest = stats.sort_values("date").groupby("user_id").tail(1).set_index("user_id")
    assert bool(latest.loc[1, "is_plateau"]) is True
    assert bool(latest.loc[2, "is_plateau"]) is False


def test_empty_input():
    assert analytics.compute_stats(sets_frame([])).empty


def _log(client, auth, day, exercise_id, sets):
    sid = client.post("/sessions", json={"date": day}, headers=auth).json()["id"]
    for n, (reps, kg) in enumerate(sets, start=1):
        body = {"exercise_id": exercise_id, "set_number": n, "reps": reps, "weight_kg": kg}
        assert client.post(f"/sessions/{sid}/sets", json=body, headers=auth).status_code == 201
    return sid


def test_rebuild_writes_stats_and_reflects_deletions(client, auth, exercise_ids):
    squat = exercise_ids["back-squat"]
    _log(client, auth, "2026-10-01", squat, [(5, 100)] * 3)
    second = _log(client, auth, "2026-10-03", squat, [(5, 105)] * 3)
    run_ = _log(client, auth, "2026-10-03", exercise_ids["treadmill-run"], [])
    client.post(
        f"/sessions/{run_}/sets",
        json={"exercise_id": exercise_ids["treadmill-run"], "set_number": 1, "duration_seconds": 600},
        headers=auth,
    )

    result = analytics.run()
    assert result == {"sets_read": 6, "users": 1, "rows_written": 2, "exercises_plateaued_now": 0}
    with SessionLocal() as db:
        rows = db.scalars(select(ExerciseStat).order_by(ExerciseStat.date)).all()
        assert [float(r.est_1rm_kg) for r in rows] == [116.67, 122.5]
        assert float(rows[1].total_volume_kg) == 3 * 5 * 105
        run = db.scalars(select(PipelineRun).where(PipelineRun.job == "analytics")).one()
        assert run.status == "success" and run.stats["rows_written"] == 2

    # Deleting a session removes its stats on the next run.
    client.delete(f"/sessions/{second}", headers=auth)
    assert analytics.run()["rows_written"] == 1
