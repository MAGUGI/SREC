---
description: Roda a bateria de medição do SREC e imprime a tabela comparativa contra o baseline da auditoria
argument-hint: "(sem argumento) — opcionalmente backend, frontend ou schema para medir só uma parte"
---

# Medir o SREC e comparar com o baseline

A rubrica da N2 paga 2,5 pontos por "melhoria comprovada do código recebido".
Comprovada significa **um número antes e um número depois, obtidos pelo mesmo
comando**. Este comando produz o lado "depois".

Rode da **raiz do repositório**. Instale as dependências uma vez por clone:
`cd server && npm ci` e `cd client && npm ci --legacy-peer-deps` (a flag é
obrigatória — React 19 + Vite 8).

Se `$ARGUMENTS` vier vazio, rode a bateria inteira. Se vier `backend`,
`frontend` ou `schema`, rode só a seção correspondente (1, 2 ou 3) e diga na
tabela que as outras métricas ficaram **não medidas** nesta execução — tabela
parcial apresentada como completa é pior que tabela parcial declarada.

## A armadilha da cobertura — leia antes de rodar qualquer coisa

`npx jest --coverage` **sem** `--collectCoverageFrom` reporta **35,48 %** neste
projeto. Esse número é falso para a pergunta que interessa: o Jest só conta os
arquivos que algum teste importou, e aqui são dois (`reservationModel.js` e
`database.js`). Os controllers, as rotas, o `resourceModel.js` e o `index.js`
**desaparecem do relatório** em vez de aparecer com zero.

Medindo contra todo o fonte, que é a pergunta real, o resultado é **6,14 %**.

Por isso, toda medição de cobertura deste projeto — agora, no meio e no fim da N2
— usa `--collectCoverageFrom='src/**/*.js'`. **Comparar números medidos de
formas diferentes é o mesmo que não medir**, e um 35,48 % citado no pitch como se
fosse a cobertura do projeto é um erro factual que derruba a credibilidade da
auditoria inteira.

Se alguém aparecer com um número de cobertura, a primeira pergunta é qual comando
gerou. Sem o comando, o número não entra na tabela.

## 1. Backend — cobertura e volume de teste

```bash
cd server && npx jest --coverage --coverageReporters=text --collectCoverageFrom='src/**/*.js'
cd server && npx jest --listTests
cd server && npm test
cd server && npm run lint
```

Registre, da tabela de cobertura: a linha `All files` (`% Stmts`, `% Branch`,
`% Funcs`) e, separadamente, as linhas de `src/controllers` e `src/routes` — são
as que estavam em 0 % e as que mais mudam nesta entrega. De `npx jest
--listTests`, o número de arquivos; de `npm test`, a linha `Tests: N passed`.

## 2. Frontend — lint, build e tamanho de arquivo

```bash
cd client && npm run lint && npm run build
wc -l client/src/App.jsx
find client/src -type f -name '*.jsx' | xargs wc -l | sort -n
```

Do build, registre o tamanho do bundle e do gzip. **"0 erros de lint" não é
elogio**: é o CS-10 — a config recebida não tem regra de complexidade, de tamanho
de arquivo, de segurança nem de acessibilidade. Conte também as regras de
qualidade ativas (M-11), não só os erros.

## 3. Duplicação, schema e acessibilidade

```bash
grep -c 'catch (err)' server/src/controllers/*.js
grep -ciE 'check|unique|exclude' server/src/config/initDb.js
grep -ci 'index' server/src/config/initDb.js
grep -c '<label>' client/src/App.jsx
grep -c 'eslint-disable' client/src/App.jsx
find server/src client/src -type f \( -name '*.js' -o -name '*.jsx' \) | xargs wc -l | sort -n
```

Não existe ferramenta de clone detection instalada e a N2 não vai instalar uma: a
duplicação desta base é estrutural e se mede com `grep`. Nunca inclua
`package-lock.json`, `node_modules/` ou CSS na contagem de JS/JSX — infla o
número e destrói a comparação.

Se as migrations de OPS-02 já estiverem mergeadas, `initDb.js` deixa de ser a
fonte do schema: meça as constraints e os índices em `server/migrations/*.sql`
e diga explicitamente que a fonte mudou.

## 4. A tabela comparativa

Imprima exatamente neste formato, uma linha por métrica medida, usando os IDs de
`docs/auditoria/metricas-baseline.md`:

| ID | Métrica | Baseline (recebido) | Meta da N2 | Medido agora | Δ | Comando |
|---|---|---|---|---|---|---|
| M-01 | Cobertura de statements, backend | 6,14 % | ≥ 70 % | | | `npx jest --coverage --collectCoverageFrom='src/**/*.js'` |
| M-02 | Cobertura de branches, backend | 0 % | ≥ 60 % | | | idem |
| M-03 | Cobertura de funções, backend | 3,57 % | ≥ 75 % | | | idem |
| M-04 | Arquivos de teste | 1 | ≥ 8 | | | `npx jest --listTests` |
| M-05 | Casos de teste | 2 | ≥ 60 | | | `npm test` |
| M-06 | Cobertura dos controllers | 0 % | ≥ 80 % | | | cobertura, linha `src/controllers` |
| M-07 | Cobertura das rotas | 0 % | 100 % | | | cobertura, linha `src/routes` |
| M-09 | Erros de ESLint, server | 0 | 0 | | | `cd server && npm run lint` |
| M-10 | Erros de ESLint, client | 0 | 0 | | | `cd client && npm run lint` |
| M-11 | Regras de qualidade no ESLint | 0 | ≥ 6 | | | leitura de `eslint.config.js` |
| M-17 | Blocos `try/catch` duplicados | 10 | 0 | | | `grep -c 'catch (err)' server/src/controllers/*.js` |
| M-18 | Maior arquivo `.jsx`, em linhas | 351 | ≤ 120 | | | `find client/src -name '*.jsx' \| xargs wc -l \| sort -n` |
| M-19 | Linhas de `App.jsx` | 351 | ≤ 60 | | | `wc -l client/src/App.jsx` |
| M-20 | Constraints de integridade no schema | 0 | ≥ 4 | | | `grep -ciE 'check\|unique\|exclude'` no schema vigente |
| M-21 | Índices além das PKs | 0 | ≥ 2 | | | `grep -ci 'index'` no schema vigente |
| M-23 | Passos manuais para subir o sistema | 7 | 1 | | | `docker compose up` existe? |
| M-26 | `<label>` sem `htmlFor` | 7 | 0 | | | `grep -c '<label>' client/src/App.jsx` |
| M-27 | Supressões `eslint-disable` | 2 | 0 | | | `grep -c 'eslint-disable' client/src/App.jsx` |
| M-29 | Testes de frontend | 0 | ≥ 1 | | | não há runner configurado em `client/` |

Regras de preenchimento, sem exceção:

* **Só preencha "Medido agora" com saída real de comando desta execução.** O que
  não rodou fica como **"não medido"**, com o comando que mediria ao lado.
  Estimativa apresentada como medição é invenção.
* Cole a saída crua da tabela do Jest junto, não só os números extraídos — é o
  que permite a qualquer pessoa do time reconferir.
* Δ é a diferença contra o **baseline do código recebido**, não contra a última
  medição. Se `main` já tem PRs mergeados, diga qual é o commit medido
  (`git rev-parse --short HEAD`): o baseline é o commit `8431181` e continua
  sendo o ponto de partida, mas "atual" mudou — confundir os dois é erro de
  auditoria.
* Marque cada meta como **atingida**, **parcial** ou **não atingida**. Meta
  parcial não é fracasso: é o que entra no handoff da N3 com justificativa.
* Se um número **piorou**, diga isso na primeira linha do relatório. Cobertura
  que caiu é bloqueio de PR de `refactor/`, e descobrir no pitch é pior.

## 5. Onde o número vai parar

Este comando **mede e imprime**; não edita documentação. A coluna "Fim da N2" de
`docs/auditoria/metricas-baseline.md` é preenchida pela spec
`qa-04-before-after-report`, em PR próprio, pelo Igor (PO/QA) — é o material
central do pitch de 23/10.

Quando a medição é parte de um PR, o par antes/depois vai para a seção "Número
antes e depois" do corpo do PR
(`.claude/skills/tbd-flow/templates/pr-body.md`), com o comando ao lado.
Atualizar `docs/auditoria/` na hora do merge é o passo 9 do ciclo da skill
`tbd-flow`: se ninguém atualiza quando o PR fecha, no dia do pitch o número não
existe.
