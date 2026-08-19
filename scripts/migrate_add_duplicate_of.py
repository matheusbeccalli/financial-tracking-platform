"""Migração one-off (2026-08-18): coluna transactions.duplicate_of_id.

`init_db` usa create_all, que não altera tabela existente. Esta coluna guarda a
suspeita de duplicata: a linha nova aponta para a que ela parece duplicar.

Uso: backend/.venv/bin/python scripts/migrate_add_duplicate_of.py
"""

import shutil
import sqlite3
import sys
from datetime import date
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent / "backend"
DB = BACKEND / "financas.db"


def migrate(db: Path) -> bool:
    """Adiciona a coluna se faltar. True = alterou, False = já existia."""
    con = sqlite3.connect(db)
    try:
        cols = [r[1] for r in con.execute("PRAGMA table_info(transactions)")]
        if "duplicate_of_id" in cols:
            return False
        con.execute(
            "ALTER TABLE transactions ADD COLUMN duplicate_of_id INTEGER "
            "REFERENCES transactions(id)"
        )
        con.commit()
        return True
    finally:
        con.close()


def main() -> None:
    if not DB.exists():
        sys.exit(f"{DB} não existe")
    backup = BACKEND / f"financas-pre-duplicate-of-{date.today():%Y%m%d}.db"
    if backup.exists():
        sys.exit(f"backup {backup.name} já existe; remova antes de rodar de novo")
    shutil.copy2(DB, backup)
    if migrate(DB):
        print(f"coluna duplicate_of_id adicionada (backup em {backup.name})")
    else:
        print("coluna duplicate_of_id já existia; nada a fazer")


if __name__ == "__main__":
    main()
