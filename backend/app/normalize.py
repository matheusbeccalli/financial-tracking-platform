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
