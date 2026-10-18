def test_builtin_programs_are_listed(client, auth):
    templates = client.get("/templates", params={"builtin": True}, headers=auth).json()
    categories = {t["category"] for t in templates}
    assert categories == {"StrongLifts 5x5", "Push/Pull/Legs", "Upper/Lower", "Full-Body 3x"}
    assert all(t["is_builtin"] for t in templates)


def test_builtin_template_prefills_exercises(client, auth, builtin_template_id):
    t = client.get(f"/templates/{builtin_template_id}", headers=auth).json()
    assert [(e["exercise"]["name"], e["target_sets"], e["target_reps"]) for e in t["exercises"]] == [
        ("Barbell Back Squat", 5, 5),
        ("Barbell Bench Press", 5, 5),
        ("Barbell Row", 5, 5),
    ]


def test_builtin_templates_cannot_be_changed(client, auth, builtin_template_id, exercise_ids):
    body = {"name": "Hacked", "exercises": [
        {"exercise_id": exercise_ids["dip"], "target_sets": 3, "target_reps": 10}]}
    assert client.put(f"/templates/{builtin_template_id}", json=body, headers=auth).status_code == 403
    assert client.delete(f"/templates/{builtin_template_id}", headers=auth).status_code == 403


def test_custom_template_crud(client, auth, other_auth, exercise_ids):
    body = {
        "name": "Arm day",
        "category": "Custom",
        "exercises": [
            {"exercise_id": exercise_ids["db-curl"], "target_sets": 3, "target_reps": 12},
            {"exercise_id": exercise_ids["triceps-pushdown"], "target_sets": 3, "target_reps": 12},
        ],
    }
    created = client.post("/templates", json=body, headers=auth)
    assert created.status_code == 201
    tid = created.json()["id"]
    assert [e["position"] for e in created.json()["exercises"]] == [1, 2]

    mine = client.get("/templates", params={"builtin": False}, headers=auth).json()
    assert [t["name"] for t in mine] == ["Arm day"]

    # Someone else can't see or change it.
    assert client.get(f"/templates/{tid}", headers=other_auth).status_code == 404
    assert client.get("/templates", params={"builtin": False}, headers=other_auth).json() == []

    body["name"] = "Arms"
    body["exercises"] = [{"exercise_id": exercise_ids["hammer-curl"], "target_sets": 4, "target_reps": 10}]
    updated = client.put(f"/templates/{tid}", json=body, headers=auth).json()
    assert updated["name"] == "Arms"
    assert [e["exercise"]["name"] for e in updated["exercises"]] == ["Hammer Curl"]

    assert client.delete(f"/templates/{tid}", headers=auth).status_code == 204
    assert client.get(f"/templates/{tid}", headers=auth).status_code == 404


def test_template_with_unknown_exercise_rejected(client, auth):
    body = {"name": "Bad", "exercises": [{"exercise_id": 999999, "target_sets": 3, "target_reps": 5}]}
    assert client.post("/templates", json=body, headers=auth).status_code == 422


def test_start_session_from_template_then_save_as_template(
    client, auth, builtin_template_id, exercise_ids
):
    session = client.post(
        "/sessions", json={"date": "2026-10-18", "template_id": builtin_template_id}, headers=auth
    ).json()
    assert session["template_id"] == builtin_template_id
    sid = session["id"]

    logged = [("back-squat", 5, 100), ("back-squat", 5, 100), ("back-squat", 4, 100),
              ("bench-press", 5, 70), ("bench-press", 6, 70)]
    for n, (ex, reps, kg) in enumerate(logged, start=1):
        body = {"exercise_id": exercise_ids[ex], "set_number": n, "reps": reps, "weight_kg": kg}
        assert client.post(f"/sessions/{sid}/sets", json=body, headers=auth).status_code == 201

    res = client.post(f"/sessions/{sid}/save-as-template", json={"name": "My 5x5"}, headers=auth)
    assert res.status_code == 201
    t = res.json()
    assert t["is_builtin"] is False
    assert [(e["exercise"]["name"], e["target_sets"], e["target_reps"]) for e in t["exercises"]] == [
        ("Barbell Back Squat", 3, 5),
        ("Barbell Bench Press", 2, 6),
    ]


def test_cannot_start_from_someone_elses_template(client, auth, other_auth, exercise_ids):
    body = {"name": "Private", "exercises": [
        {"exercise_id": exercise_ids["push-up"], "target_sets": 3, "target_reps": 20}]}
    tid = client.post("/templates", json=body, headers=auth).json()["id"]
    res = client.post("/sessions", json={"date": "2026-10-18", "template_id": tid}, headers=other_auth)
    assert res.status_code == 404
