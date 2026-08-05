from fastapi import FastAPI

from app.routers import budgets, meta, transactions


def create_app() -> FastAPI:
    app = FastAPI(title="Financas")
    app.include_router(meta.router)
    app.include_router(transactions.router)
    app.include_router(budgets.router)

    @app.get("/api/health")
    def health():
        return {"status": "ok"}

    return app


app = create_app()
