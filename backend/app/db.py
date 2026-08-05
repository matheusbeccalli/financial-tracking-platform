from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.config import settings
from app.models import Base

engine = create_engine(
    f"sqlite:///{settings.db_path}", connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(bind=engine)


def get_session():
    with SessionLocal() as session:
        yield session


def init_db():
    Base.metadata.create_all(engine)
