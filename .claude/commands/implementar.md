---
description: Implementa uma spec de docs/specs/<slug>/implementacao.md delegando o ciclo TBD completo ao subagent maintainer
argument-hint: "<slug-da-spec> — ex. be-01-prevent-double-booking"
---

# Implementar a spec `$ARGUMENTS`

## 1. Validar o slug antes de qualquer coisa

Confirme que o arquivo existe:

```bash
test -f docs/specs/$ARGUMENTS/implementacao.md && echo OK || ls docs/specs/
```

Se **não existir**, não tente adivinhar nem criar a spec. Liste os slugs
disponíveis e peça o correto. Os 26 slugs do backlog da N2:

```
be-01-prevent-double-booking            be-05-proper-http-status-codes
be-02-validate-reservation-window       be-06-extract-service-layer
be-03-restrict-reservation-status       be-07-timezone-aware-timestamps
be-04-central-error-middleware          be-08-harden-http-surface

fe-01-split-god-component               fe-04-accessibility-and-effect-cleanup
fe-02-api-layer-and-env-config          fe-05-resource-edit-and-cascade-warning
fe-03-form-validation-and-submit-lock

ops-01-docker-compose-environment       ops-04-validated-config
ops-02-versioned-migrations             ops-05-branch-protection-and-templates
ops-03-ci-quality-gates

req-01-reverse-engineer-requirements    req-03-openapi-contract
req-02-business-rules-and-der           req-04-n3-handoff-document

qa-01-api-integration-suite             qa-03-test-plan-and-regression
qa-02-domain-rule-tests                 qa-04-before-after-report
```

Se o usuário passou algo parecido (`be-1`, `be01`, `prevent-double-booking`),
proponha o slug exato e confirme antes de seguir.

## 2. Ler a spec inteira

Leia `docs/specs/$ARGUMENTS/implementacao.md` **por completo**, todas as seções:
Problema, Evidência, Decisão, Alterações, Testes, Critérios de aceite, Passo a
passo TBD, Prompt para o Claude Code.

Não comece pela seção "Alterações". A seção **Decisão** existe para registrar por
que a abordagem óbvia foi rejeitada; implementar a óbvia depois dela é desfazer a
decisão do time.

Então confira três coisas antes de delegar:

* **Depende de** — se a dependência não está mergeada em `main`, **pare** e
  avise. Começar fora de ordem gera conflito de merge garantido (BE-04 reescreve
  os dois controllers; FE-01 move quase todo o `App.jsx`).
* **Realidade do código** — abra os arquivos e as linhas citadas em "Problema" e
  confirme que o código ainda está como a spec descreve. Se alguém já mexeu ou
  outro PR mergeou antes, pare e avise; não adivinhe a intenção.
* **Branch** — o nome vem do campo **Branch** da spec. Não invente outro: issue,
  spec e branch precisam casar para a rastreabilidade que a rubrica cobra.

## 3. Carregar a skill de arquitetura certa

Pelo prefixo do slug:

| Prefixo | Skill obrigatória | Por quê |
|---|---|---|
| `be-*` | `srec-backend-architecture` | camadas de `server/`, `AppError`, transação, migration, enum de domínio |
| `fe-*` | `srec-frontend-architecture` | estrutura por feature, limite de 120 linhas por arquivo, `httpClient` |
| `qa-*` | `srec-testing` | pirâmide adotada, unitário vs integração com Supertest, PostgreSQL nos testes |
| `ops-*` | `srec-backend-architecture` + `srec-testing` | o que o compose e a CI têm que rodar é lint, teste e migration do `server/` |
| `req-*` | `srec-audit` | requisito reconstruído precisa citar código real com arquivo e linha; sem skill de arquitetura, mas leia `docs/arquitetura/` |

Spec que toca as duas pontas (o caso real é `be-07-timezone-aware-timestamps`,
`TIMESTAMPTZ` no banco + ISO 8601 com offset no front): carregue **as duas**
skills de arquitetura.

Em todos os casos, `tbd-flow` também: branch, commit, tamanho de PR e aprovação.

## 4. Delegar ao subagent `maintainer`

Dispare o subagent `maintainer` com um prompt que contenha, explicitamente:

* O caminho da spec: `docs/specs/$ARGUMENTS/implementacao.md`, para ler inteira.
* Qual skill de arquitetura carregar, conforme a tabela acima.
* O nome da branch, copiado do campo **Branch** da spec.
* A ordem do ciclo TBD, que é esta e nesta sequência:

1. `git checkout main && git pull && git checkout -b <branch da spec>`.
2. **Quando a seção "Testes" descreve um caso que falha antes da correção:
   escrever esse teste primeiro, rodar, e colar a saída do vermelho.** Teste que
   passa de primeira contra um bug catalogado significa que o teste não exercita
   o bug ou que o diagnóstico está errado — nos dois casos, parar e investigar,
   nunca "ajustar o teste até passar".
3. Implementar na ordem que a arquitetura alvo impõe. Backend:
   `migrations/` → `domain/` → `models/` → `services/` → `controllers/` →
   `routes/`. Frontend: `services/` → `features/<feature>/hooks/` →
   `features/<feature>/components/` → composição no `App.jsx`.
4. Rodar o teste de novo e ver verde, mais a suíte inteira.
5. Verde local obrigatório antes de qualquer commit:
   `cd server && npm run lint && npm test` e
   `cd client && npm run lint && npm run build`.
6. Commits em **Conventional Commits em português, imperativo, minúsculo, sem
   ponto final, até 72 caracteres**, com escopo (`reservations`, `resources`,
   `db`, `api`, `client`, `ci`, `docs`). Use as mensagens que a spec já traz
   prontas no "Passo a passo TBD". Nunca `git add .` — stage explícito dos
   arquivos da seção "Alterações".
7. Rodar `/revisar-pr` (subagent `qa-reviewer`) sobre a branch e endereçar os
   achados **antes** de abrir o PR.
8. `git push -u origin <branch>` e `gh pr create --base main`, título igual ao da
   issue, corpo a partir de `.claude/skills/tbd-flow/templates/pr-body.md`, com
   `Closes #<n>` e `@igorSeberino` como reviewer.

## 5. Escopo: a regra que não se negocia

Diga ao `maintainer`, com estas palavras:

* **Toque apenas os arquivos listados na seção "Alterações" da spec.** Arquivo
  fora da lista é bloqueio na revisão do QA — é a última linha da Definition of
  Done em `docs/time/overview.md`.
* A base tem **15 bugs e 14 code smells catalogados**. Você vai encontrar outros.
  **Encontrar não é consertar.** Registre no fim como "achado colateral, não
  corrigido aqui", sugira issue nova, e siga.
* Não reformate, não reordene import, não renomeie variável que a spec não pediu:
  infla o diff e esconde a mudança real de quem revisa.
* Não suba versão de dependência nem adicione biblioteca fora da spec. Sem ORM,
  sem TypeScript, sem React Router, sem lib de formulário — são decisões fechadas
  da N2, registradas em `docs/arquitetura/decisoes.md`.
* `refactor` e `fix` não andam na mesma branch nem no mesmo commit: o QA precisa
  separar "consertou o bug" de "mexeu na estrutura", e o número antes/depois
  precisa de dono.
* Spec ambígua num ponto? **Pergunte.** Não preencha a lacuna com invenção — a
  spec é o contrato que o `qa-reviewer` usa para aprovar ou bloquear.

## 6. O que exigir de volta

Não aceite "implementado com sucesso". Exija:

* Lista dos arquivos tocados, confrontada item a item com a seção "Alterações".
* Saída real do teste **vermelho** e do **verde**.
* Saída real de `npm run lint`, `npm test` e `npm run build`.
* O número antes e depois, quando a spec tem métrica (cobertura, linhas do
  arquivo, blocos duplicados) — é o que sustenta os 2,5 pontos de "melhoria
  comprovada" da rubrica.
* Achados colaterais não corrigidos.
* Mensagens de commit usadas e a URL do PR.

Saída de comando inventada é pior que comando não rodado. Se algo não rodou, o
relatório diz "não rodou" e por quê.
