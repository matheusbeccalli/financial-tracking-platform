"""O script one-off que adiciona duplicate_of_id em bancos já existentes."""
import importlib.util
import sqlite3
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "migrate_add_duplicate_of.py"


def load_script():
    spec = importlib.util.spec_from_file_location("migrate_add_duplicate_of", SCRIPT)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def make_old_db(path: Path) -> None:
    con = sqlite3.connect(path)
    con.execute(
        "CREATE TABLE transactions (id INTEGER PRIMARY KEY, account_id INTEGER, "
        "date DATE, description TEXT, normalized TEXT, amount_cents INTEGER, "
        "category_id INTEGER, source TEXT, dedupe_hash TEXT, batch_id INTEGER, "
        "installment TEXT, ignored BOOLEAN)"
    )
    con.commit()
    con.close()


def columns(path: Path) -> list[str]:
    con = sqlite3.connect(path)
    cols = [r[1] for r in con.execute("PRAGMA table_info(transactions)")]
    con.close()
    return cols


def test_adiciona_a_coluna(tmp_path):
    db = tmp_path / "financas.db"
    make_old_db(db)
    mod = load_script()
    assert mod.migrate(db) is True
    assert "duplicate_of_id" in columns(db)


def test_rodar_de_novo_nao_faz_nada(tmp_path):
    db = tmp_path / "financas.db"
    make_old_db(db)
    mod = load_script()
    mod.migrate(db)
    assert mod.migrate(db) is False
    assert columns(db).count("duplicate_of_id") == 1
