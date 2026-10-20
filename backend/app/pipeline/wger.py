"""Fetching and normalizing exercise data from the wger API (https://wger.de/api/v2/).

wger data is licensed CC-BY-SA 4.0; FitTrack keeps source="wger" on every row it imports
so the app can credit it.
"""

import html
import logging
import re
import time
from collections.abc import Iterator
from dataclasses import dataclass

import httpx

log = logging.getLogger("fittrack.pipeline.wger")

WGER_BASE_URL = "https://wger.de/api/v2/"
ENGLISH = 2  # wger's language id for English
PAGE_SIZE = 100
MAX_PAGES = 100  # wger has ~900 exercises; this stops a runaway pagination loop
USER_AGENT = "FitTrack catalog sync (https://github.com/dev1654/FitTrack)"

# wger muscle id -> FitTrack muscle group
MUSCLE_GROUPS = {
    1: "biceps",  # Biceps brachii
    2: "shoulders",  # Anterior deltoid
    3: "chest",  # Serratus anterior
    4: "chest",  # Pectoralis major
    5: "triceps",  # Triceps brachii
    6: "abs",  # Rectus abdominis
    7: "calves",  # Gastrocnemius
    8: "glutes",  # Gluteus maximus
    9: "back",  # Trapezius
    10: "quads",  # Quadriceps femoris
    11: "hamstrings",  # Biceps femoris
    12: "back",  # Latissimus dorsi
    13: "biceps",  # Brachialis
    14: "abs",  # Obliquus externus abdominis
    15: "calves",  # Soleus
    16: "back",  # Erector spinae
}

# Fallback when an exercise lists no muscles: wger category name -> muscle group
CATEGORY_GROUPS = {
    "legs": "quads",
    "abs": "abs",
    "chest": "chest",
    "back": "back",
    "shoulders": "shoulders",
    "calves": "calves",
    "cardio": "cardio",
}
TRICEPS_WORDS = ("tricep", "pushdown", "push down", "skull", "dip", "kickback", "extension")

# wger equipment name -> the matching seed equipment (so the catalog has one "Barbell", not two)
SEED_EQUIPMENT = {
    "barbell": "barbell",
    "dumbbell": "dumbbells",
    "pull-up bar": "pull-up-bar",
    "cable machine": "cable-station",
    "none (bodyweight exercise)": "bodyweight",
}
# wger equipment with no seed equivalent: name -> (display name, FitTrack type)
NEW_EQUIPMENT = {
    "sz-bar": ("EZ curl bar", "free_weight"),
    "gym mat": ("Gym mat", "bodyweight"),
    "swiss ball": ("Swiss ball", "bodyweight"),
    "bench": ("Bench", "free_weight"),
    "incline bench": ("Incline bench", "free_weight"),
    "kettlebell": ("Kettlebell", "free_weight"),
    "resistance band": ("Resistance band", "bodyweight"),
}
# Support equipment is only the "main" equipment when nothing else is listed
SUPPORT_EQUIPMENT = {"bench", "incline bench", "gym mat", "swiss ball"}

MAX_NAME = 160
MAX_INSTRUCTIONS = 4000


@dataclass(frozen=True)
class WgerEquipment:
    wger_id: int
    key: str  # lower-cased wger name
    seed_external_id: str | None  # set when it maps onto a seed row
    name: str
    type: str


@dataclass(frozen=True)
class NormalizedExercise:
    external_id: str  # wger exercise uuid
    name: str
    muscle_group: str
    category: str  # "strength" | "cardio"
    instructions: str | None
    equipment: WgerEquipment | None


# ---------- Fetching ----------


def _get_with_retry(client: httpx.Client, url: str, params: dict | None, attempts: int = 4) -> dict:
    delay = 2.0
    for attempt in range(1, attempts + 1):
        try:
            res = client.get(url, params=params)
            if res.status_code == 429 or res.status_code >= 500:
                raise httpx.HTTPStatusError(
                    f"wger returned {res.status_code}", request=res.request, response=res
                )
            res.raise_for_status()
            data = res.json()
            if not isinstance(data, dict) or not isinstance(data.get("results"), list):
                raise ValueError(f"Unexpected response shape from {url}")
            return data
        except (httpx.TransportError, httpx.HTTPStatusError) as exc:
            retryable = isinstance(exc, httpx.TransportError) or (
                exc.response.status_code == 429 or exc.response.status_code >= 500
            )
            if not retryable or attempt == attempts:
                raise
            log.warning("wger request failed (%s), retry %s in %.0fs", exc, attempt, delay)
            time.sleep(delay)
            delay *= 2
    raise RuntimeError("unreachable")


def fetch_exercises(client: httpx.Client) -> Iterator[dict]:
    """Yields every raw exercise from /exerciseinfo/, following the `next` links."""
    url: str | None = "exerciseinfo/"
    params: dict | None = {"limit": PAGE_SIZE, "offset": 0, "language__code": "en"}
    for page in range(MAX_PAGES):
        if url is None:
            return
        data = _get_with_retry(client, url, params)
        log.info("fetched page %s (%s exercises)", page + 1, len(data["results"]))
        yield from data["results"]
        url, params = data.get("next"), None  # `next` already carries the query string
    raise RuntimeError(f"Stopped after {MAX_PAGES} pages; wger pagination looks wrong")


def make_client(base_url: str = WGER_BASE_URL, transport: httpx.BaseTransport | None = None):
    return httpx.Client(
        base_url=base_url,
        headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
        timeout=30.0,
        follow_redirects=True,
        transport=transport,
    )


# ---------- Normalizing ----------

_TAG = re.compile(r"<[^>]+>")
_SPACE = re.compile(r"\s+")


def clean_text(value: str | None) -> str:
    if not value:
        return ""
    text = _TAG.sub(" ", value)
    return _SPACE.sub(" ", html.unescape(text)).strip()


def map_equipment(raw: dict) -> WgerEquipment:
    name = clean_text(raw.get("name"))
    key = name.lower()
    if key in SEED_EQUIPMENT:
        return WgerEquipment(raw["id"], key, SEED_EQUIPMENT[key], name, "")
    display, type_ = NEW_EQUIPMENT.get(key, (name, "free_weight"))
    return WgerEquipment(raw["id"], key, None, display, type_)


def pick_equipment(items: list[dict]) -> WgerEquipment | None:
    mapped = [map_equipment(e) for e in items if e.get("name")]
    if not mapped:
        return None
    main = [e for e in mapped if e.key not in SUPPORT_EQUIPMENT]
    return (main or mapped)[0]


def pick_muscle_group(raw: dict, name: str) -> str | None:
    for muscle in raw.get("muscles") or []:
        group = MUSCLE_GROUPS.get(muscle.get("id"))
        if group:
            return group
    category = clean_text((raw.get("category") or {}).get("name")).lower()
    if category == "arms":
        lowered = name.lower()
        return "triceps" if any(w in lowered for w in TRICEPS_WORDS) else "biceps"
    return CATEGORY_GROUPS.get(category)


def normalize(raw: dict) -> NormalizedExercise | str:
    """Returns the cleaned exercise, or a short reason string when it's skipped."""
    english = [t for t in raw.get("translations") or [] if t.get("language") == ENGLISH]
    if not english:
        return "no_english_translation"
    translation = english[0]
    name = clean_text(translation.get("name"))
    if not name:
        return "empty_name"
    if len(name) > MAX_NAME:
        return "name_too_long"
    uuid = raw.get("uuid")
    if not uuid:
        return "missing_uuid"
    muscle_group = pick_muscle_group(raw, name)
    if muscle_group is None:
        return "unknown_muscle_group"
    is_cardio = clean_text((raw.get("category") or {}).get("name")).lower() == "cardio"
    instructions = clean_text(translation.get("description"))[:MAX_INSTRUCTIONS] or None
    return NormalizedExercise(
        external_id=str(uuid),
        name=name,
        muscle_group="cardio" if is_cardio else muscle_group,
        category="cardio" if is_cardio else "strength",
        instructions=instructions,
        equipment=pick_equipment(raw.get("equipment") or []),
    )
