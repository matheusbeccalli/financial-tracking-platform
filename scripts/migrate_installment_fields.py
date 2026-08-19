"""Migração one-off (2026-08-18): colunas installment_number/installment_total.

`init_db` usa create_all, que não altera tabela existente. Tela de Parcelamentos
precisa de parcela estruturada. Este script:

1. faz backup do banco;
2. adiciona as colunas (se ainda não existem);
3. backfill: parseia as strings `installment` existentes com parse_installment
   (mesma regra de validade do importador); string inválida fica NULL.

Uso: backend/.venv/bin/python scripts/migrate_installment_fields.py
"""

import shutil
import sqlite3
import sys
from datetime import date
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(BACKEND))

from app.normalize import parse_installment  # noqa: E402

DB = BACKEND / "financas.db"


def migrate(db: Path) -> tuple[int, int]:
    """Adiciona as colunas (se faltarem) e faz backfill. Retorna (strings, backfilled)."""
    con = sqlite3.connect(db)
    try:
        cols = [r[1] for r in con.execute("PRAGMA table_info(transactions)")]
        for col in ("installment_number", "installment_total"):
            if col not in cols:
                con.execute(f"ALTER TABLE transactions ADD COLUMN {col} INTEGER")
        rows = con.execute(
            "SELECT id, installment FROM transactions WHERE installment IS NOT NULL"
        ).fetchall()
        updates = []
        for tx_id, inst in rows:
            parts = parse_installment(inst)
            if parts:
                updates.append((parts[0], parts[1], tx_id))
        con.executemany(
            "UPDATE transactions SET installment_number=?, installment_total=? WHERE id=?",
            updates,
        )
        con.commit()
        return len(rows), len(updates)
    finally:
        con.close()


def main() -> None:
    if not DB.exists():
        sys.exit(f"{DB} não existe")
    backup = BACKEND / f"financas-pre-installment-fields-{date.today():%Y%m%d}.db"
    if backup.exists():
        sys.exit(f"backup {backup.name} já existe; remova antes de rodar de novo")
    shutil.copy2(DB, backup)
    print(f"backup: {backup.name}")

    strings, backfilled = migrate(DB)
    print(f"{strings} strings de parcela, {backfilled} com backfill")


if __name__ == "__main__":
    main()
