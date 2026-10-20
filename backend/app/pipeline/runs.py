"""Records every pipeline run in the pipeline_runs table, success or failure."""

import logging
import traceback
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime

from app.db import SessionLocal
from app.models import PipelineRun

log = logging.getLogger("fittrack.pipeline")


def setup_logging() -> None:
    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s"
    )


@contextmanager
def track_run(job: str) -> Iterator[dict]:
    """Yields a stats dict for the job to fill in.

    The run row is written in its own session, so a failed job is still recorded even
    though the job's own transaction rolls back.
    """
    with SessionLocal() as db:
        run = PipelineRun(job=job, status="running")
        db.add(run)
        db.commit()
        run_id = run.id
    log.info("%s: run %s started", job, run_id)

    stats: dict = {}
    try:
        yield stats
    except Exception as exc:
        with SessionLocal() as db:
            run = db.get(PipelineRun, run_id)
            run.status = "failed"
            run.finished_at = datetime.now(UTC)
            run.stats = stats
            run.error = "".join(traceback.format_exception_only(exc)).strip()[:2000]
            db.commit()
        log.error("%s: run %s failed: %s", job, run_id, exc)
        raise
    with SessionLocal() as db:
        run = db.get(PipelineRun, run_id)
        run.status = "success"
        run.finished_at = datetime.now(UTC)
        run.stats = stats
        db.commit()
    log.info("%s: run %s succeeded: %s", job, run_id, stats)
