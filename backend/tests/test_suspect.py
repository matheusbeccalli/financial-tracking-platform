"""Regra da suspeita de duplicata entre origens."""
from datetime import date

from app.models import Transaction
from app.services.suspect import find_twin, mark_suspects


def add(session, *, batch_id, dia, cents=-150000, desc="X", installment=None,
        installment_number=None, installment_total=None, duplicate_of_id=None):
    tx = Transaction(
        account_id=1,
        date=date(2026, 8, dia),
        description=desc,
        normalized=desc.upper(),
        amount_cents=cents,
        dedupe_hash=f"h-{batch_id}-{dia}-{cents}-{desc}",
        batch_id=batch_id,
        installment=installment,
        installment_number=installment_number,
        installment_total=installment_total,
        duplicate_of_id=duplicate_of_id,
    )
    session.add(tx)
    session.flush()
    return tx


def test_marca_mesmo_valor_em_lote_diferente(session):
    velha = add(session, batch_id=1, dia=10)
    nova = add(session, batch_id=2, dia=12, desc="OUTRA DESCRICAO")
    assert find_twin(session, nova, set()) is velha


def test_nao_marca_fora_da_janela_de_tres_dias(session):
    add(session, batch_id=1, dia=10)
    nova = add(session, batch_id=2, dia=14, desc="OUTRA DESCRICAO")
    assert find_twin(session, nova, set()) is None


def test_nao_marca_dentro_do_mesmo_lote(session):
    """Dois lançamentos iguais no mesmo arquivo são legítimos (ex.: dois TEDs
    de R$ 1.500 no mesmo dia para pessoas diferentes)."""
    add(session, batch_id=1, dia=10, desc="TED IVETTE")
    nova = add(session, batch_id=1, dia=10, desc="TED DARIO")
    assert find_twin(session, nova, set()) is None


def test_nao_marca_parcelas_diferentes(session):
    """`HUGO BOSS 1/10` e `2/10` dividem data e valor por serem parcelas da
    mesma compra, em faturas diferentes."""
    add(session, batch_id=1, dia=10, desc="HUGO BOSS 2/10", installment="2/10")
    nova = add(session, batch_id=2, dia=10, desc="HUGO BOSS 1/10", installment="1/10")
    assert find_twin(session, nova, set()) is None


def test_marca_quando_so_uma_tem_parcela(session):
    """No cartão, o CSV traz `1/2` e a Pluggy não traz parcela nenhuma."""
    velha = add(session, batch_id=1, dia=10, desc="PG *CALVIN KLEIN 1/2", installment="1/2")
    nova = add(session, batch_id=2, dia=10, desc="PG *CALVIN KLEIN")
    assert find_twin(session, nova, set()) is velha


def test_escolhe_a_gemea_mais_proxima(session):
    add(session, batch_id=1, dia=9, desc="LONGE")
    perto = add(session, batch_id=1, dia=11, desc="PERTO")
    nova = add(session, batch_id=2, dia=12, desc="NOVA")
    assert find_twin(session, nova, set()) is perto


def test_desempate_pelo_menor_id(session):
    primeira = add(session, batch_id=1, dia=10, desc="A")
    add(session, batch_id=1, dia=10, desc="B")
    nova = add(session, batch_id=2, dia=10, desc="NOVA")
    assert find_twin(session, nova, set()) is primeira


def test_gemea_ja_reclamada_nao_conta(session):
    velha = add(session, batch_id=1, dia=10)
    nova = add(session, batch_id=2, dia=10, desc="NOVA")
    assert find_twin(session, nova, {velha.id}) is None


def test_nao_encadeia_marca_sobre_marca(session):
    origem = add(session, batch_id=1, dia=10, desc="ORIGEM")
    add(session, batch_id=2, dia=10, desc="JA MARCADA", duplicate_of_id=origem.id)
    nova = add(session, batch_id=3, dia=10, desc="NOVA")
    assert find_twin(session, nova, set()) is origem


def test_sem_candidata(session):
    nova = add(session, batch_id=2, dia=10)
    assert find_twin(session, nova, set()) is None


def test_mark_suspects_marca_e_conta(session):
    velha = add(session, batch_id=1, dia=10)
    nova = add(session, batch_id=2, dia=10, desc="NOVA")
    assert mark_suspects(session, [nova]) == 1
    assert nova.duplicate_of_id == velha.id


def test_mark_suspects_nao_usa_a_mesma_gemea_duas_vezes(session):
    velha = add(session, batch_id=1, dia=10)
    nova1 = add(session, batch_id=2, dia=10, desc="NOVA 1")
    nova2 = add(session, batch_id=2, dia=10, desc="NOVA 2")
    assert mark_suspects(session, [nova1, nova2]) == 1
    assert nova1.duplicate_of_id == velha.id
    assert nova2.duplicate_of_id is None


def test_parcela_compara_numeros_e_nao_o_texto(session):
    """O import passou a gravar `01/10`, e as linhas antigas têm `1/10`. É a
    mesma parcela, então a suspeita continua valendo."""
    velha = add(session, batch_id=1, dia=10, desc="HUGO BOSS", installment="1/10")
    nova = add(session, batch_id=2, dia=10, desc="HUGO BOSS DO BRA",
               installment="01/10", installment_number=1, installment_total=10)
    assert find_twin(session, nova, set()) is velha


def test_nao_marca_parcelas_diferentes_pelos_numeros(session):
    add(session, batch_id=1, dia=10, desc="HUGO BOSS", installment="02/10",
        installment_number=2, installment_total=10)
    nova = add(session, batch_id=2, dia=10, desc="HUGO BOSS DO BRA",
               installment="01/10", installment_number=1, installment_total=10)
    assert find_twin(session, nova, set()) is None
