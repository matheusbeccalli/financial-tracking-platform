from datetime import date

import pytest
from sqlalchemy.exc import IntegrityError

from app.models import PluggyLink
from app.services.pluggy_sync import to_parsed


def test_pluggy_link_roundtrip(session):
    link = PluggyLink(
        item_id="item-1",
        pluggy_account_id="acc-1",
        pluggy_type="BANK",
        account_id=1,
        sync_from=date(2026, 8, 1),
    )
    session.add(link)
    session.commit()
    got = session.get(PluggyLink, link.id)
    assert got.sync_from == date(2026, 8, 1)
    assert got.last_synced_at is None


def test_pluggy_account_id_unico(session):
    session.add(
        PluggyLink(item_id="i", pluggy_account_id="dup", pluggy_type="BANK",
                   account_id=1, sync_from=date(2026, 8, 1))
    )
    session.commit()
    session.add(
        PluggyLink(item_id="i", pluggy_account_id="dup", pluggy_type="CREDIT",
                   account_id=2, sync_from=date(2026, 8, 1))
    )
    with pytest.raises(IntegrityError):
        session.commit()
    session.rollback()


def _raw(**kw):
    base = {
        "id": "t1",
        "description": "UBER TRIP",
        "descriptionRaw": None,
        "amount": -19.9,
        "date": "2026-08-10T03:00:00.000Z",
        "type": "DEBIT",
        "status": "POSTED",
        "currencyCode": "BRL",
    }
    base.update(kw)
    return base


def test_bank_mantem_sinal_e_converte_centavos():
    parsed, skipped = to_parsed([_raw(amount=-19.9), _raw(id="t2", amount=1234.56)], "BANK")
    assert [p.amount_cents for p in parsed] == [-1990, 123456]
    assert parsed[0].date == date(2026, 8, 10)
    assert skipped == 0


def test_credit_inverte_sinal():
    # Cartão na Pluggy: positivo = compra, negativo = pagamento/estorno.
    parsed, _ = to_parsed(
        [_raw(amount=50.0), _raw(id="t2", amount=-200.0)], "CREDIT"
    )
    assert [p.amount_cents for p in parsed] == [-5000, 20000]


def test_prefere_description_raw():
    parsed, _ = to_parsed([_raw(descriptionRaw="UBER *TRIP 123")], "BANK")
    assert parsed[0].description == "UBER *TRIP 123"


def test_pending_fica_de_fora():
    # PENDING pode mudar de valor/descrição ao postar; entra no próximo sync.
    parsed, skipped = to_parsed([_raw(status="PENDING")], "BANK")
    assert parsed == []
    assert skipped == 0  # pending não conta como "pulada de moeda"


def test_moeda_estrangeira_pulada_e_contada():
    parsed, skipped = to_parsed([_raw(currencyCode="USD"), _raw(id="t2")], "BANK")
    assert len(parsed) == 1
    assert skipped == 1
