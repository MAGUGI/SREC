#!/usr/bin/env bash
# Reproduz os bugs catalogados na auditoria da N2 contra uma instancia rodando
# do SREC recebido. Nao altera nada: so faz requisicoes e compara o status HTTP
# obtido com o esperado.
#
# Uso:
#   BASE_URL=http://localhost:5000 ./reproduzir-bugs.sh
#
# Saida: uma linha por caso, com BUG CONFIRMADO quando o comportamento errado
# acontece e CORRIGIDO quando o sistema ja responde certo. Serve para rodar
# antes da N2 (esperado: quase tudo confirmado) e depois (esperado: tudo
# corrigido), e o diff entre as duas execucoes e material de pitch.
#
# Referencia: docs/auditoria/bugs-do-cliente.md

set -uo pipefail
BASE="${BASE_URL:-http://localhost:5000}"
API="$BASE/api"

confirmados=0
corrigidos=0
inconclusivos=0

req() { # metodo caminho [corpo] -> imprime o status HTTP
  local m="$1" p="$2" b="${3:-}"
  if [ -n "$b" ]; then
    curl -s -o /dev/null -w '%{http_code}' -X "$m" "$API$p" \
      -H 'Content-Type: application/json' -d "$b"
  else
    curl -s -o /dev/null -w '%{http_code}' -X "$m" "$API$p"
  fi
}

body() { # metodo caminho [corpo] -> imprime o corpo da resposta
  local m="$1" p="$2" b="${3:-}"
  if [ -n "$b" ]; then
    curl -s -X "$m" "$API$p" -H 'Content-Type: application/json' -d "$b"
  else
    curl -s -X "$m" "$API$p"
  fi
}

# avalia id severidade descricao status_obtido status_errado status_certo
avalia() {
  local id="$1" sev="$2" desc="$3" got="$4" bad="$5" good="$6"
  if [ "$got" = "$bad" ]; then
    printf '  \033[31mBUG CONFIRMADO\033[0m  %-7s %-8s %s (HTTP %s, esperado %s)\n' \
      "$id" "[$sev]" "$desc" "$got" "$good"
    confirmados=$((confirmados + 1))
  elif [ "$got" = "$good" ]; then
    printf '  \033[32mCORRIGIDO\033[0m       %-7s %-8s %s (HTTP %s)\n' \
      "$id" "[$sev]" "$desc" "$got"
    corrigidos=$((corrigidos + 1))
  else
    printf '  \033[33mINCONCLUSIVO\033[0m    %-7s %-8s %s (HTTP %s, esperava %s ou %s)\n' \
      "$id" "[$sev]" "$desc" "$got" "$bad" "$good"
    inconclusivos=$((inconclusivos + 1))
  fi
}

echo "SREC - reproducao dos bugs da auditoria N2"
echo "Alvo: $BASE"
echo

if ! curl -sf -o /dev/null "$BASE/"; then
  echo "ERRO: $BASE nao responde. Suba o servidor antes (cd server && npm run dev)."
  exit 2
fi

# ---------------------------------------------------------------- preparacao
echo "Preparando: cria um espaco de teste..."
RES=$(body POST /resources '{"name":"AUDITORIA N2 - sala de teste","type":"meeting_room","capacity":4}')
RID=$(printf '%s' "$RES" | sed -n 's/.*"id":\([0-9]*\).*/\1/p')
if [ -z "$RID" ]; then
  echo "ERRO: nao consegui criar o espaco de teste. Resposta: $RES"
  exit 2
fi
echo "  espaco criado: id=$RID"
echo

# janela de teste bem no futuro, para nao colidir com dado real
INI="2030-03-10 10:00:00"
FIM="2030-03-10 11:00:00"

echo "Casos:"

# ----------------------------------------------------------------- BUG-02
# Fim anterior ao inicio deve ser recusado com 400.
S=$(req POST /reservations \
  "{\"resource_id\":$RID,\"user_name\":\"auditoria\",\"start_time\":\"2030-03-11 10:00:00\",\"end_time\":\"2030-03-11 09:00:00\"}")
avalia BUG-02 CRITICO "reserva com fim antes do inicio" "$S" 201 400

# ----------------------------------------------------------------- BUG-08
# Reserva no passado deve ser recusada com 400.
S=$(req POST /reservations \
  "{\"resource_id\":$RID,\"user_name\":\"auditoria\",\"start_time\":\"2020-01-01 10:00:00\",\"end_time\":\"2020-01-01 11:00:00\"}")
avalia BUG-08 MEDIO "reserva com data no passado" "$S" 201 400

# ----------------------------------------------------------------- BUG-09
# Capacidade zero nao deve virar 1 silenciosamente; negativa nao deve ser aceita.
C0=$(body POST /resources '{"name":"AUDITORIA N2 - capacidade zero","type":"workstation","capacity":0}')
CAP=$(printf '%s' "$C0" | sed -n 's/.*"capacity":\([0-9-]*\).*/\1/p')
if [ "$CAP" = "1" ]; then
  printf '  \033[31mBUG CONFIRMADO\033[0m  %-7s %-8s %s\n' \
    "BUG-09" "[MEDIO]" "capacidade 0 virou 1 silenciosamente"
  confirmados=$((confirmados + 1))
else
  printf '  \033[32mCORRIGIDO\033[0m       %-7s %-8s %s (capacity=%s)\n' \
    "BUG-09" "[MEDIO]" "capacidade 0 nao foi mascarada" "${CAP:-?}"
  corrigidos=$((corrigidos + 1))
fi
S=$(req POST /resources '{"name":"AUDITORIA N2 - capacidade negativa","type":"workstation","capacity":-5}')
avalia BUG-09b MEDIO "capacidade negativa aceita" "$S" 201 400

# ----------------------------------------------------------------- BUG-10
# Tipo fora do dominio deve ser recusado.
S=$(req POST /resources '{"name":"AUDITORIA N2 - tipo invalido","type":"auditorio","capacity":2}')
avalia BUG-10 MEDIO "tipo de espaco fora do dominio" "$S" 201 400

# ----------------------------------------------------------------- BUG-04
# Id nao numerico e erro do cliente: 400, nunca 500.
S=$(req GET /resources/abc)
avalia BUG-04 ALTO "GET com id nao numerico" "$S" 500 400

# ----------------------------------------------------------------- BUG-05
# Atualizacao parcial nao deve estourar em 500.
S=$(req PUT "/resources/$RID" '{"capacity":8}')
if [ "$S" = "500" ]; then
  printf '  \033[31mBUG CONFIRMADO\033[0m  %-7s %-8s %s (HTTP 500)\n' \
    "BUG-05" "[ALTO]" "PUT parcial de espaco"
  confirmados=$((confirmados + 1))
else
  printf '  \033[32mCORRIGIDO\033[0m       %-7s %-8s %s (HTTP %s)\n' \
    "BUG-05" "[ALTO]" "PUT parcial de espaco" "$S"
  corrigidos=$((corrigidos + 1))
fi

# ----------------------------------------------------------------- BUG-03
# Status fora do dominio deve ser recusado com 400.
R1=$(body POST /reservations \
  "{\"resource_id\":$RID,\"user_name\":\"auditoria status\",\"start_time\":\"2030-04-01 10:00:00\",\"end_time\":\"2030-04-01 11:00:00\"}")
R1ID=$(printf '%s' "$R1" | sed -n 's/.*"id":\([0-9]*\).*/\1/p')
if [ -n "$R1ID" ]; then
  S=$(req PATCH "/reservations/$R1ID/status" '{"status":"banana"}')
  avalia BUG-03 ALTO "PATCH com status arbitrario" "$S" 200 400
else
  echo "  INCONCLUSIVO    BUG-03  [ALTO]   nao consegui criar reserva base"
  inconclusivos=$((inconclusivos + 1))
fi

# ----------------------------------------------------------------- BUG-01
# O caso central: N POST concorrentes no mesmo espaco e horario.
# Esperado: exatamente 1 com 201, o resto 409.
echo
echo "  BUG-01 [CRITICO] dupla reserva sob concorrencia - 5 POST simultaneos"
TMPD=$(mktemp -d)
for i in 1 2 3 4 5; do
  (
    curl -s -o /dev/null -w '%{http_code}' -X POST "$API/reservations" \
      -H 'Content-Type: application/json' \
      -d "{\"resource_id\":$RID,\"user_name\":\"concorrente $i\",\"start_time\":\"$INI\",\"end_time\":\"$FIM\"}" \
      > "$TMPD/$i"
  ) &
done
wait
N201=$(grep -l '^201$' "$TMPD"/* 2>/dev/null | wc -l | tr -d ' ')
N409=$(grep -l '^409$' "$TMPD"/* 2>/dev/null | wc -l | tr -d ' ')
echo "    respostas: ${N201}x 201, ${N409}x 409"
if [ "$N201" -gt 1 ]; then
  printf '  \033[31mBUG CONFIRMADO\033[0m  %-7s %-8s %s\n' \
    "BUG-01" "[CRITICO]" "$N201 reservas sobrepostas criadas no mesmo horario"
  confirmados=$((confirmados + 1))
elif [ "$N201" -eq 1 ]; then
  printf '  \033[32mCORRIGIDO\033[0m       %-7s %-8s %s\n' \
    "BUG-01" "[CRITICO]" "exatamente 1 reserva criada, concorrencia barrada"
  corrigidos=$((corrigidos + 1))
else
  printf '  \033[33mINCONCLUSIVO\033[0m    %-7s %-8s %s\n' \
    "BUG-01" "[CRITICO]" "nenhuma reserva criada, verifique o estado do banco"
  inconclusivos=$((inconclusivos + 1))
fi
rm -rf "$TMPD"

# ----------------------------------------------------------------- BUG-06
# Excluir espaco apaga as reservas dele em cascata.
echo
D=$(body POST /resources '{"name":"AUDITORIA N2 - cascata","type":"workstation","capacity":1}')
DID=$(printf '%s' "$D" | sed -n 's/.*"id":\([0-9]*\).*/\1/p')
if [ -n "$DID" ]; then
  req POST /reservations \
    "{\"resource_id\":$DID,\"user_name\":\"cascata\",\"start_time\":\"2030-05-01 10:00:00\",\"end_time\":\"2030-05-01 11:00:00\"}" >/dev/null
  ANTES=$(body GET /reservations | grep -o "\"resource_id\":$DID" | wc -l | tr -d ' ')
  req DELETE "/resources/$DID" >/dev/null
  DEPOIS=$(body GET /reservations | grep -o "\"resource_id\":$DID" | wc -l | tr -d ' ')
  if [ "$ANTES" -gt 0 ] && [ "$DEPOIS" -eq 0 ]; then
    printf '  \033[31mBUG CONFIRMADO\033[0m  %-7s %-8s %s\n' \
      "BUG-06" "[ALTO]" "excluir espaco apagou $ANTES reserva(s) em cascata, sem aviso"
    confirmados=$((confirmados + 1))
  else
    printf '  \033[32mCORRIGIDO\033[0m       %-7s %-8s %s\n' \
      "BUG-06" "[ALTO]" "reservas preservadas ou exclusao recusada"
    corrigidos=$((corrigidos + 1))
  fi
fi

# ----------------------------------------------------------------- BUG-11/12
# /health deveria existir para distinguir "servidor no ar" de "sistema sadio".
HS=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/health")
if [ "$HS" = "404" ]; then
  printf '  \033[31mBUG CONFIRMADO\033[0m  %-7s %-8s %s\n' \
    "BUG-11" "[MEDIO]" "nao existe /health: servidor no ar nao prova banco sadio"
  confirmados=$((confirmados + 1))
else
  printf '  \033[32mCORRIGIDO\033[0m       %-7s %-8s %s (HTTP %s)\n' \
    "BUG-11" "[MEDIO]" "/health responde" "$HS"
  corrigidos=$((corrigidos + 1))
fi

# ------------------------------------------------------------------- resumo
echo
echo "---------------------------------------------"
printf 'Bugs confirmados: %s | corrigidos: %s | inconclusivos: %s\n' \
  "$confirmados" "$corrigidos" "$inconclusivos"
echo "---------------------------------------------"
echo
echo "Os espacos criados por este script tem 'AUDITORIA N2' no nome."
echo "Limpe depois de rodar, ou use um banco descartavel."
echo
echo "Catalogo completo, com os bugs que nao dao para checar por HTTP"
echo "(BUG-07 fuso, BUG-13 duplo clique, BUG-14 setTimeout, BUG-15 endpoint"
echo "orfao): docs/auditoria/bugs-do-cliente.md"

[ "$confirmados" -eq 0 ] && exit 0 || exit 1
