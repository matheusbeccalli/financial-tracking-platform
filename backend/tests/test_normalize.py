from app.normalize import extract_installment, normalize_description, parse_installment


def test_normalize_removes_digits_dates_and_accents():
    assert normalize_description("PAG*JoseSilva 123456") == "PAG*JOSESILVA"
    assert normalize_description("SUPERMERCADO PÃO DE AÇÚCAR 03/08") == (
        "SUPERMERCADO PAO DE ACUCAR"
    )
    assert normalize_description("  PIX  QR   CODE 9921 ") == "PIX QR CODE"


def test_extract_installment_by_parc_prefix():
    assert extract_installment("LOJAS RENNER PARC 02/10") == "02/10"


def test_extract_installment_at_end():
    assert extract_installment("MAGAZINELUIZA 3/6") == "3/6"


def test_no_installment_for_dates_or_plain_text():
    assert extract_installment("COMPRA 02/08 MERCADO CENTRAL") is None
    assert extract_installment("UBER TRIP") is None


def test_parse_installment_valido():
    assert parse_installment("02/10") == (2, 10)
    assert parse_installment("3/6") == (3, 6)
    assert parse_installment(" 03 / 06 ") == (3, 6)


def test_parse_installment_invalido():
    assert parse_installment(None) is None
    assert parse_installment("") is None
    assert parse_installment("garbage") is None
    assert parse_installment("00/10") is None  # parcela 0 nao existe
    assert parse_installment("5/1") is None    # atual > total
    assert parse_installment("1/1") is None    # total < 2 nao e parcelamento
