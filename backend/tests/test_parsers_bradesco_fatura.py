from datetime import date

import pytest

from app.parsers.bradesco_fatura import parse_bradesco_fatura, sniff

FATURA = (
    "Data: 07/08/2026 12:28:27\r"
    "\r"
    "Situação da Fatura: PAGO\r"
    "MATHEUS B A SOUZA ;;; 7433\r"
    "Data;Histórico;Valor(US$);Valor(R$);\r"
    "04/08;HIROTA EM CASA ;0,00;20,56\r"
    "04/08;CAFETERIA BSG ;0,00;18,38\r"
    "04/08;CAFETERIA BSG ;0,00;18,38\r"
    "02/08;VULTR BY CONSTANT ;1,46;7,81\r"
    "28/10;MLP*KABUM KABUM 10/10;0,00;254,40\r"
    "15/07;SALDO ANTERIOR ;0,00;29732,78\r"
    "15/07;PAGTO. POR DEB EM C/C ;0,00;-29732,78\r"
    "MATHEUS B A SOUZA ;;; 1307\r"
    "Data;Histórico;Valor(US$);Valor(R$);\r"
    "03/08;MERCADOLIVRE*MERCADOLIVRE ;0,00;41,29\r"
    "Total da fatura em Real: ;;;24750,46\r"
    "Resumo das Despesas;Real\r"
    "Saldo Anterior;29732,78;\r"
    "Rotativo:;12,490;310,550;346,020;14,490;\r"
).encode("latin-1")

GENERIC_CSV = (
    "Data;Histórico;Valor\r\n"
    "03/07/2026;SUPERMERCADO PAO DE ACUCAR;-187,40\r\n"
).encode("latin-1")


def test_sniff_detects_fatura_and_rejects_generic():
    assert sniff(FATURA) is True
    assert sniff(GENERIC_CSV) is False


def test_parses_all_transaction_rows_skipping_saldo_anterior():
    txs = parse_bradesco_fatura(FATURA)
    descs = [t.description for t in txs]
    assert len(txs) == 7
    assert not any("SALDO ANTERIOR" in d for d in descs)
    assert "MERCADOLIVRE*MERCADOLIVRE" in [d.strip() for d in descs]


def test_year_inferred_from_invoice_date():
    txs = parse_bradesco_fatura(FATURA)
    by_desc = {t.description.strip(): t for t in txs}
    assert by_desc["HIROTA EM CASA"].date == date(2026, 8, 4)
    assert by_desc["MLP*KABUM KABUM 10/10"].date == date(2025, 10, 28)


def test_uses_brl_column_and_inverts_sign():
    txs = parse_bradesco_fatura(FATURA)
    by_desc = {t.description.strip(): t for t in txs}
    assert by_desc["VULTR BY CONSTANT"].amount_cents == -781
    assert by_desc["HIROTA EM CASA"].amount_cents == -2056
    assert by_desc["PAGTO. POR DEB EM C/C"].amount_cents == 2973278


def test_fitid_deterministic_with_occurrence_index():
    txs1 = parse_bradesco_fatura(FATURA)
    txs2 = parse_bradesco_fatura(FATURA)
    cafes = [t for t in txs1 if "CAFETERIA" in t.description]
    assert len(cafes) == 2
    assert cafes[0].fitid != cafes[1].fitid
    assert [t.fitid for t in txs1] == [t.fitid for t in txs2]
    assert all(t.fitid for t in txs1)


def test_missing_invoice_date_header_raises():
    no_header = FATURA.replace(b"Data: 07/08/2026 12:28:27\r", b"")
    with pytest.raises(ValueError):
        parse_bradesco_fatura(no_header)


def test_signature_without_transactions_raises():
    empty = (
        "Data: 07/08/2026 12:28:27\r"
        "Situação da Fatura: PAGO\r"
        "Data;Histórico;Valor(US$);Valor(R$);\r"
    ).encode("latin-1")
    with pytest.raises(ValueError):
        parse_bradesco_fatura(empty)
