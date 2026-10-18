def _start(client, auth, **extra):
    body = {"date": "2026-10-18", **extra}
    res = client.post("/sessions", json=body, headers=auth)
    assert res.status_code == 201, res.text
    return res.json()


def test_log_a_strength_and_cardio_session(client, auth, exercise_ids):
    session = _start(client, auth, notes="Leg day")
    sid = session["id"]

    squat = {"exercise_id": exercise_ids["back-squat"], "set_number": 1, "reps": 5, "weight_kg": 100}
    run = {"exercise_id": exercise_ids["treadmill-run"], "set_number": 1,
           "duration_seconds": 1200, "distance_m": 3000}
    assert client.post(f"/sessions/{sid}/sets", json=squat, headers=auth).status_code == 201
    assert client.post(f"/sessions/{sid}/sets", json=run, headers=auth).status_code == 201

    detail = client.get(f"/sessions/{sid}", headers=auth).json()
    assert detail["notes"] == "Leg day"
    assert [s["weight_kg"] for s in detail["sets"]] == [100.0, None]
    assert detail["sets"][1]["distance_m"] == 3000.0


def test_edit_and_delete_a_set(client, auth, exercise_ids):
    sid = _start(client, auth)["id"]
    body = {"exercise_id": exercise_ids["bench-press"], "set_number": 1, "reps": 8, "weight_kg": 60}
    set_id = client.post(f"/sessions/{sid}/sets", json=body, headers=auth).json()["id"]

    res = client.patch(f"/sets/{set_id}", json={"weight_kg": 62.5}, headers=auth)
    assert res.json()["weight_kg"] == 62.5
    assert res.json()["reps"] == 8

    assert client.delete(f"/sets/{set_id}", headers=auth).status_code == 204
    assert client.get(f"/sessions/{sid}", headers=auth).json()["sets"] == []


def test_set_validation(client, auth, exercise_ids):
    sid = _start(client, auth)["id"]
    ex = exercise_ids["bench-press"]
    bad = [
        {"exercise_id": ex, "set_number": 1, "reps": 5, "weight_kg": -10},  # negative weight
        {"exercise_id": ex, "set_number": 0, "reps": 5},  # set numbers start at 1
        {"exercise_id": ex, "set_number": 1},  # nothing measured
        {"exercise_id": 999999, "set_number": 1, "reps": 5},  # unknown exercise
    ]
    for body in bad:
        assert client.post(f"/sessions/{sid}/sets", json=body, headers=auth).status_code == 422


def test_users_only_see_their_own_data(client, auth, other_auth, exercise_ids):
    sid = _start(client, auth)["id"]
    body = {"exercise_id": exercise_ids["deadlift"], "set_number": 1, "reps": 5, "weight_kg": 140}
    set_id = client.post(f"/sessions/{sid}/sets", json=body, headers=auth).json()["id"]

    assert client.get("/sessions", headers=other_auth).json() == []
    assert client.get(f"/sessions/{sid}", headers=other_auth).status_code == 404
    assert client.delete(f"/sessions/{sid}", headers=other_auth).status_code == 404
    assert client.post(f"/sessions/{sid}/sets", json=body, headers=other_auth).status_code == 404
    assert client.patch(f"/sets/{set_id}", json={"reps": 1}, headers=other_auth).status_code == 404
    assert client.delete(f"/sets/{set_id}", headers=other_auth).status_code == 404


def test_list_sessions_newest_first_with_date_filter(client, auth):
    for d in ("2026-10-01", "2026-10-10", "2026-10-15"):
        _start(client, auth, date=d)
    dates = [s["date"] for s in client.get("/sessions", headers=auth).json()]
    assert dates == ["2026-10-15", "2026-10-10", "2026-10-01"]

    filtered = client.get("/sessions", params={"from": "2026-10-05"}, headers=auth).json()
    assert [s["date"] for s in filtered] == ["2026-10-15", "2026-10-10"]


def test_delete_session_removes_its_sets(client, auth, exercise_ids):
    sid = _start(client, auth)["id"]
    body = {"exercise_id": exercise_ids["pull-up"], "set_number": 1, "reps": 8}
    client.post(f"/sessions/{sid}/sets", json=body, headers=auth)
    assert client.delete(f"/sessions/{sid}", headers=auth).status_code == 204
    assert client.get(f"/sessions/{sid}", headers=auth).status_code == 404


def test_body_metrics_one_entry_per_day(client, auth):
    first = client.put("/body-metrics", json={"date": "2026-10-18", "body_weight_kg": 80.5},
                       headers=auth)
    assert first.status_code == 200
    again = client.put("/body-metrics",
                       json={"date": "2026-10-18", "body_weight_kg": 80.1,
                             "measurements": {"waist_cm": 84}},
                       headers=auth)
    assert again.json()["id"] == first.json()["id"]

    entries = client.get("/body-metrics", headers=auth).json()
    assert len(entries) == 1
    assert entries[0]["body_weight_kg"] == 80.1
    assert entries[0]["measurements"] == {"waist_cm": 84.0}

    empty = client.put("/body-metrics", json={"date": "2026-10-19"}, headers=auth)
    assert empty.status_code == 422
