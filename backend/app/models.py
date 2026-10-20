"""The nine FitTrack tables. All weights are stored in kilograms."""

from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base

EQUIPMENT_TYPES = ("machine", "free_weight", "cable", "bodyweight", "cardio")
EXERCISE_CATEGORIES = ("strength", "cardio")
UNITS = ("kg", "lb")


class User(Base):
    __tablename__ = "users"
    __table_args__ = (CheckConstraint("unit_pref IN ('kg', 'lb')", name="unit_pref"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    unit_pref: Mapped[str] = mapped_column(String(2), default="kg", server_default="kg")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Equipment(Base):
    __tablename__ = "equipment"
    __table_args__ = (
        UniqueConstraint("source", "external_id"),
        CheckConstraint(
            "type IN ('machine', 'free_weight', 'cable', 'bodyweight', 'cardio')", name="type"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), index=True)
    type: Mapped[str] = mapped_column(String(20))
    muscle_groups: Mapped[list[str]] = mapped_column(JSONB, default=list, server_default="[]")
    how_to: Mapped[str | None] = mapped_column(Text)
    image_url: Mapped[str | None] = mapped_column(String(500))
    # Where the row came from ("seed" or "wger") and its id there, so the pipeline can upsert.
    source: Mapped[str] = mapped_column(String(20), default="seed")
    external_id: Mapped[str] = mapped_column(String(80))

    exercises: Mapped[list["Exercise"]] = relationship(back_populates="equipment")


class Exercise(Base):
    __tablename__ = "exercises"
    __table_args__ = (
        UniqueConstraint("source", "external_id"),
        CheckConstraint("category IN ('strength', 'cardio')", name="category"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(160), index=True)
    muscle_group: Mapped[str] = mapped_column(String(40), index=True)
    category: Mapped[str] = mapped_column(String(20), default="strength")
    equipment_id: Mapped[int | None] = mapped_column(
        ForeignKey("equipment.id", ondelete="SET NULL"), index=True
    )
    instructions: Mapped[str | None] = mapped_column(Text)
    source: Mapped[str] = mapped_column(String(20), default="seed")
    external_id: Mapped[str] = mapped_column(String(80))

    equipment: Mapped[Equipment | None] = relationship(back_populates="exercises")


class WorkoutTemplate(Base):
    """A built-in program day (user_id is null) or a user's custom workout."""

    __tablename__ = "workout_templates"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str | None] = mapped_column(Text)
    category: Mapped[str | None] = mapped_column(String(60))
    is_builtin: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    exercises: Mapped[list["TemplateExercise"]] = relationship(
        back_populates="template",
        cascade="all, delete-orphan",
        order_by="TemplateExercise.position",
    )


class TemplateExercise(Base):
    __tablename__ = "template_exercises"
    __table_args__ = (
        CheckConstraint("target_sets > 0", name="target_sets_positive"),
        CheckConstraint("target_reps > 0", name="target_reps_positive"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    template_id: Mapped[int] = mapped_column(
        ForeignKey("workout_templates.id", ondelete="CASCADE"), index=True
    )
    exercise_id: Mapped[int] = mapped_column(ForeignKey("exercises.id", ondelete="RESTRICT"))
    position: Mapped[int] = mapped_column(Integer)
    target_sets: Mapped[int] = mapped_column(Integer)
    target_reps: Mapped[int] = mapped_column(Integer)

    template: Mapped[WorkoutTemplate] = relationship(back_populates="exercises")
    exercise: Mapped[Exercise] = relationship()


class WorkoutSession(Base):
    __tablename__ = "workout_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    template_id: Mapped[int | None] = mapped_column(
        ForeignKey("workout_templates.id", ondelete="SET NULL")
    )
    date: Mapped[date] = mapped_column(Date, index=True)
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    sets: Mapped[list["SetEntry"]] = relationship(
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="SetEntry.id",
    )


class SetEntry(Base):
    __tablename__ = "set_entries"
    __table_args__ = (
        CheckConstraint("set_number > 0", name="set_number_positive"),
        CheckConstraint("reps IS NULL OR reps >= 0", name="reps_non_negative"),
        CheckConstraint("weight_kg IS NULL OR weight_kg >= 0", name="weight_non_negative"),
        CheckConstraint(
            "duration_seconds IS NULL OR duration_seconds >= 0", name="duration_non_negative"
        ),
        CheckConstraint("distance_m IS NULL OR distance_m >= 0", name="distance_non_negative"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(
        ForeignKey("workout_sessions.id", ondelete="CASCADE"), index=True
    )
    exercise_id: Mapped[int] = mapped_column(
        ForeignKey("exercises.id", ondelete="RESTRICT"), index=True
    )
    set_number: Mapped[int] = mapped_column(Integer)
    # Strength fields
    reps: Mapped[int | None] = mapped_column(Integer)
    weight_kg: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))
    # Cardio fields
    duration_seconds: Mapped[int | None] = mapped_column(Integer)
    distance_m: Mapped[Decimal | None] = mapped_column(Numeric(9, 2))

    session: Mapped[WorkoutSession] = relationship(back_populates="sets")


class BodyMetric(Base):
    __tablename__ = "body_metrics"
    __table_args__ = (
        UniqueConstraint("user_id", "date"),
        CheckConstraint("body_weight_kg IS NULL OR body_weight_kg > 0", name="body_weight_positive"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    date: Mapped[date] = mapped_column(Date)
    body_weight_kg: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    # e.g. {"waist_cm": 82, "chest_cm": 101}
    measurements: Mapped[dict | None] = mapped_column(JSONB)


class PipelineRun(Base):
    """One row per pipeline job run: what it did, how long it took, and whether it failed."""

    __tablename__ = "pipeline_runs"
    __table_args__ = (
        CheckConstraint("status IN ('running', 'success', 'failed')", name="status"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    job: Mapped[str] = mapped_column(String(40), index=True)
    status: Mapped[str] = mapped_column(String(10), default="running")
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # e.g. {"fetched": 912, "inserted": 40, "updated": 860, "skipped": {"no_english_name": 12}}
    stats: Mapped[dict | None] = mapped_column(JSONB)
    error: Mapped[str | None] = mapped_column(Text)


class ExerciseStat(Base):
    """Written by the nightly analytics job (week 2); the dashboard reads it."""

    __tablename__ = "exercise_stats"
    __table_args__ = (UniqueConstraint("user_id", "exercise_id", "date"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    exercise_id: Mapped[int] = mapped_column(ForeignKey("exercises.id", ondelete="CASCADE"))
    date: Mapped[date] = mapped_column(Date)
    est_1rm_kg: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))
    total_volume_kg: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    is_plateau: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
