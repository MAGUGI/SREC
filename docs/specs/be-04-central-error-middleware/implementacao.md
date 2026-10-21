# BE-04 — Middleware central de erro

* **Responsável:** Adrian Cesar Gonçalves (Desenvolvedor Backend)
* **Issue:** #<a definir>
* **Branch:** `refactor/central-error-middleware`
* **Rubrica:** Onboarding e diagnóstico → 2,5 pt (melhoria comprovada do código recebido: resolução do CS-02, severidade ALTO, e correção colateral do BUG-04, severidade ALTO)
* **Depende de:** BE-01, BE-02 e BE-03 — este PR reescreve os dois controllers por inteiro. Fazê-lo antes geraria conflito de merge em todas as outras branches. É o **último** PR do lote de backend.

## Problema

### CS-02 — 10 blocos `try/catch` idênticos

Os dois controllers repetem, método a método, exatamente o mesmo bloco:

```js
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Internal server error' });
    }
```

Ocorrências, verificadas linha a linha:

| Arquivo | Linhas do `catch` |
|---|---|
| `server/src/controllers/resourceController.js` | 12-15, 22-25, 36-39, 51-54, 65-68 |
| `server/src/controllers/reservationController.js` | 30-33, 40-43, 54-57, 69-72, 83-86 |

São **10 blocos**. Contando o `try {` que abre cada um, são **50 linhas** de
código de tratamento de erro — todas iguais, nenhuma com uma única linha de
diferença. Em `resourceController.js`, 25 das 72 linhas do arquivo (35 %) são
*boilerplate* de erro. Em `reservationController.js`, 25 das 90 (28 %).

O custo não é estético. É que **qualquer mudança na política de erro exige 10
edições coordenadas**. A BE-01 já teve de abrir uma exceção dentro de um
desses blocos (a tradução do SQLSTATE `23P01` em 409); a BE-02 e a BE-03
precisariam das suas. Cada nova regra multiplica por 10.

### BUG-04 — tudo que não é 404 vira 500

O `catch` genérico não distingue erro do cliente de erro do servidor. O
exemplo mais visível é o **BUG-04**: `GET /api/resources/abc` faz o
PostgreSQL recusar `abc` como `integer` com SQLSTATE `22P02`
(`invalid_text_representation`). O erro é do cliente — mandou um ID que não é
número — mas a resposta é **500 "Internal server error"**. Vale para as **6
rotas com `:id`**:

```
GET    /api/resources/:id      PUT    /api/resources/:id      DELETE /api/resources/:id
GET    /api/reservations/:id   PATCH  /api/reservations/:id/status
DELETE /api/reservations/:id
```

O mesmo vale para `resource_id` apontando para um recurso inexistente
(`23503`, violação de chave estrangeira — deveria ser 409) e para as três
constraints criadas por BE-01, BE-02 e BE-03.

### O log também está errado

`console.error(err)` despeja o objeto `Error` inteiro no stdout, sem
timestamp, sem rota, sem método, sem correlação. Dez chamadas idênticas
produzem dez despejos que ninguém consegue filtrar. E não há garantia alguma
no código de que a stack não acabe no corpo da resposta — hoje não acaba por
acidente, porque o corpo é uma string fixa, não por decisão.

## Evidência

Contagem reproduzível, no código recebido:

```bash
cd server
grep -c 'catch (err)' src/controllers/*.js
# src/controllers/reservationController.js:5
# src/controllers/resourceController.js:5

grep -rc "console.error(err);" src/controllers/
# 10 no total

grep -rc "Internal server error" src/controllers/
# 10 no total
```

BUG-04, com o servidor de pé:

```bash
curl -i http://localhost:5000/api/resources/abc
# código recebido: HTTP/1.1 500 Internal Server Error
#                  {"error":"Internal server error"}
```

Números da auditoria:

| Métrica | Valor no código recebido |
|---|---|
| Blocos `try/catch` idênticos nos controllers | **10** (5 por controller) |
| Linhas de tratamento de erro duplicadas | **50** |
| Middlewares de erro registrados | **0** |
| Pontos de log de erro | **10** |
| Mapeamentos de SQLSTATE para HTTP | **0** |
| Cobertura dos controllers | **0 %** |

## Decisão

**Centralizar o tratamento de erro em um middleware único, registrado por
último, e fazer os controllers só lançarem.**

Quatro peças, nenhuma com dependência nova:

1. **`AppError`** — erro de aplicação que carrega `statusCode` e `code`. Um
   controller que precise responder 404 lança `AppError.notFound(...)` em vez
   de montar a resposta. A decisão de "o que é" fica no controller; a de
   "como se escreve na resposta" fica no middleware.
2. **`asyncHandler`** — embrulha o handler e encaminha a promessa rejeitada
   para o `next`.
3. **`errorHandler`** — middleware de 4 argumentos, registrado por último em
   `index.js`. Traduz `AppError`, depois o nome da *constraint*, depois o
   SQLSTATE, e cai num 500 genérico para o resto.
4. **`logger`** — log estruturado em JSON, em **um** lugar, com stack apenas
   no servidor e apenas em 5xx.

**Por que a ordem de tradução é `AppError` → constraint → SQLSTATE → genérico?**
Da intenção mais específica para a mais vaga. Um `AppError` é uma decisão
explícita de quem escreveu o controller e tem prioridade sobre qualquer
inferência. O nome da *constraint* (`err.constraint`, que o driver `pg`
preenche) é mais informativo que o SQLSTATE: `23514` sozinho só diz "algum
`CHECK` falhou", enquanto `reservations_time_window_check` diz exatamente
qual regra e permite uma mensagem específica — e um status diferente, porque
janela invertida é 400 (erro do cliente) e não 409.

**Por que `asyncHandler` se o Express 5 já encaminha promessas rejeitadas?**
Essa é a objeção justa, e a resposta é honesta: no Express 5 o `asyncHandler`
é cinto além do suspensório. Ele fica por duas razões. Primeira, torna o
contrato **explícito** em vez de depender de um comportamento implícito da
versão do framework — quem lê `asyncHandler(async (req, res) => ...)` sabe
para onde vai a exceção sem precisar conhecer o changelog do Express 5.
Segunda, custa 4 linhas e remove uma classe inteira de regressão silenciosa:
se a N3 fizer *downgrade*, migrar para outro roteador ou introduzir um
middleware próprio fora do `Router`, nada quebra. Dívida técnica barata de
prevenir, cara de descobrir em produção.

**Por que não jogar fora o `catch` e deixar o Express responder sozinho?**
Porque o *default error handler* do Express responde com a stack em
`NODE_ENV !== 'production'` e com um HTML `<pre>`. Isso vaza caminho de
arquivo e estrutura interna, e quebra o contrato JSON que o
`client/src/services/api.js` espera (ele faz `res.json()` na resposta de
erro). Precisa ser nosso.

**Por que o cliente nunca recebe a stack?** O corpo da resposta é montado
exclusivamente a partir da tabela de tradução — nunca a partir de
`err.message`. Um erro desconhecido produz literalmente `"Erro interno do
servidor."` e nada mais. Isso vale como decisão de segurança (CS-14, superfície
aberta): mensagens de erro do PostgreSQL revelam nomes de tabela, de coluna e
de constraint. Quem precisa do detalhe é o log, e o log fica no servidor.

**Compatibilidade com o frontend.** O envelope é
`{ "error": "<mensagem pt-BR>", "code": "<CODE_EM_INGLES>" }`. A chave `error`
é preservada porque `client/src/services/api.js:18-19,59-60` lê exatamente
ela. Nenhuma mudança no frontend é necessária neste PR; o `code` é a adição
que permite ao cliente reagir programaticamente no futuro.

## Alterações

### 1. Criar `server/src/errors/AppError.js`

```js
/**
 * Operational error: something the application decided to reject, as opposed
 * to an unexpected crash. The central error middleware trusts statusCode and
 * code, and sends `message` to the client verbatim — so keep it user-facing.
 */
class AppError extends Error {
  constructor(message, { statusCode = 500, code = 'INTERNAL_ERROR', details } = {}) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, AppError);
  }

  static badRequest(message, code = 'BAD_REQUEST', details) {
    return new AppError(message, { statusCode: 400, code, details });
  }

  static notFound(message, code = 'NOT_FOUND') {
    return new AppError(message, { statusCode: 404, code });
  }

  static conflict(message, code = 'CONFLICT') {
    return new AppError(message, { statusCode: 409, code });
  }
}

module.exports = AppError;
```

### 2. Criar `server/src/errors/pgErrorCodes.js`

```js
/**
 * PostgreSQL SQLSTATE codes translated into HTTP responses.
 * Reference: https://www.postgresql.org/docs/current/errcodes-appendix.html
 */
const SQLSTATE_TO_HTTP = Object.freeze({
  // invalid_text_representation — ex.: GET /api/resources/abc (BUG-04)
  '22P02': {
    statusCode: 400,
    code: 'INVALID_IDENTIFIER',
    message: 'Parâmetro em formato inválido.',
  },
  // not_null_violation — ex.: PUT parcial em coluna NOT NULL (BUG-05)
  '23502': {
    statusCode: 400,
    code: 'MISSING_REQUIRED_FIELD',
    message: 'Um campo obrigatório não foi informado.',
  },
  // foreign_key_violation — ex.: reserva apontando para recurso inexistente
  '23503': {
    statusCode: 409,
    code: 'RELATED_RESOURCE_NOT_FOUND',
    message: 'O espaço informado não existe.',
  },
  // check_violation
  '23514': {
    statusCode: 409,
    code: 'CONSTRAINT_VIOLATION',
    message: 'A operação viola uma regra de integridade dos dados.',
  },
  // exclusion_violation — constraint reservations_no_overlap (BE-01)
  '23P01': {
    statusCode: 409,
    code: 'RESERVATION_OVERLAP',
    message: 'Já existe uma reserva para este espaço no período selecionado.',
  },
});

/**
 * Constraint-specific overrides. The `pg` driver fills err.constraint, which
 * is more precise than the SQLSTATE alone: 23514 only says "some CHECK
 * failed", the constraint name says which rule and whose fault it is.
 */
const CONSTRAINT_OVERRIDES = Object.freeze({
  reservations_no_overlap: {
    statusCode: 409,
    code: 'RESERVATION_OVERLAP',
    message: 'Já existe uma reserva para este espaço no período selecionado.',
  },
  reservations_time_window_check: {
    statusCode: 400,
    code: 'END_BEFORE_START',
    message: 'O término da reserva deve ser posterior ao início.',
  },
  reservations_status_check: {
    statusCode: 400,
    code: 'INVALID_RESERVATION_STATUS',
    message: 'Status de reserva inválido.',
  },
});

module.exports = { SQLSTATE_TO_HTTP, CONSTRAINT_OVERRIDES };
```

### 3. Criar `server/src/utils/logger.js`

```js
const LEVELS = Object.freeze({ ERROR: 'error', WARN: 'warn', INFO: 'info' });

const write = (level, payload) => {
  const entry = { level, timestamp: new Date().toISOString(), ...payload };
  const line = JSON.stringify(entry);
  if (level === LEVELS.ERROR) {
    console.error(line);
  } else {
    console.log(line);
  }
};

module.exports = {
  error: (payload) => write(LEVELS.ERROR, payload),
  warn: (payload) => write(LEVELS.WARN, payload),
  info: (payload) => write(LEVELS.INFO, payload),
};
```

`JSON.stringify` descarta chaves com valor `undefined`, então a stack
simplesmente não aparece na linha de log quando não deve aparecer.

### 4. Criar `server/src/middlewares/asyncHandler.js`

```js
/**
 * Wraps an async route handler so that a rejected promise reaches the central
 * error middleware instead of hanging the request.
 */
const asyncHandler = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);

module.exports = asyncHandler;
```

### 5. Criar `server/src/middlewares/errorHandler.js`

```js
const AppError = require('../errors/AppError');
const logger = require('../utils/logger');
const { SQLSTATE_TO_HTTP, CONSTRAINT_OVERRIDES } = require('../errors/pgErrorCodes');

const GENERIC_ERROR = Object.freeze({
  statusCode: 500,
  code: 'INTERNAL_ERROR',
  message: 'Erro interno do servidor.',
});

/**
 * From the most explicit intent to the vaguest guess:
 * AppError -> constraint name -> SQLSTATE -> generic 500.
 */
const translate = (err) => {
  if (err instanceof AppError) {
    return {
      statusCode: err.statusCode,
      code: err.code,
      message: err.message,
      details: err.details,
    };
  }
  if (err && CONSTRAINT_OVERRIDES[err.constraint]) {
    return CONSTRAINT_OVERRIDES[err.constraint];
  }
  if (err && SQLSTATE_TO_HTTP[err.code]) {
    return SQLSTATE_TO_HTTP[err.code];
  }
  return GENERIC_ERROR;
};

// `_next` is required: Express identifies an error middleware by its arity of
// 4. The underscore matches the argsIgnorePattern in eslint.config.js.
const errorHandler = (err, req, res, _next) => {
  const { statusCode, code, message, details } = translate(err);

  logger.error({
    method: req.method,
    path: req.originalUrl,
    statusCode,
    code,
    sqlstate: err && err.code,
    constraint: err && err.constraint,
    reason: err && err.message,
    // Stack only for server-side faults, and only in the log — never in the
    // response body.
    stack: statusCode >= 500 && err ? err.stack : undefined,
  });

  const body = { error: message, code };
  if (details) body.details = details;

  return res.status(statusCode).json(body);
};

module.exports = errorHandler;
```

### 6. Alterar `server/eslint.config.js`

Para que `_next` não dispare `no-unused-vars` — e sem usar
`eslint-disable-next-line`, que é o CS-12:

```js
    rules: {
      "no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }],
      "no-console": "off"
    }
```

### 7. Reescrever `server/src/controllers/resourceController.js`

**Antes** (arquivo recebido, 72 linhas, 5 blocos `try/catch`):

```js
const ResourceModel = require('../models/resourceModel');

const ResourceController = {
  async createResource(req, res) {
    try {
      const { name, type, capacity } = req.body;
      if (!name || !type) {
        return res.status(400).json({ error: 'Name and type are required' });
      }
      const newResource = await ResourceModel.create(name, type, capacity || 1);
      res.status(201).json(newResource);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  async getAllResources(req, res) {
    try {
      const resources = await ResourceModel.findAll();
      res.json(resources);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  async getResourceById(req, res) {
    try {
      const { id } = req.params;
      const resource = await ResourceModel.findById(id);
      if (!resource) {
        return res.status(404).json({ error: 'Resource not found' });
      }
      res.json(resource);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  async updateResource(req, res) {
    try {
      const { id } = req.params;
      const { name, type, capacity } = req.body;
      const updatedResource = await ResourceModel.update(id, name, type, capacity);
      if (!updatedResource) {
        return res.status(404).json({ error: 'Resource not found' });
      }
      res.json(updatedResource);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  async deleteResource(req, res) {
    try {
      const { id } = req.params;
      const deletedResource = await ResourceModel.delete(id);
      if (!deletedResource) {
        return res.status(404).json({ error: 'Resource not found' });
      }
      res.json({ message: 'Resource deleted successfully' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
};

module.exports = ResourceController;
```

**Depois** (43 linhas, 0 blocos `try/catch`):

```js
const ResourceModel = require('../models/resourceModel');
const AppError = require('../errors/AppError');
const asyncHandler = require('../middlewares/asyncHandler');

const NOT_FOUND_MESSAGE = 'Recurso não encontrado.';
const NOT_FOUND_CODE = 'RESOURCE_NOT_FOUND';

const ResourceController = {
  createResource: asyncHandler(async (req, res) => {
    const { name, type, capacity } = req.body;
    if (!name || !type) {
      throw AppError.badRequest('Nome e tipo são obrigatórios.', 'RESOURCE_FIELDS_REQUIRED');
    }
    const newResource = await ResourceModel.create(name, type, capacity || 1);
    res.status(201).json(newResource);
  }),

  getAllResources: asyncHandler(async (req, res) => {
    const resources = await ResourceModel.findAll();
    res.json(resources);
  }),

  getResourceById: asyncHandler(async (req, res) => {
    const resource = await ResourceModel.findById(req.params.id);
    if (!resource) throw AppError.notFound(NOT_FOUND_MESSAGE, NOT_FOUND_CODE);
    res.json(resource);
  }),

  updateResource: asyncHandler(async (req, res) => {
    const { name, type, capacity } = req.body;
    const updatedResource = await ResourceModel.update(req.params.id, name, type, capacity);
    if (!updatedResource) throw AppError.notFound(NOT_FOUND_MESSAGE, NOT_FOUND_CODE);
    res.json(updatedResource);
  }),

  deleteResource: asyncHandler(async (req, res) => {
    const deletedResource = await ResourceModel.delete(req.params.id);
    if (!deletedResource) throw AppError.notFound(NOT_FOUND_MESSAGE, NOT_FOUND_CODE);
    res.json({ message: 'Recurso excluído com sucesso.' });
  }),
};

module.exports = ResourceController;
```

**72 → 43 linhas (−40 %). 5 blocos `try/catch` → 0. 25 linhas de tratamento
de erro duplicado → 0.** E, de brinde, `GET /api/resources/abc` passa a
responder 400 em vez de 500, sem que uma linha sequer deste arquivo trate
disso.

> O BUG-05 (`PUT` parcial grava `NULL` em coluna `NOT NULL`) **não** é
> corrigido aqui: o middleware apenas melhora a resposta de 500 para 400
> (`23502`). O conserto de verdade — `UPDATE` parcial com `COALESCE` — é outra
> issue.

### 8. Reescrever `server/src/controllers/reservationController.js`

Estado final, já incorporando BE-01, BE-02 e BE-03 (90 linhas, **0** blocos
`try/catch`):

```js
const ReservationModel = require('../models/reservationModel');
const AppError = require('../errors/AppError');
const asyncHandler = require('../middlewares/asyncHandler');
const { validateReservationWindow } = require('../validators/reservationValidator');
const {
  RESERVATION_STATUSES,
  isValidStatus,
  allowedSources,
} = require('../domain/reservationStatus');

const OVERLAP_MESSAGE = 'Já existe uma reserva para este espaço no período selecionado.';
const NOT_FOUND_MESSAGE = 'Reserva não encontrada.';
const NOT_FOUND_CODE = 'RESERVATION_NOT_FOUND';

const ReservationController = {
  createReservation: asyncHandler(async (req, res) => {
    const { resource_id, user_name, start_time, end_time } = req.body;
    if (!resource_id || !user_name || !start_time || !end_time) {
      throw AppError.badRequest(
        'Todos os campos são obrigatórios.',
        'RESERVATION_FIELDS_REQUIRED',
      );
    }

    const window = validateReservationWindow({ start_time, end_time });
    if (!window.valid) throw AppError.badRequest(window.message, window.code);

    // Checagem otimista: produz a mensagem amigável no caminho comum. A
    // garantia real é a constraint reservations_no_overlap (BE-01), cujo
    // SQLSTATE 23P01 o middleware de erro traduz no mesmo 409.
    const isAvailable = await ReservationModel.checkAvailability(
      resource_id,
      start_time,
      end_time,
    );
    if (!isAvailable) throw AppError.conflict(OVERLAP_MESSAGE, 'RESERVATION_OVERLAP');

    const newReservation = await ReservationModel.create(
      resource_id,
      user_name,
      start_time,
      end_time,
    );
    res.status(201).json(newReservation);
  }),

  getAllReservations: asyncHandler(async (req, res) => {
    const reservations = await ReservationModel.findAll();
    res.json(reservations);
  }),

  getReservationById: asyncHandler(async (req, res) => {
    const reservation = await ReservationModel.findById(req.params.id);
    if (!reservation) throw AppError.notFound(NOT_FOUND_MESSAGE, NOT_FOUND_CODE);
    res.json(reservation);
  }),

  updateReservationStatus: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    if (!isValidStatus(status)) {
      throw AppError.badRequest(
        `Status inválido. Valores aceitos: ${RESERVATION_STATUSES.join(', ')}.`,
        'INVALID_RESERVATION_STATUS',
      );
    }

    // A transição é verificada dentro do próprio UPDATE (WHERE status = ANY),
    // para não reintroduzir o TOCTOU que o BUG-01 expôs.
    const updated = await ReservationModel.updateStatus(id, status, allowedSources(status));
    if (updated) return res.json(updated);

    const current = await ReservationModel.findById(id);
    if (!current) throw AppError.notFound(NOT_FOUND_MESSAGE, NOT_FOUND_CODE);

    throw AppError.conflict(
      `Não é possível mudar o status de "${current.status}" para "${status}".`,
      'INVALID_STATUS_TRANSITION',
    );
  }),

  deleteReservation: asyncHandler(async (req, res) => {
    const deletedReservation = await ReservationModel.delete(req.params.id);
    if (!deletedReservation) throw AppError.notFound(NOT_FOUND_MESSAGE, NOT_FOUND_CODE);
    res.json({ message: 'Reserva excluída com sucesso.' });
  }),
};

module.exports = ReservationController;
```

O arquivo continua com 90 linhas — as mesmas 90 do arquivo recebido —, mas a
composição mudou por completo: as **25 linhas** de `try/catch` sumiram e no
lugar entraram a validação de janela (BE-02), a validação de status e de
transição (BE-03) e a tradução do conflito (BE-01). Em outras palavras,
**quatro regras de negócio novas couberam no espaço que o boilerplate
ocupava**. Esse é o número a mostrar no pitch.

### 9. Alterar `server/src/index.js`

Registrar o middleware **por último**. Estado final do arquivo (incorporando a
exportação de `app` feita pela BE-01):

```js
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const initDb = require('./config/initDb');
const resourceRoutes = require('./routes/resourceRoutes');
const reservationRoutes = require('./routes/reservationRoutes');
const errorHandler = require('./middlewares/errorHandler');
const logger = require('./utils/logger');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/resources', resourceRoutes);
app.use('/api/reservations', reservationRoutes);

// Root Endpoint
app.get('/', (req, res) => {
  res.send('SREC Coworking API is running...');
});

// Must stay LAST: Express only routes to a 4-arity middleware after an error,
// and only if it is registered after every route it should cover.
app.use(errorHandler);

// Initialize DB and start server
const startServer = async () => {
  await initDb();
  app.listen(PORT, () => {
    logger.info({ message: `Server is running on port ${PORT}` });
  });
};

if (require.main === module) {
  startServer();
}

module.exports = app;
```

## Testes

### Testes unitários — `server/src/middlewares/errorHandler.test.js` (novo)

Projeto `unit`, sem banco. Usa dublês de `req`/`res`.

```js
const errorHandler = require('./errorHandler');
const AppError = require('../errors/AppError');
const logger = require('../utils/logger');

jest.mock('../utils/logger');

const buildRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const req = { method: 'GET', originalUrl: '/api/resources/1' };

describe('errorHandler', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('respeita o statusCode e o code de um AppError', () => {
    const res = buildRes();
    errorHandler(AppError.notFound('Recurso não encontrado.', 'RESOURCE_NOT_FOUND'), req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Recurso não encontrado.',
      code: 'RESOURCE_NOT_FOUND',
    });
  });

  it('inclui details quando o AppError os carrega', () => {
    const res = buildRes();
    const err = AppError.badRequest('Dados inválidos.', 'BAD_REQUEST', { field: 'capacity' });
    errorHandler(err, req, res);

    expect(res.json).toHaveBeenCalledWith({
      error: 'Dados inválidos.',
      code: 'BAD_REQUEST',
      details: { field: 'capacity' },
    });
  });

  it('traduz SQLSTATE 22P02 em 400 (BUG-04)', () => {
    const res = buildRes();
    errorHandler({ code: '22P02', message: 'invalid input syntax for type integer' }, req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Parâmetro em formato inválido.',
      code: 'INVALID_IDENTIFIER',
    });
  });

  it('traduz SQLSTATE 23503 em 409', () => {
    const res = buildRes();
    errorHandler({ code: '23503' }, req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0].code).toBe('RELATED_RESOURCE_NOT_FOUND');
  });

  it('traduz a constraint de sobreposição em 409', () => {
    const res = buildRes();
    errorHandler({ code: '23P01', constraint: 'reservations_no_overlap' }, req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0].code).toBe('RESERVATION_OVERLAP');
  });

  it('prefere a constraint ao SQLSTATE: janela invertida é 400, não 409', () => {
    const res = buildRes();
    errorHandler({ code: '23514', constraint: 'reservations_time_window_check' }, req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].code).toBe('END_BEFORE_START');
  });

  it('cai para 500 genérico e não vaza a mensagem original nem a stack', () => {
    const res = buildRes();
    const err = new Error('relation "reservations" does not exist');
    err.stack = 'Error: relation "reservations" does not exist\n    at /app/src/db.js:12';
    errorHandler(err, req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    const body = res.json.mock.calls[0][0];
    expect(body).toEqual({ error: 'Erro interno do servidor.', code: 'INTERNAL_ERROR' });
    expect(JSON.stringify(body)).not.toContain('reservations');
    expect(JSON.stringify(body)).not.toContain('at /app');
  });

  it('loga a stack em 5xx e omite em 4xx', () => {
    errorHandler(new Error('boom'), req, buildRes());
    expect(logger.error.mock.calls[0][0].stack).toBeDefined();

    jest.clearAllMocks();
    errorHandler(AppError.notFound('Não encontrado.', 'NOT_FOUND'), req, buildRes());
    expect(logger.error.mock.calls[0][0].stack).toBeUndefined();
  });
});
```

### Testes de integração — `server/tests/integration/errorHandling.test.js` (novo)

```js
const request = require('supertest');
const app = require('../../src/index');
const { pool, resetDatabase, createResource } = require('../helpers/testDb');

describe('Tratamento central de erro (CS-02, BUG-04)', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await pool.end();
  });

  it('responde 400 para ID não numérico em /api/resources/:id', async () => {
    const response = await request(app).get('/api/resources/abc');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: 'Parâmetro em formato inválido.',
      code: 'INVALID_IDENTIFIER',
    });
  });

  it('responde 400 para ID não numérico em /api/reservations/:id', async () => {
    const response = await request(app).get('/api/reservations/abc');

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('code', 'INVALID_IDENTIFIER');
  });

  it('responde 409 quando resource_id não existe', async () => {
    const response = await request(app).post('/api/reservations').send({
      resource_id: 999999,
      user_name: 'Adrian',
      start_time: '2030-04-01T14:00:00',
      end_time: '2030-04-01T15:00:00',
    });

    expect(response.status).toBe(409);
    expect(response.body).toHaveProperty('code', 'RELATED_RESOURCE_NOT_FOUND');
  });

  it('nenhuma resposta de erro carrega stack ou detalhe interno', async () => {
    await createResource('Sala Cinza', 'meeting_room', 2);
    const responses = await Promise.all([
      request(app).get('/api/resources/abc'),
      request(app).get('/api/resources/999999'),
      request(app).get('/api/reservations/abc'),
    ]);

    responses.forEach((response) => {
      const body = JSON.stringify(response.body);
      expect(Object.keys(response.body).sort()).toEqual(['code', 'error']);
      expect(body).not.toMatch(/at \//);
      expect(body).not.toContain('node_modules');
      expect(body).not.toContain('pg');
    });
  });
});
```

**Comportamento antes da correção:** o primeiro e o segundo caso falham
recebendo **500** em vez de 400; o terceiro falha recebendo **500** em vez de
409; o quarto falha na asserção de chaves, porque o corpo do erro hoje tem só
`error`, sem `code`.

### Comandos

```bash
cd server
npm run db:migrate
npm test                 # unitários, sem banco
npm run test:integration # exige PostgreSQL de pé
npm run test:all
npm run lint

# Prova do CS-02 resolvido:
grep -c 'catch (err)' src/controllers/*.js   # esperado: 0 em ambos
grep -rc 'Internal server error' src/        # esperado: 0
```

## Critérios de aceite

* [ ] `grep -c 'catch (err)' src/controllers/*.js` retorna **0** nos dois
      arquivos.
* [ ] `grep -rn 'Internal server error' src/` não retorna nada.
* [ ] `grep -rn 'console.error' src/` só retorna `src/utils/logger.js`.
* [ ] `app.use(errorHandler)` é o **último** `app.use` de `src/index.js`,
      declarado depois de todas as rotas.
* [ ] As 10 rotas respondem com o envelope `{ "error": "...", "code": "..." }`
      em qualquer caminho de erro.
* [ ] `GET /api/resources/abc` e as outras 5 rotas com `:id` respondem
      **400** com `code: "INVALID_IDENTIFIER"`.
* [ ] `POST /api/reservations` com `resource_id` inexistente responde
      **409** com `code: "RELATED_RESOURCE_NOT_FOUND"`.
* [ ] Um erro desconhecido responde **500** com corpo exatamente
      `{"error":"Erro interno do servidor.","code":"INTERNAL_ERROR"}` — sem
      stack, sem nome de tabela, sem caminho de arquivo.
* [ ] A stack aparece no log (stdout, JSON) apenas para respostas 5xx.
* [ ] Nenhum `eslint-disable` novo foi introduzido (CS-12).
* [ ] Números do PR, medidos: blocos `try/catch` nos controllers **10 → 0**;
      linhas de tratamento de erro duplicadas **50 → 0**; `console.error`
      espalhados **10 → 1** (só no logger); middlewares de erro **0 → 1**;
      mapeamentos de SQLSTATE **0 → 5** (+3 por nome de constraint);
      `resourceController.js` **72 → 43 linhas** (−40 %);
      rotas com `:id` que respondem 500 a ID não numérico **6 → 0**;
      arquivos de teste **6 → 8**; casos de teste **29 → 41**.
* [ ] `npm run lint` com **0 erros**; `npm run test:all` verde.
* [ ] PR aprovado por **Igor Seberino (@igorSeberino)** no papel de QA.

## Passo a passo TBD

```bash
# 1. Partir de main já com BE-01, BE-02 e BE-03 integradas.
#    Esta branch reescreve os dois controllers: se qualquer uma das outras
#    ainda estiver aberta, espere o merge delas antes de começar.
git checkout main
git pull --ff-only origin main
git checkout -b refactor/central-error-middleware

cd server
npm ci
npm run db:migrate

# 2. Implementar: infraestrutura de erro -> controllers -> bootstrap -> testes

git add server/src/errors/ server/src/utils/logger.js server/eslint.config.js
git commit -m "feat(erros): criar AppError, logger estruturado e mapa de SQLSTATE"

git add server/src/middlewares/
git commit -m "feat(http): adicionar asyncHandler e middleware central de erro"

git add server/src/controllers/
git commit -m "refactor(controllers): remover os 10 try/catch duplicados"

git add server/src/index.js
git commit -m "refactor(server): registrar o middleware de erro por ultimo"

git add server/src/middlewares/errorHandler.test.js server/tests/integration/errorHandling.test.js
git commit -m "test(erros): cobrir o middleware central de erro"

git add docs/specs/be-04-central-error-middleware/implementacao.md
git commit -m "docs(specs): registrar a spec BE-04 de middleware de erro"

# 3. Validar antes de abrir o PR
npm run lint
npm run test:all
grep -c 'catch (err)' src/controllers/*.js
grep -rn 'Internal server error' src/

# 4. Publicar e abrir o PR
git push -u origin refactor/central-error-middleware
```

Título do PR: `refactor(erros): centralizar o tratamento de erro da API (CS-02)`

Corpo do PR: o antes/depois completo do `resourceController.js` (é a
evidência mais forte do lote), link para
`docs/specs/be-04-central-error-middleware/implementacao.md`, a tabela de
números antes/depois e a saída dos dois `grep`. Revisão de **@igorSeberino**
(QA). Merge com **1 aprovação do QA + CI verde**.

## Prompt para o Claude Code

```
Você está na raiz do repositório igorSeberino/srec. Leia CLAUDE.md e a skill de
backend em .claude/skills/ antes de escrever código.

Implemente integralmente a spec docs/specs/be-04-central-error-middleware/implementacao.md
(BE-04 — Middleware central de erro, resolve o CS-02 ALTO e, de forma colateral,
o BUG-04 ALTO).

Pré-requisito: BE-01, BE-02 e BE-03 já em main. Confira que existem
server/src/validators/reservationValidator.js, server/src/domain/reservationStatus.js
e as três migrações em server/migrations/. Se não existirem, pare e avise: esta
spec reescreve os dois controllers por inteiro e geraria conflito.

Regras:
- Trabalhe no branch refactor/central-error-middleware, criado a partir de main.
- Mantenha a stack: Node.js 20, Express 5, PostgreSQL via `pg` com SQL cru,
  CommonJS. NÃO adicione dependência (nada de express-async-errors, winston,
  pino, http-errors) — as quatro peças da spec somam menos de 150 linhas.
- Respeite o Prettier do projeto (printWidth 100, aspas simples, ponto e vírgula,
  trailingComma all) e o ESLint em server/eslint.config.js.
- Nomes de arquivo, identificadores e comentários de código em inglês. Mensagens
  de commit e textos de erro voltados ao usuário em português.

Ordem de execução:
1. src/errors/AppError.js, src/errors/pgErrorCodes.js, src/utils/logger.js.
2. src/middlewares/asyncHandler.js, src/middlewares/errorHandler.js.
3. eslint.config.js — "no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }].
   Não use eslint-disable: isso é o CS-12.
4. src/controllers/resourceController.js e src/controllers/reservationController.js,
   exatamente os blocos "depois" da spec.
5. src/index.js — app.use(errorHandler) como ÚLTIMO app.use, depois das rotas.
6. src/middlewares/errorHandler.test.js (8 casos) e
   tests/integration/errorHandling.test.js (4 casos).

Invariantes que o PR precisa respeitar:
- Nenhum try/catch sobra nos controllers.
- O corpo de erro nunca é montado a partir de err.message de um erro
  desconhecido: só a partir da tabela de tradução.
- A chave `error` continua existindo no corpo, porque client/src/services/api.js
  depende dela. Não altere o client/ neste PR.

Ao final, rode nesta ordem e cole a saída:
  cd server && npm run lint && npm run test:all
  grep -c 'catch (err)' src/controllers/*.js
  grep -rn 'Internal server error' src/
Os dois greps precisam retornar zero ocorrências. Depois faça os commits
exatamente com as mensagens listadas na seção "Passo a passo TBD" da spec.
```
