"""Tests run against a real Postgres database (TEST_DATABASE_URL), never the dev one."""

import os

# Point the app at the test database before anything imports app.db.
os.environ["DATABASE_URL"] = os.environ.get(
    "TEST_DATABASE_URL", "postgresql://fittrack:fittrack@localhost:5432/fittrack_test"
)
os.environ.setdefault("JWT_SECRET", "test-secret-for-pytest-only-0123456789")

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import select, text  # noqa: E402

from app import seed  # noqa: E402
from app.db import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Exercise, WorkoutTemplate  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def schema():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    yield
    Base.metadata.drop_all(engine)


@pytest.fixture(autouse=True)
def clean_db(schema):
    tables = ", ".join(t.name for t in Base.metadata.sorted_tables)
    with engine.begin() as conn:
        conn.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))
    with SessionLocal() as db:
        seed.run(db)
    yield


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def signup(client: TestClient, email: str = "dev@example.com", password: str = "strongpass1"):
    res = client.post("/auth/signup", json={"email": email, "password": password})
    assert res.status_code == 201, res.text
    return {"Authorization": f"Bearer {res.json()['access_token']}"}


@pytest.fixture
def auth(client):
    return signup(client)


@pytest.fixture
def other_auth(client):
    return signup(client, email="someone@example.com")


@pytest.fixture
def exercise_ids():
    with SessionLocal() as db:
        rows = db.execute(select(Exercise.external_id, Exercise.id))
        return {ext: id_ for ext, id_ in rows}


@pytest.fixture
def builtin_template_id():
    with SessionLocal() as db:
        return db.scalar(
            select(WorkoutTemplate.id).where(WorkoutTemplate.name == "StrongLifts 5x5: Workout A")
        )
