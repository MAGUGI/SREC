# BE-05 — Devolver códigos HTTP corretos para erro do cliente

* **Responsável:** Adrian Cesar Gonçalves (Desenvolvedor Backend)
* **Issue:** #<a definir>
* **Branch:** `fix/proper-http-status-codes`
* **Rubrica:** 4,0 — Onboarding e diagnóstico → 2,5 (melhoria comprovada do código recebido: BUG-04 e BUG-05, ambos ALTO); 3,0 — Processo, Git & Documentação → 1,5 (PR pequeno, revisado pelo QA)
* **Depende de:** BE-04 (classe `AppError`, wrapper `asyncHandler` e middleware central de erro)

## Problema

Dois defeitos distintos, de mesma causa: o `catch` genérico dos controllers trata
**erro do cliente** como **falha do servidor**.

### (a) BUG-04 — ID não numérico devolve 500 (deveria ser 400)

Os controllers repassam `req.params.id` cru para o model, que o entrega ao
Postgres como parâmetro de uma coluna `integer`:

* `server/src/controllers/resourceController.js:30-31` — `const { id } = req.params; const resource = await ResourceModel.findById(id);`
* `server/src/models/resourceModel.js:21-22` — `SELECT * FROM resources WHERE id = $1`

Com `id = 'abc'`, o Postgres levanta `invalid input syntax for type integer: "abc"`
(SQLSTATE **22P02**). O `catch` em `resourceController.js:36-39` não distingue nada:

```js
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Internal server error' });
    }
```

O cliente mandou uma requisição malformada e recebe "o servidor falhou". Isso
atinge as **6 rotas com `:id`**:

| Rota | Arquivo:linha |
|---|---|
| `GET /api/resources/:id` | `server/src/routes/resourceRoutes.js:7` |
| `PUT /api/resources/:id` | `server/src/routes/resourceRoutes.js:8` |
| `DELETE /api/resources/:id` | `server/src/routes/resourceRoutes.js:9` |
| `GET /api/reservations/:id` | `server/src/routes/reservationRoutes.js:7` |
| `PATCH /api/reservations/:id/status` | `server/src/routes/reservationRoutes.js:8` |
| `DELETE /api/reservations/:id` | `server/src/routes/reservationRoutes.js:9` |

### (b) BUG-05 — `PUT` com corpo parcial devolve 500 (deveria ser 400)

`server/src/controllers/resourceController.js:44-46` desestrutura os três campos
e os passa adiante sem verificar presença:

```js
      const { id } = req.params;
      const { name, type, capacity } = req.body;
      const updatedResource = await ResourceModel.update(id, name, type, capacity);
```

E `server/src/models/resourceModel.js:26-35` grava os três **sempre**:

```js
  async update(id, name, type, capacity) {
    const query = `
      UPDATE resources
      SET name = $1, type = $2, capacity = $3, updated_at = CURRENT_TIMESTAMP
      WHERE id = $4
      RETURNING *;
    `;
    const result = await db.query(query, [name, type, capacity, id]);
```

Com o corpo `{"capacity": 4}`, `name` e `type` são `undefined`; o driver `pg`
converte `undefined` em `NULL`; as colunas `name VARCHAR(100) NOT NULL` e
`type VARCHAR(50) NOT NULL` (`server/src/config/initDb.js:7-8`) rejeitam com
`null value in column "name" violates not-null constraint` (SQLSTATE **23502**).
Resultado: 500. Pior — se as colunas fossem anuláveis, o `PUT` parcial
**apagaria dados** silenciosamente. O schema é a única coisa que hoje impede
perda de dado, e ele impede ao custo de um 500.

Observação de escopo: `PUT /api/resources/:id` é hoje órfão no frontend (BUG-15,
nenhuma tela chama), mas existe e está publicado em `client/src/services/api.js:24-35`.
Rota publicada é contrato; corrigir aqui é mais barato que descobrir na N3.

## Evidência

Reprodução, com o servidor em `http://localhost:5000` e ao menos um recurso
cadastrado:

```bash
# (a) BUG-04 — esperado 400, obtido 500
curl -i -s -o /dev/null -w '%{http_code}\n' http://localhost:5000/api/resources/abc
# 500

curl -i -s -o /dev/null -w '%{http_code}\n' -X DELETE http://localhost:5000/api/reservations/xyz
# 500

# (b) BUG-05 — esperado 400 (ou 200 com atualização parcial), obtido 500
curl -i -s -o /dev/null -w '%{http_code}\n' \
  -X PUT http://localhost:5000/api/resources/1 \
  -H 'Content-Type: application/json' \
  -d '{"capacity": 4}'
# 500
```

Confirmação do SQLSTATE direto no banco:

```bash
psql "$DATABASE_URL" -c "SELECT * FROM resources WHERE id = 'abc';"
# ERROR:  invalid input syntax for type integer: "abc"   (SQLSTATE 22P02)
```

Números medidos no código recebido (ver `docs/auditoria/`):

| Métrica | Antes |
|---|---|
| Rotas com `:id` que devolvem 400 para ID não numérico | **0 de 6** |
| Rotas com `:id` que devolvem 500 para ID não numérico | **6 de 6** |
| `PUT /api/resources/:id` com 1 dos 3 campos | **500** |
| Cobertura de statements das rotas | **0 %** |
| Cobertura de statements dos controllers | **0 %** |
| Casos de teste no repositório | **2** |

## Decisão

**1. Um middleware `validateIdParam(paramName)` aplicado nas 6 rotas, e não uma
verificação dentro de cada controller.**

A alternativa óbvia é `if (Number.isNaN(Number(id))) return res.status(400)...`
no começo de cada handler. Recusada: são 6 handlers, o que repete a mesma regra
6 vezes e repete exatamente o smell CS-02 (10 blocos `try/catch` idênticos) numa
roupa nova. O middleware também é a única forma de **registrar a regra na rota**,
onde ela é visível em 1 linha de leitura, e a única forma de testá-la sem subir
controller nem banco.

Alternativa também considerada e recusada: restringir o parâmetro no padrão da
rota (`router.get('/:id(\\d+)', ...)`). Em Express 5 o roteador passou a usar
`path-to-regexp` 8, que **removeu** o sufixo de regex em parâmetros — a sintaxe
`:id(\\d+)` não é mais suportada e levanta erro na montagem da rota. Além disso,
um padrão que não casa produz **404**, não 400, o que mentiria sobre a causa.

**2. `validateIdParam` publica o valor convertido em `req.validated`, não em
`req.params`.**

Mutar `req.params[name]` funciona hoje, mas o roteador do Express reatribui
`req.params` por camada ao resolver a rota; depender disso é depender de detalhe
interno. `req.validated` é explícito, não colide com nada e deixa claro no
controller de onde veio o inteiro.

**3. `COALESCE($n, coluna)` no `ResourceModel.update`, e não `UPDATE` montado
dinamicamente.**

Justificativa: são **3 colunas atualizáveis** (`name`, `type`, `capacity`). O
builder dinâmico troca 1 statement fixo e parametrizado por um laço que concatena
nome de coluna e índice de placeholder — mais código, um caminho novo por
combinação de campos (2³ − 1 = **7 combinações**) e uma superfície de
concatenação de SQL que precisa de allowlist de colunas para não virar injeção.
Nada disso se paga para três colunas.

`COALESCE` tem um custo honesto: fica impossível gravar `NULL` explicitamente.
Aqui esse custo é **zero** — as três colunas são `NOT NULL` (`initDb.js:7-9`),
então "limpar o campo" nunca foi uma operação válida. Registro a regra: **se uma
coluna anulável com semântica de "limpar" aparecer, `COALESCE` deixa de servir e
a troca para atualização dinâmica volta à mesa.** Está anotado em
`docs/time/divida-tecnica.md`.

**4. Corpo vazio no `PUT` é 400, não 200 silencioso.**

`PUT /api/resources/1` com `{}` não tem o que atualizar. Com `COALESCE` isso
viraria um `UPDATE` que só mexe em `updated_at` e devolveria 200 — resposta de
sucesso para uma requisição sem sentido. O serviço rejeita com 400 antes de
chegar ao banco.

**5. A tradução de SQLSTATE 22P02 e 23502 continua existindo no middleware de
erro de BE-04, como rede de segurança.**

Este PR elimina as duas causas conhecidas. O mapa de SQLSTATE de BE-04 cobre o
caso desconhecido (por exemplo, um `resource_id` não numérico vindo do corpo),
para que nenhum erro de entrada volte a sair como 500. Isso é defesa em
profundidade, não duplicação: a validação dá a mensagem específica do campo, o
mapa dá a classe correta.

## Alterações

Assinatura de `AppError` assumida aqui, definida em BE-04:
`new AppError(statusCode, code, message, details?)`. Se BE-04 fixar assinatura
diferente, **a de BE-04 vence** e estas chamadas se ajustam a ela.

### 1. Criar `server/src/middlewares/validateIdParam.js`

```js
const AppError = require('../errors/AppError');

// Postgres `integer` upper bound. Beyond it the database raises 22003
// (numeric value out of range), which is also a client error, not a 500.
const MAX_PG_INTEGER = 2147483647;
const POSITIVE_INTEGER = /^[1-9][0-9]{0,9}$/;

/**
 * Validates a numeric route parameter before it reaches the data layer.
 *
 * Without this, values such as `/api/resources/abc` reach Postgres and raise
 * SQLSTATE 22P02 (invalid input syntax for type integer), which the generic
 * controller catch translated into HTTP 500 (BUG-04).
 *
 * The parsed integer is published on `req.validated` instead of mutating
 * `req.params`, because the router reassigns `req.params` per layer.
 *
 * @param {string} paramName route parameter to validate, defaults to 'id'
 * @returns {import('express').RequestHandler}
 */
function validateIdParam(paramName = 'id') {
  return function validateIdParamMiddleware(req, _res, next) {
    const raw = req.params[paramName];

    if (typeof raw !== 'string' || !POSITIVE_INTEGER.test(raw)) {
      return next(
        new AppError(
          400,
          'INVALID_ID_PARAM',
          `O parâmetro de rota "${paramName}" deve ser um número inteiro positivo.`,
          { param: paramName, received: raw },
        ),
      );
    }

    const value = Number(raw);

    if (value > MAX_PG_INTEGER) {
      return next(
        new AppError(
          400,
          'INVALID_ID_PARAM',
          `O parâmetro de rota "${paramName}" excede o maior identificador possível (${MAX_PG_INTEGER}).`,
          { param: paramName, received: raw },
        ),
      );
    }

    req.validated = req.validated || {};
    req.validated[paramName] = value;

    return next();
  };
}

module.exports = validateIdParam;
```

### 2. Alterar `server/src/routes/resourceRoutes.js`

Aplicar o middleware nas 3 rotas com `:id` (linhas 7-9 hoje).

```js
const express = require('express');
const router = express.Router();
const ResourceController = require('../controllers/resourceController');
const validateIdParam = require('../middlewares/validateIdParam');

router.post('/', ResourceController.createResource);
router.get('/', ResourceController.getAllResources);
router.get('/:id', validateIdParam('id'), ResourceController.getResourceById);
router.put('/:id', validateIdParam('id'), ResourceController.updateResource);
router.delete('/:id', validateIdParam('id'), ResourceController.deleteResource);

module.exports = router;
```

### 3. Alterar `server/src/routes/reservationRoutes.js`

Mesma aplicação nas 3 rotas com `:id` (linhas 7-9 hoje).

```js
const express = require('express');
const router = express.Router();
const ReservationController = require('../controllers/reservationController');
const validateIdParam = require('../middlewares/validateIdParam');

router.post('/', ReservationController.createReservation);
router.get('/', ReservationController.getAllReservations);
router.get('/:id', validateIdParam('id'), ReservationController.getReservationById);
router.patch('/:id/status', validateIdParam('id'), ReservationController.updateReservationStatus);
router.delete('/:id', validateIdParam('id'), ReservationController.deleteReservation);

module.exports = router;
```

### 4. Alterar `server/src/models/resourceModel.js`

Trocar `update(id, name, type, capacity)` por `update(id, fields)` com
`COALESCE`. O model continua sendo **só acesso a dados**: normaliza `undefined`
para `null` e nada mais.

```js
  /**
   * Partial update. Each column keeps its current value when the matching
   * parameter is null, so a payload carrying a single field no longer writes
   * NULL into NOT NULL columns (BUG-05).
   *
   * @param {number} id
   * @param {{ name?: string, type?: string, capacity?: number }} fields
   */
  async update(id, fields) {
    const query = `
      UPDATE resources
      SET name       = COALESCE($1, name),
          type       = COALESCE($2, type),
          capacity   = COALESCE($3, capacity),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $4
      RETURNING *;
    `;
    const params = [
      fields.name ?? null,
      fields.type ?? null,
      fields.capacity ?? null,
      id,
    ];
    const result = await db.query(query, params);
    return result.rows[0];
  },
```

### 5. Alterar `server/src/controllers/resourceController.js`

Os handlers passam a ler `req.validated.id` e a montar o objeto parcial.
`asyncHandler` e `AppError` vêm de BE-04.

```js
const ResourceModel = require('../models/resourceModel');
const AppError = require('../errors/AppError');
const asyncHandler = require('../middlewares/asyncHandler');

const UPDATABLE_FIELDS = ['name', 'type', 'capacity'];

const ResourceController = {
  getResourceById: asyncHandler(async (req, res) => {
    const resource = await ResourceModel.findById(req.validated.id);
    if (!resource) {
      throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Recurso não encontrado.');
    }
    res.json(resource);
  }),

  updateResource: asyncHandler(async (req, res) => {
    const fields = {};
    for (const field of UPDATABLE_FIELDS) {
      if (req.body[field] !== undefined) {
        fields[field] = req.body[field];
      }
    }

    if (Object.keys(fields).length === 0) {
      throw new AppError(
        400,
        'EMPTY_UPDATE',
        `Informe ao menos um campo para atualizar: ${UPDATABLE_FIELDS.join(', ')}.`,
      );
    }

    if (fields.name !== undefined && String(fields.name).trim() === '') {
      throw new AppError(400, 'INVALID_NAME', 'O campo "name" não pode ser vazio.');
    }

    const updated = await ResourceModel.update(req.validated.id, fields);
    if (!updated) {
      throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Recurso não encontrado.');
    }
    res.json(updated);
  }),

  deleteResource: asyncHandler(async (req, res) => {
    const deleted = await ResourceModel.delete(req.validated.id);
    if (!deleted) {
      throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Recurso não encontrado.');
    }
    res.json({ message: 'Recurso removido com sucesso.' });
  }),
};
```

> Se BE-06 (camada de serviço) for integrada antes deste PR, a montagem de
> `fields` e as duas validações migram para `resourceService.update` e o
> controller fica só com `res.json(await ResourceService.update(id, req.body))`.
> A regra é a mesma; muda o endereço. Resolver no rebase, sem reescrever a regra
> duas vezes.

### 6. Alterar `server/src/controllers/reservationController.js`

Os 3 handlers com `:id` (`getReservationById`, `updateReservationStatus`,
`deleteReservation`, hoje em `reservationController.js:46-87`) passam a ler
`req.validated.id` em vez de `req.params.id`. A validação do valor de `status`
é escopo de BE-03 e **não** entra neste PR.

### 7. Criar `server/src/middlewares/validateIdParam.test.js`

### 8. Criar `server/src/models/resourceModel.test.js`

### 9. Alterar `docs/arquitetura/contrato-api.md`

Registrar que as 6 rotas com `:id` respondem **400 `INVALID_ID_PARAM`** para
identificador não inteiro e que `PUT /api/resources/:id` aceita corpo parcial
(1, 2 ou 3 campos) e responde **400 `EMPTY_UPDATE`** para corpo vazio.

## Testes

Os dois primeiros casos de cada bloco **falham antes** da correção.

### `server/src/middlewares/validateIdParam.test.js`

Teste de integração HTTP sem banco: monta um app Express mínimo com o
middleware, um handler que ecoa `req.validated` e o middleware de erro de BE-04.

```js
const express = require('express');
const request = require('supertest');

const validateIdParam = require('./validateIdParam');
const errorHandler = require('./errorHandler'); // BE-04

function buildApp() {
  const app = express();
  app.get('/items/:id', validateIdParam('id'), (req, res) => {
    res.json({ id: req.validated.id, type: typeof req.validated.id });
  });
  app.use(errorHandler);
  return app;
}

describe('validateIdParam', () => {
  const app = buildApp();

  // FALHA ANTES DA CORREÇÃO: hoje 'abc' chega ao Postgres e o catch devolve 500.
  it('deve responder 400 para id não numérico', async () => {
    const res = await request(app).get('/items/abc');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_ID_PARAM');
  });

  it.each(['0', '-1', '1.5', '1e3', ' 1', '01'])(
    'deve responder 400 para o id inválido "%s"',
    async (value) => {
      const res = await request(app).get(`/items/${encodeURIComponent(value)}`);
      expect(res.status).toBe(400);
    },
  );

  it('deve responder 400 para id acima do limite de integer do Postgres', async () => {
    const res = await request(app).get('/items/2147483648');
    expect(res.status).toBe(400);
  });

  it('deve aceitar id inteiro positivo e convertê-lo para number', async () => {
    const res = await request(app).get('/items/42');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: 42, type: 'number' });
  });
});
```

### `server/src/models/resourceModel.test.js`

Model com `db` mockado, no mesmo padrão do único teste existente
(`server/src/models/reservationModel.test.js:1-4`).

```js
const ResourceModel = require('./resourceModel');
const db = require('../config/database');

jest.mock('../config/database');

describe('ResourceModel.update', () => {
  afterEach(() => jest.clearAllMocks());

  // FALHA ANTES DA CORREÇÃO: hoje name/type/capacity ausentes viram NULL.
  it('deve preservar as colunas ausentes usando COALESCE', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 1, capacity: 4 }] });

    await ResourceModel.update(1, { capacity: 4 });

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('COALESCE($1, name)');
    expect(sql).toContain('COALESCE($2, type)');
    expect(sql).toContain('COALESCE($3, capacity)');
    expect(params).toEqual([null, null, 4, 1]);
  });

  it('deve enviar os três campos quando todos vierem no payload', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });

    await ResourceModel.update(1, { name: 'Sala 1', type: 'meeting_room', capacity: 8 });

    expect(db.query.mock.calls[0][1]).toEqual(['Sala 1', 'meeting_room', 8, 1]);
  });

  it('deve devolver undefined quando nenhuma linha for afetada', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    await expect(ResourceModel.update(999, { capacity: 2 })).resolves.toBeUndefined();
  });
});
```

### `server/src/controllers/resourceController.test.js`

Controller com o model mockado, cobrindo `EMPTY_UPDATE` (400), `INVALID_NAME`
(400), 404 e 200 com corpo parcial.

Comando:

```bash
cd server
npm ci
npx jest --coverage --coverageReporters=text --collectCoverageFrom='src/**/*.js'
```

## Critérios de aceite

* [ ] As **6** rotas com `:id` respondem **400** para `abc`, `0`, `-1`, `1.5`
      e `2147483648`; nenhuma responde 500. Verificado com os `curl` da seção
      Evidência (antes: 0 de 6 corretas; depois: 6 de 6).
* [ ] O corpo do 400 segue o formato de erro de BE-04 e traz
      `code: "INVALID_ID_PARAM"`.
* [ ] `PUT /api/resources/:id` com `{"capacity": 4}` responde **200** e o
      recurso mantém `name` e `type` anteriores (antes: 500).
* [ ] `PUT /api/resources/:id` com `{}` responde **400 `EMPTY_UPDATE`**.
* [ ] `PUT /api/resources/:id` com `{"name": "  "}` responde **400 `INVALID_NAME`**.
* [ ] `PUT /api/resources/999999` (inexistente) responde **404**.
* [ ] `ResourceModel.update` não aparece mais em nenhum lugar com a assinatura
      de 4 argumentos posicionais: `grep -rn "ResourceModel.update(" server/src`
      retorna somente a chamada com `(id, fields)`.
* [ ] Cobertura de `src/middlewares/validateIdParam.js` = **100 %** de
      statements e branches (antes: arquivo não existia).
* [ ] Cobertura de `src/models/resourceModel.js` ≥ **80 %** de statements
      (antes: **0 %**).
* [ ] Casos de teste no backend ≥ **14** (antes: **2**); arquivos de teste ≥ **4**
      (antes: **1**).
* [ ] `npm run lint` no `server/` continua com **0** erros.
* [ ] PR com **1 aprovação** de Igor Seberino (`@igorSeberino`, QA) e CI verde.

## Passo a passo TBD

```bash
# 1. Partir de main atualizada
git checkout main
git pull origin main
git checkout -b fix/proper-http-status-codes

# 2. Confirmar que BE-04 já está em main (AppError, asyncHandler, errorHandler)
ls server/src/errors/AppError.js server/src/middlewares/asyncHandler.js \
   server/src/middlewares/errorHandler.js
#    Se faltar, pare: esta branch depende de BE-04 integrada.

# 3. Implementar
#    - criar  server/src/middlewares/validateIdParam.js
#    - alterar server/src/routes/resourceRoutes.js
#    - alterar server/src/routes/reservationRoutes.js
#    - alterar server/src/models/resourceModel.js        (update com COALESCE)
#    - alterar server/src/controllers/resourceController.js
#    - alterar server/src/controllers/reservationController.js  (req.validated.id)

# 4. Escrever os testes
#    - server/src/middlewares/validateIdParam.test.js
#    - server/src/models/resourceModel.test.js
#    - server/src/controllers/resourceController.test.js

# 5. Rodar a suíte e o lint
cd server
npx jest --coverage --coverageReporters=text --collectCoverageFrom='src/**/*.js'
npm run lint
cd ..

# 6. Validar à mão com o servidor de pé (outro terminal: cd server && npm run dev)
curl -s -o /dev/null -w 'id invalido: %{http_code}\n' http://localhost:5000/api/resources/abc
curl -s -o /dev/null -w 'put parcial: %{http_code}\n' -X PUT \
  http://localhost:5000/api/resources/1 -H 'Content-Type: application/json' -d '{"capacity":4}'
curl -s -o /dev/null -w 'put vazio:   %{http_code}\n' -X PUT \
  http://localhost:5000/api/resources/1 -H 'Content-Type: application/json' -d '{}'
# esperado: 400 / 200 / 400

# 7. Commits
git add server/src/middlewares/validateIdParam.js server/src/routes
git commit -m "fix(api): validar id de rota e responder 400 para identificador invalido"

git add server/src/models/resourceModel.js server/src/controllers
git commit -m "fix(resources): aceitar atualizacao parcial sem violar restricao NOT NULL"

git add server/src/**/*.test.js
git commit -m "test(api): cobrir 400 de id invalido e PUT parcial de recurso"

git add docs/arquitetura/contrato-api.md docs/specs/be-05-proper-http-status-codes
git commit -m "docs(api): documentar 400 de id invalido e corpo parcial no PUT de recurso"

# 8. PR
git push -u origin fix/proper-http-status-codes
#    Abrir PR para main, título:
#      "fix(api): devolver 400 em vez de 500 para id invalido e PUT parcial"
#    Descrição: link para docs/specs/be-05-proper-http-status-codes/implementacao.md,
#    tabela antes/depois dos códigos HTTP e saída do jest --coverage.
#    Revisor obrigatório: @igorSeberino (QA).
```

## Prompt para o Claude Code

```text
Você está na raiz do repositório igorSeberino/srec, na branch
fix/proper-http-status-codes. Carregue antes de começar:

  - docs/specs/be-05-proper-http-status-codes/implementacao.md  (esta spec)
  - docs/specs/be-04-centralized-error-handling/implementacao.md (dependência)
  - a skill de arquitetura de backend do repositório, em .claude/skills/
  - CLAUDE.md

Tarefa: corrigir BUG-04 e BUG-05 implementando exatamente o que está na seção
"Alterações" da spec BE-05. Nada além disso — este PR é pequeno de propósito.

Restrições:
  - Node 20, Express 5, PostgreSQL com `pg` e SQL cru, CommonJS. Não introduza
    ORM, não introduza biblioteca de validação, não mexa no client/.
  - Reutilize AppError, asyncHandler e o middleware de erro de BE-04; não crie
    um segundo mecanismo de erro.
  - Em Express 5 não existe `:id(\\d+)`: a validação é middleware.
  - `validateIdParam` publica em `req.validated`, nunca muta `req.params`.
  - `ResourceModel.update` usa COALESCE por coluna; o model não valida nada.
  - BE-03 (enum de status) não é deste PR: não toque na validação de `status`.

Escreva os testes antes da correção e me mostre a saída do jest com os dois
testes vermelhos (400 esperado / 500 obtido) antes de corrigir. Depois corrija,
rode de novo e me mostre:
  - jest --coverage (tabela completa)
  - npm run lint do server
  - os 3 curl da seção "Passo a passo TBD", item 6

Por fim, proponha as 4 mensagens de commit do item 7 sem executar nenhum
comando git.
```
