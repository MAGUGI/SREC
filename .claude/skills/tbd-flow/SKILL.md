---
name: tbd-flow
description: Use when starting, committing, reviewing or merging any work in the SREC project — o fluxo Trunk-Based Development do time na N2: nome de branch, Conventional Commits em português no imperativo, tamanho de PR, aprovação obrigatória do QA e o ciclo completo do início ao merge.
---

# Fluxo Trunk-Based Development — SREC N2

Herdado da N1 (Ludens) e mantido. `main` é o único branch longevo do
`igorSeberino/srec`; todo trabalho nasce de uma branch curta e volta para `main`
em poucos dias, via PR pequeno aprovado pelo QA.

Isso vale 1,5 ponto direto da rubrica: "uso correto de branches, Pull Requests
**aprovados pelo QA** e padrões de commit". Não é cerimônia opcional.

## Quem é quem na N2

| Pessoa | GitHub | Papel |
|---|---|---|
| Igor Thiago Seberino | `@igorSeberino` | **Product Owner + QA** — prioriza o backlog e **aprova todos os PRs** |
| Gabriel Carvalho | `@gabrielcarvallho` | DevOps |
| Adrian Cesar Gonçalves | `@adrian-cesar` | Backend |
| Renato Colin Neto | `@RenatoColin` | Frontend |
| Diego Nessler | `@Diegonessler` | Engenheiro de Requisitos |

Os papéis rodaram em relação à N1 de propósito. Quem foi Backend na N1 é PO+QA
agora; quem foi QA é Backend. Ninguém revisa o próprio PR.

## Branches

`main` é o único branch longevo. O repositório recebido trouxe `backend` e
`frontend` como branches longevas — **não usamos**: branch por camada acumula
trabalho de semanas e é o oposto de TBD. E `develop`, que a doc recebida e o
`ci.yml` mencionam, **não existe**.

Nome de branch: `{tipo}/{slug-em-inglês}`. Regras e exemplos em
`references/branch-naming.md`.

```
fix/reservation-overlap
fix/invalid-id-400
refactor/error-middleware
feat/schema-migrations
test/reservation-service
docs/audit-report
```

Tipos: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`, `build`, `ci`.

* Branch viva por **até 2 dias**. Passou disso, o escopo estava grande demais:
  quebre e abra PR do que já está pronto.
* Uma branch, um assunto. `refactor` e `fix` **nunca** na mesma branch — o QA não
  consegue separar "consertou o bug" de "mexeu na estrutura", e o número
  antes/depois fica sem dono.
* Nunca commite direto em `main`.
* Rebase em `main` se a branch envelheceu: `git fetch origin && git rebase origin/main`.

## Conventional Commits

Formato: `{tipo}({escopo}): {descrição}`.

* **Tipo:** `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `build`, `ci`.
* **Escopo** (entre parênteses, obrigatório quando identificável). Escopos desta
  base: `reservations`, `resources`, `db`, `api`, `client`, `ci`, `docs`, `deps`.
* **Descrição:** **português**, **imperativo**, presente, **minúscula**, **sem
  ponto final**, até **72 caracteres**. Descreve o efeito, não o arquivo.

```
fix(reservations): impedir dupla reserva concorrente
fix(reservations): recusar término anterior ao início
fix(api): devolver 400 para id não numérico
refactor(api): centralizar tratamento de erro em middleware
refactor(client): extrair painel de recursos de App.jsx
feat(db): adicionar migrations versionadas
test(reservations): cobrir sobreposição de horário via supertest
docs(auditoria): registrar métricas de baseline do código recebido
chore(deps): remover placeholders versionados
```

Proibido, sem exceção: `update`, `ajustes`, `ajustes diversos`, `wip`,
`correções`, `melhorias`, `fix: fix`, `refatorando`, mensagem em inglês, mensagem
que nomeia o arquivo em vez do efeito (`fix: App.jsx`).

* **Nunca `git add .`** — stage explícito dos arquivos da spec. `git add .`
  arrasta `.env`, artefato de build e arquivo que a spec não pediu.
* Commit pequeno e coeso. Dois assuntos no stage → dois commits.
* Corpo opcional depois de linha em branco, quando o "por quê" não cabe no
  título. Use para citar o bug: `Fecha BUG-01. Antes: 10 try/catch. Depois: 0.`

## Tamanho do PR

* **Alvo: até 300 linhas alteradas**, fora de `package-lock.json` e de arquivo
  gerado.
* Passou de 500 linhas: quebre, ou justifique explicitamente no corpo por que não
  dá (ex.: extração de `App.jsx` que move blocos inteiros).
* Um PR fecha **uma** issue. `Closes #N`, não `Closes #N, #M`.
* PR que toca `server/` **e** `client/` só é aceitável quando a mudança é
  intrinsecamente das duas pontas — o caso real é o BUG-07 (`TIMESTAMPTZ` no
  banco + ISO 8601 com offset no front). Fora disso, dois PRs.

Corpo do PR: `templates/pr-body.md`. Preencha todas as seções; a Definition of
Done é checklist de verdade, não decoração.

## Quem aprova

**Igor (`@igorSeberino`), como QA.** Um PR do SREC na N2 só mergeia com:

1. **1 aprovação do QA** no GitHub.
2. **CI verde** — `.github/workflows/ci.yml`: lint + test no `server/`, lint +
   build no `client/`.
3. **Checklist de DoD** do corpo do PR toda marcada.

Antes de pedir a revisão humana, rode o subagent `qa-reviewer` sobre a branch
(`/revisar-pr <número>`) e endereçe os achados. Chegar no QA humano com
não-conformidade óbvia queima o ciclo de 2 dias.

Ninguém aprova o próprio PR. Ninguém mergeia sem aprovação, nem "porque é
pequeno".

## O ciclo completo

### 1. Antes de começar

Existe issue? Existe `docs/specs/<slug>/implementacao.md`? Se não, pare: o
trabalho da N2 nasce de achado de auditoria → issue → spec. Trabalho sem spec não
tem critério de aceite, e o QA não tem contra o que revisar.

```bash
gh issue list --state open
```

### 2. Branch

```bash
git checkout main
git pull
git checkout -b fix/reservation-overlap
```

O nome vem do campo **Branch** da spec. Não invente um diferente — a spec, a
issue e a branch precisam casar para a rastreabilidade que a rubrica cobra.

### 3. Implementar

Leia a spec inteira primeiro. Carregue a skill de arquitetura pertinente
(`srec-backend-architecture` ou `srec-frontend-architecture`). Teste vermelho
antes da correção, quando a spec pede (skill `srec-testing`).

Atalho: `/implementar <slug>` delega o ciclo ao subagent `maintainer`.

### 4. Verde local

```bash
cd server && npm run lint && npm test
cd client && npm run lint && npm run build
```

Vermelho não vira commit.

### 5. Commits

```bash
git add server/src/services/reservationService.js server/tests/unit/services/reservationService.test.js
git commit -m "fix(reservations): impedir dupla reserva concorrente"
```

### 6. Revisão automática antes do push

```bash
/revisar-pr        # qa-reviewer sobre a branch, antes de existir PR
```

Corrija o que ele apontar. Veredito `BLOQUEAR` não vai para o QA humano.

### 7. PR

```bash
git push -u origin fix/reservation-overlap
gh pr create --base main --title "<título exato da issue>" --body-file <corpo>
```

Título = título da issue. Corpo de `templates/pr-body.md`, com `Closes #N`.
Marque `@igorSeberino` como reviewer.

### 8. Merge

Depois da aprovação do QA e da CI verde, merge em `main`. Então limpe:

```bash
git checkout main
git pull
git branch -d fix/reservation-overlap      # nunca -D; se o git recusar, investigue
```

`git branch -d` recusando significa que a branch tem commit que não está em
`main` — algo se perdeu no caminho. Nunca force.

### 9. Fechar o ciclo

* A issue fecha sozinha pelo `Closes #N`.
* **Atualize o número medido** em `docs/auditoria/` quando o PR tinha métrica.
  Esse par antes/depois é literalmente o conteúdo do pitch — se ninguém atualiza
  na hora, no dia 23/10 não existe.
* Mudou schema, contrato de API ou arquitetura? Atualize `docs/arquitetura/` no
  mesmo PR. Doc divergente do código é o que nós herdamos (12 divergências
  catalogadas) e é exatamente o que a N3 não pode herdar de nós.

## Idioma

* **Português:** issue, história, descrição de commit, corpo de PR,
  documentação, nome de caso de teste, texto visível ao usuário.
* **Inglês:** nome de branch, identificador de código, nome de arquivo, nome de
  pasta de spec, comentário de código.
