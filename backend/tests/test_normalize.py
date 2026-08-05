from app.normalize import extract_installment, normalize_description


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
