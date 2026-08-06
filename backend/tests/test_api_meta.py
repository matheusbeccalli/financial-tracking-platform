def test_list_accounts(client):
    r = client.get("/api/accounts")
    assert r.status_code == 200
    assert len(r.json()) == 4


def test_category_crud(client):
    r = client.post("/api/categories", json={"name": "Pets", "kind": "saida"})
    assert r.status_code == 201
    cat_id = r.json()["id"]
    r = client.patch(f"/api/categories/{cat_id}", json={"name": "Animais", "archived": True})
    assert r.status_code == 200
    listed = client.get("/api/categories").json()
    edited = next(c for c in listed if c["id"] == cat_id)
    assert edited["name"] == "Animais" and edited["archived"] is True


def test_duplicate_category_name_is_400(client):
    assert client.post("/api/categories", json={"name": "Mercado", "kind": "saida"}).status_code == 400


def test_settings_get_and_put(client):
    assert client.get("/api/settings").json()["llm_model"].startswith("claude-")
    r = client.put("/api/settings", json={"llm_model": "claude-sonnet-5"})
    assert r.status_code == 200
    assert client.get("/api/settings").json()["llm_model"] == "claude-sonnet-5"


def test_rules_list_and_delete(client, session):
    from app.models import Rule
    session.add(Rule(matcher="UBER", category_id=1))
    session.flush()
    rules = client.get("/api/rules").json()
    assert len(rules) == 1
    assert client.delete(f"/api/rules/{rules[0]['id']}").status_code == 204
    assert client.get("/api/rules").json() == []


def test_account_create_and_rename(client):
    r = client.post(
        "/api/accounts",
        json={"name": "Nubank Conta", "institution": "nubank", "kind": "corrente"},
    )
    assert r.status_code == 201
    acc_id = r.json()["id"]
    r = client.patch(f"/api/accounts/{acc_id}", json={"name": "Nubank"})
    assert r.json()["name"] == "Nubank"
    assert len(client.get("/api/accounts").json()) == 5


def test_account_invalid_kind_is_400(client):
    r = client.post(
        "/api/accounts", json={"name": "X", "institution": "y", "kind": "poupanca"}
    )
    assert r.status_code == 400


def test_rule_patch_category(client, session):
    from app.models import Rule

    session.add(Rule(matcher="UBER", category_id=1))
    session.flush()
    rule_id = client.get("/api/rules").json()[0]["id"]
    r = client.patch(f"/api/rules/{rule_id}", json={"category_id": 2})
    assert r.status_code == 200 and r.json()["category_id"] == 2


def test_settings_reports_api_key_status(client, monkeypatch):
    from app.config import settings as cfg

    monkeypatch.setattr(cfg, "anthropic_api_key", "")
    assert client.get("/api/settings").json()["api_key_set"] is False
    monkeypatch.setattr(cfg, "anthropic_api_key", "sk-teste")
    assert client.get("/api/settings").json()["api_key_set"] is True
