"""The deployed web app (any fittrack-web*.onrender.com URL) may call the API; other sites may not."""

import importlib

from fastapi.testclient import TestClient


def make_app(monkeypatch):
    monkeypatch.setenv("CORS_ORIGINS", "http://localhost:5173")
    monkeypatch.setenv("CORS_ORIGIN_REGEX", r"^https://fittrack-web(-[a-z0-9]+)?\.onrender\.com$")
    from app import config, main

    config.get_settings.cache_clear()
    try:
        return TestClient(importlib.reload(main).app)
    finally:
        config.get_settings.cache_clear()


def preflight(client, origin):
    return client.options(
        "/auth/login",
        headers={"Origin": origin, "Access-Control-Request-Method": "POST"},
    ).headers.get("access-control-allow-origin")


def test_cors_allows_the_web_app_and_blocks_others(monkeypatch):
    client = make_app(monkeypatch)
    assert preflight(client, "https://fittrack-web.onrender.com") == "https://fittrack-web.onrender.com"
    assert preflight(client, "https://fittrack-web-x9k2.onrender.com") == "https://fittrack-web-x9k2.onrender.com"
    assert preflight(client, "http://localhost:5173") == "http://localhost:5173"
    assert preflight(client, "https://evil.example.com") is None
    assert preflight(client, "https://fittrack-web.onrender.com.evil.com") is None
