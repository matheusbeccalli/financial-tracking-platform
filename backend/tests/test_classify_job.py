import pytest
from sqlalchemy import select
from sqlalchemy.orm import sessionmaker

from app.models import Transaction
from app.services import classify_job
from app.services.classify_job import JOBS, job_status, run_classification
from app.services.importer import import_file

CSV = (
    "Data;Histórico;Valor\n"
    "01/07/2026;LOJA A;-10,00\n"
    "02/07/2026;LOJA B;-20,00\n"
    "03/07/2026;LOJA C;-30,00\n"
).encode("utf-8")


class FakeLLM:
    def __init__(self):
        self.calls = 0

    def classify(self, items, categories, examples=None):
        self.calls += 1
        return {item["id"]: categories[0] for item in items}


def _import_batch(session):
    batch, new = import_file(session, 1, "t.csv", CSV)
    session.commit()
    return batch


def test_run_classification_classifies_all_and_marks_done(session, monkeypatch):
    batch = _import_batch(session)
    fake = FakeLLM()
    monkeypatch.setattr(classify_job, "SessionLocal", sessionmaker(bind=session.get_bind()))
    monkeypatch.setattr(classify_job, "get_llm", lambda s: fake)

    run_classification(batch.id)

    assert JOBS[batch.id] == "done"
    st = job_status(session, batch.id)
    assert st["status"] == "done"
    assert st["total"] == 3 and st["done"] == 3
    assert st["counts"]["llm"] == 3 and st["counts"]["pendente"] == 0


def test_run_classification_chunks_by_batch_size(session, monkeypatch):
    batch = _import_batch(session)
    fake = FakeLLM()
    monkeypatch.setattr(classify_job, "SessionLocal", sessionmaker(bind=session.get_bind()))
    monkeypatch.setattr(classify_job, "get_llm", lambda s: fake)
    monkeypatch.setattr(classify_job, "LLM_BATCH_SIZE", 2)

    run_classification(batch.id)

    assert fake.calls == 2  # 3 pendentes em lotes de 2 => 2 chamadas


def test_run_classification_error_marks_error(session, monkeypatch):
    batch = _import_batch(session)

    class Boom:
        def classify(self, items, categories, examples=None):
            raise RuntimeError("api caiu")

    monkeypatch.setattr(classify_job, "SessionLocal", sessionmaker(bind=session.get_bind()))
    monkeypatch.setattr(classify_job, "get_llm", lambda s: Boom())

    run_classification(batch.id)

    assert JOBS[batch.id] == "error"


def test_job_status_without_entry_derives_interrupted_or_done(session):
    batch = _import_batch(session)
    assert job_status(session, batch.id)["status"] == "interrupted"  # pendentes, sem job
    for tx in session.scalars(select(Transaction)):
        tx.category_id, tx.source = 1, "llm"
    session.flush()
    assert job_status(session, batch.id)["status"] == "done"


def test_llm_client_has_timeout_and_limited_retries():
    from app.services.llm import AnthropicLLM

    llm = AnthropicLLM("sk-test", "claude-haiku-4-5")
    assert llm.client.timeout == 120.0
    assert llm.client.max_retries == 1


def test_crash_mid_run_preserves_committed_chunks(session, monkeypatch):
    batch = _import_batch(session)

    class FlakyLLM:
        def __init__(self):
            self.calls = 0

        def classify(self, items, categories, examples=None):
            self.calls += 1
            if self.calls == 2:
                raise RuntimeError("caiu no 2º lote")
            return {item["id"]: categories[0] for item in items}

    monkeypatch.setattr(
        classify_job, "SessionLocal", sessionmaker(bind=session.get_bind())
    )
    monkeypatch.setattr(classify_job, "get_llm", lambda s: FlakyLLM())
    monkeypatch.setattr(classify_job, "LLM_BATCH_SIZE", 2)

    run_classification(batch.id)

    assert JOBS[batch.id] == "error"
    st = job_status(session, batch.id)
    assert st["counts"]["llm"] == 2  # 1º lote commitado antes da queda
    assert st["counts"]["pendente"] == 1


def test_prune_jobs_keeps_recent_and_running():
    from app.services.classify_job import MAX_JOBS, prune_jobs

    JOBS.clear()
    for i in range(30):
        JOBS[i] = "done"
    JOBS[99] = "running"
    prune_jobs()
    assert len(JOBS) == MAX_JOBS
    assert 99 in JOBS  # nunca poda job em execução
    assert 0 not in JOBS and 29 in JOBS  # caem os mais antigos
