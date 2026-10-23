"""Last time + next target, and the dashboard stats endpoints."""

from app.pipeline import analytics


def _log(client, auth, day, exercise_id, sets):
    sid = client.post("/sessions", json={"date": day}, headers=auth).json()["id"]
    for n, (reps, kg) in enumerate(sets, start=1):
        body = {"exercise_id": exercise_id, "set_number": n, "reps": reps, "weight_kg": kg}
        assert client.post(f"/sessions/{sid}/sets", json=body, headers=auth).status_code == 201
    return sid


def test_last_time_with_no_history(client, auth, exercise_ids):
    res = client.get(f"/exercises/{exercise_ids['bench-press']}/last", headers=auth).json()
    assert res == {
        "exercise_id": exercise_ids["bench-press"],
        "last_date": None,
        "sets": [],
        "suggestion": None,
    }


def test_all_sets_hit_target_so_add_weight(client, auth, exercise_ids):
    bench = exercise_ids["bench-press"]
    _log(client, auth, "2026-10-01", bench, [(8, 50)] * 3)
    _log(client, auth, "2026-10-05", bench, [(8, 60), (8, 60), (8, 60)])

    res = client.get(f"/exercises/{bench}/last", params={"target_reps": 8}, headers=auth).json()
    assert res["last_date"] == "2026-10-05"
    assert [(s["reps"], s["weight_kg"]) for s in res["sets"]] == [(8, 60.0)] * 3
    assert res["suggestion"]["weight_kg"] == 62.5  # upper body: +2.5 kg
    assert res["suggestion"]["reps"] == 8


def test_lower_body_steps_up_5kg(client, auth, exercise_ids):
    squat = exercise_ids["back-squat"]
    _log(client, auth, "2026-10-05", squat, [(5, 100)] * 5)
    res = client.get(f"/exercises/{squat}/last", params={"target_reps": 5}, headers=auth).json()
    assert res["suggestion"]["weight_kg"] == 105.0


def test_deadlift_steps_up_5kg_though_filed_under_back(client, auth, exercise_ids):
    deadlift = exercise_ids["deadlift"]
    _log(client, auth, "2026-10-05", deadlift, [(5, 120)])
    res = client.get(f"/exercises/{deadlift}/last", params={"target_reps": 5}, headers=auth).json()
    assert res["suggestion"]["weight_kg"] == 125.0


def test_missed_reps_so_repeat_the_weight(client, auth, exercise_ids):
    bench = exercise_ids["bench-press"]
    _log(client, auth, "2026-10-05", bench, [(8, 60), (7, 60), (6, 60)])
    res = client.get(f"/exercises/{bench}/last", params={"target_reps": 8}, headers=auth).json()
    assert (res["suggestion"]["weight_kg"], res["suggestion"]["reps"]) == (60.0, 8)
    assert "Stay at 60 kg" in res["suggestion"]["reason"]


def test_bodyweight_suggests_one_more_rep(client, auth, exercise_ids):
    pull_up = exercise_ids["pull-up"]
    _log(client, auth, "2026-10-05", pull_up, [(8, None), (6, None)])
    res = client.get(f"/exercises/{pull_up}/last", headers=auth).json()
    assert (res["suggestion"]["weight_kg"], res["suggestion"]["reps"]) == (None, 9)


def test_before_skips_todays_session(client, auth, exercise_ids):
    bench = exercise_ids["bench-press"]
    _log(client, auth, "2026-10-01", bench, [(5, 70)])
    _log(client, auth, "2026-10-08", bench, [(5, 72.5)])
    res = client.get(f"/exercises/{bench}/last", params={"before": "2026-10-08"}, headers=auth)
    assert res.json()["last_date"] == "2026-10-01"


def test_last_time_is_private(client, auth, other_auth, exercise_ids):
    bench = exercise_ids["bench-press"]
    _log(client, auth, "2026-10-05", bench, [(8, 60)])
    res = client.get(f"/exercises/{bench}/last", headers=other_auth).json()
    assert res["last_date"] is None


def test_dashboard_stats(client, auth, other_auth, exercise_ids):
    bench, squat = exercise_ids["bench-press"], exercise_ids["back-squat"]
    # Bench stalls: 100 kg singles for four sessions after an early best.
    for day, kg in [("2026-10-01", 100), ("2026-10-03", 100), ("2026-10-06", 100), ("2026-10-08", 100)]:
        _log(client, auth, day, bench, [(1, kg)])
    _log(client, auth, "2026-10-08", squat, [(5, 120), (5, 120)])
    _log(client, other_auth, "2026-10-08", bench, [(1, 200)])  # someone else's data
    analytics.run()

    trend = client.get(f"/stats/exercises/{bench}", headers=auth).json()
    assert [t["date"] for t in trend] == ["2026-10-01", "2026-10-03", "2026-10-06", "2026-10-08"]
    assert trend[-1]["is_plateau"] is True

    prs = {p["exercise_name"]: p for p in client.get("/stats/prs", headers=auth).json()}
    assert prs["Barbell Bench Press"]["best_est_1rm_kg"] == 100.0
    assert prs["Barbell Bench Press"]["best_est_1rm_date"] == "2026-10-01"
    assert prs["Barbell Back Squat"]["heaviest_weight_kg"] == 120.0

    plateaus = client.get("/stats/plateaus", headers=auth).json()
    assert [p["exercise_name"] for p in plateaus] == ["Barbell Bench Press"]

    volume = client.get("/stats/weekly-volume", params={"weeks": 104}, headers=auth).json()
    by_group = {}
    for row in volume:
        by_group[row["muscle_group"]] = by_group.get(row["muscle_group"], 0) + row["total_volume_kg"]
    assert by_group == {"chest": 400.0, "quads": 1200.0}
    assert all(r["week_start"] in ("2026-09-28", "2026-10-05") for r in volume)  # Mondays
