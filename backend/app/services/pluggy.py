"""Cliente fino da API Pluggy (docs.pluggy.ai). Atrás de interface de propósito:
testes usam MockTransport/fakes — nenhum teste bate na API real."""
from datetime import date

import httpx

from app.config import settings

BASE_URL = "https://api.pluggy.ai"


class PluggyError(Exception):
    """Erro da API Pluggy, mensagem já em pt-BR para a UI."""

    def __init__(self, message: str, status: int | None = None):
        super().__init__(message)
        self.status = status


class PluggyClient:
    def __init__(
        self,
        client_id: str,
        client_secret: str,
        transport: httpx.BaseTransport | None = None,
    ):
        self._auth = {"clientId": client_id, "clientSecret": client_secret}
        self._http = httpx.Client(base_url=BASE_URL, timeout=30.0, transport=transport)
        self._api_key: str | None = None

    def _authenticate(self) -> str:
        try:
            r = self._http.post("/auth", json=self._auth)
        except httpx.HTTPError as e:
            raise PluggyError(
                f"Pluggy inacessível ({e.__class__.__name__}) — verifique a conexão"
            )
        if r.status_code in (401, 403):
            raise PluggyError(
                "Credencial Pluggy inválida — confira PLUGGY_CLIENT_ID e "
                "PLUGGY_CLIENT_SECRET em backend/.env",
                r.status_code,
            )
        if r.status_code != 200:
            raise PluggyError(f"Pluggy /auth respondeu {r.status_code}", r.status_code)
        self._api_key = r.json()["apiKey"]
        return self._api_key

    def _get(self, path: str, params: dict | None = None) -> dict:
        key = self._api_key or self._authenticate()
        try:
            r = self._http.get(path, params=params, headers={"X-API-KEY": key})
            if r.status_code in (401, 403):  # apiKey expira em ~2h — renova uma vez
                key = self._authenticate()
                r = self._http.get(path, params=params, headers={"X-API-KEY": key})
        except httpx.HTTPError as e:
            raise PluggyError(
                f"Pluggy inacessível ({e.__class__.__name__}) — verifique a conexão"
            )
        if r.status_code == 404:
            raise PluggyError(
                "Item não encontrado na Pluggy — confira o Item ID no dashboard", 404
            )
        if r.status_code != 200:
            raise PluggyError(f"Pluggy respondeu {r.status_code} em {path}", r.status_code)
        return r.json()

    def get_item(self, item_id: str) -> dict:
        return self._get(f"/items/{item_id}")

    def get_accounts(self, item_id: str) -> list[dict]:
        return self._get("/accounts", {"itemId": item_id})["results"]

    def get_transactions(self, account_id: str, date_from: date, date_to: date) -> list[dict]:
        # v2 com cursor: o GET /transactions paginado foi removido (410
        # ENDPOINT_DEPRECATED). `next` já vem como a query string completa da
        # próxima página (inclui o `after`), então basta segui-la.
        out: list[dict] = []
        path = "/v2/transactions"
        params: dict | None = {
            "accountId": account_id,
            "dateFrom": date_from.isoformat(),
            "dateTo": date_to.isoformat(),
        }
        while True:
            data = self._get(path, params)
            out.extend(data["results"])
            nxt = data.get("next")
            if not nxt:
                return out
            path = f"/v2/transactions{nxt}"
            params = None


# Singleton: preserva o cache da apiKey entre requests do FastAPI.
_client: PluggyClient | None = None


def get_pluggy() -> PluggyClient | None:
    """None = credencial ausente no .env (a UI mostra o estado antes de sincronizar)."""
    global _client
    if not (settings.pluggy_client_id and settings.pluggy_client_secret):
        return None
    if _client is None:
        _client = PluggyClient(settings.pluggy_client_id, settings.pluggy_client_secret)
    return _client
