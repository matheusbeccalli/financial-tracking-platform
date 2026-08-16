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


from app.models import Transaction
from app.services.pluggy import PluggyError
from app.services.pluggy_sync import sync_all


class FakePluggy:
    """Grava as janelas pedidas e devolve transações fixas por conta."""

    def __init__(self, by_account: dict[str, list[dict]], fail: set[str] = frozenset()):
        self.by_account = by_account
        self.fail = fail
        self.windows: dict[str, tuple[date, date]] = {}

    def get_transactions(self, account_id, date_from, date_to):
        if account_id in self.fail:
            raise PluggyError("Pluggy respondeu 500", 500)
        self.windows[account_id] = (date_from, date_to)
        return self.by_account.get(account_id, [])


def _link(session, pluggy_id="acc-1", account_id=1, sync_from=date(2026, 8, 1),
          last=None, pluggy_type="BANK"):
    link = PluggyLink(item_id="item-1", pluggy_account_id=pluggy_id,
                      pluggy_type=pluggy_type, account_id=account_id,
                      sync_from=sync_from, last_synced_at=last)
    session.add(link)
    session.commit()
    return link


def test_sync_importa_via_import_parsed(session):
    link = _link(session)
    fake = FakePluggy({"acc-1": [_raw(), _raw(id="t2", amount=-5.0, description="PADARIA")]})
    results = sync_all(session, fake, today=date(2026, 8, 16))
    session.commit()
    assert len(results) == 1
    r = results[0]
    assert r["batch"].source == "pluggy"
    assert r["batch"].filename == "Pluggy · Bradesco Conta · 2026-08-16"
    assert r["batch"].new_count == 2
    txs = session.query(Transaction).filter_by(batch_id=r["batch"].id).all()
    assert {t.amount_cents for t in txs} == {-1990, -500}
    assert link.last_synced_at is not None


def test_primeira_sync_usa_sync_from(session):
    _link(session, sync_from=date(2026, 8, 5))
    fake = FakePluggy({"acc-1": []})
    sync_all(session, fake, today=date(2026, 8, 16))
    assert fake.windows["acc-1"] == (date(2026, 8, 5), date(2026, 8, 16))


def test_resync_parte_do_last_synced_menos_3_dias(session):
    from datetime import datetime

    _link(session, sync_from=date(2026, 8, 1), last=datetime(2026, 8, 14, 12, 0))
    fake = FakePluggy({"acc-1": []})
    sync_all(session, fake, today=date(2026, 8, 16))
    assert fake.windows["acc-1"] == (date(2026, 8, 11), date(2026, 8, 16))


def test_overlap_nao_recua_antes_do_corte(session):
    from datetime import datetime

    _link(session, sync_from=date(2026, 8, 13), last=datetime(2026, 8, 14, 12, 0))
    fake = FakePluggy({"acc-1": []})
    sync_all(session, fake, today=date(2026, 8, 16))
    assert fake.windows["acc-1"] == (date(2026, 8, 13), date(2026, 8, 16))


def test_nada_antes_do_corte_mesmo_se_api_devolver(session):
    # Cinto e suspensório: a API filtra por from, mas o invariante da spec
    # ("nunca grava antes do corte") não pode depender dela.
    _link(session, sync_from=date(2026, 8, 5))
    fake = FakePluggy({"acc-1": [_raw(date="2026-08-04T03:00:00.000Z")]})
    results = sync_all(session, fake, today=date(2026, 8, 16))
    assert results[0]["batch"].new_count == 0


def test_falha_em_um_vinculo_nao_aborta_os_outros(session):
    _link(session, pluggy_id="acc-1", account_id=1)
    _link(session, pluggy_id="acc-2", account_id=2)
    fake = FakePluggy({"acc-2": [_raw()]}, fail={"acc-1"})
    results = sync_all(session, fake, today=date(2026, 8, 16))
    assert "error" in results[0]
    assert results[1]["batch"].new_count == 1
    # o vínculo que falhou não avança o last_synced_at
    links = session.query(PluggyLink).order_by(PluggyLink.id).all()
    assert links[0].last_synced_at is None
    assert links[1].last_synced_at is not None


def test_resync_dentro_do_overlap_deduplica(session):
    _link(session)
    fake = FakePluggy({"acc-1": [_raw()]})
    r1 = sync_all(session, fake, today=date(2026, 8, 16))
    session.commit()
    r2 = sync_all(session, fake, today=date(2026, 8, 16))
    session.commit()
    assert r1[0]["batch"].new_count == 1
    assert r2[0]["batch"].new_count == 0
    assert r2[0]["batch"].dup_count == 1
