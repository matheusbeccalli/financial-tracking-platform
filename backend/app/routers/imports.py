from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import select

from app.db import get_session
from app.models import Account, ImportBatch, Transaction
from app.services.classifier import classify_new
from app.services.importer import import_file, undo_batch
from app.services.llm import get_llm

router = APIRouter(prefix="/api")


@router.post("/imports")
async def create_import(
    account_id: int = Form(...),
    file: UploadFile = File(...),
    session=Depends(get_session),
):
    if not session.get(Account, account_id):
        raise HTTPException(404, "Conta não encontrada")
    if not file.filename:
        raise HTTPException(400, "Arquivo sem nome")
    content = await file.read()
    try:
        batch, new = import_file(session, account_id, file.filename, content)
    except ValueError as e:
        session.rollback()
        raise HTTPException(400, str(e))
    counts = classify_new(session, new, get_llm(session))
    session.commit()
    return {
        "batch_id": batch.id,
        "filename": batch.filename,
        "new_count": batch.new_count,
        "dup_count": batch.dup_count,
        "classified": counts,
    }


@router.get("/imports")
def list_imports(session=Depends(get_session)):
    batches = session.scalars(select(ImportBatch).order_by(ImportBatch.id.desc()))
    return [
        {
            "id": b.id, "filename": b.filename, "source": b.source,
            "imported_at": b.imported_at.isoformat(),
            "new_count": b.new_count, "dup_count": b.dup_count,
        }
        for b in batches
    ]


@router.delete("/imports/{batch_id}", status_code=204)
def delete_import(batch_id: int, session=Depends(get_session)):
    if not session.get(ImportBatch, batch_id):
        raise HTTPException(404, "Lote não encontrado")
    undo_batch(session, batch_id)
    session.commit()


@router.post("/classify/pending")
def classify_pending(session=Depends(get_session)):
    pending = list(
        session.scalars(
            select(Transaction).where(
                Transaction.category_id.is_(None), Transaction.ignored.is_(False)
            )
        )
    )
    counts = classify_new(session, pending, get_llm(session))
    session.commit()
    return counts
