# Nome de branch no SREC

Formato: `{tipo}/{slug-em-inglês}`.

A issue e a spec são em **português**; a branch é **sempre em inglês**. Isso
exige tradução, não transliteração — tirar o acento de uma palavra portuguesa
não produz um slug em inglês.

## Os tipos

| Tipo | Quando usar | Exemplo no SREC |
|---|---|---|
| `fix` | corrige um `BUG-xx` do catálogo | `fix/reservation-overlap` |
| `refactor` | resolve um `CS-xx` sem mudar comportamento | `refactor/error-middleware` |
| `feat` | acrescenta algo que não existia | `feat/schema-migrations` |
| `test` | só adiciona teste, sem tocar código de produção | `test/reservation-service` |
| `docs` | só documentação | `docs/audit-report` |
| `chore` | limpeza, dependência, placeholder | `chore/remove-placeholders` |
| `ci` | pipeline, workflow | `ci/postgres-service` |

Se a branch mistura dois tipos, o escopo está errado. `refactor` e `fix` nunca
compartilham branch: o QA precisa separar "consertou o bug" de "mexeu na
estrutura", e o número antes/depois precisa de dono.

## Como gerar o slug

1. Pegue o título da issue (já em português).
2. Reduza ao núcleo: **2 ou 3 palavras-chave**. Corte artigo, preposição e
   palavra de encheção.
3. Traduza o sentido para inglês técnico.
4. Minúsculas, espaço vira hífen, sem caractere especial, **máximo 24
   caracteres** no slug.
5. Monte `{tipo}/{slug}`.

O slug é rótulo para reconhecer a branch de relance, não resumo da issue — a
rastreabilidade completa vem da issue e da spec referenciadas no PR.

## Exemplos reais, do catálogo da N2

| Achado | Issue (pt-BR) | Branch |
|---|---|---|
| BUG-01 | impedir dupla reserva sob concorrência | `fix/reservation-overlap` |
| BUG-02 | recusar reserva com término anterior ao início | `fix/invalid-time-range` |
| BUG-03 | validar status da reserva contra o enum de domínio | `fix/status-validation` |
| BUG-04 | devolver 400 em vez de 500 para id não numérico | `fix/invalid-id-400` |
| BUG-05 | aceitar corpo parcial no update de recurso | `fix/partial-update` |
| BUG-06 | impedir exclusão silenciosa de reservas ao remover recurso | `fix/delete-restrict` |
| BUG-07 | corrigir deslocamento de fuso horário na reserva | `fix/timezone-offset` |
| BUG-09 | rejeitar capacidade zero ou negativa | `fix/capacity-validation` |
| BUG-11 | derrubar o boot quando a migration falha | `fix/boot-on-db-error` |
| BUG-12 | tratar erro de client idle do pool do pg | `fix/pool-error-handler` |
| BUG-13 | desabilitar o submit durante o envio da reserva | `fix/double-submit` |
| BUG-14 | limpar o timer do feedback na desmontagem | `fix/feedback-timer` |
| CS-01 | extrair o painel de recursos de App.jsx | `refactor/resources-panel` |
| CS-01 | extrair o painel de agendamentos de App.jsx | `refactor/reservations-panel` |
| CS-02 | centralizar tratamento de erro em middleware | `refactor/error-middleware` |
| CS-03 | introduzir camada de serviço no backend | `refactor/service-layer` |
| CS-05 | mover os enums de domínio para módulo próprio | `refactor/domain-enums` |
| CS-06 | substituir initDb por migrations versionadas | `feat/schema-migrations` |
| CS-07 | ler a URL da API de variável de ambiente | `refactor/api-base-url` |
| CS-09 | criar índices de resource_id e start_time | `feat/db-indexes` |
| CS-10 | endurecer as regras do ESLint | `ci/lint-rules` |
| — | separar app.js de index.js para habilitar supertest | `refactor/extract-app` |
| — | adicionar serviço de PostgreSQL ao workflow de CI | `ci/postgres-service` |

## Erros comuns

| Errado | Por quê | Certo |
|---|---|---|
| `fix/corrigir-reserva-dupla` | português | `fix/reservation-overlap` |
| `fix/bug-01` | o ID não diz nada de relance | `fix/reservation-overlap` |
| `feature/reservation-overlap` | o prefixo é `feat`, não `feature` | `fix/reservation-overlap` |
| `fix/fix-the-overlap-bug-in-reservation-controller` | longo e redundante | `fix/reservation-overlap` |
| `backend` / `frontend` | branch por camada, veio no repo recebido, não usamos | uma branch por issue |
| `develop` | não existe neste repositório | `main` é o único longevo |
| `igor/minhas-alterações` | branch por pessoa, não por assunto | `{tipo}/{slug}` |
