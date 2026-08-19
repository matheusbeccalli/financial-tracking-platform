"""O script one-off que adiciona installment_number/installment_total em bancos já existentes."""
import importlib.util
import sqlite3
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "migrate_installment_fields.py"


def load_script():
    spec = importlib.util.spec_from_file_location("migrate_installment_fields", SCRIPT)
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


def insert(path: Path, inst: str | None) -> int:
    con = sqlite3.connect(path)
    cur = con.execute("INSERT INTO transactions (installment) VALUES (?)", (inst,))
    con.commit()
    tx_id = cur.lastrowid
    con.close()
    return tx_id


def get(path: Path, tx_id: int) -> tuple:
    con = sqlite3.connect(path)
    row = con.execute(
        "SELECT installment_number, installment_total FROM transactions WHERE id=?",
        (tx_id,),
    ).fetchone()
    con.close()
    return row


def test_adiciona_as_colunas(tmp_path):
    db = tmp_path / "financas.db"
    make_old_db(db)
    mod = load_script()
    mod.migrate(db)
    cols = columns(db)
    assert "installment_number" in cols
    assert "installment_total" in cols


def test_rodar_de_novo_e_idempotente(tmp_path):
    db = tmp_path / "financas.db"
    make_old_db(db)
    mod = load_script()
    mod.migrate(db)
    mod.migrate(db)  # não deve quebrar com coluna já existente
    cols = columns(db)
    assert cols.count("installment_number") == 1
    assert cols.count("installment_total") == 1


def test_backfill_string_valida(tmp_path):
    db = tmp_path / "financas.db"
    make_old_db(db)
    tx_id = insert(db, "02/10")
    mod = load_script()
    mod.migrate(db)
    assert get(db, tx_id) == (2, 10)


def test_backfill_string_invalida_fica_null(tmp_path):
    db = tmp_path / "financas.db"
    make_old_db(db)
    tx_id = insert(db, "12/3")  # atual > total: inválido
    mod = load_script()
    mod.migrate(db)
    assert get(db, tx_id) == (None, None)


def test_backfill_installment_null_fica_null(tmp_path):
    db = tmp_path / "financas.db"
    make_old_db(db)
    tx_id = insert(db, None)
    mod = load_script()
    mod.migrate(db)
    assert get(db, tx_id) == (None, None)
