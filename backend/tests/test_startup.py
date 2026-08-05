from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.db as db
from app.main import create_app


def test_app_starts_seeds_and_serves(monkeypatch):
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    # troca engine/SessionLocal no módulo: init_db e get_session leem daqui
    monkeypatch.setattr(db, "engine", engine)
    monkeypatch.setattr(db, "SessionLocal", sessionmaker(bind=engine))
    with TestClient(create_app(init=True)) as client:
        assert client.get("/api/health").json() == {"status": "ok"}
        accounts = client.get("/api/accounts").json()
        assert len(accounts) == 4  # startup rodou init_db + seed
