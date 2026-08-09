from datetime import date

import pytest

from app.parsers import parse_file

INTER_STYLE = """Extrato Conta Corrente
Conta: 123456-7

Data Lançamento;Descrição;Valor
01/07/2026;Pix enviado - Jose Silva;-45,00
05/07/2026;Salário Empresa XYZ;8.500,00
""".encode("utf-8")

BRADESCO_STYLE = """Data;Histórico;Valor
03/07/2026;SUPERMERCADO PAO DE ACUCAR;-187,40
""".encode("latin-1")


def test_parse_csv_with_preamble_and_brazilian_numbers():
    txs = parse_file("extrato.csv", INTER_STYLE)
    assert len(txs) == 2
    assert txs[0].date == date(2026, 7, 1)
    assert txs[0].amount_cents == -4500
    assert txs[1].amount_cents == 850000


def test_parse_csv_latin1_header_historico():
    txs = parse_file("extrato.csv", BRADESCO_STYLE)
    assert len(txs) == 1
    assert txs[0].description == "SUPERMERCADO PAO DE ACUCAR"


def test_csv_without_recognizable_header_raises():
    with pytest.raises(ValueError):
        parse_file("x.csv", b"foo;bar\n1;2\n")
