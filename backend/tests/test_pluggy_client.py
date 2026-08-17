"""Cliente Pluggy contra um MockTransport — nenhum teste toca a API real."""
from datetime import date

import httpx
import pytest

from app.services.pluggy import PluggyClient, PluggyError


def make_client(handler):
    return PluggyClient("cid", "csecret", transport=httpx.MockTransport(handler))


def test_autentica_uma_vez_e_usa_x_api_key():
    calls = []

    def handler(request):
        calls.append((request.method, request.url.path, request.headers.get("X-API-KEY")))
        if request.url.path == "/auth":
            return httpx.Response(200, json={"apiKey": "k1"})
        return httpx.Response(200, json={"id": "item-1", "status": "UPDATED"})

    c = make_client(handler)
    c.get_item("item-1")
    c.get_item("item-1")
    auths = [x for x in calls if x[1] == "/auth"]
    gets = [x for x in calls if x[1] == "/items/item-1"]
    assert len(auths) == 1  # apiKey cacheada
    assert all(g[2] == "k1" for g in gets)


def test_renova_apikey_em_401():
    keys = iter(["k1", "k2"])
    state = {"gets": 0}

    def handler(request):
        if request.url.path == "/auth":
            return httpx.Response(200, json={"apiKey": next(keys)})
        state["gets"] += 1
        if request.headers.get("X-API-KEY") == "k1":
            return httpx.Response(401, json={})
        return httpx.Response(200, json={"id": "item-1", "status": "UPDATED"})

    c = make_client(handler)
    assert c.get_item("item-1")["status"] == "UPDATED"
    assert state["gets"] == 2  # tentou com k1, renovou, repetiu com k2


def test_credencial_invalida_vira_pluggy_error():
    def handler(request):
        return httpx.Response(401, json={"message": "invalid"})

    c = make_client(handler)
    with pytest.raises(PluggyError) as e:
        c.get_item("x")
    assert "credencial" in str(e.value).lower()


def test_item_404_vira_pluggy_error_com_status():
    def handler(request):
        if request.url.path == "/auth":
            return httpx.Response(200, json={"apiKey": "k"})
        return httpx.Response(404, json={})

    c = make_client(handler)
    with pytest.raises(PluggyError) as e:
        c.get_item("nao-existe")
    assert e.value.status == 404


def test_transactions_v2_pagina_pelo_cursor_next():
    # O GET /transactions paginado foi removido (410 ENDPOINT_DEPRECATED em
    # 2026-09): o v2 filtra por dateFrom/dateTo e devolve em `next` a query
    # string pronta da próxima página (parâmetro real: `after`).
    calls = []

    def handler(request):
        if request.url.path == "/auth":
            return httpx.Response(200, json={"apiKey": "k"})
        assert request.url.path == "/v2/transactions"
        calls.append(dict(request.url.params))
        if "after" not in request.url.params:
            assert request.url.params["accountId"] == "acc-1"
            assert request.url.params["dateFrom"] == "2026-08-01"
            assert request.url.params["dateTo"] == "2026-08-16"
            return httpx.Response(200, json={
                "results": [{"id": "t1"}],
                "next": "?accountId=acc-1&dateFrom=2026-08-01&after=cur2",
            })
        assert request.url.params["after"] == "cur2"
        return httpx.Response(200, json={"results": [{"id": "t2"}], "next": None})

    c = make_client(handler)
    txs = c.get_transactions("acc-1", date(2026, 8, 1), date(2026, 8, 16))
    assert [t["id"] for t in txs] == ["t1", "t2"]
    assert len(calls) == 2


def test_get_accounts_devolve_results():
    def handler(request):
        if request.url.path == "/auth":
            return httpx.Response(200, json={"apiKey": "k"})
        assert request.url.params["itemId"] == "item-1"
        return httpx.Response(200, json={"results": [{"id": "acc-1", "type": "BANK"}]})

    c = make_client(handler)
    assert c.get_accounts("item-1") == [{"id": "acc-1", "type": "BANK"}]


def test_erro_de_rede_vira_pluggy_error():
    def handler(request):
        raise httpx.ConnectError("boom")

    c = make_client(handler)
    with pytest.raises(PluggyError) as e:
        c.get_item("x")
    assert "inacess" in str(e.value).lower()
