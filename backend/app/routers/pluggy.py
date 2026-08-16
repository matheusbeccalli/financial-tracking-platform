from datetime import date, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import func, select

from app.db import get_session
from app.models import Account, PluggyLink, Transaction
from app.schemas import PluggyLinkIn
from app.services.classifier import apply_rules
from app.services.classify_job import JOBS, job_status, prune_jobs, run_classification
from app.services.llm import get_llm
from app.services.pluggy import PluggyError, get_pluggy
from app.services.pluggy_sync import sync_all

router = APIRouter(prefix="/api/pluggy")

_SEM_CREDENCIAL = (
    "Credencial Pluggy ausente — defina PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET "
    "em backend/.env e reinicie"
)


def _link_out(link: PluggyLink) -> dict:
    return {
        "id": link.id,
        "item_id": link.item_id,
        "pluggy_account_id": link.pluggy_account_id,
        "pluggy_type": link.pluggy_type,
        "account_id": link.account_id,
        "sync_from": link.sync_from.isoformat(),
        "last_synced_at": (
            link.last_synced_at.replace(tzinfo=timezone.utc).isoformat()
            if link.last_synced_at
            else None
        ),
    }


@router.get("/links")
def list_links(session=Depends(get_session), client=Depends(get_pluggy)):
    # última transação por conta local: a UI sugere sync_from = dia seguinte
    last = session.execute(
        select(Transaction.account_id, func.max(Transaction.date))
        .group_by(Transaction.account_id)
    ).all()
    return {
        "credential_set": client is not None,
        "links": [
            _link_out(l)
            for l in session.scalars(select(PluggyLink).order_by(PluggyLink.id))
        ],
        "last_tx_dates": {str(acc): d.isoformat() for acc, d in last},
    }


@router.get("/items/{item_id}/accounts")
def item_accounts(item_id: str, client=Depends(get_pluggy)):
    if client is None:
        raise HTTPException(503, _SEM_CREDENCIAL)
    try:
        item = client.get_item(item_id)
        accounts = client.get_accounts(item_id)
    except PluggyError as e:
        raise HTTPException(404 if e.status == 404 else 502, str(e))
    return {
        "item_status": item.get("status"),
        "connector": (item.get("connector") or {}).get("name"),
        "accounts": [
            {
                "id": a["id"],
                "type": a.get("type"),
                "subtype": a.get("subtype"),
                "name": a.get("name"),
                "number": a.get("number"),
            }
            for a in accounts
        ],
    }


@router.post("/links", status_code=201)
def create_link(payload: PluggyLinkIn, session=Depends(get_session)):
    if payload.pluggy_type not in ("BANK", "CREDIT"):
        raise HTTPException(400, "pluggy_type deve ser 'BANK' ou 'CREDIT'")
    if not session.get(Account, payload.account_id):
        raise HTTPException(404, "Conta não encontrada")
    try:
        sync_from = date.fromisoformat(payload.sync_from)
    except ValueError:
        raise HTTPException(400, "sync_from deve ser YYYY-MM-DD")
    if session.scalar(
        select(PluggyLink).where(PluggyLink.pluggy_account_id == payload.pluggy_account_id)
    ):
        raise HTTPException(409, "Essa conta Pluggy já está vinculada")
    link = PluggyLink(
        item_id=payload.item_id,
        pluggy_account_id=payload.pluggy_account_id,
        pluggy_type=payload.pluggy_type,
        account_id=payload.account_id,
        sync_from=sync_from,
    )
    session.add(link)
    session.commit()
    return _link_out(link)


@router.delete("/links/{link_id}", status_code=204)
def delete_link(link_id: int, session=Depends(get_session)):
    link = session.get(PluggyLink, link_id)
    if not link:
        raise HTTPException(404, "Vínculo não encontrado")
    session.delete(link)
    session.commit()


@router.post("/sync")
def sync(
    background_tasks: BackgroundTasks,
    session=Depends(get_session),
    client=Depends(get_pluggy),
):
    if client is None:
        raise HTTPException(503, _SEM_CREDENCIAL)
    if not session.scalar(select(PluggyLink.id)):
        raise HTTPException(400, "Nenhuma conta vinculada — vincule em Configurações")
    results = sync_all(session, client)
    llm = get_llm(session)
    for r in results:
        if "error" not in r:
            _, r["pending"] = apply_rules(session, r["new"])
    session.commit()
    out = []
    for r in results:
        if "error" in r:
            out.append({"link_id": r["link_id"], "account": r["account"], "error": r["error"]})
            continue
        batch = r["batch"]
        if r["pending"] and llm is not None:
            JOBS[batch.id] = "running"
            background_tasks.add_task(run_classification, batch.id)
        else:
            JOBS[batch.id] = "done"
        out.append({
            "link_id": r["link_id"],
            "account": r["account"],
            "batch_id": batch.id,
            "filename": batch.filename,
            "new_count": batch.new_count,
            "dup_count": batch.dup_count,
            "skipped_currency": r["skipped_currency"],
            "classification": job_status(session, batch.id),
        })
    prune_jobs()
    return out
