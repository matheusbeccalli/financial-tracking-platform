from collections import defaultdict

from sqlalchemy import select

from app.models import Category
from app.services.budget import budget_map, month_bounds, real_by_category

TOP_N = 8


def months_for_period(period: str, ref: str) -> list[str]:
    year, month = int(ref[:4]), int(ref[5:7])
    if period == "month":
        return [ref]
    if period == "ytd":
        return [f"{year:04d}-{m:02d}" for m in range(1, month + 1)]
    if period == "12m":
        out = []
        y, m = year, month
        for _ in range(12):
            out.append(f"{y:04d}-{m:02d}")
            m -= 1
            if m == 0:
                y, m = y - 1, 12
        return list(reversed(out))
    raise ValueError(f"Período inválido: {period}")


def bridge(session, period: str, ref: str) -> dict:
    months = months_for_period(period, ref)
    cats = {c.id: c for c in session.scalars(select(Category))}

    orc_signed: dict[int, int] = defaultdict(int)
    for month in months:
        for cat_id, cents in budget_map(session, month).items():
            sign = 1 if cats[cat_id].kind == "entrada" else -1
            orc_signed[cat_id] += sign * cents

    start = month_bounds(months[0])[0]
    end = month_bounds(months[-1])[1]
    real_signed = real_by_category(session, start, end)

    effects = []
    for cat_id in set(orc_signed) | set(real_signed):
        delta = real_signed.get(cat_id, 0) - orc_signed.get(cat_id, 0)
        if delta == 0:
            continue
        name = cats[cat_id].name if cat_id is not None else "Sem categoria"
        effects.append({"categoria": name, "delta": delta})
    effects.sort(key=lambda e: abs(e["delta"]), reverse=True)

    steps = effects[:TOP_N]
    rest = sum(e["delta"] for e in effects[TOP_N:])
    if rest != 0:
        steps.append({"categoria": "Demais", "delta": rest})

    total_orc = sum(orc_signed.values())
    return {
        "period": period,
        "ref": ref,
        "months": months,
        "start": total_orc,
        "steps": steps,
        "end": total_orc + sum(s["delta"] for s in steps),
    }
