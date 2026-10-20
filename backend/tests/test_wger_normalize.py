"""The rules that turn raw wger exercises into FitTrack catalog rows (no database needed)."""

import copy
import json
from pathlib import Path

import pytest

from app.pipeline import wger
from app.pipeline.catalog_sync import transform

SAMPLE = json.loads(
    (Path(__file__).parent / "fixtures" / "wger_exerciseinfo_sample.json").read_text("utf-8")
)
BY_ID = {r["id"]: r for r in SAMPLE}


def norm(wger_id: int) -> wger.NormalizedExercise:
    result = wger.normalize(copy.deepcopy(BY_ID[wger_id]))
    assert isinstance(result, wger.NormalizedExercise), result
    return result


def test_uses_the_english_name_and_plain_text_instructions():
    ex = norm(20)  # Arnold Shoulder Press: German + English translations, HTML description
    assert ex.name == "Arnold Shoulder Press"
    assert ex.instructions and "<" not in ex.instructions and "&amp;" not in ex.instructions
    assert ex.external_id == BY_ID[20]["uuid"]


@pytest.mark.parametrize(
    ("wger_id", "group"),
    [
        (308, "chest"),  # muscles: pectoralis major
        (12, "glutes"),  # muscles: gluteus maximus
        (94, "biceps"),  # muscles: biceps brachii
        (152, "back"),  # no muscles listed -> category "Back"
        (193, "shoulders"),  # no muscles listed -> category "Shoulders"
        (31, "biceps"),  # "Arms" with no muscles and no triceps words in the name
    ],
)
def test_muscle_group(wger_id, group):
    assert norm(wger_id).muscle_group == group


def test_arms_exercise_with_triceps_words_maps_to_triceps():
    raw = copy.deepcopy(BY_ID[31])
    for t in raw["translations"]:
        t["name"] = "Overhead Triceps Extension"
    assert wger.normalize(raw).muscle_group == "triceps"


def test_cardio_category():
    ex = norm(177)  # Cycling
    assert (ex.category, ex.muscle_group) == ("cardio", "cardio")


@pytest.mark.parametrize(
    ("wger_id", "seed_id", "name"),
    [
        (41, "barbell", "Barbell"),
        (20, "dumbbells", "Dumbbell"),
        (152, "pull-up-bar", "Pull-up bar"),
        (57, "bodyweight", "none (bodyweight exercise)"),
    ],
)
def test_common_equipment_reuses_seed_rows(wger_id, seed_id, name):
    eq = norm(wger_id).equipment
    assert (eq.seed_external_id, eq.name) == (seed_id, name)


def test_new_equipment_gets_a_friendly_name_and_type():
    eq = norm(94).equipment  # SZ-Bar
    assert (eq.seed_external_id, eq.name, eq.type) == (None, "EZ curl bar", "free_weight")
    assert norm(9).equipment.name == "Kettlebell"


def test_main_equipment_beats_support_equipment():
    assert norm(308).equipment.name == "Dumbbell"  # Dumbbell + Incline bench
    assert norm(193).equipment.name == "Bench"  # bench is all there is


def test_no_equipment():
    assert norm(12).equipment is None


@pytest.mark.parametrize(
    ("change", "reason"),
    [
        (lambda r: r.update(translations=[t for t in r["translations"] if t["language"] != 2]),
         "no_english_translation"),
        (lambda r: [t.update(name="   ") for t in r["translations"]], "empty_name"),
        (lambda r: [t.update(name="x" * 200) for t in r["translations"]], "name_too_long"),
        (lambda r: r.update(uuid=None), "missing_uuid"),
        (lambda r: r.update(muscles=[], category={"id": 99, "name": "Misc"}),
         "unknown_muscle_group"),
    ],
)
def test_invalid_records_are_skipped_with_a_reason(change, reason):
    raw = copy.deepcopy(BY_ID[41])
    change(raw)
    assert wger.normalize(raw) == reason


def test_transform_drops_duplicates_and_seed_names():
    kept, skipped = transform(copy.deepcopy(SAMPLE), seed_names={"chin up"})
    names = [e.name for e in kept]
    assert names.count("Bent Over Rowing Reverse") == 1  # wger has it twice
    assert "Chin Up" not in names
    assert skipped == {"duplicate_name": 1, "duplicates_seed_exercise": 1}
    assert len(kept) == len(SAMPLE) - 2
