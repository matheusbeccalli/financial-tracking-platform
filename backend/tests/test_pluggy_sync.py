from datetime import date

import pytest
from sqlalchemy.exc import IntegrityError

from app.models import PluggyLink


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
