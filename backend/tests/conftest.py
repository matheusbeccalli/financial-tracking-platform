import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.models import Base
from app.seed import seed


@pytest.fixture
def session():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    with Session() as s:
        seed(s)
        s.commit()
        yield s


from fastapi.testclient import TestClient

from app.db import get_session
from app.main import create_app


@pytest.fixture
def client(session):
    app = create_app()
    app.dependency_overrides[get_session] = lambda: session
    with TestClient(app) as c:
        yield c


@pytest.fixture(autouse=True)
def no_real_api_key(monkeypatch):
    """Testes nunca chamam a API real, mesmo com ANTHROPIC_API_KEY no .env."""
    from app.config import settings as app_settings

    monkeypatch.setattr(app_settings, "anthropic_api_key", "")
