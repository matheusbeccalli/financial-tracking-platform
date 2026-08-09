"""Migração one-off (2026-08-09): dedupe_hash v2.

O Bradesco regenera FITIDs a cada exportação de OFX, então o hash baseado em
fitid deixou passar duplicatas (maio/2026, conta corrente). Este script:

1. faz backup do banco;
2. remove os batches informados em --purge-batch (importações 100% duplicadas);
3. recalcula todos os dedupe_hash no esquema novo:
   sha256(account|data|centavos|DESCRICAO|seq), onde seq numera ocorrências
   de chave idêntica dentro da conta, em ordem de id — o mesmo esquema que o
   importador passa a usar.

Uso: backend/.venv/bin/python scripts/migrate_dedupe_hash_v2.py [--purge-batch N ...]
"""

import argparse
import shutil
import sqlite3
import sys
from datetime import date
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(BACKEND))

from app.dedupe import make_hash  # noqa: E402

DB = BACKEND / "financas.db"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--purge-batch", type=int, action="append", default=[])
    ap.add_argument("--backup-suffix", default=date.today().strftime("%Y%m%d"))
    args = ap.parse_args()

    backup = BACKEND / f"financas-backup-{args.backup_suffix}.db"
    if backup.exists():
        sys.exit(f"backup {backup.name} já existe; remova ou use --backup-suffix")
    shutil.copy2(DB, backup)
    print(f"backup: {backup.name}")

    con = sqlite3.connect(DB)
    try:
        for b in args.purge_batch:
            n = con.execute(
                "DELETE FROM transactions WHERE batch_id=?", (b,)
            ).rowcount
            con.execute("DELETE FROM import_batch WHERE id=?", (b,))
            print(f"batch {b}: {n} transações removidas")

        rows = con.execute(
            "SELECT id, account_id, date, amount_cents, description"
            " FROM transactions ORDER BY account_id, id"
        ).fetchall()
        seen: dict[tuple, int] = {}
        updates = []
        for tx_id, account_id, d, cents, desc in rows:
            key = (account_id, d, cents, desc.strip().upper())
            seen[key] = seen.get(key, 0) + 1
            updates.append(
                (make_hash(account_id, date.fromisoformat(d), cents, desc, seen[key]), tx_id)
            )
        if len({h for h, _ in updates}) != len(updates):
            sys.exit("colisão de hash inesperada; nada foi gravado")
        con.executemany("UPDATE transactions SET dedupe_hash=? WHERE id=?", updates)
        con.commit()
        print(f"{len(updates)} hashes recalculados")
    except Exception:
        con.rollback()
        raise
    finally:
        con.close()


if __name__ == "__main__":
    main()
