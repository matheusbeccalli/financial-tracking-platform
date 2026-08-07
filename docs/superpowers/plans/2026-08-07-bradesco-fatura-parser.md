# Bradesco Credit Card Statement Parser Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Importar o CSV de fatura de cartão de crédito do Bradesco pelo fluxo de upload existente, com detecção automática do formato.

**Architecture:** Novo parser `app/parsers/bradesco_fatura.py` com `sniff()` (detecção por assinatura de conteúdo) e `parse_bradesco_fatura()` (latin-1/CR-only, inferência de ano pela data da fatura, coluna Valor(R$), sinal invertido, fitid determinístico). O dispatcher `parse_file` tenta o sniff antes de cair no CSV genérico. Nada muda a jusante (importer, dedupe, normalize já cobrem parcelas e ignore patterns).

**Tech Stack:** Python 3 / FastAPI backend, pytest (`backend/.venv/bin/pytest`), sem dependências novas.

**Spec:** `docs/superpowers/specs/2026-08-07-bradesco-fatura-parser-design.md`

---

## File Structure

- Create: `backend/app/parsers/bradesco_fatura.py` — sniff + parser da fatura Bradesco (única responsabilidade: bytes → `list[ParsedTransaction]`)
- Create: `backend/tests/test_parsers_bradesco_fatura.py` — testes do parser e do sniff
- Modify: `backend/app/parsers/__init__.py:19-22` — dispatcher `.csv` tenta sniff antes do genérico

Contexto que o executor precisa saber:

- `ParsedTransaction(date, description, amount_cents, fitid)` está em `backend/app/parsers/__init__.py:5-10`. `amount_cents` negativo = saída de dinheiro.
- `_to_cents` e `_fold` já existem em `backend/app/parsers/csv_generic.py:12-19` (reutilizar via import, DRY).
- O hash de dedupe (`backend/app/dedupe.py`) usa `account_id|fitid|...` quando fitid existe — fitid determinístico por conteúdo é seguro.
- Parcelas (`... 1/2` no fim da descrição) são extraídas depois pelo `extract_installment` de `backend/app/normalize.py:11-21` — o parser NÃO mexe nisso.
- O ignore pattern `PAGTO POR DEB` (`backend/app/services/importer.py`) marca o pagamento da fatura como `ignored` no import — o parser importa essa linha normalmente.
- Testes rodam do diretório `backend/`: `cd backend && .venv/bin/pytest`.
- Formato real do arquivo (latin-1, linhas terminadas só em `\r`):
  - `Data: 07/08/2026 12:28:27` / `Situação da Fatura: PAGO` no topo;
  - blocos por cartão: `MATHEUS B A SOUZA ;;; 7433` + header `Data;Histórico;Valor(US$);Valor(R$);`;
  - linhas `dd/mm;DESCRIÇÃO [N/M];valor_usd;valor_brl` (números `1234,56`, despesa positiva, pagamento negativo);
  - linhas especiais `SALDO ANTERIOR` / `PAGTO. POR DEB EM C/C`; rodapé `Total da fatura...`, `Resumo das Despesas`, tabela de taxas.

---

### Task 1: Parser `bradesco_fatura.py`

**Files:**
- Create: `backend/tests/test_parsers_bradesco_fatura.py`
- Create: `backend/app/parsers/bradesco_fatura.py`

- [ ] **Step 1: Write the failing tests**

Criar `backend/tests/test_parsers_bradesco_fatura.py` com este conteúdo exato:

```python
from datetime import date

import pytest

from app.parsers.bradesco_fatura import parse_bradesco_fatura, sniff

FATURA = (
    "Data: 07/08/2026 12:28:27\r"
    "\r"
    "Situação da Fatura: PAGO\r"
    "MATHEUS B A SOUZA ;;; 7433\r"
    "Data;Histórico;Valor(US$);Valor(R$);\r"
    "04/08;HIROTA EM CASA ;0,00;20,56\r"
    "04/08;CAFETERIA BSG ;0,00;18,38\r"
    "04/08;CAFETERIA BSG ;0,00;18,38\r"
    "02/08;VULTR BY CONSTANT ;1,46;7,81\r"
    "28/10;MLP*KABUM KABUM 10/10;0,00;254,40\r"
    "15/07;SALDO ANTERIOR ;0,00;29732,78\r"
    "15/07;PAGTO. POR DEB EM C/C ;0,00;-29732,78\r"
    "MATHEUS B A SOUZA ;;; 1307\r"
    "Data;Histórico;Valor(US$);Valor(R$);\r"
    "03/08;MERCADOLIVRE*MERCADOLIVRE ;0,00;41,29\r"
    "Total da fatura em Real: ;;;24750,46\r"
    "Resumo das Despesas;Real\r"
    "Saldo Anterior;29732,78;\r"
    "Rotativo:;12,490;310,550;346,020;14,490;\r"
).encode("latin-1")

GENERIC_CSV = (
    "Data;Histórico;Valor\r\n"
    "03/07/2026;SUPERMERCADO PAO DE ACUCAR;-187,40\r\n"
).encode("latin-1")


def test_sniff_detects_fatura_and_rejects_generic():
    assert sniff(FATURA) is True
    assert sniff(GENERIC_CSV) is False


def test_parses_all_transaction_rows_skipping_saldo_anterior():
    txs = parse_bradesco_fatura(FATURA)
    descs = [t.description for t in txs]
    assert len(txs) == 7
    assert not any("SALDO ANTERIOR" in d for d in descs)
    assert "MERCADOLIVRE*MERCADOLIVRE" in [d.strip() for d in descs]


def test_year_inferred_from_invoice_date():
    txs = parse_bradesco_fatura(FATURA)
    by_desc = {t.description.strip(): t for t in txs}
    assert by_desc["HIROTA EM CASA"].date == date(2026, 8, 4)
    assert by_desc["MLP*KABUM KABUM 10/10"].date == date(2025, 10, 28)


def test_uses_brl_column_and_inverts_sign():
    txs = parse_bradesco_fatura(FATURA)
    by_desc = {t.description.strip(): t for t in txs}
    assert by_desc["VULTR BY CONSTANT"].amount_cents == -781
    assert by_desc["HIROTA EM CASA"].amount_cents == -2056
    assert by_desc["PAGTO. POR DEB EM C/C"].amount_cents == 2973278


def test_fitid_deterministic_with_occurrence_index():
    txs1 = parse_bradesco_fatura(FATURA)
    txs2 = parse_bradesco_fatura(FATURA)
    cafes = [t for t in txs1 if "CAFETERIA" in t.description]
    assert len(cafes) == 2
    assert cafes[0].fitid != cafes[1].fitid
    assert [t.fitid for t in txs1] == [t.fitid for t in txs2]
    assert all(t.fitid for t in txs1)


def test_missing_invoice_date_header_raises():
    no_header = FATURA.replace(b"Data: 07/08/2026 12:28:27\r", b"")
    with pytest.raises(ValueError):
        parse_bradesco_fatura(no_header)


def test_signature_without_transactions_raises():
    empty = (
        "Data: 07/08/2026 12:28:27\r"
        "Situação da Fatura: PAGO\r"
        "Data;Histórico;Valor(US$);Valor(R$);\r"
    ).encode("latin-1")
    with pytest.raises(ValueError):
        parse_bradesco_fatura(empty)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && .venv/bin/pytest tests/test_parsers_bradesco_fatura.py -v`
Expected: FAIL na coleta com `ModuleNotFoundError: No module named 'app.parsers.bradesco_fatura'`

- [ ] **Step 3: Write the implementation**

Criar `backend/app/parsers/bradesco_fatura.py` com este conteúdo exato:

```python
import re
from datetime import date, datetime

from app.parsers import ParsedTransaction
from app.parsers.csv_generic import _fold, _to_cents

_ROW_RE = re.compile(r"^(\d{2})/(\d{2});")
_REF_RE = re.compile(r"^data:\s*(\d{2}/\d{2}/\d{4})")


def _decode(content: bytes) -> str:
    try:
        return content.decode("utf-8-sig")
    except UnicodeDecodeError:
        return content.decode("latin-1")


def sniff(content: bytes) -> bool:
    folded = _fold(_decode(content))
    return "valor(us$);valor(r$)" in folded and (
        "situacao da fatura" in folded or "total da fatura" in folded
    )


def _infer_date(day: int, month: int, ref: date) -> date | None:
    for year in (ref.year, ref.year - 1, ref.year - 2):
        try:
            d = date(year, month, day)
        except ValueError:
            continue
        if d <= ref:
            return d
    return None


def parse_bradesco_fatura(content: bytes) -> list[ParsedTransaction]:
    lines = [l for l in _decode(content).splitlines() if l.strip()]

    ref = None
    for line in lines:
        m = _REF_RE.match(_fold(line))
        if m:
            ref = datetime.strptime(m.group(1), "%d/%m/%Y").date()
            break
    if ref is None:
        raise ValueError("Fatura Bradesco sem data de referência (linha 'Data: dd/mm/aaaa')")

    out: list[ParsedTransaction] = []
    counts: dict[tuple[str, str, int], int] = {}
    for line in lines:
        m = _ROW_RE.match(line)
        if not m:
            continue
        parts = line.split(";")
        if len(parts) < 4:
            continue
        desc = parts[1].strip()
        if _fold(desc) == "saldo anterior":
            continue
        d = _infer_date(int(m.group(1)), int(m.group(2)), ref)
        if d is None:
            continue
        try:
            cents = -_to_cents(parts[3])
        except ValueError:
            continue
        key = (d.isoformat(), desc, cents)
        counts[key] = counts.get(key, 0) + 1
        out.append(
            ParsedTransaction(
                date=d,
                description=desc,
                amount_cents=cents,
                fitid=f"bradesco-fatura|{d.isoformat()}|{desc}|{cents}|{counts[key]}",
            )
        )
    if not out:
        raise ValueError("Fatura Bradesco sem linhas de transação válidas")
    return out
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && .venv/bin/pytest tests/test_parsers_bradesco_fatura.py -v`
Expected: 7 passed

- [ ] **Step 5: Commit**

```bash
git add backend/app/parsers/bradesco_fatura.py backend/tests/test_parsers_bradesco_fatura.py
git commit -m "feat(ingest): add Bradesco credit card statement parser"
```

---

### Task 2: Detecção automática no dispatcher

**Files:**
- Modify: `backend/app/parsers/__init__.py:19-22`
- Test: `backend/tests/test_parsers_bradesco_fatura.py` (append)

- [ ] **Step 1: Write the failing tests**

Adicionar ao FINAL de `backend/tests/test_parsers_bradesco_fatura.py`:

```python
def test_parse_file_routes_fatura_to_bradesco_parser():
    from app.parsers import parse_file

    txs = parse_file("Bradesco_872026_122833 AM.csv", FATURA)
    assert len(txs) == 7
    assert txs[0].fitid and txs[0].fitid.startswith("bradesco-fatura|")


def test_parse_file_routes_generic_csv_to_generic_parser():
    from app.parsers import parse_file

    txs = parse_file("extrato.csv", GENERIC_CSV)
    assert len(txs) == 1
    assert txs[0].fitid is None
```

- [ ] **Step 2: Run tests to verify the new one fails**

Run: `cd backend && .venv/bin/pytest tests/test_parsers_bradesco_fatura.py -v`
Expected: `test_parse_file_routes_fatura_to_bradesco_parser` FAIL (o dispatcher usa o parser genérico, que lança `ValueError: CSV sem linhas de transação válidas` — datas `dd/mm` não casam com `dd/mm/yyyy`); `test_parse_file_routes_generic_csv_to_generic_parser` PASS.

- [ ] **Step 3: Update the dispatcher**

Em `backend/app/parsers/__init__.py`, substituir o bloco `.csv`:

```python
    if lower.endswith(".csv"):
        from app.parsers.csv_generic import parse_csv

        return parse_csv(content)
```

por:

```python
    if lower.endswith(".csv"):
        from app.parsers.bradesco_fatura import parse_bradesco_fatura, sniff
        from app.parsers.csv_generic import parse_csv

        if sniff(content):
            return parse_bradesco_fatura(content)
        return parse_csv(content)
```

- [ ] **Step 4: Run the full test suite**

Run: `cd backend && .venv/bin/pytest`
Expected: tudo passa (novos + `test_parsers_csv.py` + resto da suíte, sem regressões)

- [ ] **Step 5: Commit**

```bash
git add backend/app/parsers/__init__.py backend/tests/test_parsers_bradesco_fatura.py
git commit -m "feat(ingest): auto-detect Bradesco statement format in CSV dispatcher"
```

---

### Task 3: Verificação com o arquivo real

**Files:**
- Nenhum arquivo novo; validação manual + suíte completa.

- [ ] **Step 1: Parse do arquivo real**

Run (do diretório `backend/`):

```bash
.venv/bin/python -c "
from pathlib import Path
from app.parsers import parse_file

content = Path('../Bradesco_872026_122833 AM.csv').read_bytes()
txs = parse_file('Bradesco_872026_122833 AM.csv', content)
print(len(txs), 'transações')
expenses = sum(-t.amount_cents for t in txs if t.amount_cents < 0)
print('despesas: R$', expenses / 100)
print('min/max data:', min(t.date for t in txs), max(t.date for t in txs))
"
```

Expected: `142 transações` (143 linhas `dd/mm;` menos 1 `SALDO ANTERIOR`) e `despesas: R$ 24750.46` — valor conferido previamente contra a linha `Total da fatura em Real: 24750,46` do próprio arquivo (o único crédito, o pagamento de R$ 29.732,78, fica fora da soma de despesas). Se divergir, investigar antes de prosseguir.

- [ ] **Step 2: Suíte completa de novo (sanidade final)**

Run: `cd backend && .venv/bin/pytest`
Expected: tudo verde.

- [ ] **Step 3: Nada a commitar**

Task de verificação apenas; nenhum artefato novo. O arquivo `Bradesco_872026_122833 AM.csv` NÃO deve ser commitado (dado financeiro pessoal; deixar untracked).
