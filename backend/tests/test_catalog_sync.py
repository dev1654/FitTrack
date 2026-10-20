"""The catalog sync end to end, against a fake wger server serving real wger records."""

import copy
import json
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import httpx
import pytest
from sqlalchemy import func, select

from app.db import SessionLocal
from app.models import Equipment, Exercise, PipelineRun
from app.pipeline import catalog_sync, wger

SAMPLE = json.loads(
    (Path(__file__).parent / "fixtures" / "wger_exerciseinfo_sample.json").read_text("utf-8")
)
BASE = "https://wger.test/api/v2/"


class FakeWger:
    """Serves /exerciseinfo/ with limit/offset pagination and absolute `next` links."""

    def __init__(self, items, page_size=5, fail_times=0, status=503):
        self.items, self.page_size = items, page_size
        self.fail_times, self.status = fail_times, status
        self.requests = 0

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests += 1
        if self.fail_times > 0:
            self.fail_times -= 1
            return httpx.Response(self.status, json={"detail": "busy"})
        assert request.url.path == "/api/v2/exerciseinfo/"
        q = parse_qs(urlparse(str(request.url)).query)
        offset = int(q.get("offset", ["0"])[0])
        page = self.items[offset : offset + self.page_size]
        nxt = offset + self.page_size
        return httpx.Response(
            200,
            json={
                "count": len(self.items),
                "next": f"{BASE}exerciseinfo/?limit={self.page_size}&offset={nxt}"
                if nxt < len(self.items)
                else None,
                "previous": None,
                "results": page,
            },
        )


def client_for(server: FakeWger) -> httpx.Client:
    return wger.make_client(BASE, transport=httpx.MockTransport(server))


@pytest.fixture(autouse=True)
def no_sleep(monkeypatch):
    monkeypatch.setattr(wger.time, "sleep", lambda s: None)


def wger_exercises():
    with SessionLocal() as db:
        return {
            e.name: e
            for e in db.scalars(select(Exercise).where(Exercise.source == "wger"))
        }


def last_run():
    with SessionLocal() as db:
        return db.scalars(select(PipelineRun).order_by(PipelineRun.id.desc())).first()


def test_sync_imports_valid_exercises_across_pages():
    server = FakeWger(copy.deepcopy(SAMPLE), page_size=5)
    stats = catalog_sync.run(client_for(server), min_expected=1)

    assert server.requests == 3  # 13 records, 5 per page
    assert stats["fetched"] == 13
    assert stats["skipped"] == {"duplicate_name": 1}
    assert stats["exercises"] == {"inserted": 12, "updated": 0, "unchanged": 0}

    exercises = wger_exercises()
    assert len(exercises) == 12
    with SessionLocal() as db:
        swing = exercises["2 Handed Kettlebell Swing"]
        assert db.get(Equipment, swing.equipment_id).name == "Kettlebell"
        # Common equipment points at the seed rows instead of duplicating them.
        press = exercises["Arnold Shoulder Press"]
        dumbbells = db.get(Equipment, press.equipment_id)
        assert (dumbbells.source, dumbbells.external_id) == ("seed", "dumbbells")
        barbells = db.scalar(
            select(func.count()).select_from(Equipment).where(Equipment.name.ilike("barbell"))
        )
        assert barbells == 1

    run = last_run()
    assert run.job == "catalog_sync" and run.status == "success"
    assert run.stats["exercises"]["inserted"] == 12
    assert run.finished_at is not None


def test_rerun_is_idempotent_and_detects_changes():
    items = copy.deepcopy(SAMPLE)
    catalog_sync.run(client_for(FakeWger(items)), min_expected=1)

    again = catalog_sync.run(client_for(FakeWger(copy.deepcopy(items))), min_expected=1)
    assert again["exercises"] == {"inserted": 0, "updated": 0, "unchanged": 12}
    assert again["equipment"]["inserted"] == 0

    changed = copy.deepcopy(items)
    target = next(r for r in changed if r["id"] == 20)
    for t in target["translations"]:
        if t["language"] == wger.ENGLISH:
            t["name"] = "Arnold Press"
    third = catalog_sync.run(client_for(FakeWger(changed)), min_expected=1)
    assert third["exercises"] == {"inserted": 0, "updated": 1, "unchanged": 11}
    assert "Arnold Press" in wger_exercises()
    assert len(wger_exercises()) == 12


def test_transient_errors_are_retried():
    server = FakeWger(copy.deepcopy(SAMPLE), fail_times=2, status=503)
    stats = catalog_sync.run(client_for(server), min_expected=1)
    assert stats["exercises"]["inserted"] == 12


def test_persistent_failure_is_recorded_and_writes_nothing():
    server = FakeWger(copy.deepcopy(SAMPLE), fail_times=99, status=500)
    with pytest.raises(httpx.HTTPStatusError):
        catalog_sync.run(client_for(server), min_expected=1)
    assert wger_exercises() == {}
    run = last_run()
    assert run.status == "failed" and "500" in run.error


def test_suspiciously_small_feed_is_rejected():
    with pytest.raises(catalog_sync.TooFewExercises):
        catalog_sync.run(client_for(FakeWger(copy.deepcopy(SAMPLE))), min_expected=500)
    assert wger_exercises() == {}
    assert last_run().status == "failed"


def test_unexpected_response_shape_fails_cleanly():
    def broken(request):
        return httpx.Response(200, json={"oops": True})

    with pytest.raises(ValueError):
        catalog_sync.run(wger.make_client(BASE, transport=httpx.MockTransport(broken)), min_expected=1)
    assert last_run().status == "failed"


def test_synced_exercises_show_up_in_the_api(client, auth):
    catalog_sync.run(client_for(FakeWger(copy.deepcopy(SAMPLE))), min_expected=1)
    res = client.get("/exercises", params={"search": "kettlebell swing"}, headers=auth).json()
    assert res[0]["equipment"]["name"] == "Kettlebell"

    runs = client.get("/pipeline/runs", params={"job": "catalog_sync"}, headers=auth).json()
    assert runs[0]["status"] == "success"
