from datetime import date
from pathlib import Path

import pytest

from app.parsers import ParsedTransaction, parse_file

FIXTURES = Path(__file__).parent / "fixtures"


def load(name: str) -> bytes:
    return (FIXTURES / name).read_bytes()


def test_parse_bradesco_conta():
    txs = parse_file("bradesco_conta.ofx", load("bradesco_conta.ofx"))
    assert len(txs) == 3
    first = txs[0]
    assert first == ParsedTransaction(
        date=date(2026, 7, 3),
        description="SUPERMERCADO PAO DE ACUCAR 123456",
        amount_cents=-18740,
        fitid="N1001",
    )
    assert txs[1].amount_cents == 850000  # crédito de salário


def test_parse_inter_cartao():
    txs = parse_file("inter_cartao.ofx", load("inter_cartao.ofx"))
    assert len(txs) == 2
    assert txs[1].description == "LOJAS RENNER PARC 02/04"
    assert txs[1].amount_cents == -12000


def test_latin1_bytes_do_not_crash():
    content = load("bradesco_conta.ofx").replace(
        b"SUPERMERCADO PAO", b"FARMACIA S\xc3O JO\xc3O"
    )
    txs = parse_file("x.ofx", content)
    assert len(txs) == 3  # decodifica sem explodir


def test_invalid_file_raises_value_error():
    with pytest.raises(ValueError):
        parse_file("lixo.ofx", b"isto nao e um ofx")


def test_unknown_extension_raises():
    with pytest.raises(ValueError):
        parse_file("extrato.pdf", b"")
