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
