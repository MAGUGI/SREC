# Relatório antes/depois — SREC, entrega N2

Comparação numérica entre o sistema recebido do grupo MAGUGI (commit `8431181`)
e o sistema que entregamos ao grupo da N3.

**Regra deste documento: nenhuma afirmação sem número dos dois lados.**
"Melhoramos a qualidade" não entra. "A cobertura de statements saiu de 6,14 %
para 89,95 %, e 51 casos de integração reprovavam contra o código recebido"
entra.

Onde mediu:

* **Antes:** commit `8431181` (`upstream/main`, código recebido). Os números
  são os de [`metricas-baseline.md`](metricas-baseline.md), revalidados pelo
  Caso 2 da spec: [`evidencias/qa-04-antes-caso2.txt`](evidencias/qa-04-antes-caso2.txt)
  e [`evidencias/qa-04-medicoes-antes.txt`](evidencias/qa-04-medicoes-antes.txt).
* **Depois:** `origin/main` em `9662616` (merge do #59), 23/10/2026. A
  cobertura (C-01) foi medida em `d5d56ef`; `git diff --stat d5d56ef 9662616 --
  server client` é vazio, então o número vale para `9662616`.
* Ambiente: Windows 11, Node.js 24.22.0, npm 11.19.1, `npm ci` limpo nos dois
  pacotes. Banco de integração: Postgres 16 descartável de
  `server/docker-compose.test.yml` (porta 5433).

Célula marcada **a medir após #NN** é número que ainda não existe: não foi
estimado.

* Baseline congelado: [`metricas-baseline.md`](metricas-baseline.md)
* Catálogo de defeitos: [`bugs-do-cliente.md`](bugs-do-cliente.md)
* Catálogo de smells: [`code-smells.md`](code-smells.md)
* Divergências: [`divergencias-doc-codigo.md`](divergencias-doc-codigo.md)
* Saída bruta de cada medição: [`evidencias/`](evidencias/README.md)

## 1. Armadilha de medição — leia antes de medir qualquer coisa

Rodar `npx jest --coverage` **sem** `--collectCoverageFrom` reporta **35,48 %**
no código recebido, porque o Jest só conta os arquivos que algum teste importou.
Medindo contra todo o fonte, o resultado é **6,14 %**. Reproduzido no
`8431181` ([`qa-04-armadilha-antes.txt`](evidencias/qa-04-armadilha-antes.txt)):

```
$ npx jest --coverage --coverageReporters=text | grep "All files"
All files             |   35.48 |      100 |   11.11 |   35.48 |
$ npx jest --coverage --coverageReporters=text --collectCoverageFrom='src/**/*.js' | grep "All files"
All files                  |    6.14 |        0 |    3.57 |    6.14 |
```

**Toda medição de cobertura deste documento usa
`--collectCoverageFrom='src/**/*.js'`.**

No `main` a armadilha mudou de forma, e há **duas** novas, as três medidas em
[`qa-04-cobertura-main.txt`](evidencias/qa-04-cobertura-main.txt):

| Comando no `main` | Stmts | Branch | Funcs | Por que difere |
|---|---|---|---|---|
| `--collectCoverageFrom='src/**/*.js'` (literal) | 49,81 | 87,08 | 36,36 | os testes unitários agora moram em `src/**/*.test.js`, e com `projects` no `jest.config.js` o Jest os põe no denominador com 0 % |
| idem + `--collectCoverageFrom='!src/**/*.test.js'` | **89,95** | **87,92** | **84,70** | mesmo denominador do baseline: todo o fonte de `src/`, `index.js` incluído, teste fora |
| sem `--collectCoverageFrom` (vale o do `jest.config.js`) | 96,09 | 91,45 | 92,30 | o `jest.config.js` tira também `src/index.js` do denominador |

O número comparável com os 6,14 % é o da segunda linha, e é ele que entra nas
tabelas. A primeira subestima, a terceira superestima.

Terceira armadilha: `npx jest` puro roda os arquivos de integração **em
paralelo** contra o mesmo banco, e eles se truncam mutuamente. Em
[`qa-04-medicoes-main.txt`](evidencias/qa-04-medicoes-main.txt) a mesma suíte
deu `17 failed, 220 passed`; com `--runInBand` deu `237 passed, 1 todo`.
**Medir sempre com `--runInBand`** (é o que `npm run test:all`,
`test:coverage` e `test:ci` já fazem).

## 2. Comandos de medição

Ambiente: `npm ci` limpo nos dois pacotes; para C-01 e C-02, banco de teste de
pé (`cd server && npm run db:test:up`). Os comandos abaixo rodam copiados e
colados no `main`. Onde o comando da spec não rodava, a correção está anotada.

### C-01 — Cobertura do backend · M-01, M-02, M-03, M-06, M-07

```bash
cd server && npm ci && npm run db:test:up
npx jest --runInBand --coverage --coverageReporters=text \
  --collectCoverageFrom='src/**/*.js' --collectCoverageFrom='!src/**/*.test.js'
```

Correção: `--runInBand` e a exclusão dos `*.test.js` (seção 1).

### C-02 — Arquivos e casos de teste · M-04, M-05

```bash
cd server
npx jest --listTests | wc -l
npx jest --runInBand 2>&1 | grep -E '^(Test Suites|Tests):'
```

### C-03 — Endpoints exercitados por teste · M-08

```bash
grep -rhoE "\.(get|post|put|patch|delete)\('/api/[^']*'" server/tests/integration \
  | sed -E "s/\('/ /; s/'$//" | sort -u
```

Correção: a pasta é `server/tests/integration`, não `server/test/integration`.
Rotas com `:id` contam como um endpoint só.

### C-04 — ESLint · M-09, M-10

```bash
cd server  && npm run lint; echo "exit=$?"
cd ../client && npm run lint; echo "exit=$?"
cd ../server && npm run lint:strict 2>&1 | tail -3
cd ../client && npm run lint:strict 2>&1 | tail -3
```

### C-05 — Regras de qualidade declaradas no ESLint · M-11

```bash
grep -cE 'complexity|max-lines|max-depth|max-params|security|jsx-a11y|eqeqeq' \
  server/eslint.config.js client/eslint.config.js
```

O `grep -c` conta linhas, não regras. A métrica M-11 conta **famílias de regra**
presentes, conferidas no arquivo.

### C-06 — Bugs abertos por severidade · M-12, M-13, M-14, M-15

```bash
for s in critico alto medio baixo; do
  n=$(gh issue list --repo igorSeberino/srec --state open \
        --label 'bug do cliente' --label "sev: $s" --json number --jq 'length')
  echo "sev: $s = $n"
done
```

O número de issues abertas é indicador; **a prova é a seção 5**, bug a bug.

### C-07 — Code smells abertos por severidade · M-16 e seção 6

```bash
for s in alto medio baixo; do
  n=$(gh issue list --repo igorSeberino/srec --state open \
        --label 'code smell' --label "sev: $s" --json number --jq 'length')
  echo "sev: $s = $n"
done
```

### C-08 — Blocos `try/catch` duplicados · M-17

```bash
grep -c 'catch (err)' server/src/controllers/*.js
grep -rc 'catch (err)' server/src | awk -F: '{s += $2} END {print s}'
```

No `8431181` o segundo comando dá **11**, não 10: conta também o `catch` de
`initDb.js`. M-17 é a soma dos controllers (5 + 5).

### C-09 — Maior arquivo `.jsx` e tamanho de `App.jsx` · M-18, M-19

```bash
find client/src -name '*.jsx' ! -name '*.test.jsx' -exec wc -l {} + | sort -n | tail -6
wc -l client/src/App.jsx
```

Correção: `! -name '*.test.jsx'`, senão o maior `.jsx` vira um arquivo de teste.

### C-10 — Constraints e índices · M-20, M-21

O baseline foi medido por `grep` em `src/config/initDb.js`. Depois de OPS-02 o
schema vem das migrations, então a medição passa a ser **no banco**, migrado do
zero com `node scripts/migrate.js`.

```bash
psql "$DATABASE_URL" -c "
  SELECT c.contype, count(*)
  FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
  WHERE t.relname IN ('resources','reservations') AND c.contype NOT IN ('p','f')
  GROUP BY c.contype ORDER BY c.contype;"
# c = CHECK · u = UNIQUE · x = EXCLUDE

psql "$DATABASE_URL" -c "
  SELECT tablename, indexname FROM pg_indexes
  WHERE tablename IN ('resources','reservations') AND indexname NOT LIKE '%_pkey'
  ORDER BY 1, 2;"
```

### C-11 — Migrations versionadas · M-22

```bash
ls server/migrations/*.sql | grep -v _rollback | wc -l
psql "$DATABASE_URL" -c "SELECT filename FROM schema_migrations ORDER BY filename;"
```

Correção: as migrations são `.sql`, não `.js`, e não existe
`npm run migrate:status`; o estado vive na tabela `schema_migrations`.

### C-12 — Passos manuais para subir o sistema · M-23

Contagem à mão dos comandos da seção "Como Executar o Projeto" do `README.md`
e do [diário de onboarding](diario-onboarding.md).

```bash
sed -n '/[Cc]omo [Ee]xecutar/,/^### Opção B/p' README.md
```

Correção: a seção se chama "Como Executar o Projeto", não "Como subir".

### C-13 — Endpoints documentados vs implementados · M-24

```bash
grep -cE '^\s{4}(get|post|put|patch|delete):' docs/arquitetura/contrato-api.yaml
grep -rhoE 'router\.(get|post|put|patch|delete)\(' server/src/routes | wc -l
```

O primeiro falha com `No such file or directory` até REQ-03 (#23). O segundo dá
**11** no `main`: os 10 de negócio mais `GET /health`.

### C-14 — Divergências doc vs código · M-25

```bash
grep -cE '^\| D-[0-9]+ ' docs/auditoria/divergencias-doc-codigo.md   # => 12
```

O numerador vem da seção 9, item por item.

### C-15 — `<label>` sem `htmlFor` · M-26

```bash
grep -rhoE '<label[^>]*>' client/src --include='*.jsx' | grep -vc 'htmlFor'
```

### C-16 — Supressões de lint · M-27

```bash
grep -rc 'eslint-disable' client/src server/src | awk -F: '{s += $2} END {print s}'
```

### C-17 — Arquivos placeholder de 0 byte · M-28

```bash
find . -path '*/node_modules' -prune -o -path ./.git -prune -o -type f -size 0 -print
```

Correção: `-path '*/node_modules'` em vez de `./node_modules`, que não poda
`server/node_modules` nem `client/node_modules`.

### C-18 — Testes de frontend · M-29

```bash
cd client && npm test 2>&1 | tail -5
```

### C-19 — Tamanho do bundle do client

```bash
cd client && npm run build
```

### C-20 — Volume de código

```bash
find server/src client/src -type f \( -name '*.js' -o -name '*.jsx' -o -name '*.css' \) \
  -exec wc -l {} + | tail -1
find server/src client/src -type f \( -name '*.js' -o -name '*.jsx' \) \
  -exec wc -l {} + | tail -1
# sem os testes co-localizados
find server/src client/src -type f \( -name '*.js' -o -name '*.jsx' -o -name '*.css' \) \
  ! -name '*.test.*' ! -name 'setupTests.js' -exec wc -l {} + | tail -1
```

### C-21 — Processo e Git

```bash
gh issue list --repo igorSeberino/srec --state all --limit 500 --json number --jq 'length'
gh pr   list --repo igorSeberino/srec --state all --limit 500 --json number --jq 'length'
git rev-list --count origin/main
ls .github/ISSUE_TEMPLATE/*.yml | wc -l
test -f .github/CODEOWNERS && grep -c '^[^#]' .github/CODEOWNERS
gh api /repos/igorSeberino/srec/branches/main/protection \
  --jq '{checks: (.required_status_checks.contexts // [] | length),
         aprovacoes: .required_pull_request_reviews.required_approving_review_count,
         code_owners: .required_pull_request_reviews.require_code_owner_reviews}'
awk '/^jobs:/{f=1;next} f && /^  [a-zA-Z_-]+:$/' .github/workflows/ci.yml | wc -l
```

Correções: `--limit 500` (o padrão do `gh` é 30 e já trunca as issues) e
`// []` (sem checks obrigatórios a API devolve `null`). Para contar jobs, o
`grep -cE '^  [a-z-]+:$'` da spec também casa `push:` do bloco `on:`; o `awk`
conta só o bloco `jobs:`.

Saída: [`qa-04-processo-git.txt`](evidencias/qa-04-processo-git.txt).

## 3. As 29 métricas

| # | Métrica | Antes (medido) | Meta N2 | Depois (`main`) | Δ | Comando |
|---|---|---|---|---|---|---|
| M-01 | Cobertura de statements, backend | **6,14 %** | ≥ 70 % | **89,95 %** | +83,81 pp | C-01 |
| M-02 | Cobertura de branches, backend | **0 %** | ≥ 60 % | **87,92 %** | +87,92 pp | C-01 |
| M-03 | Cobertura de funções, backend | **3,57 %** | ≥ 75 % | **84,70 %** | +81,13 pp | C-01 |
| M-04 | Arquivos de teste | **1** | ≥ 8 | **21** no server (+ 14 no client) | +20 | C-02 |
| M-05 | Casos de teste | **2** | ≥ 60 | **238** no server (237 passam, 1 `todo`) | +236 | C-02 |
| M-06 | Cobertura dos controllers | **0 %** | ≥ 80 % | **100 %** | +100 pp | C-01 |
| M-07 | Cobertura das rotas | **0 %** | 100 % | **100 %** de statements (branch 50 % em `healthRoutes.js`) | +100 pp | C-01 |
| M-08 | Endpoints exercitados por teste | **0 de 10** | 10 de 10 | **10 de 10** | +10 | C-03 |
| M-09 | Erros de ESLint, server | **0** | 0 | **0** (13 avisos das regras novas) | 0 | C-04 |
| M-10 | Erros de ESLint, client | **0** | 0 | **0** (6 avisos das regras novas) | 0 | C-04 |
| M-11 | Regras de qualidade no ESLint | **0** | ≥ 6 | **8** famílias: `complexity`, `max-lines`, `max-lines-per-function`, `max-depth`, `max-params`, `eqeqeq`, plugin `security`, `jsx-a11y` — como `warn` | +8 | C-05 |
| M-12 | Bugs CRÍTICO abertos | **2** | 0 | **0** | −2 | seção 5 |
| M-13 | Bugs ALTO abertos | **5** | 0 | **1** (BUG-06, decisão de produto) | −4 | seção 5 |
| M-14 | Bugs MÉDIO abertos | **5** | ≤ 1 | **2** (BUG-09, BUG-10 — PR #61 aberto) | −3 | seção 5 |
| M-15 | Bugs BAIXO abertos | **3** | ≤ 1 | **0** (com a ressalva da seção 5.3) | −3 | seção 5 |
| M-16 | Code smells ALTO abertos | **4** | 0 | **0** | −4 | seção 6 |
| M-17 | Blocos `try/catch` duplicados | **10** | 0 | **0** nos controllers | −10 | C-08 |
| M-18 | Maior arquivo `.jsx`, em linhas | **351** | ≤ 120 | **112** (`ReservationForm.jsx`) | −239 | C-09 |
| M-19 | Linhas de `App.jsx` | **351** | ≤ 60 | **56** | −295 | C-09 |
| M-20 | Constraints de integridade no schema | **0** | ≥ 4 | **3** (2 `CHECK` + 1 `EXCLUDE`) | +3 | C-10 |
| M-21 | Índices além das PKs | **0** | ≥ 2 | **1** (GiST de `reservations_no_overlap`) | +1 | C-10 |
| M-22 | Migrations versionadas | **0** | ≥ 5 | **5** (+ 1 rollback) | +5 | C-11 |
| M-23 | Passos manuais para subir o sistema | **7** | 1 | **1** (`docker compose up`) | −6 | C-12 |
| M-24 | Endpoints documentados vs implementados | **5 de 10** | 10 de 10 | a medir após #23 (REQ-03) | | C-13 |
| M-25 | Divergências doc vs código | **12** | 0 | **5** abertas | −7 | C-14 e seção 9 |
| M-26 | `<label>` sem `htmlFor` | **7** | 0 | **0** | −7 | C-15 |
| M-27 | Supressões `eslint-disable` | **2** | 0 | **0** | −2 | C-16 |
| M-28 | Arquivos placeholder de 0 byte | **3** | 0 | **3** (`client.txt`, `server.txt`, `shared.txt`; os 2 `.gitkeep` são intencionais) | 0 | C-17 |
| M-29 | Testes de frontend | **0** | ≥ 1 | **79** casos em 14 arquivos | +79 | C-18 |

A coluna **Δ** usa pontos percentuais (`pp`) para percentual e valor absoluto
para contagem. As 6 métricas abaixo da meta estão na seção 10.

## 4. Volume de código e bundle

Não são métricas M: não há meta, e tamanho não é qualidade. Entram porque o
pitch fala de `App.jsx`.

| Escopo | Antes | Depois (`main`) | Comando |
|---|---|---|---|
| Fonte total (js, jsx, css), testes incluídos | **1.280** linhas | **4.042** | C-20 |
| Fonte total sem testes | 1.242 | **2.414** | C-20 |
| JS e JSX, testes incluídos | **853** linhas | **3.701** | C-20 |
| JS e JSX sem testes | 815 | **2.073** | C-20 |
| `client/src/App.jsx` | **351** linhas (**41 %** do JS/JSX) | **56** (2,7 % do JS/JSX sem testes) | C-09 |
| CSS do client | 427 linhas (`index.css` + `App.css`) | **341** (só `index.css`) | C-20 |
| `server/src/` sem testes | 370 linhas | **666** | C-20 |
| Linhas de teste (server + client) | **38** | **2.276** | C-20 |
| Bundle do client | **201,86 kB** (63,26 kB gzip) | **214,45 kB** (67,80 kB gzip) | C-19 |

O "antes" de `server/src/` é o do baseline (370). O mesmo `find` no `8431181`
dá **372** sem o arquivo de teste: diferença de 2 linhas, registrada aqui em vez
de corrigida no baseline congelado.

Dado para o pitch: o backend **inteiro** recebido tinha 370 linhas — menos que o
`App.jsx` sozinho.

## 5. Placar de bugs do cliente

Baseline: **15** bugs — **2 CRÍTICO**, **5 ALTO**, **5 MÉDIO**, **3 BAIXO**.

### 5.1 Por severidade

| Severidade | Abertos antes | Meta N2 | Corrigidos | Abertos depois | Δ |
|---|---|---|---|---|---|
| CRÍTICO | **2** | 0 | **2** | **0** | −2 |
| ALTO | **5** | 0 | **4** | **1** | −4 |
| MÉDIO | **5** | ≤ 1 | **3** | **2** | −3 |
| BAIXO | **3** | ≤ 1 | **3** | **0** | −3 |
| **Total** | **15** | ≤ 2 | **12** | **3** | −12 |

C-06 (issues abertas por label) no mesmo momento: `critico = 0`, `alto = 0`,
`medio = 1` (#47), `baixo = 0`. A issue de BUG-06 (#15) está fechada porque
FE-05 entregou o aviso; o bug, pela definição abaixo, não.

### 5.2 Definição de "corrigido"

Um bug entra como corrigido quando existe um caso de teste identificado por ID
que **reprovava** contra o código recebido e **passa** depois da correção, com as
duas saídas registradas.

Fonte das duas saídas da suíte de integração: [`qa-01-antes.txt`](evidencias/qa-01-antes.txt)
(a mesma suíte contra o código recebido: **51 casos reprovam, 28 passam**) e
[`qa-01-depois.txt`](evidencias/qa-01-depois.txt). No `main`, com C-01:
**237 passam, 1 `todo`, 0 reprovam**.

BUG-11, BUG-12 e BUG-13 não têm teste de integração. Para BUG-11 e BUG-12 este
relatório reproduziu os passos C-12 e C-13 do
[roteiro de regressão](../qa/roteiro-regressao.md) por script, antes e depois,
com um Postgres descartável próprio:
[`qa-04-bug-11-12.txt`](evidencias/qa-04-bug-11-12.txt). A execução manual do
roteiro (`docs/qa/execucoes/`) ainda não tem registro.

### 5.3 Bug por bug

| ID | Sev. | Título | Spec | Prova (caso de teste) | Reprovava antes? | Passa depois? | PR |
|---|---|---|---|---|---|---|---|
| BUG-01 | CRÍTICO | Dupla reserva sob concorrência | BE-01 | QA-01 **V-12** (20 requisições simultâneas), **V-31** | sim — **15×201** de 20 | sim — 1×201 e 19×409 | #41 |
| BUG-02 | CRÍTICO | Reserva com fim antes do início | BE-02 | QA-01 **V-03**, **V-04**, **V-32**; QA-02 **O-15** | sim — 201 | sim — 400 | #41 |
| BUG-03 | ALTO | Status arbitrário aceito | BE-03 | QA-01 **V-21**, **V-22**, **V-22b**, **V-23**, **V-33** | sim — 200 com `banana` | sim — 400 / 409 | #41 |
| BUG-04 | ALTO | ID não numérico retorna 500 | BE-05 | QA-01 **R-12**, **R-17**, **R-20**, **V-14**, **V-18**, **V-25**, **V-28** | sim — 500 nas 7 | sim — 400 | #41 |
| BUG-05 | ALTO | Atualização parcial retorna 500 | BE-05 | QA-01 **R-14** (3 variações), **R-15** | sim — 500 | sim — 200 / 400 | #41 |
| BUG-06 | ALTO | Exclusão apaga reservas em silêncio | BE-08 / FE-05 | QA-01 **R-21** (`it.todo`), **R-22** | R-22 documenta a cascata | **não corrigido**: o client avisa quantas reservas serão apagadas (FE-05), o backend continua apagando em cascata | #44 (mitigação) |
| BUG-07 | ALTO | Horário desloca por falta de fuso | BE-07 | QA-01 **V-29**, **V-30**; colunas `timestamptz` (C-10) | sim — V-29 201 | sim — 400 `INVALID_DATETIME` | #41, #42 |
| BUG-08 | MÉDIO | Reserva no passado é aceita | BE-02 | QA-01 **V-05** | sim — 201 | sim — 400 | #41 |
| BUG-09 | MÉDIO | Capacidade inválida é aceita | BE-02 | QA-01 **R-06**, **R-07** (`test.failing`) | sim | **não** — `test.failing` passa porque o bug existe | a medir após #61 |
| BUG-10 | MÉDIO | `type` aceita qualquer string | BE-03 | QA-01 **R-05** (`test.failing`) | sim | **não** | a medir após #61 |
| BUG-11 | MÉDIO | Servidor sobe com o banco quebrado | BE-08 / OPS-04 | roteiro **C-12** por script; QA-01 **A-05** | sim — sobe, `/health` 404, API 500 | sim — sobe e `/health` responde **503** | #41, #55 |
| BUG-12 | MÉDIO | Queda do Postgres mata o processo | BE-08 | roteiro **C-13** por script | sim — processo **morre** | sim — processo vivo 30 s depois, API 500 e `/health` 503 | #41 |
| BUG-13 | BAIXO | Duplo clique cria duas reservas | FE-03 | teste de componente "dispara apenas um POST com duplo clique"; roteiro **C-01** | não registrado (o client recebido não tinha testes) | sim | #43 |
| BUG-14 | BAIXO | `setTimeout` do feedback nunca é limpo | FE-04 | `useFeedback.test.js` (4 casos); roteiro **A-10**, **C-14** | não registrado | sim | #36 |
| BUG-15 | BAIXO | Endpoint de edição é órfão | FE-05 | `ResourcesPanel.test.jsx` "tem um botão de editar por espaço"; QA-01 **R-13**; roteiro **A-15**, **C-15** | não registrado | sim | #44 |

Os três BAIXO entram como corrigidos com ressalva: o teste existe e passa, mas a
reprovação contra o código recebido não foi registrada, porque o client
recebido não tinha infraestrutura de teste. A prova complementar é o roteiro
manual (C-01, C-14, C-15), ainda sem execução registrada.

**Contagem para o pitch:** **51** casos da suíte de integração reprovavam
contra o código recebido e **0** reprovam no `main`.

## 6. Placar de code smells

Baseline: **14** smells — **4 ALTO**, **6 MÉDIO**, **4 BAIXO**.

| Severidade | Abertos antes | Meta N2 | Resolvidos | Abertos depois |
|---|---|---|---|---|
| ALTO | **4** | 0 | **4** | **0** |
| MÉDIO | **6** | — | **5** | **1** (CS-08) |
| BAIXO | **4** | — | **3** | **1** (CS-11) |
| **Total** | **14** | — | **12** | **2** |

C-07 dá `medio = 2` (#17, #18), mas os PRs dessas issues (#54, #56) já estão no
`main`; é a issue que ficou aberta, não o smell.

| ID | Sev. | Smell | Spec | Métrica que prova | Antes | Depois | Comando |
|---|---|---|---|---|---|---|---|
| CS-01 | ALTO | God Component | FE-01 | maior `.jsx` / `App.jsx` (M-18, M-19) | **351** / **351** linhas | **112** / **56** | C-09 |
| CS-02 | ALTO | Duplicated Code no tratamento de erro | BE-04 | blocos `catch (err)` nos controllers (M-17) | **10** | **0** | C-08 |
| CS-03 | ALTO | Ausência de camada de serviço | BE-06 | cobertura de statements e dos controllers (M-01, M-06) | **6,14 %** / **0 %** | **89,95 %** / **100 %**; `src/services/` com 98,55 % | C-01 |
| CS-04 | ALTO | Validação ad-hoc | BE-02 | casos de validação de janela e de entrada que passam (V-02..V-05, V-29, R-03, R-04, R-15, R-15b) | **0** | **9** de 9 | C-02 |
| CS-05 | MÉDIO | Magic strings de domínio | BE-03 | arquivos não-teste com literal de domínio | **5** valores em **3** arquivos (`initDb.js`, `reservationModel.js`, `App.jsx`) | **2** arquivos, ambos módulos de constantes (`server/src/domain/reservationStatus.js`, `client/src/constants/domain.js`) | `grep -rln "'scheduled'\|'cancelled'\|'completed'\|'workstation'\|'meeting_room'" server/src client/src \| grep -v '\.test\.'` |
| CS-06 | MÉDIO | Schema como efeito colateral do boot | OPS-02 | migrations versionadas (M-22); `initDb.js` | **0**; existe | **5**; removido (#54) | C-11 |
| CS-07 | MÉDIO | Configuração hardcoded no cliente | FE-02 | URL fixa em `client/src` fora de teste | **1** (`api.js:1`, única fonte) | **1** (`config/env.js:2`, só como fallback de `VITE_API_BASE_URL`) | `grep -rn 'http://localhost:5000' client/src` |
| CS-08 | MÉDIO | Refetch total a cada mutação | FE-01 | chamadas de recarga total | **6** `loadData()` (5 após mutação) | **0** `loadData()`, mas `reloadAll()` recarrega as duas listas a cada mutação — mantido de propósito (`useAppData.js:19`) | `grep -rn 'loadData()\|reloadAll' client/src` |
| CS-09 | MÉDIO | Zero índices | OPS-02 | índices além das PKs (M-21) | **0** | **1** | C-10 |
| CS-10 | MÉDIO | Lint sem dente | OPS-03 | famílias de regra de qualidade (M-11) | **0** | **8**, como `warn` | C-05 |
| CS-11 | BAIXO | Placeholders versionados | OPS-01 | arquivos de 0 byte (M-28) | **3** | **3** | C-17 |
| CS-12 | BAIXO | Supressões de lint | FE-04 | `eslint-disable` (M-27) | **2** | **0** | C-16 |
| CS-13 | BAIXO | Rótulos sem associação | FE-04 | `<label>` sem `htmlFor` (M-26) | **7** | **0** | C-15 |
| CS-14 | BAIXO | Superfície HTTP aberta | BE-08 | middlewares registrados (helmet, rate limit, CORS com allowlist) | **0** de 3 | **3** de 3 (`app.js:15`, `middlewares/rateLimit.js`, `config/cors.js`) | `grep -rnE 'helmet\|rateLimit\|CORS_ALLOWED_ORIGINS' server/src` |

## 7. Cobertura por camada

Mesmo denominador nos dois lados (C-01, seção 1). Antes: `metricas-baseline.md`.
Depois: bloco 3 de [`qa-04-cobertura-main.txt`](evidencias/qa-04-cobertura-main.txt).

| Caminho | % Stmts antes | % Branch antes | % Funcs antes | % Stmts depois | % Branch depois | % Funcs depois |
|---|---|---|---|---|---|---|
| **Todos os arquivos** | **6,14** | **0** | **3,57** | **89,95** | **87,92** | **84,70** |
| `src/index.js` | 0 | 0 | 0 | 0 | 0 | 0 |
| `src/app.js` (criado por BE-04) | não existia | — | — | 100 | 100 | 100 |
| `src/config/database.js` | 71,42 | 100 | 0 | 88,88 | 100 | 66,66 |
| `src/config/initDb.js` | 0 | 100 | 0 | removido por OPS-02 | — | — |
| `src/controllers/reservationController.js` | **0** | **0** | **0** | 100 | 100 | 100 |
| `src/controllers/resourceController.js` | **0** | **0** | **0** | 100 | 100 | 100 |
| `src/models/reservationModel.js` | 25 | 100 | 14,28 | 88 | 100 | 85,71 |
| `src/models/resourceModel.js` | **0** | 100 | **0** | 100 | 100 | 100 |
| `src/routes/reservationRoutes.js` | **0** | 100 | 100 | 100 | 100 | 100 |
| `src/routes/resourceRoutes.js` | **0** | 100 | 100 | 100 | 100 | 100 |
| `src/domain/` (criado por BE-03 e QA-02) | não existia | — | — | 100 | 100 | 100 |
| `src/services/` (criado por BE-06) | não existia | — | — | 98,55 | 97,61 | 100 |
| `src/middlewares/` (criado por BE-04) | não existia | — | — | 97,61 | 92,68 | 100 |

Os `100` de branch nas linhas de modelo e rota do "antes" são artefato: arquivo
sem nenhuma decisão executada reporta 100 % porque não tem branch coberta
**nem** descoberta. A leitura honesta do antes é a linha agregada: **0 %**.

## 8. Processo, Git e ambiente

Medido em 23/10/2026 15:35 (UTC−3), `origin/main` em `d5d56ef`; as linhas de
`.github/` foram medidas de novo em `9662616`, depois do #59.

| Métrica | Antes | Depois | Comando |
|---|---|---|---|
| Issues no repositório | **0** | **30** (10 abertas) | C-21 |
| Pull requests | **2** | **31** (23 mergeados, 5 fechados sem merge, 3 abertos) | C-21 |
| PRs mergeados com aprovação registrada | — | **21** de 23 (o #29 não tem review registrada; no #36 a única aprovação foi descartada) | C-21 |
| Commits | **10** | **120** em `main` | C-21 |
| Templates de issue | **0** | **3** (+ `config.yml`) | C-21 |
| Template de PR | **0** | **1** | C-21 |
| Regras em `CODEOWNERS` | **não existe** | **11** linhas | C-21 |
| Proteção de `main` | **não configurada** | configurada | C-21 |
| Checks obrigatórios no merge | **0** | **0** | C-21 |
| Aprovação exigida | **nenhuma** | **1** (`require_code_owner_reviews: false`) | C-21 |
| Padrão de commit validado por CI | **não** | só o **título do PR** (`pr-title.yml`) | `ls .github/workflows/` |
| Jobs na CI (`ci.yml`) | **2** | **4** (`backend`, `frontend`, `quality-report`, `docker-compose-smoke`) | C-21 |
| Branches no gatilho da CI que não existem | **1** (`develop`) | **0** | `grep -c develop .github/workflows/ci.yml` |
| Serviços de banco na CI | **0** | **1** | `grep -c 'services:' .github/workflows/ci.yml` |
| Gate de cobertura | **0** | statements 80, branches 70, functions 85, lines 80; controllers 90; routes 100 | `grep -A6 coverageThreshold server/jest.config.js` |
| Passos manuais para subir (M-23) | **7** | **1** | C-12 |
| Dockerfile / compose | **nenhum** | `docker-compose.yml`, `server/Dockerfile`, `client/Dockerfile` | `ls docker-compose.yml server/Dockerfile client/Dockerfile` |
| Schema aplicado pelo `docker compose up` | só `initDb.js`, **0** constraint | `npm run db:migrate` antes do start (`docker-compose.yml:33`) | C-10 |

Achado de processo: até o #54, o compose não rodava as migrations. Um stack
ainda de pé de antes do #54 (`39237e3`) tem **0** constraints e **0** índices
([`qa-04-schema-main.txt`](evidencias/qa-04-schema-main.txt), banco B): as
proteções de BE-01..BE-03 existiam no repositório e não no banco de quem subia
pelo Docker. Quem tiver um volume dessa época precisa de `docker compose up
--build` para o `db:migrate` rodar.

Papéis e responsabilidades: [matriz de papéis e RACI](../time/overview.md).
4 das 5 pessoas trocaram de área entre N1 e N2. Os PRs do próprio QA foram
aprovados por outro membro do time (seção 8, C-21).

## 9. Documentação e requisitos

Denominador: **12** divergências (C-14). "Fechada" aqui quer dizer que existe o
artefato citado; a classificação é desta medição.

| ID | O que a doc afirma | Encaminhamento | Fechada? | PR |
|---|---|---|---|---|
| D-01 | `UUID` como PK | corrigir a doc (REQ-02) | **sim** — `der.md:215` | #45, #52 |
| D-02 | `resources.is_active` | corrigir a doc; avaliar em BE-08 | **sim** na doc — `der.md:216`; a coluna segue inexistente (RF15) | #45, #52 |
| D-03 | `reservations.user_id UUID` | corrigir a doc; usuário vira débito N3 | **sim** na doc — `der.md:217` | #45, #52 |
| D-04 | `PUT /api/reservations/{id}/cancel` | corrigir a doc (REQ-03) | **não** — registrada em `requisitos.md:449-474`; contrato a medir após #23 | |
| D-05 | lista "as reservas do usuário atual" | corrigir a doc | **não** — registrada em `requisitos.md:331`; contrato a medir após #23 | |
| D-06 | "Nível de acesso Admin" | corrigir a doc; autenticação é débito N3 | **não** — registrada em `requisitos.md:555-596`; contrato a medir após #23 | |
| D-07 | 5 endpoints documentados | corrigir a doc (OpenAPI, REQ-03) | **não** — a medir após #23 | |
| D-08 | casos de uso com Usuário e Administrador | corrigir o diagrama (REQ-01) | **não** — atores marcados como inexistentes em `requisitos.md:45-46`; diagrama a conferir | #39 |
| D-09 | "tarefas mapeadas no Jira" | backlog no GitHub Project (OPS-05) | **sim** — 30 issues | — |
| D-10 | "crie uma branch a partir da `develop`" | Trunk-Based (OPS-03, OPS-05) | **sim** — `develop` 0 vezes na CI; `fluxo-tbd.md` | #56, #59 |
| D-11 | "Clean Code: separação estrita" | corrigir o código (FE-01, BE-06) | **sim** — `App.jsx` 351 → 56; `src/services/` | #35, #41 |
| D-12 | "testes unitários automatizados de domínio" | corrigir o código (QA-01, QA-02) | **sim** — `src/domain/` com 100 % | #48, #50 |

| Métrica | Antes | Depois | Comando |
|---|---|---|---|
| Divergências abertas (M-25) | **12** | **5** | C-14 |
| Endpoints documentados (M-24) | **5 de 10** | a medir após #23 | C-13 |
| Contrato de API publicado (OpenAPI/Swagger/Postman) | **nenhum** | **nenhum** — a medir após #23 | `ls docs/arquitetura/contrato-api.yaml` |
| DER atualizado contra o schema real | **não** | **sim** (`der.md`) | revisão de REQ-02 |
| Documento de handoff para a N3 | **não existe** | **não existe** — a medir após #24 | `ls docs/handoff/` |

## 10. O que piorou ou não atingiu a meta

| Métrica ou item | Meta | Chegou a | Por que | Encaminhamento |
|---|---|---|---|---|
| Bugs ALTO (M-13) | 0 | **1** (BUG-06) | exclusão física vs. desativação lógica é decisão de produto; FE-05 só avisa | débito 4 da seção 11 |
| Bugs MÉDIO (M-14) | ≤ 1 | **2** (BUG-09, BUG-10) | correção em PR aberto | a medir após #61 |
| Constraints (M-20) | ≥ 4 | **3** | `resources` não ganhou `CHECK` de `type` nem de `capacity` (é o BUG-09/10) | a medir após #61, se trouxer migration |
| Índices (M-21) | ≥ 2 | **1** | só o GiST que sustenta o `EXCLUDE`; nenhum índice em `reservations.resource_id` | débito 10 da seção 11 |
| Endpoints documentados (M-24) | 10 de 10 | não medido | contrato OpenAPI não existe | a medir após #23 |
| Divergências (M-25) | 0 | **5** | 4 dependem do contrato de REQ-03 | a medir após #23 |
| Placeholders (M-28) | 0 | **3** | nenhuma spec mesclada os removeu | débito da N3 |
| Bundle do client | sem meta | **201,86 → 214,45 kB** (+12,59 kB; gzip +4,54 kB) | componentes novos de FE-01..FE-05 (diálogo de confirmação, aviso de cascata, validação) | aceitar; não há meta de bundle |
| `npx jest` em paralelo | — | **17** falhas intermitentes | arquivos de integração truncam o mesmo banco | medir sempre com `--runInBand` (seção 1) |
| Checks obrigatórios no merge | — | **0** | a proteção de `main` exige 1 aprovação, mas nenhum check da CI | OPS-05 (#20) |

## 11. Débito entregue para a N3, com justificativa

| # | Débito | Por que não foi feito na N2 | Custo de carregar | Prioridade na N3 |
|---|---|---|---|---|
| 1 | **Autenticação e autorização** | Fora do escopo recebido e grande demais para o prazo. A doc recebida já prometia "Nível de acesso Admin" (D-06) sem nunca ter existido | Qualquer pessoa com acesso à porta apaga todas as reservas. CS-14 sobe de BAIXO para CRÍTICO no momento em que houver login | **máxima** |
| 2 | **Testes de ponta a ponta (Playwright)** | FE-01 a FE-05 mudaram a estrutura do client cinco vezes; teste escrito antes nasceria para ser reescrito | 56 passos de verificação manual por execução ([roteiro](../qa/roteiro-regressao.md)), nenhuma execução registrada ainda | **alta** — o roteiro já é a especificação de entrada |
| 3 | **Regras de ESLint ainda como `warn`** | OPS-03 adotou promoção em fases para não travar PRs por dívida pré-existente | 19 avisos hoje (13 server, 6 client); `lint:strict` reprova | **alta** |
| 4 | **Decisão de domínio de BUG-06** (exclusão física vs. desativação lógica) | É decisão de produto e depende de D-02 (`is_active`) | Exclusão de espaço continua apagando histórico | **alta** |
| 5 | **`enforce_admins: false` e 0 checks obrigatórios na proteção de `main`** | Em repositório de usuário, o dono não consegue aprovar o próprio PR — ver OPS-05 | Bypass disponível ao dono; merge possível com CI vermelha | média |
| 6 | **ORM no lugar de SQL cru** | Funciona, é legível, e trocar a persistência é reescrita | SQL duplicado entre model e migration | baixa |
| 7 | **DDD completo** | A camada de serviço de BE-06 resolve a testabilidade a uma fração do custo | — | baixa |
| 8 | **TypeScript no frontend** | Fora de escopo | Literais de CS-05 sem apoio de compilador no client | baixa |
| 9 | **Bugs MÉDIO e BAIXO remanescentes** | BUG-09 e BUG-10 estão no PR #61 | 2 MÉDIO abertos na medição (meta ≤ 1) | média |
| 10 | **Paginação em `GET /api/reservations` e índice em `resource_id`** | `findAll` faz `SELECT *` sem limite; M-21 ficou em 1 | Resposta e varredura crescem com o uso (CS-08) | média |

Lista viva em [`docs/time/overview.md`](../time/overview.md) e no documento de
handoff (REQ-04, #24).

## 12. Roteiro do pitch

**12 minutos.** Cada bloco tem o número que o sustenta; bloco sem número ao lado
não entra.

| # | Bloco | Tempo | Quem | Argumento | Número que sustenta |
|---|---|---|---|---|---|
| 1 | Abertura | 0:45 | Igor | Não apresentamos um sistema nosso: auditamos o de outro grupo e medimos antes de tocar | 1.280 linhas auditadas; 15 bugs e 14 smells confirmados por leitura de código |
| 2 | O que recebemos, e a matriz de papéis | 1:30 | Igor | O sistema funciona no caminho feliz — e tem 6,14 % de cobertura. Os papéis rodaram: 4 de 5 trocaram de área | M-01 **6,14 %**, M-02 **0 %**, M-05 **2** casos, M-29 **0**; [matriz de papéis](../time/overview.md) |
| 3 | O achado central: o SREC falhava na sua razão de existir | 2:00 | Adrian | Duas idas ao banco sem transação, e zero constraint para segurar | M-20 **0 → 3** constraints, entre elas o `EXCLUDE`; caso **V-12**: 20 requisições → antes **15×201**, depois **1×201 e 19×409** |
| 4 | A prova: de alegação a assertion | 1:45 | Igor | Nenhuma correção entrou sem um teste que falhava antes | **51** casos reprovavam contra o recebido, **0** no `main`; M-05 **2 → 238**; M-01 **6,14 % → 89,95 %**; M-08 **0 → 10 de 10** |
| 5 | O frontend: 351 linhas num arquivo | 1:30 | Renato | 41 % de todo o JS/JSX num componente único, quebrado em features | M-19 **351 → 56**; M-18 **351 → 112**; M-26 **7 → 0**; M-29 **0 → 79** testes |
| 6 | O ambiente e o portão | 1:30 | Gabriel | Recebemos 7 passos manuais, 0 migrations, 0 issues, `main` aberta e uma CI que apontava para um branch inexistente | M-23 **7 → 1**; M-22 **0 → 5**; jobs de CI **2 → 4**; `develop` **1 → 0**; gate de cobertura **0 → 80 %** |
| 7 | A documentação descrevia outro sistema | 1:15 | Diego | 12 divergências. A mais séria: "Nível de acesso Admin" num sistema sem autenticação | M-25 **12 → 5**; DER corrigido; M-24 a medir após #23 |
| 8 | O que não fizemos, e a conta para a N3 | 1:15 | Igor | Escolhas declaradas, não esquecimentos | seção 11: 10 débitos; seção 10: 6 métricas abaixo da meta |
| 9 | Fechamento | 0:30 | Igor | Entregamos à N3 o que gostaríamos de ter recebido | M-23 **7 → 1**; M-01 **6,14 % → 89,95 %**; M-12+M-13 **7 → 1** |

### Abertura, literal

> "O SREC existe para impedir que duas pessoas reservem a mesma sala no mesmo
> horário. A primeira coisa que fizemos, antes de escrever uma linha, foi
> verificar se ele fazia isso. Ele não fazia: vinte requisições simultâneas no
> mesmo horário criaram quinze reservas. Nos próximos doze minutos a gente
> mostra o que mais encontramos nas 1.280 linhas que recebemos, o que
> corrigimos, e com qual número cada uma dessas afirmações se sustenta. Todo
> número que vamos dizer tem um comando ao lado dele no repositório, e qualquer
> um aqui pode rodar."

* Começa pelo **produto**, não pela stack.
* O defeito aparece **em dez segundos**.
* A última frase é um convite à verificação.

### Fechamento, literal

> "Recebemos um sistema com 6,14 % de cobertura, zero constraint no banco, zero
> issue e a `main` aberta. Entregamos com 89,95 % de cobertura, 3 constraints,
> 30 issues rastreáveis e merge só com aprovação. E entregamos também a lista do
> que não fizemos, com o motivo — porque foi justamente o débito escondido que
> nos custou a primeira semana desta entrega."

### O que não dizer

* **Adjetivo sem número.** Se não tem número dos dois lados, corta a frase.
* **Crítica ao grupo anterior.** O sistema é "um v1.0 de prazo apertado, com os
  problemas típicos de um v1.0 de prazo apertado". O nosso código vai para um
  terceiro grupo.
* **"Não deu tempo."** Toda decisão de escopo está na seção 11 com motivo.
* **Número medido de um jeito e comparado com outro.** Cobertura é a do C-01
  com o denominador da seção 1. Nem 35,48 %, nem 49,81 %, nem 96,09 % entram.

### Perguntas prováveis, e o número que responde

| Pergunta | Resposta curta | Número |
|---|---|---|
| "Como vocês sabem que não quebraram nada?" | Suíte de integração nos 10 endpoints, suíte de domínio, testes de componente e roteiro manual | M-08 **0 → 10 de 10**; M-05 **2 → 238**; 56 passos no roteiro, execução a registrar |
| "O que vocês não conseguiram fazer?" | Autenticação, teste de ponta a ponta, decisão do BUG-06 e as regras de lint como bloqueantes | seção 11, 10 itens |
| "A cobertura não está alta demais para ser verdade?" | É medida sobre todo `src/`, com `index.js` em 0 %; o número do `jest.config.js` (96,09 %) tira o `index.js` e não é o que citamos | M-01 **89,95 %**; seção 1 |
| "Por que não reescreveram o frontend?" | O backend recebido tinha 370 linhas e o `App.jsx` 351. Reescrever o frontend era reescrever 41 % do sistema | seção 4 |
| "Quem revisou o quê?" | 21 de 23 PRs mergeados têm aprovação registrada; os do QA foram aprovados por outro membro | seção 8 |

### Ensaio

Cronometrar duas vezes, uma delas com interrupção no meio do bloco 3. Se passar
de 12 minutos, o corte é no bloco 7 e no 8, nunca no 3 nem no 4.

Rodar `docker compose up -d --build --wait` e o roteiro de regressão **na
máquina da apresentação**, no dia, antes de começar.
