def test_exercise_search_and_filters(client, auth):
    res = client.get("/exercises", params={"search": "squat"}, headers=auth)
    assert res.status_code == 200
    names = {e["name"] for e in res.json()}
    assert {"Barbell Back Squat", "Goblet Squat"} <= names

    cardio = client.get("/exercises", params={"category": "cardio"}, headers=auth).json()
    assert cardio and all(e["category"] == "cardio" for e in cardio)


def test_browse_by_machine(client, auth):
    machines = client.get("/equipment", params={"type": "machine"}, headers=auth).json()
    leg_press = next(m for m in machines if m["name"] == "Leg press machine")

    detail = client.get(f"/equipment/{leg_press['id']}", headers=auth).json()
    assert [e["name"] for e in detail["exercises"]] == ["Leg Press"]

    by_filter = client.get(
        "/exercises", params={"equipment_id": leg_press["id"]}, headers=auth
    ).json()
    assert by_filter[0]["equipment"]["name"] == "Leg press machine"


def test_missing_catalog_items_404(client, auth):
    assert client.get("/exercises/999999", headers=auth).status_code == 404
    assert client.get("/equipment/999999", headers=auth).status_code == 404


def test_health(client):
    assert client.get("/health").json() == {"status": "ok"}
