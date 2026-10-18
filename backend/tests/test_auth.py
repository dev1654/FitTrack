from tests.conftest import signup


def test_signup_login_and_me(client):
    headers = signup(client, email="Dev@Example.com")
    me = client.get("/auth/me", headers=headers)
    assert me.status_code == 200
    assert me.json()["email"] == "dev@example.com"
    assert me.json()["unit_pref"] == "kg"

    login = client.post("/auth/login", json={"email": "dev@example.com", "password": "strongpass1"})
    assert login.status_code == 200
    assert login.json()["token_type"] == "bearer"


def test_duplicate_email_rejected(client):
    signup(client)
    res = client.post("/auth/signup", json={"email": "dev@example.com", "password": "anotherpass"})
    assert res.status_code == 409


def test_wrong_password(client):
    signup(client)
    res = client.post("/auth/login", json={"email": "dev@example.com", "password": "wrongpass1"})
    assert res.status_code == 401


def test_short_password_rejected(client):
    res = client.post("/auth/signup", json={"email": "a@example.com", "password": "short"})
    assert res.status_code == 422


def test_protected_routes_need_a_token(client):
    assert client.get("/sessions").status_code == 401
    bad = {"Authorization": "Bearer not-a-real-token"}
    assert client.get("/sessions", headers=bad).status_code == 401


def test_unit_preference(client, auth):
    res = client.patch("/auth/me", json={"unit_pref": "lb"}, headers=auth)
    assert res.status_code == 200
    assert res.json()["unit_pref"] == "lb"
    assert client.patch("/auth/me", json={"unit_pref": "stone"}, headers=auth).status_code == 422
