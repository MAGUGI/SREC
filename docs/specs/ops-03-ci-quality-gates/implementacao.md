# OPS-03 — Portões de qualidade na CI

* **Responsável:** Gabriel Carvalho (DevOps)
* **Issue:** #<a definir>
* **Branch:** `feature/ci-quality-gates`
* **Rubrica:** 4,0 — Onboarding e diagnóstico → 2,5 pt (resolve **CS-10**, MÉDIO) e 3,0 — Processo, Git & Documentação → 1,5 pt "branches, PRs aprovados pelo QA e padrões de commit" (a CI é o que torna o gate do PR verificável).
* **Depende de:** OPS-02 (step de `migrate:up` no job), OPS-04 (variáveis validadas no job). **Casa com:** QA-01 (precisa do serviço Postgres que esta spec sobe) e OPS-05 (os nomes de job desta spec são os *required status checks* da proteção de branch).

## Problema

### A CI dispara em um branch que não existe

`.github/workflows/ci.yml:3-7`:

```yaml
on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main, develop ]
```

O repositório recebido tem os branches `main`, `backend` e `frontend`.
**`develop` não existe.** Metade do gatilho é código morto, e o
`Documentação Oficial SREC.md` ainda manda criar branch a partir de `develop`
(divergência nº 10 da auditoria). Além disso, a convenção da N2 é
**Trunk-Based Development**: `main` é o único branch longevo. Manter `develop`
no gatilho é documentar um fluxo que o time não usa.

### A CI não roda os testes que importam

`.github/workflows/ci.yml:9-23` tem um job de backend com `npm ci`,
`npm run lint`, `npm test`. `server/package.json:12` define `"test": "jest"` —
sem `--coverage`, sem `--ci`, sem threshold. O job **não sobe banco nenhum**.

Isso é suficiente hoje porque o único arquivo de teste,
`server/src/models/reservationModel.test.js:4`, faz
`jest.mock('../config/database')`. Mas **QA-01** vai adicionar testes de
integração com Supertest (a dependência já está lá, `server/package.json:32`:
`"supertest": "^7.2.2"`) e esses testes precisam de um Postgres real. Hoje eles
falhariam na CI por `ECONNREFUSED`.

### O verde da CI não significa qualidade

O baseline mediu **0 erros de ESLint** nos dois pacotes. E ainda assim:

* `server/eslint.config.js:22-25` tem exatamente **2 regras** declaradas:
  `"no-unused-vars": "warn"` e `"no-console": "off"`. Nada mais além do
  `js.configs.recommended`.
* `client/eslint.config.js:24-32` tem **2 regras** próprias
  (`no-unused-vars` e `react-refresh/only-export-components`), mais
  `js.configs.recommended` e `reactHooks.configs.recommended`.
* Nos dois: **zero** regra de complexidade ciclomática, **zero** limite de
  tamanho de função ou arquivo, **zero** plugin de segurança, **zero** plugin de
  acessibilidade.

O resultado medido é a definição de CS-10: `client/src/App.jsx` tem **351 linhas**
(41 % de todo o JS/JSX do projeto) num componente único, os controllers têm
**10 blocos `try/catch` idênticos**, há **7 `<label>` sem `htmlFor`** (CS-13) e
**2 `eslint-disable-next-line`** (CS-12) — e o lint passa limpo. O portão existe,
mas não tem dente.

### Não há cobertura nem formatação no portão

* `npm test` não produz relatório de cobertura; os 6,14 % do baseline só foram
  obtidos rodando `npx jest --coverage` à mão. Nada impede o número de **cair**.
* `prettier` está instalado nos dois pacotes (`server/package.json:31`,
  `client/package.json:32`) e há `.prettierrc` em cada um, mas o único script é
  `format` (que **escreve**). Não existe `format:check`, e a CI nunca verifica
  formatação — então divergência de formatação entra no repositório e vira ruído
  de diff nos PRs.
* `npm audit` nunca é executado. Nenhuma vulnerabilidade de dependência é
  detectada por ninguém.
* O client **não tem script `test`**: `client/package.json:6-13` tem `dev`,
  `build`, `lint`, `lint:fix`, `format`, `preview`. **0 testes de frontend**,
  confirmado no baseline.

## Evidência

```bash
# develop não existe
git branch -r
# => origin/HEAD -> origin/main, origin/main, origin/backend, origin/frontend
grep -n 'develop' .github/workflows/ci.yml
# => 5:    branches: [ main, develop ]
# => 7:    branches: [ main, develop ]

# o lint passa limpo, e não tem regra nenhuma de qualidade estrutural
cd server && npm ci && npm run lint; echo "exit=$?"   # => exit=0
grep -cE 'complexity|max-lines|max-depth|max-params|security|jsx-a11y' eslint.config.js  # => 0
cd ../client && npm ci --legacy-peer-deps && npm run lint; echo "exit=$?"  # => exit=0
grep -cE 'complexity|max-lines|max-depth|max-params|security|jsx-a11y' eslint.config.js  # => 0

# a CI não sobe banco
grep -c 'services:' .github/workflows/ci.yml   # => 0

# cobertura só sai se você pedir à mão
cd ../server && npm test 2>&1 | grep -c 'Coverage'   # => 0
npx jest --coverage --coverageReporters=text --collectCoverageFrom='src/**/*.js'
# => All files | 6.14 | 0 | 3.57 | 6.14

# formatação não é verificada
grep -c 'format:check\|prettier --check' package.json ../client/package.json  # => 0

# o client não tem teste
grep -c '"test"' ../client/package.json   # => 0
```

Baseline consolidado, que esta spec passa a **proteger**:

| Métrica | Valor medido no recebimento |
|---|---|
| Cobertura de statements (backend) | 6,14 % |
| Cobertura de branches (backend) | 0 % |
| Cobertura de funções (backend) | 3,57 % |
| Cobertura de linhas (backend) | 6,14 % |
| Arquivos de teste / casos de teste | 1 / 2 |
| Testes de frontend | 0 |
| Erros de ESLint | 0 (sem regra de qualidade estrutural) |
| Regras de complexidade/tamanho/segurança/a11y | 0 |
| Serviços de banco na CI | 0 |
| Gates de cobertura | 0 |
| `npm audit` na CI | não roda |
| `prettier --check` na CI | não roda |
| Branches no gatilho que não existem | 1 (`develop`) |

## Decisão

**Reescrever `.github/workflows/ci.yml` com quatro jobs nomeados e introduzir cada
portão novo em duas fases: primeiro observando, depois bloqueando.**

### Por que o modelo de duas fases, e não ligar tudo como `error` de uma vez

A alternativa óbvia é adicionar `complexity`, `max-lines`, `security`, `jsx-a11y`,
`prettier --check` e `npm audit --audit-level=high` como bloqueantes num único PR.
Ela é errada aqui, por um motivo mensurável: `client/src/App.jsx` tem **351
linhas**, e qualquer `max-lines` razoável (300) o reprova **imediatamente**. O
mesmo vale para `jsx-a11y`, que acusaria os **7 `<label>` sem `htmlFor`** de
CS-13. O efeito prático de ligar tudo bloqueante no dia 1 é: a `main` fica
vermelha, **todos** os PRs do time (BE-01 a BE-08, QA-01, as specs de frontend)
ficam impedidos de mesclar por avisos que não têm nada a ver com eles, e a
primeira reação de qualquer pessoa sob prazo é adicionar `eslint-disable`. O
repositório já tem 2 supressões (CS-12); multiplicá-las seria o oposto do
objetivo.

O modelo adotado:

* **Fase 1 (este PR).** Todas as regras novas entram como **`warn`**.
  `npm run lint` continua saindo com código 0 e **não bloqueia nada**. Um job
  separado, `quality-report`, roda as mesmas regras com `--max-warnings=0` e
  `continue-on-error: true`: ele aparece **amarelo** no PR, publica o número de
  avisos como artefato e comentário, e **não** entra na lista de *required status
  checks* de OPS-05. O gate de cobertura entra com o limiar **igual ao baseline**
  (6 %), ou seja: impede regressão, não exige progresso.
* **Fase 2 (durante a N2).** Conforme as specs fecham, os limiares sobem. O
  `quality-report` deixa de ter `continue-on-error` para os grupos de regra que
  chegaram a zero aviso.
* **Fase 3 (handoff para a N3).** Tudo promovido a `error` e o `quality-report`
  virando *required check*. O que não der tempo vira item documentado em
  `docs/handoff/`, com o número atual e a meta — que é mais honesto do que
  entregar regra desativada.

Isso dá ao pitch uma curva com número, não uma afirmação: **"0 regras de
qualidade estrutural → 9 regras, com N avisos no dia 1 e M no handoff"**.

### Gate de cobertura: por que `coverageThreshold` do Jest e não uma action

A alternativa é uma action de terceiros que compara cobertura entre base e head.
`coverageThreshold` do Jest ganha porque: (a) é configuração versionada no
repositório, então o limiar sobe por PR revisado, com rastro no `git log`;
(b) falha o **mesmo comando** que o dev roda localmente (`npm test`), sem
surpresa só na CI; (c) não acrescenta dependência de terceiro no caminho crítico
do portão.

Limiares, ancorados no baseline medido:

| Fase | Quando | statements | branches | functions | lines | Justificativa |
|---|---|---|---|---|---|---|
| **1** | este PR | **6** | **0** | **3** | **6** | trava exatamente o baseline (6,14 / 0 / 3,57 / 6,14) arredondado para baixo. Não exige nada de ninguém; só proíbe regressão. |
| **2** | após QA-01 | **40** | **30** | **40** | **40** | QA-01 cobre os 10 endpoints via Supertest; controllers e rotas saem dos 0 % |
| **3** | **meta da entrega N2** | **50** | **40** | **50** | **50** | alvo declarado no pitch: **6,14 % → 50 %**, 8× o recebido |

O limiar da Fase 1 é deliberadamente igual ao baseline. O erro clássico é
escolher um número "aspiracional" (80 %) que reprova o primeiro PR e é
desativado na semana seguinte. Um gate que nunca é desligado vale mais do que um
gate ambicioso que é.

### Comentário de cobertura no PR: `actions/github-script`, não action de terceiros

`actions/github-script@v7` é mantido pela própria GitHub e já vem com
`@actions/github` autenticado. Lê o `coverage/coverage-summary.json` que o Jest
gera e publica/atualiza **um** comentário fixo (em vez de empilhar um por push).
Uma action de terceiros faria o mesmo, mas passaria a ter permissão de escrita
em PR do repositório — superfície de risco desnecessária num repositório de
disciplina que a auditoria vai avaliar.

### `npm audit --audit-level=high`: `continue-on-error` na Fase 1

`npm audit` falha por vulnerabilidade em **dependência transitiva**, que não está
sob controle do autor do PR, e novos avisos aparecem sem nenhum commit nosso.
Bloqueante desde o dia 1, ele transformaria "a `main` está vermelha" em estado
normal. Na Fase 1 roda com `continue-on-error: true`; passa a bloquear quando o
time tiver tratado o backlog inicial (registrado em `docs/time/divida-tecnica.md`).

### Por que o client ganha um job de teste que hoje roda zero testes

`client/package.json` não tem script `test` e há **0 testes de frontend**. Esta
spec adiciona `"test": "echo \"nenhum teste de frontend ainda\" && exit 0"`? **Não.**
Script que mente é pior que script ausente. O job do client nesta spec roda
lint, `prettier --check` e build — e a spec de frontend que introduzir Vitest
adiciona o step de teste. O que **esta** spec garante é que o job já se chama
`Frontend — lint, formato e build` e já está na lista de checks obrigatórios, de
modo que acrescentar um step depois não exija mexer na proteção de branch.

## Alterações

### Substituir — `.github/workflows/ci.yml`

O arquivo atual tem 38 linhas e 2 jobs. O novo:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

permissions:
  contents: read
  pull-requests: write

concurrency:
  group: ci-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  backend:
    name: Backend — lint, formato, auditoria e testes
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: ./server

    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: srec
          POSTGRES_PASSWORD: srec
          POSTGRES_DB: srec_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd "pg_isready -U srec -d srec_test"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 10

    env:
      NODE_ENV: test
      PORT: 5000
      DATABASE_URL: postgres://srec:srec@localhost:5432/srec_test
      CORS_ALLOWED_ORIGINS: http://localhost:5173

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
          cache-dependency-path: server/package-lock.json

      - name: Instalar dependências
        run: npm ci

      - name: Verificar formatação (Prettier)
        run: npm run format:check

      - name: Lint (bloqueante — regras herdadas)
        run: npm run lint

      - name: Auditoria de dependências
        run: npm audit --audit-level=high
        continue-on-error: true # Fase 1 — ver "Decisão" na spec OPS-03

      - name: Aplicar migrations no banco de teste
        run: npm run migrate:up

      - name: Validar que o down da última migration funciona
        run: npm run migrate:down && npm run migrate:up

      - name: Testes com cobertura e gate de limiar
        run: npm run test:ci

      - name: Publicar relatório de cobertura como artefato
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: backend-coverage-${{ github.run_number }}
          path: server/coverage/
          retention-days: 14

      - name: Comentar cobertura no PR
        if: github.event_name == 'pull_request' && always()
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const path = 'server/coverage/coverage-summary.json';
            if (!fs.existsSync(path)) {
              core.warning('coverage-summary.json não encontrado; o Jest falhou antes de gerar o relatório.');
              return;
            }
            const total = JSON.parse(fs.readFileSync(path, 'utf8')).total;
            // Baseline medido no recebimento do projeto (docs/auditoria/).
            const baseline = { statements: 6.14, branches: 0, functions: 3.57, lines: 6.14 };
            // Meta da entrega N2 (Fase 3 da spec OPS-03).
            const meta = { statements: 50, branches: 40, functions: 50, lines: 50 };
            const rotulos = {
              statements: 'Statements',
              branches: 'Branches',
              functions: 'Funções',
              lines: 'Linhas',
            };
            const linhas = Object.keys(rotulos).map((k) => {
              const atual = total[k].pct;
              const delta = atual - baseline[k];
              const sinal = delta > 0 ? '+' : '';
              const status = atual >= meta[k] ? '✅' : atual >= baseline[k] ? '➡️' : '🔻';
              return `| ${rotulos[k]} | ${baseline[k].toFixed(2)} % | **${atual.toFixed(2)} %** | ${sinal}${delta.toFixed(2)} pp | ${meta[k]} % | ${status} |`;
            });
            const corpo = [
              '<!-- srec-coverage-report -->',
              '## Cobertura do backend',
              '',
              '| Métrica | Baseline recebido | Neste PR | Δ | Meta N2 | |',
              '|---|---|---|---|---|---|',
              ...linhas,
              '',
              `Casos de teste: **${total.lines.total > 0 ? 'ver artefato' : 'n/d'}** · `
                + `Artefato completo: \`backend-coverage-${context.runNumber}\``,
              '',
              '_Gate de cobertura configurado em `server/jest.config.js`. Fases e limiares: `docs/specs/ops-03-ci-quality-gates/implementacao.md`._',
            ].join('\n');

            const { data: comentarios } = await github.rest.issues.listComments({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: context.issue.number,
            });
            const existente = comentarios.find((c) =>
              c.body.includes('<!-- srec-coverage-report -->'),
            );
            if (existente) {
              await github.rest.issues.updateComment({
                owner: context.repo.owner,
                repo: context.repo.repo,
                comment_id: existente.id,
                body: corpo,
              });
            } else {
              await github.rest.issues.createComment({
                owner: context.repo.owner,
                repo: context.repo.repo,
                issue_number: context.issue.number,
                body: corpo,
              });
            }

  frontend:
    name: Frontend — lint, formato e build
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: ./client

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
          cache-dependency-path: client/package-lock.json

      - name: Instalar dependências
        run: npm ci --legacy-peer-deps

      - name: Verificar formatação (Prettier)
        run: npm run format:check

      - name: Lint (bloqueante — regras herdadas)
        run: npm run lint

      - name: Auditoria de dependências
        run: npm audit --audit-level=high
        continue-on-error: true # Fase 1 — ver "Decisão" na spec OPS-03

      - name: Build de produção
        run: npm run build

      - name: Registrar tamanho do bundle
        run: |
          echo '### Bundle do client' >> "$GITHUB_STEP_SUMMARY"
          echo '' >> "$GITHUB_STEP_SUMMARY"
          echo 'Baseline medido no recebimento: 201,86 kB (63,26 kB gzip)' >> "$GITHUB_STEP_SUMMARY"
          echo '' >> "$GITHUB_STEP_SUMMARY"
          echo '```' >> "$GITHUB_STEP_SUMMARY"
          du -bh dist/assets/*.js dist/assets/*.css 2>/dev/null >> "$GITHUB_STEP_SUMMARY" || true
          echo '```' >> "$GITHUB_STEP_SUMMARY"

  quality-report:
    name: Relatório de qualidade (não bloqueante na Fase 1)
    runs-on: ubuntu-latest
    continue-on-error: true

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Instalar dependências do server
        working-directory: ./server
        run: npm ci

      - name: Instalar dependências do client
        working-directory: ./client
        run: npm ci --legacy-peer-deps

      - name: Lint estrito do server (0 avisos tolerados)
        id: server_lint
        working-directory: ./server
        continue-on-error: true
        run: npm run lint:strict

      - name: Lint estrito do client (0 avisos tolerados)
        id: client_lint
        working-directory: ./client
        continue-on-error: true
        run: npm run lint:strict

      - name: Resumo
        run: |
          {
            echo '### Portões de qualidade — Fase 1 (observando)'
            echo ''
            echo "| Pacote | lint estrito (--max-warnings=0) |"
            echo "|---|---|"
            echo "| server | ${{ steps.server_lint.outcome }} |"
            echo "| client | ${{ steps.client_lint.outcome }} |"
            echo ''
            echo 'Regras novas (complexity, max-lines, max-lines-per-function,'
            echo 'eslint-plugin-security, eslint-plugin-jsx-a11y) estão como `warn`.'
            echo 'Promoção para `error` conforme as fases em'
            echo '`docs/specs/ops-03-ci-quality-gates/implementacao.md`.'
          } >> "$GITHUB_STEP_SUMMARY"

  docker-compose-smoke:
    name: Docker — build e smoke test do compose
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Build das imagens
        run: docker compose -f docker-compose.yml build
      - name: Subir a stack
        run: docker compose -f docker-compose.yml up -d --wait --wait-timeout 180
      - name: Smoke test da API
        run: |
          curl --fail --silent --show-error http://localhost:5000/
          test "$(curl --fail --silent http://localhost:5000/api/resources)" = "[]"
      - name: Smoke test do frontend
        run: curl --fail --silent --show-error http://localhost:5173 | grep -q 'id="root"'
      - name: Logs em caso de falha
        if: failure()
        run: docker compose -f docker-compose.yml logs --no-color
      - name: Derrubar a stack
        if: always()
        run: docker compose -f docker-compose.yml down -v
```

O job `docker-compose-smoke` vem de **OPS-01**; está reproduzido aqui porque este
PR substitui o arquivo inteiro e não pode apagá-lo. Se OPS-01 ainda não tiver
sido mesclado, remova este job deste PR e deixe OPS-01 adicioná-lo.

Mudanças pontuais em relação ao arquivo de 38 linhas recebido:

| Linha original | O que era | O que passa a ser |
|---|---|---|
| `ci.yml:1` | `name: CI/CD Pipeline` | `name: CI` — não há deploy; o nome prometia o que não entrega |
| `ci.yml:5` e `:7` | `branches: [ main, develop ]` | `branches: [main]` — `develop` não existe no repositório |
| `ci.yml:10` | job `backend-lint-test`, sem `name:` | job `backend`, com `name:` explícito (é o *required check* de OPS-05) |
| `ci.yml:25` | job `frontend-lint-build` | job `frontend`, com `name:` explícito |
| — | nenhum `services:` | serviço `postgres:16-alpine` com healthcheck, para QA-01 |
| `ci.yml:21`, `:36` | `npm ci` sem cache | `actions/setup-node` com `cache: npm` |
| `ci.yml:23` | `npm test` | `npm run test:ci` (cobertura + gate) |
| — | nenhum artefato | `upload-artifact` da pasta `coverage/` |
| — | nenhum comentário no PR | comentário fixo via `actions/github-script` |
| — | nenhum `permissions` | `contents: read`, `pull-requests: write` (mínimo necessário) |
| — | nenhum `concurrency` | cancela execuções obsoletas do mesmo ref |

### Criar — `server/jest.config.js`

Hoje não existe configuração de Jest alguma: `server/package.json:12` é só
`"test": "jest"`.

```js
/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  collectCoverageFrom: ['src/**/*.js', '!src/**/*.test.js'],
  coverageDirectory: 'coverage',
  coverageReporters: ['text-summary', 'json-summary', 'lcov'],

  // Gate de cobertura — Fase 1.
  // Baseline medido no recebimento: 6,14 / 0 / 3,57 / 6,14.
  // Os limiares abaixo travam o baseline: proibem regressao, nao exigem avanco.
  // Fase 2 (apos QA-01): 40 / 30 / 40 / 40.
  // Fase 3 (meta da entrega N2): 50 / 40 / 50 / 50.
  // Suba estes numeros em PR proprio, com o relatorio antes/depois no corpo.
  coverageThreshold: {
    global: {
      statements: 6,
      branches: 0,
      functions: 3,
      lines: 6,
    },
  },

  // Os testes de integracao de QA-01 compartilham um unico banco; rodar em
  // paralelo geraria interferencia entre suites.
  maxWorkers: 1,
};
```

Nota para QA-01: quando entrarem os testes de integração, adicionar aqui
`globalSetup`/`globalTeardown` ou `setupFilesAfterEach` para truncar as tabelas
entre suítes. Esta spec não define esse arquivo.

### Alterar — `server/package.json` (scripts)

```json
  "scripts": {
    "start": "node src/index.js",
    "dev": "nodemon src/index.js",
    "lint": "eslint src/ migrations/",
    "lint:fix": "eslint src/ migrations/ --fix",
    "lint:strict": "eslint src/ migrations/ --max-warnings=0",
    "format": "prettier --write \"src/**/*.js\" \"migrations/**/*.js\"",
    "format:check": "prettier --check \"src/**/*.js\" \"migrations/**/*.js\"",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:ci": "jest --ci --coverage --runInBand",
    "migrate": "node-pg-migrate",
    "migrate:up": "node-pg-migrate up",
    "migrate:down": "node-pg-migrate down 1",
    "migrate:create": "node-pg-migrate create --",
    "migrate:status": "node-pg-migrate --dry-run up"
  }
```

`format:check` usa **exatamente** o mesmo glob de `format`. Isso é intencional:
ampliar o escopo e verificar formatação junto introduz falhas sem relação com o
PR. Ver a nota sobre `client/vite.config.js` adiante.

### Alterar — `client/package.json` (scripts)

```json
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "lint": "eslint .",
    "lint:fix": "eslint . --fix",
    "lint:strict": "eslint . --max-warnings=0",
    "format": "prettier --write \"src/**/*.{js,jsx,css}\"",
    "format:check": "prettier --check \"src/**/*.{js,jsx,css}\"",
    "preview": "vite preview"
  }
```

**Armadilha verificada, não hipotética:** `client/vite.config.js` tem 7 linhas e
as linhas 1-2 (`import react from '@vitejs/plugin-react'` e
`import { defineConfig } from 'vite'`) **não terminam em ponto e vírgula**,
enquanto `client/.prettierrc` declara `"semi": true`. Esse arquivo está **fora**
do glob `src/**` do script `format`, então `format:check` com o glob acima passa.
Se alguém ampliar o glob para a raiz, o job do frontend fica vermelho num PR que
não tem nada a ver com isso. Se o time quiser cobrir a raiz, faça num
commit dedicado `style: aplicar prettier nos arquivos de configuracao do client`
e amplie o glob **no mesmo commit** — nunca no meio de outro PR.

### Alterar — `server/eslint.config.js`

O arquivo tem 28 linhas. Acrescentar o plugin de segurança e as 6 regras novas,
todas como **`warn`** (Fase 1). Resultado completo:

```js
const js = require('@eslint/js');
const prettier = require('eslint-config-prettier');
const security = require('eslint-plugin-security');

module.exports = [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        process: 'readonly',
        console: 'readonly',
        require: 'readonly',
        module: 'readonly',
        __dirname: 'readonly',
        jest: 'readonly',
        describe: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
      },
    },
    plugins: { security },
    rules: {
      'no-unused-vars': 'warn',
      'no-console': 'off',

      // --- Portoes de qualidade estrutural (OPS-03, Fase 1: warn) ---
      // Promover para 'error' quando `npm run lint:strict` sair com 0 avisos.
      complexity: ['warn', { max: 10 }],
      'max-lines': ['warn', { max: 200, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': [
        'warn',
        { max: 50, skipBlankLines: true, skipComments: true },
      ],
      'max-depth': ['warn', { max: 3 }],
      'max-params': ['warn', { max: 4 }],
      'no-return-await': 'warn',
      eqeqeq: ['warn', 'smart'],

      // --- Seguranca (eslint-plugin-security, Fase 1: warn) ---
      ...security.configs.recommended.rules,
    },
  },
  {
    files: ['migrations/**/*.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { exports: 'writable', module: 'readonly', require: 'readonly' },
    },
    rules: {
      // migrations sao DDL declarativo: limites de tamanho nao se aplicam
      'max-lines': 'off',
      'max-lines-per-function': 'off',
    },
  },
  {
    files: ['**/*.test.js'],
    rules: {
      // suites de teste sao naturalmente longas
      'max-lines': 'off',
      'max-lines-per-function': 'off',
    },
  },
  prettier,
];
```

Calibração dos números, contra os arquivos reais do `server/src/`:

* `max-lines: 200` — o maior arquivo do backend é
  `controllers/reservationController.js` com **90 linhas**. 200 dá margem de mais
  de 2× e ainda assim impede que um controller cresça para o tamanho de
  `App.jsx`. Esperado na Fase 1: **0 avisos** no server.
* `max-lines-per-function: 50` — os handlers dos controllers têm entre ~10 e
  ~25 linhas. 50 é folgado hoje e vira trava quando BE-01 colocar transação e
  tratamento de erro de constraint dentro do handler, que é exatamente o momento
  em que a função deveria ser extraída para a camada de serviço (**CS-03**).
* `complexity: 10` — valor padrão de referência. Medir na Fase 1 e registrar.
* `eslint-plugin-security` vai muito provavelmente acusar
  `security/detect-object-injection` em acessos do tipo `obj[key]`. É uma regra
  ruidosa por natureza; **se** o relatório da Fase 1 mostrar que todos os seus
  avisos são falsos positivos, desative **essa regra específica** com
  justificativa no comentário — não o plugin inteiro, que também traz
  `detect-unsafe-regex`, `detect-non-literal-fs-filename` e
  `detect-possible-timing-attacks`.

Instalar: `npm install --save-dev eslint-plugin-security` em `server/`.

### Alterar — `client/eslint.config.js`

O arquivo tem 35 linhas. Acrescentar `eslint-plugin-jsx-a11y` e os limites de
tamanho, como **`warn`**:

```js
import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import prettierConfig from 'eslint-config-prettier';

export default [
  { ignores: ['dist', 'coverage'] },
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'jsx-a11y': jsxA11y,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'no-unused-vars': ['warn', { varsIgnorePattern: '^[A-Z_]' }],
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

      // --- Acessibilidade (OPS-03, Fase 1: warn) ---
      // Esperado acusar os 7 <label> sem htmlFor de CS-13.
      ...jsxA11y.flatConfigs.recommended.rules,

      // --- Portoes de qualidade estrutural (OPS-03, Fase 1: warn) ---
      // App.jsx tem 351 linhas: max-lines 300 acusa 1 aviso de proposito,
      // para que CS-01 (God Component) tenha numero antes e depois.
      complexity: ['warn', { max: 10 }],
      'max-lines': ['warn', { max: 300, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': [
        'warn',
        { max: 80, skipBlankLines: true, skipComments: true },
      ],
      'max-depth': ['warn', { max: 3 }],
    },
  },
  prettierConfig,
];
```

Instalar: `npm install --save-dev eslint-plugin-jsx-a11y --legacy-peer-deps` em
`client/`.

Expectativa **declarada** da Fase 1 no client, para que o número do relatório
possa ser conferido contra a previsão:

* `max-lines` em `src/App.jsx` (351 linhas) → **1 aviso**.
* `jsx-a11y/label-has-associated-control` → **até 7 avisos** (os 7 `<label>` sem
  `htmlFor` de CS-13).
* `max-lines-per-function` no componente `App` → **1 aviso** provável.

Quem implementar deve rodar `npm run lint:strict` e **colar a contagem real** no
PR. A previsão existe para ser confrontada, não para substituir a medição.

### Criar — `.github/workflows/README.md`

Uma página curta explicando as fases, para que a próxima pessoa (e o grupo da N3)
entenda por que há regra como `warn` e job com `continue-on-error`.

```markdown
# Workflows de CI do SREC

## `ci.yml`

Dispara em `push` e `pull_request` para `main` (único branch longevo — Trunk-Based
Development; ver `docs/time/`).

| Job | Nome do check | Bloqueante? |
|---|---|---|
| `backend` | `Backend — lint, formato, auditoria e testes` | **sim** |
| `frontend` | `Frontend — lint, formato e build` | **sim** |
| `docker-compose-smoke` | `Docker — build e smoke test do compose` | **sim** |
| `quality-report` | `Relatório de qualidade (não bloqueante na Fase 1)` | não (Fase 1) |

Os três primeiros são *required status checks* na proteção de `main` (ver
`docs/specs/ops-05-branch-protection-and-templates/`).

## Por que existe um job não bloqueante

As regras de ESLint de complexidade, tamanho, segurança e acessibilidade foram
introduzidas como `warn`, não `error`. O motivo e o cronograma de promoção estão
em `docs/specs/ops-03-ci-quality-gates/implementacao.md`. Resumo: ligar tudo
bloqueante no primeiro dia reprovaria `client/src/App.jsx` (351 linhas) e os 7
`<label>` sem `htmlFor`, travando todos os PRs do time por dívida pré-existente.

## Gate de cobertura

Configurado em `server/jest.config.js` (`coverageThreshold`), não no workflow —
assim `npm test` falha localmente pelo mesmo motivo que falharia na CI.

| Fase | statements | branches | functions | lines |
|---|---|---|---|---|
| Baseline recebido (medido) | 6,14 % | 0 % | 3,57 % | 6,14 % |
| Fase 1 (gate atual) | 6 % | 0 % | 3 % | 6 % |
| Fase 2 (após QA-01) | 40 % | 30 % | 40 % | 40 % |
| Fase 3 (meta N2) | 50 % | 40 % | 50 % | 50 % |

Subir limiar é PR próprio, com o relatório antes/depois no corpo.
```

### Alterar — `docs/time/divida-tecnica.md`

Registrar os itens que a Fase 1 apenas **observa** e que precisam ser fechados
antes da promoção a `error`, cada um com o número medido. Se o arquivo ainda não
existir, esta spec não o cria — abra a linha na seção de dívida do relatório de
auditoria.

## Testes

A validação de um workflow é a própria execução dele. Os casos abaixo são
verificáveis e cada um tem um "antes" medido.

### Caso 1 — `develop` sai do gatilho

```bash
grep -c 'develop' .github/workflows/ci.yml
# ANTES: 2    (linhas 5 e 7)
# DEPOIS: 0
```

### Caso 2 — o gate de cobertura reprova regressão (o teste que falha antes)

Este é o caso central. **Antes** desta spec ele não existe: `npm test` não mede
cobertura, então apagar um teste passa pela CI.

```bash
cd server
# Estado atual: 2 testes, 6,14 % de statements
npm run test:ci
# => sai 0, e imprime "Statements : 6.14% ( ... )"

# Simular regressão: remover temporariamente os 2 testes
mv src/models/reservationModel.test.js /tmp/
npm run test:ci; echo "exit=$?"
# ANTES desta spec: `npm test` -> "No tests found" ... exit=1 por outro motivo,
#   e nenhuma informação de cobertura.
# DEPOIS: Jest reprova explicitamente:
#   "Jest: "global" coverage threshold for statements (6%) not met: 0%"
#   exit=1
mv /tmp/reservationModel.test.js src/models/
```

### Caso 3 — o Postgres do job aceita conexão

Pré-requisito de QA-01. Executado no próprio job, após o serviço subir:

```bash
# dentro do job backend
psql "$DATABASE_URL" -c 'SELECT 1'   # => 1 linha
npm run migrate:up                   # => migrations aplicadas
```

### Caso 4 — as regras novas são detectadas e não bloqueiam

```bash
cd server
npm run lint;         echo "exit=$?"   # esperado: exit=0 (warn não falha)
npm run lint:strict;  echo "exit=$?"   # registra a contagem de avisos
cd ../client
npm run lint;         echo "exit=$?"   # esperado: exit=0
npm run lint:strict;  echo "exit=$?"   # esperado: exit=1 (App.jsx + a11y)
```

Aceite: `npm run lint` sai **0** nos dois pacotes (ninguém fica bloqueado) e
`lint:strict` do client sai **1** com pelo menos o aviso de `max-lines` em
`App.jsx`. A contagem exata vai no PR.

### Caso 5 — formatação verificada sem falso positivo

```bash
cd server && npm run format:check; echo "exit=$?"   # esperado: exit=0
cd ../client && npm run format:check; echo "exit=$?" # esperado: exit=0
```

Se qualquer um sair ≠ 0, rode `npm run format` e commite como
`style: aplicar prettier` **em commit separado**, antes do commit que adiciona o
`format:check`. Não misture reformatação com configuração no mesmo diff.

### Caso 6 — artefato e comentário de cobertura

Abrir o PR e verificar:

* A aba *Artifacts* da execução tem `backend-coverage-<n>` com
  `lcov-report/index.html` dentro.
* O PR tem **um** comentário com a tabela "Cobertura do backend", com o baseline
  6,14 % na primeira coluna.
* Fazer um segundo push e confirmar que o comentário é **atualizado**, não
  duplicado (é o que o marcador `<!-- srec-coverage-report -->` garante).

### Caso 7 — todos os jobs passam

| Job | Esperado |
|---|---|
| `Backend — lint, formato, auditoria e testes` | ✅ verde |
| `Frontend — lint, formato e build` | ✅ verde |
| `Docker — build e smoke test do compose` | ✅ verde |
| `Relatório de qualidade (não bloqueante na Fase 1)` | ⚠️ amarelo/neutro, **não** bloqueia |

### Comando único de verificação local

```bash
cd server  && npm ci && npm run format:check && npm run lint && npm run test:ci
cd ../client && npm ci --legacy-peer-deps && npm run format:check && npm run lint && npm run build
```

## Critérios de aceite

* [ ] `.github/workflows/ci.yml` não contém mais a string `develop`.
* [ ] Os jobs têm `name:` explícito e os nomes batem exatamente com os *required
      status checks* configurados em OPS-05.
* [ ] O job `backend` tem serviço `postgres:16-alpine` com `--health-cmd
      pg_isready` e `DATABASE_URL` apontando para `srec_test`.
* [ ] O job `backend` roda `npm run migrate:up` **e** valida o `down`.
* [ ] `server/jest.config.js` existe com `coverageThreshold` global em
      **6 / 0 / 3 / 6** (Fase 1) e o comentário que documenta as Fases 2 e 3.
* [ ] `npm run test:ci` reprova quando a cobertura cai abaixo do baseline
      (Caso 2 executado, com a saída colada no PR).
* [ ] A pasta `coverage/` é publicada como artefato com retenção de 14 dias.
* [ ] O PR recebe **um** comentário de cobertura, atualizado (não duplicado) a
      cada push.
* [ ] `npm audit --audit-level=high` roda nos dois jobs, com
      `continue-on-error: true` e comentário apontando a Fase 1.
* [ ] `format:check` existe em `server/package.json` e `client/package.json`, com
      o **mesmo glob** do `format` correspondente, e passa nos dois pacotes.
* [ ] `server/eslint.config.js` tem `complexity`, `max-lines`,
      `max-lines-per-function`, `max-depth`, `max-params` e as regras de
      `eslint-plugin-security`, **todas como `warn`**.
* [ ] `client/eslint.config.js` tem `complexity`, `max-lines`,
      `max-lines-per-function`, `max-depth` e as regras de
      `eslint-plugin-jsx-a11y`, **todas como `warn`**.
* [ ] `npm run lint` sai **0** nos dois pacotes (nenhum PR do time fica
      bloqueado por dívida pré-existente).
* [ ] `lint:strict` existe nos dois pacotes e é executado pelo job
      `quality-report`, que é `continue-on-error: true`.
* [ ] `.github/workflows/README.md` existe e documenta as três fases.
* [ ] O PR traz, com número medido: contagem de avisos de `lint:strict` no server
      e no client, nome e contagem por regra, e os 4 números de cobertura.
* [ ] PR aprovado por `@igorSeberino` (QA).

## Passo a passo TBD

```bash
# 1. Branch
git checkout main
git pull origin main
git checkout -b feature/ci-quality-gates

# 2. Garantir que a formatação já está limpa ANTES de adicionar o check
cd server  && npx prettier --check "src/**/*.js" "migrations/**/*.js" || npm run format
cd ../client && npx prettier --check "src/**/*.{js,jsx,css}" || npm run format
cd ..
git status   # se houver mudança, commitar separado:
# git commit -am "style: aplicar prettier antes de ativar o format:check"

# 3. Instalar os plugins de lint
cd server  && npm install --save-dev eslint-plugin-security
cd ../client && npm install --save-dev eslint-plugin-jsx-a11y --legacy-peer-deps
cd ..

# 4. Criar/alterar os arquivos da seção "Alterações"
#    server/jest.config.js
#    server/package.json (scripts)
#    client/package.json (scripts)
#    server/eslint.config.js
#    client/eslint.config.js
#    .github/workflows/ci.yml
#    .github/workflows/README.md

# 5. Medir — os números vão para o corpo do PR
cd server
npm run format:check
npm run lint;        echo "lint server exit=$?"
npm run lint:strict  2>&1 | tail -3
npm run test:ci      2>&1 | tail -15
cd ../client
npm run format:check
npm run lint;        echo "lint client exit=$?"
npm run lint:strict  2>&1 | tail -20
npm run build
cd ..

# 6. Caso 2 — provar que o gate de cobertura morde
cd server
mv src/models/reservationModel.test.js "$TMPDIR/"
npm run test:ci; echo "exit esperado=1, obtido=$?"
mv "$TMPDIR/reservationModel.test.js" src/models/
npm run test:ci; echo "exit esperado=0, obtido=$?"
cd ..

# 7. Validar a sintaxe do workflow antes de empurrar
#    (opcional, se houver actionlint instalado)
actionlint .github/workflows/ci.yml || true

# 8. Commits
git add server/jest.config.js server/package.json
git commit -m "ci(server): adicionar gate de cobertura no limiar do baseline medido"

git add server/eslint.config.js server/package-lock.json
git commit -m "ci(server): adicionar regras de complexidade, tamanho e seguranca como aviso"

git add client/eslint.config.js client/package.json client/package-lock.json
git commit -m "ci(client): adicionar regras de acessibilidade e tamanho como aviso"

git add .github/workflows/ci.yml
git commit -m "ci: corrigir gatilho, subir postgres e publicar cobertura no PR"

git add .github/workflows/README.md
git commit -m "docs(ci): documentar as fases de promocao dos portoes de qualidade"

# 9. Publicar
git push -u origin feature/ci-quality-gates
```

Corpo do PR (colar e **preencher os campos marcados**):

```
Fecha #<a definir>
Resolve CS-10 (MÉDIO).

## O que muda
A CI deixa de ser um verde decorativo. O gatilho para de apontar para um branch
inexistente, o job de backend passa a ter Postgres real (pré-requisito de QA-01),
a cobertura virou portão versionado e as regras de complexidade, tamanho,
segurança e acessibilidade entraram — como AVISO, de propósito.

## Antes / depois
| Métrica | Antes (medido) | Depois |
|---|---|---|
| Branches no gatilho que não existem | 1 (`develop`, ci.yml:5 e :7) | 0 |
| Jobs na CI | 2 | 4 |
| Serviços de banco na CI | 0 | 1 (postgres:16-alpine com healthcheck) |
| Gate de cobertura | 0 | 4 limiares (6/0/3/6) travando o baseline |
| Regras de qualidade estrutural (server) | 0 | <preencher> |
| Regras de qualidade estrutural (client) | 0 | <preencher> |
| Avisos de `lint:strict` no server | n/d | <preencher> |
| Avisos de `lint:strict` no client | n/d | <preencher> |
| `npm audit` na CI | não roda | roda (não bloqueante — Fase 1) |
| `prettier --check` na CI | não roda | roda (bloqueante) |
| Relatório de cobertura publicado | nunca | artefato + comentário no PR |

## Por que as regras novas entram como `warn` e não como `error`
`client/src/App.jsx` tem 351 linhas e há 7 `<label>` sem `htmlFor` (CS-13).
Ligar `max-lines` e `jsx-a11y` como `error` hoje deixaria a `main` vermelha e
bloquearia BE-01..BE-08, QA-01 e as specs de frontend por dívida que eles não
introduziram — e a reação previsível seria encher o código de
`eslint-disable`. Fases de promoção em `.github/workflows/README.md`.

## Gate de cobertura — fases
| Fase | statements | branches | functions | lines |
|---|---|---|---|---|
| Baseline recebido | 6,14 % | 0 % | 3,57 % | 6,14 % |
| Fase 1 (este PR) | 6 % | 0 % | 3 % | 6 % |
| Fase 2 (após QA-01) | 40 % | 30 % | 40 % | 40 % |
| Fase 3 (meta N2) | 50 % | 40 % | 50 % | 50 % |

## Prova de que o gate morde
<colar aqui a saída do Caso 2: "coverage threshold for statements (6%) not met: 0%">

## Para @igorSeberino (QA)
Os nomes de job deste PR são os required status checks de OPS-05:
- Backend — lint, formato, auditoria e testes
- Frontend — lint, formato e build
- Docker — build e smoke test do compose
O job "Relatório de qualidade" NÃO deve entrar na lista de obrigatórios na Fase 1.

## Rubrica
4,0 — Onboarding (2,5 pt, CS-10) + 3,0 — Processo e Git (1,5 pt)
```

## Prompt para o Claude Code

```
Implemente a spec OPS-03 deste repositório.

Leia primeiro, por inteiro:
- docs/specs/ops-03-ci-quality-gates/implementacao.md
- .github/workflows/ci.yml (as 38 linhas, inteiras)
- server/package.json e client/package.json
- server/eslint.config.js e client/eslint.config.js
- server/.prettierrc e client/.prettierrc
- client/vite.config.js (atenção às linhas 1-2, sem ponto e vírgula)
- server/src/models/reservationModel.test.js

Carregue a skill de CI/qualidade do time (.claude/skills) antes de começar.

Crie a branch feature/ci-quality-gates e execute a seção "Alterações" da spec.

Regras não negociáveis:
1. TODAS as regras novas de ESLint entram como "warn", nunca "error". O objetivo
   declarado é NÃO bloquear os PRs do time no primeiro dia. `npm run lint` tem
   que sair com código 0 nos dois pacotes depois da sua mudança — verifique.
2. O gate de cobertura em server/jest.config.js usa 6/0/3/6, que é o baseline
   medido (6,14 / 0 / 3,57 / 6,14) arredondado para baixo. NÃO coloque 80 % nem
   nenhum número aspiracional. Mantenha o comentário que documenta as Fases 2 e 3.
3. `format:check` DEVE usar exatamente o mesmo glob do script `format`
   correspondente. Não amplie para a raiz: client/vite.config.js viola o
   "semi": true do .prettierrc e faria o job falhar sem relação com este PR.
4. Se `prettier --check` já falhar antes das suas mudanças, rode `npm run format`
   e faça um commit `style: aplicar prettier antes de ativar o format:check`
   SEPARADO, antes dos outros.
5. Use actions/github-script@v7 para o comentário de cobertura. Não use action
   de terceiros.
6. `npm audit` entra com continue-on-error: true, com o comentário apontando a
   Fase 1.
7. Não escreva teste de integração nenhum (é de QA-01) e não implemente /health
   (é de BE-08). Esta spec só prepara o terreno: o serviço postgres do job e o
   step de migrate:up.
8. Se OPS-01 já estiver em main, mantenha o job docker-compose-smoke no arquivo
   novo. Se não estiver, remova esse job deste PR.

Ao terminar, rode e me mostre a saída REAL, com as CONTAGENS:
  cd server && npm ci
  npm run format:check; echo "exit=$?"
  npm run lint; echo "exit=$?"
  npm run lint:strict 2>&1 | tail -5
  npm run test:ci 2>&1 | tail -15
  mv src/models/reservationModel.test.js "$TMPDIR/" && npm run test:ci; echo "exit=$?"
  mv "$TMPDIR/reservationModel.test.js" src/models/
  cd ../client && npm ci --legacy-peer-deps
  npm run format:check; echo "exit=$?"
  npm run lint; echo "exit=$?"
  npm run lint:strict 2>&1 | tail -25
  npm run build

Depois me responda, com número medido:
- quantos avisos o lint:strict acusou no server, por regra
- quantos avisos o lint:strict acusou no client, por regra
- os 4 percentuais de cobertura
- a mensagem exata do Jest quando o gate de cobertura reprovou

Não invente nenhuma saída. Se `npm run lint` sair diferente de 0 em qualquer
pacote, você violou a regra 1: baixe a regra para warn e rode de novo.

Por fim, crie os commits com as mensagens exatas da seção "Passo a passo TBD",
nessa ordem. Não abra o PR nem rode git push.
```
