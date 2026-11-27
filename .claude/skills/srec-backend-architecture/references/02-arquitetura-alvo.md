# Arquitetura alvo do backend na N2 — `server/`

O alvo não é um backend novo. É o backend recebido com quatro peças introduzidas
e as responsabilidades separadas. Cada bloco de código abaixo é o padrão a
seguir — copie o padrão, não improvise um variante.

## Árvore alvo

```
server/
  migrations/
    0001_create_resources.sql
    0002_create_reservations.sql
    0003_add_integrity_constraints.sql
    0004_add_indexes.sql
  scripts/migrate.js
  src/
    app.js
    index.js
    config/
      database.js
      env.js
    domain/
      reservationStatus.js
      resourceType.js
      timeRange.js
    errors/
      AppError.js
    middlewares/
      errorHandler.js
      validateId.js
      notFound.js
    services/
      resourceService.js
      reservationService.js
    models/
      resourceModel.js
      reservationModel.js
    controllers/
      resourceController.js
      reservationController.js
    routes/
      resourceRoutes.js
      reservationRoutes.js
  tests/
    integration/
    unit/
```

Nada de `utils/`, `helpers/`, `common/`. Se não couber em `domain/`, `services/`,
`middlewares/` ou `errors/`, o nome da pasta está errado ou a responsabilidade
está confusa.

## 1. `app.js` separado de `index.js`

Esta é a primeira mudança a fazer, porque ela destrava todo o resto: sem app
importável, não existe teste de integração com Supertest e os controllers ficam
presos em 0 % de cobertura.

```js
// src/app.js
const express = require('express');
const cors = require('cors');

const resourceRoutes = require('./routes/resourceRoutes');
const reservationRoutes = require('./routes/reservationRoutes');
const notFound = require('./middlewares/notFound');
const errorHandler = require('./middlewares/errorHandler');

const app = express();

app.use(cors({ origin: require('./config/env').CORS_ORIGIN }));
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.use('/api/resources', resourceRoutes);
app.use('/api/reservations', reservationRoutes);

app.use(notFound);        // 404 explícito
app.use(errorHandler);    // SEMPRE o último app.use

module.exports = app;
```

```js
// src/index.js
const app = require('./app');
const env = require('./config/env');

app.listen(env.PORT, () => {
  console.log(`SREC API ouvindo na porta ${env.PORT}`);
});
```

Regras: `app.js` **nunca** chama `listen`. `errorHandler` é sempre o último
`app.use`, depois das rotas e do `notFound`. `index.js` não registra rota nem
middleware.

## 2. `errors/AppError.js` + `middlewares/errorHandler.js`

Resolve CS-02 (10 blocos `try/catch` idênticos) de uma vez.

```js
// src/errors/AppError.js
class AppError extends Error {
  constructor(message, statusCode = 400, code = 'BAD_REQUEST', details = null) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }

  static badRequest(message, details) {
    return new AppError(message, 400, 'BAD_REQUEST', details);
  }

  static notFound(message) {
    return new AppError(message, 404, 'NOT_FOUND');
  }

  static conflict(message, details) {
    return new AppError(message, 409, 'CONFLICT', details);
  }
}

module.exports = AppError;
```

```js
// src/middlewares/errorHandler.js
const AppError = require('../errors/AppError');

// Precisa dos 4 parâmetros: é assim que o Express reconhece um error handler.
// eslint-disable-next-line no-unused-vars
module.exports = (err, req, res, next) => {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
      ...(err.details ? { details: err.details } : {}),
    });
  }

  // Violação de constraint do Postgres vira resposta de domínio, não 500.
  if (err.code === '23P01') {
    return res.status(409).json({
      error: 'Já existe reserva para este recurso no horário solicitado',
      code: 'RESERVATION_OVERLAP',
    });
  }
  if (err.code === '23514') {
    return res.status(400).json({ error: 'Dados violam uma regra de integridade', code: 'CHECK_VIOLATION' });
  }
  if (err.code === '23503') {
    return res.status(404).json({ error: 'Recurso referenciado não existe', code: 'FK_VIOLATION' });
  }
  if (err.code === '22P02') {
    return res.status(400).json({ error: 'Parâmetro em formato inválido', code: 'INVALID_INPUT' });
  }

  console.error('[erro não tratado]', { path: req.originalUrl, message: err.message, stack: err.stack });
  return res.status(500).json({ error: 'Erro interno do servidor', code: 'INTERNAL_ERROR' });
};
```

O mapa de `SQLSTATE` é o que converte as novas constraints (item 4) em resposta
HTTP correta: `23P01` é violação de `EXCLUDE`, `23514` de `CHECK`, `23503` de
chave estrangeira, `22P02` de cast inválido.

**Corolário para o controller.** Express 5 encaminha a rejeição de handler
`async` ao error handler automaticamente. Depois disso:

```js
// ERRADO — era exatamente o CS-02
async getResourceById(req, res) {
  try { ... } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
}

// CERTO
async getResourceById(req, res) {
  const resource = await resourceService.getById(req.params.id);
  res.json(resource);
}
```

Nenhum `try/catch` novo em controller. Nenhum `res.status(500)` escrito à mão.

## 3. `config/env.js` e `config/database.js`

```js
// src/config/env.js
require('dotenv').config();

const required = ['DATABASE_URL'];
const missing = required.filter((key) => !process.env[key]);

if (missing.length > 0) {
  console.error(`Variáveis de ambiente obrigatórias ausentes: ${missing.join(', ')}`);
  process.exit(1);           // falha no boot, não na primeira query
}

module.exports = {
  PORT: Number(process.env.PORT || 5000),
  DATABASE_URL: process.env.DATABASE_URL,
  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:5173',
  NODE_ENV: process.env.NODE_ENV || 'development',
};
```

```js
// src/config/database.js
const { Pool } = require('pg');
const env = require('./env');

const pool = new Pool({ connectionString: env.DATABASE_URL });

// Obrigatório: sem este handler o processo morre quando o Postgres reinicia (BUG-12).
pool.on('error', (err) => {
  console.error('[pg] erro em client idle do pool', err.message);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  getClient: () => pool.connect(),   // destrava transação (BUG-01)
  close: () => pool.end(),           // usado no teardown dos testes
};
```

`getClient` existe para transação. `close` existe para o `afterAll` dos testes de
integração — sem ele o Jest fica pendurado em handle aberto.

## 4. Migrations versionadas

Resolve CS-06 e BUG-11. `src/config/initDb.js` é **removido**; o schema passa a
ser série de arquivos SQL numerados.

```
server/migrations/0001_create_resources.sql
server/migrations/0002_create_reservations.sql
server/migrations/0003_add_integrity_constraints.sql
server/migrations/0004_add_indexes.sql
```

Regras:

* Prefixo de 4 dígitos, sequencial, nome em inglês, `snake_case`.
* **Migration mergeada é imutável.** Correção é migration nova, nunca edição da
  anterior — senão o banco de quem já aplicou divergeia do banco de quem clonou
  hoje. Esse é o tipo de divergência que a N3 herda.
* Uma migration = uma intenção. Não junte "criar índice" com "adicionar CHECK".
* Sem rollback automático nesta N2; para desfazer, escreva a migration inversa.

`0003_add_integrity_constraints.sql` é a que fecha cinco bugs de uma vez:

```sql
-- BUG-02: fim precisa ser depois do início
ALTER TABLE reservations
  ADD CONSTRAINT reservations_time_order_check CHECK (end_time > start_time);

-- BUG-03: status é enum fechado
ALTER TABLE reservations
  ADD CONSTRAINT reservations_status_check
  CHECK (status IN ('scheduled', 'cancelled', 'completed'));

-- BUG-10: type é enum fechado
ALTER TABLE resources
  ADD CONSTRAINT resources_type_check
  CHECK (type IN ('workstation', 'meeting_room'));

-- BUG-09: capacidade é positiva
ALTER TABLE resources
  ADD CONSTRAINT resources_capacity_check CHECK (capacity > 0);

-- BUG-06: não apagar reserva em silêncio ao remover o recurso
ALTER TABLE reservations DROP CONSTRAINT reservations_resource_id_fkey;
ALTER TABLE reservations
  ALTER COLUMN resource_id SET NOT NULL,
  ADD CONSTRAINT reservations_resource_id_fkey
    FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE RESTRICT;

-- BUG-01: a garantia definitiva contra dupla reserva, no banco
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE reservations
  ADD CONSTRAINT reservations_no_overlap
  EXCLUDE USING gist (
    resource_id WITH =,
    tstzrange(start_time, end_time) WITH &&
  ) WHERE (status <> 'cancelled');
```

`0004_add_indexes.sql` resolve CS-09:

```sql
CREATE INDEX IF NOT EXISTS idx_reservations_resource_id ON reservations (resource_id);
CREATE INDEX IF NOT EXISTS idx_reservations_start_time  ON reservations (start_time);
CREATE INDEX IF NOT EXISTS idx_reservations_status      ON reservations (status);
```

O runner registra o que já aplicou e **falha com código ≠ 0**:

```js
// scripts/migrate.js (esqueleto do padrão)
const fs = require('fs');
const path = require('path');
const db = require('../src/config/database');

const run = async () => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  const dir = path.join(__dirname, '..', 'migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const { rows } = await db.query('SELECT filename FROM schema_migrations');
  const applied = new Set(rows.map((r) => r.filename));

  for (const file of files) {
    if (applied.has(file)) continue;
    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      await client.query(fs.readFileSync(path.join(dir, file), 'utf8'));
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`aplicada: ${file}`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`FALHOU: ${file} — ${err.message}`);
      process.exit(1);           // o oposto do BUG-11
    } finally {
      client.release();
    }
  }
  await db.close();
};

run();
```

Script em `server/package.json`: `"migrate": "node scripts/migrate.js"`. A API
**não** aplica migration no boot — `npm run migrate` é passo explícito do
onboarding e da CI.

## 5. `domain/` — enum e regra pura

Resolve CS-05. É o único lugar do backend testável sem mock nenhum.

```js
// src/domain/reservationStatus.js
const RESERVATION_STATUS = Object.freeze({
  SCHEDULED: 'scheduled',
  CANCELLED: 'cancelled',
  COMPLETED: 'completed',
});

const RESERVATION_STATUS_VALUES = Object.freeze(Object.values(RESERVATION_STATUS));

const isValidReservationStatus = (value) => RESERVATION_STATUS_VALUES.includes(value);

module.exports = { RESERVATION_STATUS, RESERVATION_STATUS_VALUES, isValidReservationStatus };
```

```js
// src/domain/resourceType.js
const RESOURCE_TYPE = Object.freeze({
  WORKSTATION: 'workstation',
  MEETING_ROOM: 'meeting_room',
});

const RESOURCE_TYPE_VALUES = Object.freeze(Object.values(RESOURCE_TYPE));
const isValidResourceType = (value) => RESOURCE_TYPE_VALUES.includes(value);

module.exports = { RESOURCE_TYPE, RESOURCE_TYPE_VALUES, isValidResourceType };
```

`timeRange.js` guarda a regra de horário que não depende de banco: fim depois do
início (BUG-02), início não no passado (BUG-08), parse de ISO 8601 com offset
(BUG-07).

Depois disso, `'scheduled'` e `'meeting_room'` **não aparecem mais** como
literal em controller, service nem model — nem dentro de SQL, onde hoje
`checkAvailability` tem `status != 'cancelled'` cravado.

## 6. `services/` — regra de negócio e transação

Resolve CS-03 e CS-04. O service recebe dado cru, valida, decide e lança
`AppError`. Não conhece `req`, `res` nem `next`.

```js
// src/services/reservationService.js
const db = require('../config/database');
const ReservationModel = require('../models/reservationModel');
const ResourceModel = require('../models/resourceModel');
const AppError = require('../errors/AppError');
const { RESERVATION_STATUS, isValidReservationStatus } = require('../domain/reservationStatus');
const { assertValidRange } = require('../domain/timeRange');

const reservationService = {
  async create({ resource_id, user_name, start_time, end_time }) {
    if (!resource_id || !user_name || !start_time || !end_time) {
      throw AppError.badRequest('resource_id, user_name, start_time e end_time são obrigatórios');
    }
    assertValidRange(start_time, end_time);          // BUG-02 e BUG-08

    const resource = await ResourceModel.findById(resource_id);
    if (!resource) throw AppError.notFound('Recurso não encontrado');

    // BUG-01: checar e inserir na MESMA transação, com a linha do recurso travada.
    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      await client.query('SELECT id FROM resources WHERE id = $1 FOR UPDATE', [resource_id]);

      const free = await ReservationModel.isSlotFree(client, resource_id, start_time, end_time);
      if (!free) throw AppError.conflict('Recurso indisponível no horário solicitado');

      const created = await ReservationModel.create(client, { resource_id, user_name, start_time, end_time });
      await client.query('COMMIT');
      return created;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;                                     // errorHandler traduz 23P01 → 409
    } finally {
      client.release();
    }
  },

  async updateStatus(id, status) {
    if (!isValidReservationStatus(status)) {         // BUG-03
      throw AppError.badRequest(`status inválido: use um de ${Object.values(RESERVATION_STATUS).join(', ')}`);
    }
    const updated = await ReservationModel.updateStatus(id, status);
    if (!updated) throw AppError.notFound('Reserva não encontrada');
    return updated;
  },
};

module.exports = reservationService;
```

Duas defesas, de propósito: a transação com `FOR UPDATE` serializa as reservas do
mesmo recurso, e a constraint `EXCLUDE` é a rede final no banco. Cinto e
suspensório — a regra de negócio central do SREC é "nunca reservar o mesmo
recurso duas vezes no mesmo intervalo", e um `CRÍTICO` não se resolve com uma
camada só.

Padrão de método de model que participa de transação: **o client entra como
primeiro parâmetro**, e o model usa `client.query` quando recebe um e `db.query`
quando não recebe.

```js
// src/models/reservationModel.js
async isSlotFree(client, resource_id, start_time, end_time) {
  const runner = client || db;
  const { rows } = await runner.query(
    `SELECT id FROM reservations
      WHERE resource_id = $1
        AND status <> $4
        AND (start_time < $3 AND end_time > $2)
      LIMIT 1`,
    [resource_id, start_time, end_time, RESERVATION_STATUS.CANCELLED],
  );
  return rows.length === 0;
}
```

A fórmula de sobreposição é **idêntica** à recebida. Só o `'cancelled'` saiu de
literal para parâmetro vindo do enum.

## 7. `controllers/` — HTTP e só HTTP

```js
// src/controllers/reservationController.js
const reservationService = require('../services/reservationService');

const reservationController = {
  async create(req, res) {
    const reservation = await reservationService.create(req.body);
    res.status(201).json(reservation);
  },

  async updateStatus(req, res) {
    const reservation = await reservationService.updateStatus(req.params.id, req.body.status);
    res.json(reservation);
  },
};

module.exports = reservationController;
```

Três linhas por ação. Nenhum `try/catch`, nenhum `if` de validação, nenhum
`console.error`, nenhum SQL.

## 8. `middlewares/validateId.js` e `notFound.js`

```js
// src/middlewares/validateId.js — resolve BUG-04 nas 6 rotas com :id
const AppError = require('../errors/AppError');

module.exports = (req, res, next) => {
  const { id } = req.params;
  if (!/^[1-9]\d*$/.test(String(id))) {
    return next(AppError.badRequest(`id inválido: "${id}" não é um inteiro positivo`));
  }
  req.params.id = Number(id);
  next();
};
```

```js
// src/middlewares/notFound.js
const AppError = require('../errors/AppError');

module.exports = (req, res, next) =>
  next(AppError.notFound(`Rota não encontrada: ${req.method} ${req.originalUrl}`));
```

## 9. `routes/` — amarração declarativa

```js
// src/routes/reservationRoutes.js
const express = require('express');
const controller = require('../controllers/reservationController');
const validateId = require('../middlewares/validateId');

const router = express.Router();

router.post('/', controller.create);
router.get('/', controller.list);
router.get('/:id', validateId, controller.getById);
router.patch('/:id/status', validateId, controller.updateStatus);
router.delete('/:id', validateId, controller.remove);

module.exports = router;
```

Os 10 endpoints continuam os mesmos — a N2 **não** muda o contrato de rota. Muda
o status code devolvido nos casos de erro (400 em vez de 500) e os códigos de
erro da resposta. Mudança de contrato de resposta exige atualizar
`client/src/services/api.js` e `docs/arquitetura/` no mesmo PR.

## Ordem de execução recomendada das issues

Esta ordem não é estética — cada passo destrava o seguinte:

1. `app.js` + `AppError` + `errorHandler` + `notFound` → destrava Supertest e
   mata CS-02.
2. `config/env.js` + `pool.on('error')` → BUG-11, BUG-12.
3. `migrations/` + `scripts/migrate.js`, removendo `initDb.js` → CS-06.
4. `0003_add_integrity_constraints.sql` → BUG-02, 03, 06, 09, 10 e a rede do 01.
5. `domain/` + `services/` → CS-03, CS-04, CS-05, BUG-01, BUG-08.
6. `validateId` → BUG-04.
7. `COALESCE` no `update` de recurso → BUG-05.
8. `TIMESTAMPTZ` → BUG-07 (coordenado com o frontend).
9. `0004_add_indexes.sql` → CS-09.

Cada item é uma issue, uma branch, um PR. Nunca dois numa branch.
