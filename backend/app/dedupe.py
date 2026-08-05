import hashlib
from datetime import date


def make_hash(
    account_id: int,
    fitid: str | None,
    d: date,
    amount_cents: int,
    description: str,
) -> str:
    if fitid:
        base = f"{account_id}|fitid|{fitid}"
    else:
        base = f"{account_id}|{d.isoformat()}|{amount_cents}|{description.strip().upper()}"
    return hashlib.sha256(base.encode()).hexdigest()
