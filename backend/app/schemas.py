"""Request and response shapes. Weights are always kilograms; clients convert for display."""

from datetime import date as Date
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

EquipmentType = Literal["machine", "free_weight", "cable", "bodyweight", "cardio"]
Category = Literal["strength", "cardio"]
Unit = Literal["kg", "lb"]


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---------- Auth ----------


class Credentials(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)

    @field_validator("password")
    @classmethod
    def _bcrypt_limit(cls, v: str) -> str:
        if len(v.encode()) > 72:
            raise ValueError("password must be at most 72 bytes")
        return v

    @field_validator("email")
    @classmethod
    def _lower(cls, v: str) -> str:
        return v.lower()


class Token(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"


class UserOut(ORM):
    id: int
    email: str
    unit_pref: Unit
    created_at: datetime


class UserUpdate(BaseModel):
    unit_pref: Unit


# ---------- Catalog ----------


class EquipmentBrief(ORM):
    id: int
    name: str
    type: EquipmentType


class ExerciseOut(ORM):
    id: int
    name: str
    muscle_group: str
    category: Category
    instructions: str | None
    equipment: EquipmentBrief | None


class ExerciseBrief(ORM):
    id: int
    name: str
    muscle_group: str
    category: Category


class EquipmentOut(ORM):
    id: int
    name: str
    type: EquipmentType
    muscle_groups: list[str]
    how_to: str | None
    image_url: str | None


class EquipmentDetail(EquipmentOut):
    exercises: list[ExerciseBrief]


# ---------- Templates ----------


class TemplateExerciseIn(BaseModel):
    exercise_id: int
    target_sets: int = Field(gt=0, le=20)
    target_reps: int = Field(gt=0, le=100)


class TemplateExerciseOut(ORM):
    id: int
    position: int
    target_sets: int
    target_reps: int
    exercise: ExerciseBrief


class TemplateIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str | None = None
    category: str | None = Field(default=None, max_length=60)
    exercises: list[TemplateExerciseIn] = Field(min_length=1, max_length=30)


class TemplateSummary(ORM):
    id: int
    name: str
    description: str | None
    category: str | None
    is_builtin: bool


class TemplateOut(TemplateSummary):
    exercises: list[TemplateExerciseOut]


class SaveAsTemplateIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str | None = None


# ---------- Sessions and sets ----------


class SetIn(BaseModel):
    exercise_id: int
    set_number: int = Field(gt=0, le=100)
    reps: int | None = Field(default=None, ge=0, le=1000)
    weight_kg: float | None = Field(default=None, ge=0, le=1000)
    duration_seconds: int | None = Field(default=None, ge=0, le=86400)
    distance_m: float | None = Field(default=None, ge=0, le=1_000_000)

    @model_validator(mode="after")
    def _has_a_measurement(self):
        if all(
            v is None for v in (self.reps, self.weight_kg, self.duration_seconds, self.distance_m)
        ):
            raise ValueError("a set needs reps, weight, duration or distance")
        return self


class SetUpdate(BaseModel):
    set_number: int | None = Field(default=None, gt=0, le=100)
    reps: int | None = Field(default=None, ge=0, le=1000)
    weight_kg: float | None = Field(default=None, ge=0, le=1000)
    duration_seconds: int | None = Field(default=None, ge=0, le=86400)
    distance_m: float | None = Field(default=None, ge=0, le=1_000_000)


class SetOut(ORM):
    id: int
    exercise_id: int
    set_number: int
    reps: int | None
    weight_kg: float | None
    duration_seconds: int | None
    distance_m: float | None


class SessionIn(BaseModel):
    date: Date
    notes: str | None = None
    template_id: int | None = None


class SessionUpdate(BaseModel):
    date: Date | None = None
    notes: str | None = None


class SessionSummary(ORM):
    id: int
    date: Date
    notes: str | None
    template_id: int | None
    created_at: datetime


class SessionOut(SessionSummary):
    sets: list[SetOut]


# ---------- Progress (last time, stats) ----------


class LastSet(ORM):
    set_number: int
    reps: int | None
    weight_kg: float | None
    duration_seconds: int | None
    distance_m: float | None


class Suggestion(BaseModel):
    weight_kg: float | None
    reps: int | None
    reason: str


class LastTimeOut(BaseModel):
    exercise_id: int
    last_date: Date | None
    sets: list[LastSet]
    suggestion: Suggestion | None


class ExerciseStatOut(ORM):
    date: Date
    est_1rm_kg: float | None
    total_volume_kg: float | None
    is_plateau: bool


class WeeklyVolumeOut(BaseModel):
    week_start: Date
    muscle_group: str
    total_volume_kg: float


class PersonalRecordOut(BaseModel):
    exercise_id: int
    exercise_name: str
    best_est_1rm_kg: float | None
    best_est_1rm_date: Date | None
    heaviest_weight_kg: float | None
    heaviest_weight_date: Date | None


class PlateauOut(BaseModel):
    exercise_id: int
    exercise_name: str
    last_session: Date
    est_1rm_kg: float | None
    best_est_1rm_kg: float | None


class PipelineRunOut(ORM):
    id: int
    job: str
    status: Literal["running", "success", "failed"]
    started_at: datetime
    finished_at: datetime | None
    stats: dict | None
    error: str | None


# ---------- Body metrics ----------


class BodyMetricIn(BaseModel):
    date: Date
    body_weight_kg: float | None = Field(default=None, gt=0, le=700)
    measurements: dict[str, float] | None = None


class BodyMetricOut(ORM):
    id: int
    date: Date
    body_weight_kg: float | None
    measurements: dict[str, float] | None
