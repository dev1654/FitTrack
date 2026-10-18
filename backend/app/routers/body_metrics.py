from datetime import date

from fastapi import APIRouter, HTTPException, Query, Response, status
from sqlalchemy import select

from app.deps import CurrentUser, DbSession
from app.models import BodyMetric
from app.schemas import BodyMetricIn, BodyMetricOut

router = APIRouter(prefix="/body-metrics", tags=["body metrics"])


@router.get("", response_model=list[BodyMetricOut])
def list_metrics(
    db: DbSession,
    user: CurrentUser,
    date_from: date | None = Query(default=None, alias="from"),
    date_to: date | None = Query(default=None, alias="to"),
) -> list[BodyMetric]:
    q = select(BodyMetric).where(BodyMetric.user_id == user.id)
    if date_from:
        q = q.where(BodyMetric.date >= date_from)
    if date_to:
        q = q.where(BodyMetric.date <= date_to)
    return list(db.scalars(q.order_by(BodyMetric.date.desc())))


@router.put("", response_model=BodyMetricOut)
def upsert_metric(body: BodyMetricIn, db: DbSession, user: CurrentUser) -> BodyMetric:
    """One entry per day: logging again on the same date replaces that day's values."""
    if body.body_weight_kg is None and not body.measurements:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, "Send a body weight or at least one measurement"
        )
    m = db.scalar(
        select(BodyMetric).where(BodyMetric.user_id == user.id, BodyMetric.date == body.date)
    )
    if m is None:
        m = BodyMetric(user_id=user.id, date=body.date)
        db.add(m)
    m.body_weight_kg = body.body_weight_kg
    m.measurements = body.measurements
    db.commit()
    return m


@router.delete("/{metric_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_metric(metric_id: int, db: DbSession, user: CurrentUser) -> Response:
    m = db.get(BodyMetric, metric_id)
    if m is None or m.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Entry not found")
    db.delete(m)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
