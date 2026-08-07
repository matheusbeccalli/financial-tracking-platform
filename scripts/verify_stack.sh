#!/usr/bin/env bash
# Verifica que o app local está de pé e coerente. Saída: linhas PASS/FAIL/WARN.
# Exit 0 somente com zero FAILs. Uso: scripts/verify_stack.sh [--skip-data]
set -u
APP_URL="${APP_URL:-http://localhost:8000}"
FAILS=0

pass() { echo "PASS: $1"; }
fail() { echo "FAIL: $1"; FAILS=$((FAILS + 1)); }
warn() { echo "WARN: $1"; }

# 1. Processo
if pgrep -f "uvicorn app.main:app" >/dev/null; then
  pass "processo uvicorn rodando"
else
  fail "processo uvicorn não encontrado"
fi

# 2. Health endpoint
health=$(curl -sf --max-time 5 "$APP_URL/api/health" 2>/dev/null)
if [ "$health" = '{"status":"ok"}' ]; then
  pass "GET /api/health responde ok"
else
  fail "GET /api/health não respondeu ok (recebido: ${health:-nada})"
fi

# 3. UI servida
if curl -sf --max-time 5 "$APP_URL/" 2>/dev/null | grep -q "<title>Finanças</title>"; then
  pass "UI (frontend/dist) servida na raiz"
else
  fail "UI não servida na raiz (frontend/dist existe? rodou npm run build?)"
fi

# 4. Seed / banco
accounts=$(curl -sf --max-time 5 "$APP_URL/api/accounts" 2>/dev/null | grep -o '"id"' | wc -l)
if [ "${accounts:-0}" -ge 4 ]; then
  pass "banco com seed: $accounts contas"
else
  fail "esperava >=4 contas no seed, achei ${accounts:-0}"
fi

# 5. Configuração do LLM
settings=$(curl -sf --max-time 5 "$APP_URL/api/settings" 2>/dev/null)
if echo "$settings" | grep -q '"llm_model"'; then
  pass "settings respondem (modelo: $(echo "$settings" | grep -o '"llm_model":"[^"]*"' | cut -d'"' -f4))"
else
  fail "GET /api/settings não respondeu"
fi
if echo "$settings" | grep -q '"api_key_set":true'; then
  pass "chave da API Anthropic configurada — classificação LLM ativa"
else
  warn "ANTHROPIC_API_KEY ausente — transações novas ficarão 'a classificar'"
fi

# 6. Erros recentes no log
if [ -f /tmp/financas-app.log ]; then
  errors=$(grep -cE "Traceback|ERROR" /tmp/financas-app.log 2>/dev/null || true)
  if [ "${errors:-0}" -eq 0 ]; then
    pass "sem erros no log do app"
  else
    warn "$errors linhas de erro em /tmp/financas-app.log — inspecione"
  fi
fi

echo "---"
if [ "$FAILS" -eq 0 ]; then
  echo "RESULTADO: OK (0 FAILs)"
  exit 0
fi
echo "RESULTADO: $FAILS FAIL(s)"
exit 1
