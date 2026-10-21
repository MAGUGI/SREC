# QA-01 — Suíte de integração da API com Supertest

* **Responsável:** Igor Thiago Seberino (Product Owner + QA)
* **Issue:** #<a definir>
* **Branch:** `test/api-integration-suite`
* **Rubrica:** 4,0 — Onboarding e diagnóstico → 2,5 de melhoria comprovada do código recebido. É esta suíte que transforma "corrigimos o bug" em "existe um teste que falhava e passou a passar".
* **Depende de:** OPS-02 (migrations com node-pg-migrate), BE-04 (AppError + middleware de erro). Consome, sem bloquear: BE-01, BE-02, BE-03, BE-06, BE-07. Alimenta OPS-03 (gate de cobertura na CI) e QA-04 (relatório antes/depois).

## Problema

O backend recebido expõe 10 endpoints e **nenhum deles é tocado por teste algum**.

O único arquivo de teste do repositório é
`server/src/models/reservationModel.test.js` (38 linhas, 2 casos). Ele mocka o
banco (`jest.mock('../config/database')`, linha 4) e exercita apenas
`checkAvailability` nos dois ramos triviais: `rows: []` → `true` (linhas 12-23)
e `rows: [{ id: 1 }]` → `false` (linhas 25-36). Resultado: a fórmula de
sobreposição nunca roda contra Postgres, os controllers nunca são chamados e as
rotas nunca são montadas.

Três fatos do código recebido tornam a situação pior do que o número de
cobertura sugere:

1. **Não existe app testável.** `server/src/index.js` cria o Express, registra
   middleware e rotas (linhas 9-23) e, na mesma função, chama `initDb()` e
   `app.listen()` (linhas 26-31), com `startServer()` executado no carregamento
   do módulo (linha 33). Dar `require('./index')` num teste sobe um servidor
   real na porta 5000 e abre conexão com o banco de produção. Como `app` não é
   exportado, o Supertest não tem o que receber. **Isto é o bloqueio técnico
   número um** e é o motivo pelo qual `supertest` está em
   `server/package.json:32` desde o primeiro commit e não aparece em nenhum
   teste.
2. **Os 10 blocos `try/catch` dos controllers escondem defeito como 500.**
   `resourceController.js:12-15, 22-25, 36-39, 51-54, 65-68` e
   `reservationController.js:30-33, 40-43, 54-57, 69-72, 83-86` são idênticos:
   `console.error(err)` + `res.status(500)`. Qualquer erro de tipo do Postgres
   (`id = 'abc'`) ou violação de `NOT NULL` (`PUT` parcial) vira "Internal
   server error", indistinguível de um bug real de infraestrutura.
3. **Não há validação de entrada além de truthiness.**
   `reservationController.js:7` só checa `if (!resource_id || !user_name ||
   !start_time || !end_time)`; `resourceController.js:7` só checa `if (!name ||
   !type)`. Fim antes do início, status inventado, capacidade negativa e reserva
   no passado passam direto.

Sem suíte de integração, as correções BE-01 a BE-07 ficariam sem prova, e a
rubrica pede prova numérica.

## Evidência

Baseline medido, não estimado:

```bash
cd server
npm ci
npx jest --coverage --coverageReporters=text --collectCoverageFrom='src/**/*.js'
```

| Métrica | Valor medido |
|---|---|
| Cobertura de statements | **6,14 %** |
| Cobertura de branches | **0 %** |
| Cobertura de funções | **3,57 %** |
| Arquivos de teste | **1** |
| Casos de teste | **2** |
| Cobertura dos controllers (`src/controllers/`) | **0 %** |
| Cobertura das rotas (`src/routes/`) | **0 %** |
| Cobertura de `src/models/resourceModel.js` | **0 %** |
| Cobertura de `src/config/initDb.js` e `src/index.js` | **0 %** |

Branches em **0 %** é o dado mais revelador: os dois testes existentes só
percorrem caminho reto, então nenhum `if` do sistema — incluindo os `if` de
validação e os cinco `if (!resource)` que decidem 404 — foi jamais executado.

Reprodução manual de dois defeitos, para quem quiser ver antes de escrever
teste (servidor rodando em `localhost:5000`):

```bash
# BUG-04 — id não numérico devolve 500 em vez de 400
curl -i http://localhost:5000/api/resources/abc

# BUG-02 — reserva invertida é aceita com 201 e nunca colide com nada
curl -i -X POST http://localhost:5000/api/reservations \
  -H 'Content-Type: application/json' \
  -d '{"resource_id":1,"user_name":"Teste","start_time":"2026-11-10T11:00:00Z","end_time":"2026-11-10T09:00:00Z"}'
```

## Decisão

**Escolha: suíte de integração HTTP contra Postgres real e descartável, com
`app` extraído de `index.js`.**

O ponto de partida é extrair `server/src/app.js` contendo a montagem do Express
e deixar em `server/src/index.js` apenas `initDb`/`listen`. Isto não é
cosmético: é pré-requisito para o Supertest, que precisa receber um app que
**não** esteja escutando porta.

Por que Postgres real e não mock do `pg`:

* Três dos bugs mais graves **só existem no banco**. BUG-01 é uma corrida entre
  `checkAvailability` (`reservationController.js:12-16`) e `create` (linhas
  23-28); a correção de BE-01 é uma constraint `EXCLUDE` — um mock jamais
  provaria que ela funciona. BUG-05 é uma violação de `NOT NULL` disparada por
  `resourceModel.js:26-35`, que escreve `name = $1, type = $2, capacity = $3`
  com os três valores vindos do corpo parcial. BUG-04 é um erro de coerção de
  tipo do próprio Postgres.
* A alternativa óbvia — continuar no caminho do teste existente, mockando
  `../config/database` — produz cobertura alta e confiança zero: o teste passa a
  afirmar que o código chama `db.query` com certa string, não que o sistema se
  comporta corretamente. O repositório recebido é a demonstração disso: 100 % de
  `checkAvailability` mockado e um TOCTOU crítico em produção.

Por que **não** `pg-mem` nem SQLite: a correção central da N2 (BE-01) usa
`EXCLUDE USING gist` com `tstzrange` e a extensão `btree_gist`. Nenhum dos dois
suporta isso. O teste rodaria contra um motor que não tem a feature que estamos
testando.

Por que banco **descartável em tmpfs** e não um schema dentro do banco de
desenvolvimento: isolamento. O container de teste sobe na porta `5433`, guarda
dados em `tmpfs` (nada em disco), e é destruído ao fim. Impossível um teste
truncar a tabela de alguém.

Por que `globalSetup`/`globalTeardown` e não um `beforeAll` por arquivo: criar o
banco e rodar as migrations de OPS-02 é operação de processo, não de arquivo de
teste. Rodando uma vez só, a suíte inteira paga o custo de migration uma única
vez; a limpeza por teste fica num `TRUNCATE ... RESTART IDENTITY` no
`beforeEach`, que é mais rápido que recriar schema e garante ids previsíveis.

Por que `TRUNCATE` e não transação com rollback por teste: o caso V-12 (BUG-01)
precisa de **cinco conexões simultâneas** do pool vendo o mesmo estado. Envolver
o teste numa transação única quebraria exatamente o cenário de concorrência que
queremos provar.

Por que `jest.projects` separando `unit` de `integration`: assim
`npm run test:unit` continua rodando sem Docker e sem Postgres — o teste
herdado em `src/models/reservationModel.test.js` continua válido e verde, e a
suíte de QA-02 (lógica pura, sem banco) entra no projeto `unit` sem arrastar
dependência de infraestrutura.

### Meta de cobertura e por que este número

| Métrica | Antes (medido) | Meta ao fim de QA-01 + QA-02 |
|---|---|---|
| Statements | 6,14 % | **≥ 80 %** |
| Branches | 0 % | **≥ 70 %** |
| Funções | 3,57 % | **≥ 85 %** |
| Linhas | ~6 % | **≥ 80 %** |
| `src/controllers/` (statements) | 0 % | **≥ 90 %** |
| `src/routes/` (statements) | 0 % | **100 %** |
| `src/models/resourceModel.js` | 0 % | **≥ 90 %** |
| `src/models/reservationModel.js` | parcial | **≥ 90 %** |
| Arquivos de teste | 1 | **≥ 4** |
| Casos de teste | 2 | **≥ 55** |

Justificativa do 80 %, a partir das linhas reais dos arquivos recebidos:

* Alcançável por HTTP: `controllers/` 162 linhas (`resourceController.js` 72 +
  `reservationController.js` 90), `routes/` 22 linhas (11 + 11), `models/` 108
  linhas (`resourceModel.js` 44 + `reservationModel.js` 64), mais o `app.js`
  novo (~30) e os módulos de BE-04/BE-06. Soma ≈ **322 linhas**, e praticamente
  toda ela é exercitável por requisição.
* **Não** alcançável por HTTP: `src/index.js` 33 linhas são bootstrap puro
  (`listen`) — excluído do `collectCoverageFrom`; `src/config/database.js` 14
  linhas contêm o callback `pool.on('connect')` (linhas 8-10) e o handler de
  `error` que BUG-12 vai adicionar, ramos que só disparam quando o Postgres cai
  — exigiriam injeção de falha, fora do escopo da N2;
  `src/config/initDb.js` 33 linhas saem de cena com OPS-02.

Ou seja: o teto realista é da ordem de 95 %. Fixar a meta em **80 %** deixa
margem de ~15 pontos para os ramos de erro de infraestrutura que não vamos
simular, e é um número que o gate de OPS-03 pode exigir sem virar obstáculo
para a N3. Branches em 70 % — e não 80 % — porque cada `catch` de falha de
conexão é um branch inalcançável sem fault injection, e são 10 deles no código
recebido.

Regra que acompanha a meta: **o número do gate é piso, nunca teto, e só sobe.**

## Alterações

### 1. `server/src/app.js` — criar

Monta o Express sem escutar porta. É o que o Supertest recebe.

```js
const express = require('express');
const cors = require('cors');

const resourceRoutes = require('./routes/resourceRoutes');
const reservationRoutes = require('./routes/reservationRoutes');
const errorHandler = require('./middlewares/errorHandler'); // BE-04
const notFoundHandler = require('./middlewares/notFoundHandler'); // BE-04

const createApp = () => {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get('/', (req, res) => {
    res.send('SREC Coworking API is running...');
  });

  app.use('/api/resources', resourceRoutes);
  app.use('/api/reservations', reservationRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};

module.exports = createApp;
```

O texto do endpoint raiz é copiado literalmente de `index.js:22` para não
quebrar o smoke test de quem já usa a API.

### 2. `server/src/index.js` — reescrever

Fica só o bootstrap. Note que `startServer()` deixa de engolir falha: se as
migrations não rodaram, o processo morre com código 1 em vez de subir um
servidor sem tabela (isto fecha a porta que BUG-11 abriu).

```js
require('dotenv').config();

const createApp = require('./app');
const db = require('./config/database');

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  await db.query('SELECT 1');

  const app = createApp();
  const server = app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });

  const shutdown = async () => {
    server.close();
    await db.end();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
};

startServer().catch((err) => {
  console.error('Failed to start server', err);
  process.exit(1);
});
```

A chamada a `initDb()` (`index.js:27` no recebido) sai: o schema passa a ser
responsabilidade das migrations de OPS-02. `src/config/initDb.js` é removido
por OPS-02, não por esta spec.

### 3. `server/src/config/database.js` — alterar

Exportar `pool` e `end`, que a suíte precisa para fechar conexões e não deixar
handle aberto (`Jest did not exit one second after...`).

```js
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on('connect', () => {
  if (process.env.NODE_ENV !== 'test') {
    console.log('Connected to PostgreSQL Database');
  }
});

// BUG-12: sem este handler, uma queda do Postgres derruba o processo.
pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client', err);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  getClient: () => pool.connect(),
  end: () => pool.end(),
  pool,
};
```

`getClient` é o que BE-01 usa para rodar `checkAvailability` + `create` na mesma
transação; já fica exposto aqui para não criar conflito de merge depois.

### 4. `server/docker-compose.test.yml` — criar

Postgres descartável, porta `5433` para não brigar com um Postgres local em
`5432`, dados em `tmpfs` (nada em disco), `btree_gist` disponível para a
constraint `EXCLUDE` de BE-01.

```yaml
services:
  postgres-test:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: postgres
    ports:
      - '5433:5432'
    tmpfs:
      - /var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U postgres -d postgres']
      interval: 2s
      timeout: 3s
      retries: 30
```

### 5. `server/test/helpers/testDatabaseUrl.js` — criar

Uma única fonte de verdade para a URL do banco de teste, calculada só a partir
de variáveis de ambiente. `globalSetup` e `setupFiles` importam o mesmo módulo —
assim não dependemos de propagação de `process.env` entre o processo do Jest e
os workers, que é a pegadinha clássica desse arranjo.

```js
const HOST = process.env.TEST_PGHOST || 'localhost';
const PORT = process.env.TEST_PGPORT || '5433';
const USER = process.env.TEST_PGUSER || 'postgres';
const PASSWORD = process.env.TEST_PGPASSWORD || 'postgres';
const DATABASE = process.env.TEST_PGDATABASE || 'srec_test';

const adminUrl = () => `postgres://${USER}:${PASSWORD}@${HOST}:${PORT}/postgres`;
const testUrl = () => `postgres://${USER}:${PASSWORD}@${HOST}:${PORT}/${DATABASE}`;

module.exports = { adminUrl, testUrl, DATABASE };
```

### 6. `server/test/globalSetup.js` — criar

Recria o banco do zero e aplica as migrations de OPS-02. Roda uma vez por
execução do projeto `integration`.

```js
const { execFileSync } = require('node:child_process');
const { Client } = require('pg');

const { adminUrl, testUrl, DATABASE } = require('./helpers/testDatabaseUrl');

module.exports = async () => {
  const admin = new Client({ connectionString: adminUrl() });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${DATABASE} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${DATABASE}`);
  await admin.end();

  // Migrations de OPS-02: o schema de teste é o MESMO de produção.
  execFileSync('npx', ['node-pg-migrate', 'up', '--no-reject-unauthorized'], {
    cwd: __dirname + '/..',
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, DATABASE_URL: testUrl(), NODE_ENV: 'test' },
  });
};
```

### 7. `server/test/globalTeardown.js` — criar

```js
const { Client } = require('pg');

const { adminUrl, DATABASE } = require('./helpers/testDatabaseUrl');

module.exports = async () => {
  if (process.env.KEEP_TEST_DB === '1') {
    return; // para inspecionar o banco depois de uma falha
  }
  const admin = new Client({ connectionString: adminUrl() });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${DATABASE} WITH (FORCE)`);
  await admin.end();
};
```

### 8. `server/test/setupEnv.js` — criar

Roda **antes** do registro de módulos de cada arquivo de teste, portanto antes
de `database.js` instanciar o `Pool`.

```js
const { testUrl } = require('./helpers/testDatabaseUrl');

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = testUrl();
```

### 9. `server/test/setupAfterEnv.js` — criar

Limpeza entre testes e fechamento do pool.

```js
const db = require('../src/config/database');

beforeEach(async () => {
  await db.query('TRUNCATE TABLE reservations, resources RESTART IDENTITY CASCADE');
});

afterAll(async () => {
  await db.end();
});
```

`RESTART IDENTITY` zera as sequences, então `id` 1 é sempre o primeiro recurso
criado no teste — nenhum caso precisa adivinhar id.

### 10. `server/test/helpers/factories.js` — criar

```js
const request = require('supertest');

const HOUR_MS = 60 * 60 * 1000;

const createResource = async (app, overrides = {}) => {
  const payload = {
    name: 'Sala Alpha',
    type: 'meeting_room',
    capacity: 6,
    ...overrides,
  };
  const response = await request(app).post('/api/resources').send(payload);
  if (response.status !== 201) {
    throw new Error(`factory createResource falhou: ${response.status} ${JSON.stringify(response.body)}`);
  }
  return response.body;
};

/** Janela futura, alinhada na hora cheia, em UTC. */
const futureSlot = ({ offsetHours = 24, durationHours = 1 } = {}) => {
  const start = new Date(Date.now() + offsetHours * HOUR_MS);
  start.setUTCMinutes(0, 0, 0);
  const end = new Date(start.getTime() + durationHours * HOUR_MS);
  return { start_time: start.toISOString(), end_time: end.toISOString() };
};

const shiftSlot = (slot, hours) => ({
  start_time: new Date(new Date(slot.start_time).getTime() + hours * HOUR_MS).toISOString(),
  end_time: new Date(new Date(slot.end_time).getTime() + hours * HOUR_MS).toISOString(),
});

const pastSlot = () => futureSlot({ offsetHours: -48 });

const createReservation = async (app, resourceId, overrides = {}) => {
  const payload = {
    resource_id: resourceId,
    user_name: 'Carlos Silva',
    ...futureSlot(),
    ...overrides,
  };
  const response = await request(app).post('/api/reservations').send(payload);
  if (response.status !== 201) {
    throw new Error(`factory createReservation falhou: ${response.status} ${JSON.stringify(response.body)}`);
  }
  return response.body;
};

module.exports = { createResource, createReservation, futureSlot, shiftSlot, pastSlot };
```

Todas as datas são ISO com `Z`. Isto é deliberado: exercita o contrato de BE-07
(`TIMESTAMPTZ`) e documenta o defeito de BUG-07, onde `datetime-local` do
`App.jsx:264` manda string sem offset.

### 11. `server/jest.config.js` — criar

```js
module.exports = {
  collectCoverageFrom: ['src/**/*.js', '!src/index.js', '!src/**/*.test.js'],
  coverageReporters: ['text', 'lcov', 'json-summary'],
  coverageThreshold: {
    global: { statements: 80, branches: 70, functions: 85, lines: 80 },
    './src/controllers/': { statements: 90, lines: 90 },
    './src/routes/': { statements: 100, lines: 100 },
  },
  projects: [
    {
      displayName: 'unit',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/src/**/*.test.js'],
    },
    {
      displayName: 'integration',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/test/integration/**/*.test.js'],
      globalSetup: '<rootDir>/test/globalSetup.js',
      globalTeardown: '<rootDir>/test/globalTeardown.js',
      setupFiles: ['<rootDir>/test/setupEnv.js'],
      setupFilesAfterEnv: ['<rootDir>/test/setupAfterEnv.js'],
      testTimeout: 15000,
    },
  ],
};
```

O limiar por pasta em `coverageThreshold` é o que impede a suíte de "ganhar"
cobertura global sem tocar nos controllers, que é justamente a camada que estava
em 0 %.

### 12. `server/package.json` — alterar scripts

```json
  "scripts": {
    "start": "node src/index.js",
    "dev": "nodemon src/index.js",
    "lint": "eslint src/ test/",
    "lint:fix": "eslint src/ test/ --fix",
    "format": "prettier --write \"src/**/*.js\" \"test/**/*.js\"",
    "test": "jest --runInBand",
    "test:unit": "jest --selectProjects unit",
    "test:integration": "jest --selectProjects integration --runInBand",
    "test:coverage": "jest --runInBand --coverage",
    "db:test:up": "docker compose -f docker-compose.test.yml up -d --wait",
    "db:test:down": "docker compose -f docker-compose.test.yml down -v"
  }
```

`--runInBand` não é preguiça: workers paralelos compartilhariam o mesmo banco e
o `TRUNCATE` de um apagaria os dados do outro. Serial é correto; a suíte roda em
poucos segundos.

### 13. `server/test/integration/resources.test.js` — criar

```js
const request = require('supertest');

const createApp = require('../../src/app');
const { createResource, createReservation } = require('../helpers/factories');

const app = createApp();

describe('API de recursos', () => {
  describe('POST /api/resources', () => {
    it('R-01 cria recurso válido e devolve 201 com id', async () => {
      const response = await request(app)
        .post('/api/resources')
        .send({ name: 'Sala Alpha', type: 'meeting_room', capacity: 6 });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        name: 'Sala Alpha',
        type: 'meeting_room',
        capacity: 6,
      });
      expect(response.body.id).toEqual(expect.any(Number));
    });

    it('R-02 assume capacidade 1 quando o campo é omitido', async () => {
      const response = await request(app)
        .post('/api/resources')
        .send({ name: 'Estação 7', type: 'workstation' });

      expect(response.status).toBe(201);
      expect(response.body.capacity).toBe(1);
    });

    it('R-03 recusa recurso sem nome', async () => {
      const response = await request(app)
        .post('/api/resources')
        .send({ type: 'workstation', capacity: 1 });

      expect(response.status).toBe(400);
    });

    it('R-04 recusa recurso sem tipo', async () => {
      const response = await request(app)
        .post('/api/resources')
        .send({ name: 'Sem tipo', capacity: 1 });

      expect(response.status).toBe(400);
    });

    it('R-05 recusa tipo fora do enum (BUG-10)', async () => {
      const response = await request(app)
        .post('/api/resources')
        .send({ name: 'Puff', type: 'sofa', capacity: 2 });

      expect(response.status).toBe(400);
    });

    // BUG-09 — hoje `capacity || 1` em resourceController.js:10 transforma 0 em 1.
    it('R-06 recusa capacidade zero (BUG-09)', async () => {
      const response = await request(app)
        .post('/api/resources')
        .send({ name: 'Sala vazia', type: 'meeting_room', capacity: 0 });

      expect(response.status).toBe(400);
    });

    // BUG-09 — hoje -5 é gravado sem reclamação.
    it('R-07 recusa capacidade negativa (BUG-09)', async () => {
      const response = await request(app)
        .post('/api/resources')
        .send({ name: 'Sala negativa', type: 'meeting_room', capacity: -5 });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/resources', () => {
    it('R-08 devolve lista vazia quando não há recurso', async () => {
      const response = await request(app).get('/api/resources');

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });

    it('R-09 devolve os recursos ordenados por id', async () => {
      await createResource(app, { name: 'Primeira' });
      await createResource(app, { name: 'Segunda' });

      const response = await request(app).get('/api/resources');

      expect(response.status).toBe(200);
      expect(response.body.map((r) => r.name)).toEqual(['Primeira', 'Segunda']);
    });
  });

  describe('GET /api/resources/:id', () => {
    it('R-10 devolve 200 para recurso existente', async () => {
      const resource = await createResource(app);

      const response = await request(app).get(`/api/resources/${resource.id}`);

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(resource.id);
    });

    it('R-11 devolve 404 para id inexistente', async () => {
      const response = await request(app).get('/api/resources/999999');

      expect(response.status).toBe(404);
    });

    // BUG-04 — hoje o Postgres rejeita a coerção e o catch devolve 500.
    it('R-12 devolve 400 para id não numérico (BUG-04)', async () => {
      const response = await request(app).get('/api/resources/abc');

      expect(response.status).toBe(400);
      expect(response.status).not.toBe(500);
    });
  });

  describe('PUT /api/resources/:id', () => {
    it('R-13 atualiza recurso com corpo completo', async () => {
      const resource = await createResource(app);

      const response = await request(app)
        .put(`/api/resources/${resource.id}`)
        .send({ name: 'Sala Beta', type: 'workstation', capacity: 2 });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        name: 'Sala Beta',
        type: 'workstation',
        capacity: 2,
      });
    });

    // BUG-05 — hoje resourceModel.js:26-35 grava NULL em coluna NOT NULL e o
    // controller devolve 500.
    it('R-14 aceita corpo parcial preservando os demais campos (BUG-05)', async () => {
      const resource = await createResource(app, {
        name: 'Sala Alpha',
        type: 'meeting_room',
        capacity: 6,
      });

      const response = await request(app)
        .put(`/api/resources/${resource.id}`)
        .send({ name: 'Sala Alpha Renomeada' });

      expect(response.status).not.toBe(500);
      expect([200, 400]).toContain(response.status);

      if (response.status === 200) {
        expect(response.body).toMatchObject({
          name: 'Sala Alpha Renomeada',
          type: 'meeting_room',
          capacity: 6,
        });
      }
    });

    it('R-15 recusa corpo vazio', async () => {
      const resource = await createResource(app);

      const response = await request(app).put(`/api/resources/${resource.id}`).send({});

      expect(response.status).toBe(400);
    });

    it('R-16 devolve 404 ao atualizar recurso inexistente', async () => {
      const response = await request(app)
        .put('/api/resources/999999')
        .send({ name: 'X', type: 'workstation', capacity: 1 });

      expect(response.status).toBe(404);
    });

    it('R-17 devolve 400 para id não numérico (BUG-04)', async () => {
      const response = await request(app)
        .put('/api/resources/abc')
        .send({ name: 'X', type: 'workstation', capacity: 1 });

      expect(response.status).toBe(400);
    });
  });

  describe('DELETE /api/resources/:id', () => {
    it('R-18 remove recurso existente', async () => {
      const resource = await createResource(app);

      const response = await request(app).delete(`/api/resources/${resource.id}`);

      expect(response.status).toBe(200);

      const check = await request(app).get(`/api/resources/${resource.id}`);
      expect(check.status).toBe(404);
    });

    it('R-19 devolve 404 ao remover recurso inexistente', async () => {
      const response = await request(app).delete('/api/resources/999999');

      expect(response.status).toBe(404);
    });

    it('R-20 devolve 400 para id não numérico (BUG-04)', async () => {
      const response = await request(app).delete('/api/resources/abc');

      expect(response.status).toBe(400);
    });

    // BUG-06 — ON DELETE CASCADE em initDb.js:16 apaga as reservas em silêncio.
    // O status alvo (409 vs 200 com aviso) é decidido na issue do BUG-06;
    // este caso entra como todo para não travar QA-01.
    it.todo('R-21 não apaga silenciosamente reservas ativas ao remover recurso (BUG-06)');

    it('R-22 expõe o acoplamento recurso→reserva de forma observável', async () => {
      const resource = await createResource(app);
      await createReservation(app, resource.id);

      const before = await request(app).get('/api/reservations');
      expect(before.body).toHaveLength(1);

      await request(app).delete(`/api/resources/${resource.id}`);

      const after = await request(app).get('/api/reservations');
      // Documenta o comportamento atual; a issue do BUG-06 altera esta
      // expectativa e o teste passa a ser a prova da correção.
      expect(after.body).toHaveLength(0);
    });
  });
});
```

### 14. `server/test/integration/reservations.test.js` — criar

```js
const request = require('supertest');

const createApp = require('../../src/app');
const {
  createResource,
  createReservation,
  futureSlot,
  shiftSlot,
  pastSlot,
} = require('../helpers/factories');

const app = createApp();

describe('API de reservas', () => {
  describe('POST /api/reservations', () => {
    it('V-01 cria reserva futura com status scheduled', async () => {
      const resource = await createResource(app);
      const slot = futureSlot();

      const response = await request(app)
        .post('/api/reservations')
        .send({ resource_id: resource.id, user_name: 'Carlos Silva', ...slot });

      expect(response.status).toBe(201);
      expect(response.body.status).toBe('scheduled');
      expect(response.body.resource_id).toBe(resource.id);
    });

    it('V-02 recusa reserva sem user_name', async () => {
      const resource = await createResource(app);

      const response = await request(app)
        .post('/api/reservations')
        .send({ resource_id: resource.id, ...futureSlot() });

      expect(response.status).toBe(400);
    });

    // BUG-02 — hoje reservationController.js:7 só checa truthiness, a reserva
    // invertida é aceita com 201 e checkAvailability nunca a encontra.
    it('V-03 recusa reserva com fim antes do início (BUG-02)', async () => {
      const resource = await createResource(app);
      const slot = futureSlot();

      const response = await request(app).post('/api/reservations').send({
        resource_id: resource.id,
        user_name: 'Carlos Silva',
        start_time: slot.end_time,
        end_time: slot.start_time,
      });

      expect(response.status).toBe(400);
    });

    it('V-04 recusa reserva de duração zero (BE-02)', async () => {
      const resource = await createResource(app);
      const slot = futureSlot();

      const response = await request(app).post('/api/reservations').send({
        resource_id: resource.id,
        user_name: 'Carlos Silva',
        start_time: slot.start_time,
        end_time: slot.start_time,
      });

      expect(response.status).toBe(400);
    });

    // BUG-08 — hoje não existe comparação com o instante atual.
    it('V-05 recusa reserva no passado (BUG-08)', async () => {
      const resource = await createResource(app);

      const response = await request(app)
        .post('/api/reservations')
        .send({ resource_id: resource.id, user_name: 'Carlos Silva', ...pastSlot() });

      expect(response.status).toBe(400);
    });

    it('V-06 recusa sobreposição parcial com 409', async () => {
      const resource = await createResource(app);
      const slot = futureSlot({ durationHours: 2 });
      await createReservation(app, resource.id, slot);

      const response = await request(app)
        .post('/api/reservations')
        .send({ resource_id: resource.id, user_name: 'Outro', ...shiftSlot(slot, 1) });

      expect(response.status).toBe(409);
    });

    it('V-07 recusa intervalo idêntico com 409', async () => {
      const resource = await createResource(app);
      const slot = futureSlot();
      await createReservation(app, resource.id, slot);

      const response = await request(app)
        .post('/api/reservations')
        .send({ resource_id: resource.id, user_name: 'Outro', ...slot });

      expect(response.status).toBe(409);
    });

    it('V-08 recusa intervalo contido no existente com 409', async () => {
      const resource = await createResource(app);
      const slot = futureSlot({ durationHours: 4 });
      await createReservation(app, resource.id, slot);

      const inner = {
        start_time: new Date(new Date(slot.start_time).getTime() + 3600_000).toISOString(),
        end_time: new Date(new Date(slot.end_time).getTime() - 3600_000).toISOString(),
      };

      const response = await request(app)
        .post('/api/reservations')
        .send({ resource_id: resource.id, user_name: 'Outro', ...inner });

      expect(response.status).toBe(409);
    });

    it('V-09 permite reserva que começa exatamente quando a anterior termina', async () => {
      const resource = await createResource(app);
      const slot = futureSlot();
      await createReservation(app, resource.id, slot);

      const response = await request(app)
        .post('/api/reservations')
        .send({ resource_id: resource.id, user_name: 'Outro', ...shiftSlot(slot, 1) });

      expect(response.status).toBe(201);
    });

    it('V-10 permite reserva que termina exatamente quando a seguinte começa', async () => {
      const resource = await createResource(app);
      const slot = futureSlot({ offsetHours: 48 });
      await createReservation(app, resource.id, slot);

      const response = await request(app)
        .post('/api/reservations')
        .send({ resource_id: resource.id, user_name: 'Outro', ...shiftSlot(slot, -1) });

      expect(response.status).toBe(201);
    });

    it('V-11 libera o horário de uma reserva cancelada', async () => {
      const resource = await createResource(app);
      const slot = futureSlot();
      const reservation = await createReservation(app, resource.id, slot);

      await request(app)
        .patch(`/api/reservations/${reservation.id}/status`)
        .send({ status: 'cancelled' })
        .expect(200);

      const response = await request(app)
        .post('/api/reservations')
        .send({ resource_id: resource.id, user_name: 'Outro', ...slot });

      expect(response.status).toBe(201);
    });

    // BUG-01 — TOCTOU entre checkAvailability (reservationController.js:12-16)
    // e create (linhas 23-28). Hoje este teste cria 5 reservas sobrepostas.
    it('V-12 aceita exatamente uma de cinco requisições concorrentes no mesmo horário (BUG-01)', async () => {
      const resource = await createResource(app);
      const slot = futureSlot({ offsetHours: 72 });

      const responses = await Promise.all(
        Array.from({ length: 5 }, (_, index) =>
          request(app)
            .post('/api/reservations')
            .send({ resource_id: resource.id, user_name: `Usuario ${index}`, ...slot }),
        ),
      );

      const statuses = responses.map((r) => r.status).sort();
      const created = statuses.filter((s) => s === 201);
      const conflicted = statuses.filter((s) => s === 409);

      expect(created).toHaveLength(1);
      expect(conflicted).toHaveLength(4);
      expect(statuses.filter((s) => s >= 500)).toHaveLength(0);

      const list = await request(app).get('/api/reservations');
      expect(list.body).toHaveLength(1);
    });

    it('V-13 devolve 404 para resource_id inexistente', async () => {
      const response = await request(app)
        .post('/api/reservations')
        .send({ resource_id: 999999, user_name: 'Carlos Silva', ...futureSlot() });

      expect(response.status).toBe(404);
    });

    it('V-14 devolve 400 para resource_id não numérico (BUG-04)', async () => {
      const response = await request(app)
        .post('/api/reservations')
        .send({ resource_id: 'abc', user_name: 'Carlos Silva', ...futureSlot() });

      expect(response.status).toBe(400);
      expect(response.status).not.toBe(500);
    });
  });

  describe('GET /api/reservations', () => {
    it('V-15 devolve as reservas ordenadas por start_time', async () => {
      const resource = await createResource(app);
      const later = futureSlot({ offsetHours: 50 });
      const earlier = futureSlot({ offsetHours: 25 });
      await createReservation(app, resource.id, { ...later, user_name: 'Depois' });
      await createReservation(app, resource.id, { ...earlier, user_name: 'Antes' });

      const response = await request(app).get('/api/reservations');

      expect(response.status).toBe(200);
      expect(response.body.map((r) => r.user_name)).toEqual(['Antes', 'Depois']);
    });
  });

  describe('GET /api/reservations/:id', () => {
    it('V-16 devolve 200 para reserva existente', async () => {
      const resource = await createResource(app);
      const reservation = await createReservation(app, resource.id);

      const response = await request(app).get(`/api/reservations/${reservation.id}`);

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(reservation.id);
    });

    it('V-17 devolve 404 para reserva inexistente', async () => {
      const response = await request(app).get('/api/reservations/999999');

      expect(response.status).toBe(404);
    });

    it('V-18 devolve 400 para id não numérico (BUG-04)', async () => {
      const response = await request(app).get('/api/reservations/abc');

      expect(response.status).toBe(400);
    });
  });

  describe('PATCH /api/reservations/:id/status', () => {
    it('V-19 cancela reserva agendada', async () => {
      const resource = await createResource(app);
      const reservation = await createReservation(app, resource.id);

      const response = await request(app)
        .patch(`/api/reservations/${reservation.id}/status`)
        .send({ status: 'cancelled' });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('cancelled');
    });

    it('V-20 conclui reserva agendada', async () => {
      const resource = await createResource(app);
      const reservation = await createReservation(app, resource.id);

      const response = await request(app)
        .patch(`/api/reservations/${reservation.id}/status`)
        .send({ status: 'completed' });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('completed');
    });

    // BUG-03 — hoje reservationController.js:60-64 grava qualquer string.
    it('V-21 recusa status fora do enum (BUG-03)', async () => {
      const resource = await createResource(app);
      const reservation = await createReservation(app, resource.id);

      const response = await request(app)
        .patch(`/api/reservations/${reservation.id}/status`)
        .send({ status: 'banana' });

      expect(response.status).toBe(400);

      const check = await request(app).get(`/api/reservations/${reservation.id}`);
      expect(check.body.status).toBe('scheduled');
    });

    // BUG-03 — hoje o corpo sem status grava NULL na coluna e devolve 200.
    it('V-22 recusa corpo sem status (BUG-03)', async () => {
      const resource = await createResource(app);
      const reservation = await createReservation(app, resource.id);

      const response = await request(app)
        .patch(`/api/reservations/${reservation.id}/status`)
        .send({});

      expect(response.status).toBe(400);

      const check = await request(app).get(`/api/reservations/${reservation.id}`);
      expect(check.body.status).toBe('scheduled');
    });

    it('V-23 recusa transição de cancelled para completed (BE-03)', async () => {
      const resource = await createResource(app);
      const reservation = await createReservation(app, resource.id);

      await request(app)
        .patch(`/api/reservations/${reservation.id}/status`)
        .send({ status: 'cancelled' })
        .expect(200);

      const response = await request(app)
        .patch(`/api/reservations/${reservation.id}/status`)
        .send({ status: 'completed' });

      expect(response.status).toBe(409);
    });

    it('V-24 devolve 404 para reserva inexistente', async () => {
      const response = await request(app)
        .patch('/api/reservations/999999/status')
        .send({ status: 'cancelled' });

      expect(response.status).toBe(404);
    });

    it('V-25 devolve 400 para id não numérico (BUG-04)', async () => {
      const response = await request(app)
        .patch('/api/reservations/abc/status')
        .send({ status: 'cancelled' });

      expect(response.status).toBe(400);
    });
  });

  describe('DELETE /api/reservations/:id', () => {
    it('V-26 remove reserva existente', async () => {
      const resource = await createResource(app);
      const reservation = await createReservation(app, resource.id);

      const response = await request(app).delete(`/api/reservations/${reservation.id}`);

      expect(response.status).toBe(200);

      const check = await request(app).get(`/api/reservations/${reservation.id}`);
      expect(check.status).toBe(404);
    });

    it('V-27 devolve 404 ao remover reserva inexistente', async () => {
      const response = await request(app).delete('/api/reservations/999999');

      expect(response.status).toBe(404);
    });

    it('V-28 devolve 400 para id não numérico (BUG-04)', async () => {
      const response = await request(app).delete('/api/reservations/abc');

      expect(response.status).toBe(400);
    });
  });
});
```

### 15. `server/test/integration/app.test.js` — criar

```js
const request = require('supertest');

const createApp = require('../../src/app');

const app = createApp();

describe('Contrato geral da aplicação', () => {
  it('A-01 responde no endpoint raiz', async () => {
    const response = await request(app).get('/');

    expect(response.status).toBe(200);
    expect(response.text).toContain('SREC Coworking API is running');
  });

  it('A-02 devolve 404 em JSON para rota desconhecida (BE-04)', async () => {
    const response = await request(app).get('/api/nope');

    expect(response.status).toBe(404);
    expect(response.headers['content-type']).toMatch(/json/);
    expect(response.body).toHaveProperty('error');
  });

  it('A-03 devolve 400 para JSON malformado em vez de 500 (BE-04)', async () => {
    const response = await request(app)
      .post('/api/resources')
      .set('Content-Type', 'application/json')
      .send('{"name": "Sala",');

    expect(response.status).toBe(400);
    expect(response.status).not.toBe(500);
  });

  it('A-04 usa o mesmo envelope de erro em todas as respostas de erro (BE-04)', async () => {
    const responses = await Promise.all([
      request(app).get('/api/resources/abc'),
      request(app).get('/api/resources/999999'),
      request(app).post('/api/resources').send({}),
    ]);

    for (const response of responses) {
      expect(response.headers['content-type']).toMatch(/json/);
      expect(response.body).toHaveProperty('error');
    }
  });
});
```

### 16. `server/.env.example` — alterar

Acrescentar as variáveis do banco de teste, para quem clona não precisar
adivinhar a porta `5433`.

```
DATABASE_URL=postgres://postgres:postgres@localhost:5432/srec
PORT=5000

# Banco de teste descartável (docker-compose.test.yml)
TEST_PGHOST=localhost
TEST_PGPORT=5433
TEST_PGUSER=postgres
TEST_PGPASSWORD=postgres
TEST_PGDATABASE=srec_test
```

## Testes

### Mapa completo de casos

Legenda da coluna **Hoje**: `FALHA` = o caso reprova contra o código recebido e
só passa depois da correção indicada; `passa` = já verde, serve de rede de
proteção contra regressão.

#### Recursos — `test/integration/resources.test.js`

| # | Método e rota | Cenário | Status esperado | Hoje | Prova |
|---|---|---|---|---|---|
| R-01 | `POST /api/resources` | corpo completo e válido | 201 | passa | — |
| R-02 | `POST /api/resources` | `capacity` omitido | 201 com `capacity: 1` | passa | — |
| R-03 | `POST /api/resources` | sem `name` | 400 | passa | — |
| R-04 | `POST /api/resources` | sem `type` | 400 | passa | — |
| R-05 | `POST /api/resources` | `type: 'sofa'` | 400 | **FALHA** (201) | BUG-10 |
| R-06 | `POST /api/resources` | `capacity: 0` | 400 | **FALHA** (201 com 1) | BUG-09 |
| R-07 | `POST /api/resources` | `capacity: -5` | 400 | **FALHA** (201 com −5) | BUG-09 |
| R-08 | `GET /api/resources` | base vazia | 200 + `[]` | passa | — |
| R-09 | `GET /api/resources` | dois recursos, ordem por `id` | 200 + 2 itens | passa | — |
| R-10 | `GET /api/resources/:id` | id existente | 200 | passa | — |
| R-11 | `GET /api/resources/:id` | `999999` | 404 | passa | — |
| R-12 | `GET /api/resources/:id` | `abc` | 400 | **FALHA** (500) | BUG-04 |
| R-13 | `PUT /api/resources/:id` | corpo completo | 200 | passa | — |
| R-14 | `PUT /api/resources/:id` | corpo parcial `{name}` | 200 ou 400, **nunca 500** | **FALHA** (500) | BUG-05 |
| R-15 | `PUT /api/resources/:id` | corpo vazio `{}` | 400 | **FALHA** (500) | BUG-05 |
| R-16 | `PUT /api/resources/:id` | id inexistente | 404 | passa | — |
| R-17 | `PUT /api/resources/:id` | `abc` | 400 | **FALHA** (500) | BUG-04 |
| R-18 | `DELETE /api/resources/:id` | id existente | 200 + `GET` posterior 404 | passa | — |
| R-19 | `DELETE /api/resources/:id` | id inexistente | 404 | passa | — |
| R-20 | `DELETE /api/resources/:id` | `abc` | 400 | **FALHA** (500) | BUG-04 |
| R-21 | `DELETE /api/resources/:id` | recurso com reserva ativa | `it.todo` até a issue do BUG-06 | — | BUG-06 |
| R-22 | `DELETE /api/resources/:id` | efeito do cascade, observável | 200 + reservas zeradas | passa | BUG-06 (documenta) |

#### Reservas — `test/integration/reservations.test.js`

| # | Método e rota | Cenário | Status esperado | Hoje | Prova |
|---|---|---|---|---|---|
| V-01 | `POST /api/reservations` | janela futura válida | 201 + `status: 'scheduled'` | passa | — |
| V-02 | `POST /api/reservations` | sem `user_name` | 400 | passa | — |
| V-03 | `POST /api/reservations` | `end_time` < `start_time` | 400 | **FALHA** (201) | BUG-02 |
| V-04 | `POST /api/reservations` | `end_time` == `start_time` | 400 | **FALHA** (201) | BE-02 |
| V-05 | `POST /api/reservations` | janela no passado | 400 | **FALHA** (201) | BUG-08 |
| V-06 | `POST /api/reservations` | sobreposição parcial | 409 | passa | — |
| V-07 | `POST /api/reservations` | intervalo idêntico | 409 | passa | — |
| V-08 | `POST /api/reservations` | intervalo contido | 409 | passa | — |
| V-09 | `POST /api/reservations` | começa quando a anterior termina | 201 | passa | borda |
| V-10 | `POST /api/reservations` | termina quando a seguinte começa | 201 | passa | borda |
| V-11 | `POST /api/reservations` | horário liberado por `cancelled` | 201 | passa | — |
| V-12 | `POST /api/reservations` | **5 requisições concorrentes no mesmo slot** | exatamente 1×201 e 4×409, zero 5xx | **FALHA** (5×201) | BUG-01 |
| V-13 | `POST /api/reservations` | `resource_id` inexistente | 404 | **FALHA** (500, FK) | BUG-04/BE-04 |
| V-14 | `POST /api/reservations` | `resource_id: 'abc'` | 400 | **FALHA** (500) | BUG-04 |
| V-15 | `GET /api/reservations` | ordem por `start_time` | 200 + ordem correta | passa | — |
| V-16 | `GET /api/reservations/:id` | id existente | 200 | passa | — |
| V-17 | `GET /api/reservations/:id` | `999999` | 404 | passa | — |
| V-18 | `GET /api/reservations/:id` | `abc` | 400 | **FALHA** (500) | BUG-04 |
| V-19 | `PATCH /api/reservations/:id/status` | `cancelled` | 200 | passa | — |
| V-20 | `PATCH /api/reservations/:id/status` | `completed` | 200 | passa | — |
| V-21 | `PATCH /api/reservations/:id/status` | `banana` | 400 + status preservado | **FALHA** (200) | BUG-03 |
| V-22 | `PATCH /api/reservations/:id/status` | corpo sem `status` | 400 + status preservado | **FALHA** (200, grava `NULL`) | BUG-03 |
| V-23 | `PATCH /api/reservations/:id/status` | `cancelled` → `completed` | 409 | **FALHA** (200) | BE-03 |
| V-24 | `PATCH /api/reservations/:id/status` | id inexistente | 404 | passa | — |
| V-25 | `PATCH /api/reservations/:id/status` | `abc` | 400 | **FALHA** (500) | BUG-04 |
| V-26 | `DELETE /api/reservations/:id` | id existente | 200 + `GET` posterior 404 | passa | — |
| V-27 | `DELETE /api/reservations/:id` | id inexistente | 404 | passa | — |
| V-28 | `DELETE /api/reservations/:id` | `abc` | 400 | **FALHA** (500) | BUG-04 |

#### Contrato geral — `test/integration/app.test.js`

| # | Método e rota | Cenário | Status esperado | Hoje | Prova |
|---|---|---|---|---|---|
| A-01 | `GET /` | smoke test | 200 + texto | passa | — |
| A-02 | `GET /api/nope` | rota desconhecida | 404 em JSON | **FALHA** (404 em HTML) | BE-04 |
| A-03 | `POST /api/resources` | JSON malformado | 400 | **FALHA** (500) | BE-04 |
| A-04 | três rotas de erro | envelope de erro uniforme | sempre JSON com `error` | parcial | BE-04 |

### Contagem

| | Antes | Depois de QA-01 |
|---|---|---|
| Arquivos de teste | 1 | **4** |
| Casos executáveis | 2 | **55** (2 herdados + 53 novos) |
| Casos `it.todo` | 0 | 1 (R-21, aguarda a issue do BUG-06) |
| Casos que reprovam contra o código recebido | 0 | **22** |
| Endpoints cobertos | 0 de 10 | **10 de 10** |

Os 22 casos que reprovam hoje são a prova documental que o pitch (QA-04) usa:
cada um deles é um bug do catálogo que deixa de ser alegação e passa a ser
assertion.

### Comandos

```bash
cd server

# 1. sobe o Postgres descartável (porta 5433, dados em tmpfs)
npm run db:test:up

# 2. só a lógica pura, sem banco — roda em qualquer máquina
npm run test:unit

# 3. a suíte HTTP contra Postgres real
npm run test:integration

# 4. tudo com relatório de cobertura e gate
npm run test:coverage

# 5. derruba e apaga o banco de teste
npm run db:test:down
```

Para rodar um caso isolado durante a investigação de uma falha:

```bash
npx jest --selectProjects integration -t 'V-12' --runInBand
KEEP_TEST_DB=1 npx jest --selectProjects integration -t 'V-12' --runInBand
psql postgres://postgres:postgres@localhost:5433/srec_test -c 'SELECT * FROM reservations'
```

## Critérios de aceite

* [ ] `server/src/app.js` existe, exporta `createApp()` e **não** chama
      `listen` nem `initDb`.
* [ ] `server/src/index.js` não tem definição de rota nem de middleware; só
      bootstrap, e encerra o processo com código 1 se o banco não responder.
* [ ] `npm run test:unit` passa **sem** Postgres rodando.
* [ ] `npm run db:test:up && npm run test:integration` passa numa máquina limpa,
      com um único comando por etapa.
* [ ] `globalSetup` cria o banco e aplica as migrations de OPS-02; nenhuma
      tabela é criada por `CREATE TABLE` dentro de arquivo de teste.
* [ ] `globalTeardown` derruba o banco de teste (salvo `KEEP_TEST_DB=1`).
* [ ] O `beforeEach` trunca `reservations` e `resources` com `RESTART IDENTITY`;
      rodar a suíte duas vezes seguidas dá o mesmo resultado.
* [ ] Os 10 endpoints têm pelo menos um caminho feliz e um caminho de erro.
* [ ] Existem casos nomeados para BUG-01, BUG-02, BUG-03, BUG-04, BUG-05,
      BUG-08 e BUG-09, cada um com o ID do bug em comentário no código.
* [ ] Antes das correções: a suíte reprova em **22** casos, e os 22 são os
      marcados `FALHA` na tabela. Rodar e anexar a saída ao PR.
* [ ] Depois das correções (BE-01 a BE-04): **0** reprovações, **0** casos
      pulados além do `it.todo` de R-21.
* [ ] `npm run test:coverage` atinge statements ≥ 80 %, branches ≥ 70 %,
      funções ≥ 85 %, linhas ≥ 80 %, com `src/index.js` excluído.
* [ ] `src/controllers/` ≥ 90 % de statements e `src/routes/` em 100 %,
      verificados pelo `coverageThreshold` por pasta.
* [ ] Nenhum teste de integração usa `jest.mock` do `../config/database`.
* [ ] Jest encerra sozinho, sem `--forceExit` e sem aviso de handle aberto.
* [ ] `npm run lint` passa com `test/` incluído no escopo.
* [ ] Os números medidos (antes e depois) foram transcritos na tabela de QA-04.

## Passo a passo TBD

```bash
# 1. Branch curta a partir de main atualizada
git checkout main
git pull --ff-only origin main
git checkout -b test/api-integration-suite

# 2. Infraestrutura de teste (compose + helpers + config do Jest)
# cria docker-compose.test.yml, test/helpers/, test/globalSetup.js,
# test/globalTeardown.js, test/setupEnv.js, test/setupAfterEnv.js,
# jest.config.js e ajusta os scripts do package.json
npm run db:test:up
npm run test:unit
git add server/docker-compose.test.yml server/test server/jest.config.js server/package.json server/.env.example
git commit -m "test(server): adicionar infraestrutura de teste com Postgres descartável"

# 3. Extrair o app do bootstrap — pré-requisito do Supertest
git add server/src/app.js server/src/index.js server/src/config/database.js
git commit -m "refactor(server): extrair construção do app Express para app.js"

# 4. Suíte de recursos
npx jest --selectProjects integration -t 'API de recursos' --runInBand
git add server/test/integration/resources.test.js
git commit -m "test(resources): cobrir os cinco endpoints de recursos com Supertest"

# 5. Suíte de reservas
npx jest --selectProjects integration -t 'API de reservas' --runInBand
git add server/test/integration/reservations.test.js
git commit -m "test(reservations): cobrir os cinco endpoints de reservas com Supertest"

# 6. Contrato geral
git add server/test/integration/app.test.js
git commit -m "test(server): cobrir endpoint raiz, rota desconhecida e envelope de erro"

# 7. Registrar a linha de base vermelha, que é a evidência do PR
npm run test:coverage 2>&1 | tee ../docs/auditoria/evidencias/qa-01-antes.txt
git add ../docs/auditoria/evidencias/qa-01-antes.txt
git commit -m "docs(qa): registrar saída da suíte antes das correções"

# 8. Gate de cobertura
git add server/jest.config.js
git commit -m "test(server): exigir 80% de statements e 70% de branches no gate"

# 9. Abrir PR
git push -u origin test/api-integration-suite
# PR: "QA-01 — Suíte de integração da API com Supertest"
# Corpo: colar a tabela de casos, a contagem antes/depois e a saída do passo 7.
# Revisor obrigatório: @igorSeberino (QA). Fecha a issue #<a definir>.
```

Ordem de merge combinada com o time: **QA-01 entra antes de BE-01..BE-04**, com
a suíte vermelha e a CI configurada para reportar sem bloquear (`continue-on-error`
no job de integração, definido em OPS-03). Cada PR de correção de bug tem então
a obrigação de virar ao menos um caso de vermelho para verde, e o próprio diff
do relatório de teste é a evidência. Quando o último dos 22 casos ficar verde,
OPS-03 remove o `continue-on-error` e o gate passa a bloquear.

## Prompt para o Claude Code

```
Implemente a spec docs/specs/qa-01-api-integration-suite/implementacao.md neste
repositório. Leia a spec inteira antes de escrever qualquer linha, e carregue as
skills de backend e de testes disponíveis em .claude/skills/.

Contexto que você precisa confirmar lendo o código, não presumir:
- server/src/index.js monta o Express e chama listen() no carregamento do
  módulo, por isso o Supertest não tem app para receber. Extrair
  server/src/app.js com createApp() é o primeiro passo e é pré-requisito de
  todo o resto.
- server/src/models/reservationModel.test.js é o único teste existente, mocka
  ../config/database e precisa continuar passando no projeto "unit" do Jest,
  sem Postgres.
- supertest@7 e jest@30 já estão em server/package.json; não instale nada além
  de node-pg-migrate, que vem de OPS-02.

Ordem de trabalho, um commit por etapa, mensagens prontas na seção
"Passo a passo TBD" da spec:
1. docker-compose.test.yml, test/helpers/, globalSetup, globalTeardown,
   setupEnv, setupAfterEnv, jest.config.js com projects unit/integration e
   scripts do package.json.
2. Extração de src/app.js e reescrita de src/index.js; src/config/database.js
   passa a exportar end/getClient/pool e a ter handler de erro do pool.
3. test/integration/resources.test.js, reservations.test.js e app.test.js com
   TODOS os casos das tabelas R-01..R-22, V-01..V-28 e A-01..A-04. Use
   exatamente os IDs dos casos no nome de cada it(), e cite o ID do bug em
   comentário nos casos que provam bug.
4. Rode: npm run db:test:up && npm run test:coverage. Salve a saída em
   docs/auditoria/evidencias/qa-01-antes.txt.

Regras:
- Não corrija nenhum bug nesta branch. QA-01 só escreve teste. Os 22 casos
  marcados FALHA na spec DEVEM reprovar ao fim do seu trabalho; se algum passar,
  o teste está frouxo — aperte a assertion, não relaxe a expectativa.
- Nenhum teste de integração pode usar jest.mock de ../config/database.
- Nenhum arquivo de teste cria tabela: o schema vem das migrations.
- Não use --forceExit. Se o Jest não encerrar, feche o pool no afterAll.
- Código e identificadores em inglês; comentários explicativos e mensagens de
  commit em português, no imperativo.

Ao terminar, reporte: quantidade de arquivos de teste, de casos executáveis, de
casos que reprovaram, e os quatro números de cobertura, comparados com o
baseline de 6,14 % / 0 % / 3,57 % / 1 arquivo / 2 casos.
```
