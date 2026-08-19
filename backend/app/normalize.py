import re
import unicodedata


def normalize_description(desc: str) -> str:
    s = unicodedata.normalize("NFKD", desc).encode("ascii", "ignore").decode()
    s = re.sub(r"[^A-Z*]+", " ", s.upper())
    return re.sub(r"\s+", " ", s).strip()


def name_sort_key(name: str) -> str:
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    return s.casefold()


def extract_installment(desc: str) -> str | None:
    up = desc.upper()
    m = re.search(r"PARC\w*\s*(\d{1,2})\s*/\s*(\d{1,2})", up)
    if not m:
        m = re.search(r"(\d{1,2})\s*/\s*(\d{1,2})\s*$", up)
    if not m:
        return None
    cur, total = int(m.group(1)), int(m.group(2))
    if 1 <= cur <= total and total >= 2:
        return f"{m.group(1)}/{m.group(2)}"
    return None


def parse_installment(inst: str | None) -> tuple[int, int] | None:
    """"02/10" → (2, 10). None, formato ou faixa inválidos → None.

    Mesma regra de validade do extract_installment (1 <= atual <= total, total >= 2);
    revalida porque a migração faz backfill de strings gravadas antes da regra existir.
    """
    if not inst:
        return None
    m = re.fullmatch(r"(\d{1,2})\s*/\s*(\d{1,2})", inst.strip())
    if not m:
        return None
    cur, total = int(m.group(1)), int(m.group(2))
    if 1 <= cur <= total and total >= 2:
        return (cur, total)
    return None
