# Métricas de Baseline — SREC recebido

Fotografia numérica do sistema no commit `8431181`, antes de qualquer
alteração da N2. É contra esta tabela que toda melhoria da entrega é medida.

Ambiente da medição: Node.js 20, Windows 11, `npm ci` limpo nos dois pacotes.

## Como reproduzir

```bash
git checkout 8431181

# Backend
cd server
npm ci
npx jest --coverage --coverageReporters=text --collectCoverageFrom='src/**/*.js'
npm run lint

# Frontend
cd ../client
npm ci --legacy-peer-deps
npm run lint
npm run build

# Volume de código fonte
find server/src client/src -type f \( -name '*.js' -o -name '*.jsx' -o -name '*.css' \) -exec wc -l {} +

# Duplicação de tratamento de erro
grep -c 'catch (err)' server/src/controllers/*.js

# Integridade e índices declarados no schema
grep -ciE 'check|unique|exclude' server/src/config/initDb.js
grep -ci 'index' server/src/config/initDb.js

# Acessibilidade de formulário
grep -c '<label>' client/src/App.jsx
```

## Armadilha na medição de cobertura

Rodar `npx jest --coverage` **sem** `--collectCoverageFrom` reporta
**35,48 %**. Esse número é falso para a pergunta que interessa: o Jest só conta
os arquivos que algum teste importou, e neste projeto são dois
(`reservationModel.js` e `database.js`). Os controllers, as rotas, o
`resourceModel` e o `index.js` simplesmente não aparecem no relatório — somem,
em vez de aparecer com zero.

Medindo contra todo o fonte, que é a pergunta real, o resultado é **6,14 %**.

Toda métrica de cobertura deste projeto, agora e no fim da N2, usa
`--collectCoverageFrom='src/**/*.js'`. Comparar números medidos de formas
diferentes é como não medir.

## Cobertura de testes, por arquivo

Saída literal do comando, backend:

```
File                       | % Stmts | % Branch | % Funcs | % Lines
---------------------------|---------|----------|---------|--------
All files                  |    6.14 |        0 |    3.57 |    6.14
 src                       |       0 |        0 |       0 |       0
  index.js                 |       0 |        0 |       0 |       0
 src/config                |   33.33 |      100 |       0 |   33.33
  database.js              |   71.42 |      100 |       0 |   71.42
  initDb.js                |       0 |      100 |       0 |       0
 src/controllers           |       0 |        0 |       0 |       0
  reservationController.js |       0 |        0 |       0 |       0
  resourceController.js    |       0 |        0 |       0 |       0
 src/models                |   14.28 |      100 |    8.33 |   14.28
  reservationModel.js      |      25 |      100 |   14.28 |      25
  resourceModel.js         |       0 |      100 |       0 |       0
 src/routes                |       0 |      100 |     100 |       0
  reservationRoutes.js     |       0 |      100 |     100 |       0
  resourceRoutes.js        |       0 |      100 |     100 |       0

Test Suites: 1 passed, 1 total
Tests:       2 passed, 2 total
```

Leitura: **0 % de branches em todo o projeto.** Nenhuma decisão do código é
exercitada por teste. Os dois testes que existem cobrem uma função
(`checkAvailability`) com o módulo de banco mockado — e, como o mock controla
o retorno, o que é testado é que a função chama `db.query` uma vez e interpreta
o resultado, não que a regra de sobreposição esteja correta. O teste passaria
com a fórmula errada.

## Tabela consolidada

| # | Métrica | Baseline | Meta da N2 | Fim da N2 |
|---|---|---|---|---|
| M-01 | Cobertura de statements, backend | **6,14 %** | ≥ 70 % | *a medir* |
| M-02 | Cobertura de branches, backend | **0 %** | ≥ 60 % | *a medir* |
| M-03 | Cobertura de funções, backend | **3,57 %** | ≥ 75 % | *a medir* |
| M-04 | Arquivos de teste | **1** | ≥ 8 | *a medir* |
| M-05 | Casos de teste | **2** | ≥ 60 | *a medir* |
| M-06 | Cobertura dos controllers | **0 %** | ≥ 80 % | *a medir* |
| M-07 | Cobertura das rotas | **0 %** | 100 % | *a medir* |
| M-08 | Endpoints exercitados por teste | **0 de 10** | 10 de 10 | *a medir* |
| M-09 | Erros de ESLint, server | **0** | 0 | *a medir* |
| M-10 | Erros de ESLint, client | **0** | 0 | *a medir* |
| M-11 | Regras de qualidade no ESLint | **0** | ≥ 6 | *a medir* |
| M-12 | Bugs CRÍTICO abertos | **2** | 0 | *a medir* |
| M-13 | Bugs ALTO abertos | **5** | 0 | *a medir* |
| M-14 | Bugs MÉDIO abertos | **5** | ≤ 1 | *a medir* |
| M-15 | Bugs BAIXO abertos | **3** | ≤ 1 | *a medir* |
| M-16 | Code smells ALTO abertos | **4** | 0 | *a medir* |
| M-17 | Blocos `try/catch` duplicados | **10** | 0 | *a medir* |
| M-18 | Maior arquivo `.jsx`, em linhas | **351** | ≤ 120 | *a medir* |
| M-19 | Linhas de `App.jsx` | **351** | ≤ 60 | *a medir* |
| M-20 | Constraints de integridade no schema | **0** | ≥ 4 | *a medir* |
| M-21 | Índices além das PKs | **0** | ≥ 2 | *a medir* |
| M-22 | Migrations versionadas | **0** | ≥ 5 | *a medir* |
| M-23 | Passos manuais para subir o sistema | **7** | 1 | *a medir* |
| M-24 | Endpoints documentados vs implementados | **5 de 10** | 10 de 10 | *a medir* |
| M-25 | Divergências doc vs código | **12** | 0 | *a medir* |
| M-26 | `<label>` sem `htmlFor` | **7** | 0 | *a medir* |
| M-27 | Supressões `eslint-disable` | **2** | 0 | *a medir* |
| M-28 | Arquivos placeholder de 0 byte | **3** | 0 | *a medir* |
| M-29 | Testes de frontend | **0** | ≥ 1 | *a medir* |

A coluna "Fim da N2" é preenchida por
[QA-04](../specs/qa-04-before-after-report/implementacao.md) e vira o material
central do pitch.

### Por que as metas são essas

**70 % de cobertura de statements e 60 % de branches** não é número redondo
escolhido por estética. É o que cobre os 10 endpoints com caminho feliz e
caminho de erro, mais as regras de domínio, deixando de fora o que não vale o
custo: `index.js`, bootstrap e configuração. Mirar em 90 % nesta entrega
levaria o time a escrever teste de getter para inflar número, que é
exatamente o vício que a disciplina quer ensinar a evitar.

**Zero bugs CRÍTICO e ALTO** não é negociável: são sete defeitos e todos têm
spec. Um MÉDIO e um BAIXO podem sobrar como débito declarado, desde que
registrados no handoff com justificativa.

**`App.jsx` abaixo de 60 linhas** sai da conta da FE-01: sobram o layout da
página e a orquestração das abas, e tudo mais vira componente.

**Um passo para subir o sistema** contra os sete atuais do README: instalar
PostgreSQL, criar o banco, copiar o `.env`, `cd server`, `npm install`,
`cd client`, `npm install --legacy-peer-deps`. Com OPS-01, vira
`docker compose up`.

## Volume de código

| Escopo | Linhas |
|---|---|
| Total de fonte (js, jsx, css) | **1.280** |
| JS e JSX | **853** |
| `client/src/App.jsx` | **351** (41 % do JS/JSX) |
| `client/src/index.css` + `App.css` | 427 |
| `server/src/` inteiro | 370 |
| Testes | 38 |

O backend inteiro tem 370 linhas — **menos que o `App.jsx` sozinho**. Serve de
contrapeso quando alguém propuser "reescrever o frontend do zero, que é
pequeno": não é pequeno em relação ao resto do sistema.

## Processo e histórico

| Métrica | Baseline |
|---|---|
| Commits no repositório recebido | 10 |
| Pull requests | 2, ambos mergeados |
| Issues | 0 |
| Branches | 3 (`main`, `backend`, `frontend`) |
| Branch `develop` referenciada pela CI e pelo guia | **não existe** |
| Workflows de CI | 1, com 2 jobs |
| Templates de issue ou PR | 0 |
| `CODEOWNERS` | não existe |
| Proteção de branch em `main` | não configurada |
