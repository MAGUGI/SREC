---
name: srec-testing
description: Use when writing or reviewing tests in the SREC project — a pirâmide adotada, o que é teste unitário e o que é integração com Supertest, como lidar com o PostgreSQL nos testes, convenção de nome e organização dos arquivos, e a regra de escrever o teste que falha antes da correção. Vale para server/ (Jest); teste de frontend exige decisão de runner em spec.
---

# Estratégia de teste do SREC

O projeto recebido tem **1 arquivo de teste, 2 casos e 6,14 % de cobertura de
statements**. Controllers, rotas e `resourceModel.js` estão em **0 %**. Branches
em **0 %** — nenhum caminho de erro é exercido.

Dois números explicam por que a N2 precisa disso antes de refatorar: sem teste,
refatorar é aposta; e a rubrica exige "melhoria comprovada", o que significa
teste vermelho antes e verde depois, não afirmação.

## A regra que vem antes de todas: vermelho primeiro

Para **todo** bug corrigido na N2:

1. Escreva o teste que reproduz o bug.
2. Rode e **veja falhar**. `cd server && npx jest <caminho>`. Guarde a saída.
3. Só então corrija.
4. Rode de novo, veja passar, e rode a suíte inteira (`npm test`).

Teste que passa de primeira contra um bug catalogado significa uma de duas
coisas: o teste não exercita o bug, ou o diagnóstico está errado. Nos dois casos,
**pare e investigue** — não "ajuste o teste até passar".

A saída do vermelho entra no corpo do PR. É a evidência de que o defeito existia,
e é o que o `qa-reviewer` exige para aprovar um PR de `fix/`. PR de `fix/` sem
teste de regressão é bloqueio: sem ele o bug volta na N3 e ninguém percebe.

## A pirâmide adotada

Deliberadamente modesta — a N2 tem prazo e um sistema de 853 linhas de JS/JSX,
não uma suite corporativa.

```
        /\        0 testes E2E
       /  \       (sem Playwright/Cypress — reengenharia, escopo da N3)
      /----\
     /      \     ~15 testes de integração (Supertest sobre app.js)
    /        \    os 10 endpoints: caminho felizmente + caminho de erro
   /----------\
  /            \  ~35 testes unitários
 /______________\ domain/ (sem mock), services/ (model mockado), middlewares/
```

Proporção alvo ao fim da N2: **cobertura de statements ≥ 70 %** e **cobertura de
branches ≥ 60 %** em `server/src`, com controllers e rotas saindo de 0 %.

Onde investir primeiro, em ordem: `domain/` (barato e sem mock) → `services/`
(onde mora a regra) → integração dos endpoints (onde estava 0 %) → `middlewares/`.

## O que é unitário

Teste unitário no SREC exercita **uma unidade sem tocar o PostgreSQL**.

| Alvo | Como | Mock |
|---|---|---|
| `src/domain/*.js` | chamada direta | **nenhum** — é código puro, é o teste mais valioso por custo |
| `src/services/*.js` | chamada direta | `jest.mock('../models/<model>')` e `jest.mock('../config/database')` |
| `src/middlewares/*.js` | `req`/`res`/`next` falsos | nenhum |
| `src/models/*.js` | chamada direta | `jest.mock('../config/database')`, como o teste existente já faz |

Teste de service precisa cobrir o **lançamento de `AppError`**, não só o caminho
felizmente:

```js
// server/tests/unit/services/reservationService.test.js
const AppError = require('../../../src/errors/AppError');

it('rejeita status fora do enum de domínio', async () => {
  await expect(reservationService.updateStatus(1, 'qualquer_coisa')).rejects.toThrow(AppError);
  await expect(reservationService.updateStatus(1, 'qualquer_coisa')).rejects.toMatchObject({ statusCode: 400 });
});
```

**Teste de fachada é proibido.** O teste recebido faz
`expect(db.query).toHaveBeenCalledTimes(1)` sem verificar **com quais parâmetros**
— ele passaria mesmo se o SQL estivesse errado. Quando você mocka `db.query`,
verifique o SQL e os parâmetros:

```js
expect(db.query).toHaveBeenCalledWith(
  expect.stringContaining('start_time < $3 AND end_time > $2'),
  [1, '2026-10-23T13:00:00.000Z', '2026-10-23T14:00:00.000Z', 'cancelled'],
);
```

## O que é integração

Teste de integração exercita **rota → controller → service → model → PostgreSQL
real**, via Supertest sobre o app Express.

`supertest@^7.2.2` **já está** em `server/devDependencies` e nenhum teste o usa.
O bloqueio é estrutural: hoje `src/index.js` cria o app e chama `listen` no mesmo
arquivo. Por isso a primeira issue de arquitetura é extrair `src/app.js` — ela
destrava a cobertura de controllers e rotas (ver
`srec-backend-architecture/references/02-arquitetura-alvo.md`, seção 1).

```js
// server/tests/integration/reservations.test.js
const request = require('supertest');
const app = require('../../src/app');
const db = require('../../src/config/database');

describe('POST /api/reservations', () => {
  afterAll(() => db.close());   // sem isso o Jest fica pendurado em handle aberto

  it('recusa reserva com término antes do início', async () => {
    const response = await request(app).post('/api/reservations').send({
      resource_id: resourceId,
      user_name: 'Adrian',
      start_time: '2026-10-23T15:00:00-03:00',
      end_time: '2026-10-23T14:00:00-03:00',
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/término/i);
  });
});
```

O que a integração precisa cobrir, no mínimo, porque é onde estavam os 0 %:

* Os **10 endpoints** no caminho felizmente.
* **400** em corpo incompleto e em `:id` não numérico (BUG-04, nas 6 rotas com `:id`).
* **404** em id inexistente.
* **409** em sobreposição de horário (BUG-01) e **400** em `end_time` antes de
  `start_time` (BUG-02).
* **400** em `status` fora do enum (BUG-03) e `type` fora do enum (BUG-10).
* **400** em `capacity` 0 ou negativo (BUG-09).
* **200** em `PUT /api/resources/:id` com corpo parcial (BUG-05).
* **409 ou 400** ao excluir recurso com reserva (BUG-06), em vez do cascade silencioso.
* **404** em rota inexistente, com corpo JSON e não HTML do Express.

## O banco nos testes

Teste de integração usa **PostgreSQL real**, não mock e não SQLite. O domínio do
SREC depende de coisa que só o Postgres faz: `EXCLUDE USING gist` com `tstzrange`
(a garantia contra dupla reserva), `TIMESTAMPTZ`, `CHECK`. Mockar o banco aqui
testaria o mock.

Regras, nesta ordem de importância:

1. **Banco separado.** `DATABASE_URL` dos testes aponta para `srec_test`, nunca
   para o banco de desenvolvimento. Configure em `server/.env.test` (não
   versionado; exemplo em `server/.env.test.example`).
2. **Migrations antes da suíte.** `npm run migrate` contra `srec_test` no
   `globalSetup`. O schema de teste é o mesmo de produção, aplicado pelo mesmo
   runner — senão o teste valida um schema que não existe.
3. **Cada teste limpa o que criou.** `TRUNCATE resources, reservations RESTART
   IDENTITY CASCADE` no `beforeEach`. Não dependa de ordem de execução nem de
   dado deixado por outro teste. `RESTART IDENTITY` importa porque as PKs são
   `SERIAL` e o teste frequentemente afirma sobre o id.
4. **Fixture explícita.** Cada teste cria o recurso de que precisa, no próprio
   `beforeEach`. Sem seed global compartilhado.
5. **`db.close()` no `afterAll`.** O pool do `pg` mantém handle aberto e o Jest
   avisa "did not exit"; pior, em CI o job pendura.
6. **Sem `jest.mock('../config/database')` em teste de integração.** Se você
   mockou o banco, é teste unitário — mova para `tests/unit/`.

Se o Postgres não estiver disponível, o teste de integração **falha**, não é
silenciosamente pulado. Suíte que pula em silêncio dá falsa segurança: foi
exatamente assim que o projeto chegou com 6,14 % de cobertura e CI verde.

## Organização e nome dos arquivos

```
server/
  tests/
    unit/
      domain/reservationStatus.test.js
      domain/timeRange.test.js
      services/reservationService.test.js
      services/resourceService.test.js
      middlewares/validateId.test.js
      models/reservationModel.test.js        ← migrado do src/
    integration/
      resources.test.js
      reservations.test.js
    helpers/
      database.js                            ← truncate, fixture, setup
    globalSetup.js
```

Convenções:

* Arquivo de teste é `<unidadeSobTeste>.test.js`, espelhando o nome do arquivo
  testado, em `tests/`.
* **Teste sai de `src/`.** `src/models/reservationModel.test.js` migra para
  `tests/unit/models/`. Teste convivendo com código de produção entra na
  contagem de LOC de fonte e polui `--collectCoverageFrom='src/**/*.js'`.
* Um `describe` por unidade, um `describe` aninhado por método/rota.
* Nome do caso em **português**, descrevendo comportamento observável, começando
  por verbo na terceira pessoa: `'recusa reserva sobreposta com 409'`,
  `'devolve 400 quando o id não é numérico'`. Não `'should work'`, não
  `'test 1'`, não `'funciona'`.
* O caso nomeia o comportamento, não a implementação: `'impede dupla reserva no
  mesmo intervalo'`, não `'chama checkAvailability'`.

Scripts a adicionar em `server/package.json`:

```json
"test": "jest",
"test:unit": "jest tests/unit",
"test:integration": "jest tests/integration --runInBand",
"test:coverage": "jest --coverage --collectCoverageFrom='src/**/*.js'"
```

`--runInBand` na integração é obrigatório: testes em paralelo truncando a mesma
tabela se atropelam.

## Frontend

Não há teste de frontend, **nem runner configurado** em `client/`. Nenhum
`vitest`, `jest`, `@testing-library/react` ou `jsdom` está instalado.

Consequência prática: **não escolha um runner no meio de uma task.** Se uma spec
pedir teste de frontend, ela precisa dizer qual runner adicionar e por quê, e
isso é decisão do Frontend com o PO. Até existir essa decisão, a verificação do
`client/` é `npm run lint` + `npm run build` + verificação manual descrita na
seção "Como testar" do PR.

## O que a CI roda

`.github/workflows/ci.yml`, Node 20:

```
server:  npm ci              → npm run lint → npm test
client:  npm ci --legacy-peer-deps → npm run lint → npm run build
```

Dois pontos de atenção:

* A CI **não** tem serviço de PostgreSQL hoje. Introduzir teste de integração
  exige adicionar `services: postgres` ao job do backend, na mesma spec — senão o
  PR passa local e quebra na CI.
* O workflow dispara em `main` e `develop`, e **`develop` não existe** neste
  repositório (só `main`, `backend`, `frontend`). É divergência catalogada da doc
  recebida; corrigir é tarefa do DevOps.

Rode tudo local antes de commitar. Descobrir na CI é desperdiçar o ciclo.
