import hashlib
from datetime import date


def make_hash(
    account_id: int,
    d: date,
    amount_cents: int,
    description: str,
    seq: int = 1,
) -> str:
    # FITIDs de OFX não entram no hash: o Bradesco regenera FITIDs a cada
    # exportação, então o mesmo lançamento chegaria com hash diferente.
    # `seq` é a ordem da ocorrência de chave idêntica dentro do arquivo,
    # preservando compras iguais repetidas no mesmo dia.
    base = f"{account_id}|{d.isoformat()}|{amount_cents}|{description.strip().upper()}|{seq}"
    return hashlib.sha256(base.encode()).hexdigest()
