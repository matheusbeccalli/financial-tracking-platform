from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.routers import budgets, dashboard, imports, meta, transactions

FRONTEND_DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"


def create_app(init: bool = False) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        if init:
            from app.db import SessionLocal, init_db

            init_db()
            with SessionLocal() as session:
                from app.seed import seed

                seed(session)
                session.commit()
        yield

    app = FastAPI(title="Financas", lifespan=lifespan)
    app.include_router(meta.router)
    app.include_router(transactions.router)
    app.include_router(budgets.router)
    app.include_router(imports.router)
    app.include_router(dashboard.router)

    @app.get("/api/health")
    def health():
        return {"status": "ok"}

    if FRONTEND_DIST.is_dir():  # o Plano 2 (frontend) cria este diretório
        app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="app")

    return app


app = create_app(init=True)
