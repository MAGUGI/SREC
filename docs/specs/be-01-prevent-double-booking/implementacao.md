# BE-01 — Impedir dupla reserva concorrente

* **Responsável:** Adrian Cesar Gonçalves (Desenvolvedor Backend)
* **Issue:** #<a definir>
* **Branch:** `fix/prevent-double-booking`
* **Rubrica:** Onboarding e diagnóstico → 2,5 pt (melhoria comprovada do código recebido: correção do BUG-01, severidade CRÍTICO)
* **Depende de:** nada

## Problema

O endpoint `POST /api/reservations` decide se um horário está livre com **duas
consultas independentes, sem transação e sem nenhuma constraint no banco**.
Entre a leitura e a escrita existe uma janela em que outro processo pode gravar
a mesma faixa de horário. É um TOCTOU (*time-of-check to time-of-use*) clássico.

`server/src/controllers/reservationController.js:11-28`:

```js
      // Check availability
      const isAvailable = await ReservationModel.checkAvailability(
        resource_id,
        start_time,
        end_time,
      );
      if (!isAvailable) {
        return res
          .status(409)
          .json({ error: 'Resource is not available for the selected time slot' });
      }

      const newReservation = await ReservationModel.create(
        resource_id,
        user_name,
        start_time,
        end_time,
      );
```

A checagem está em `server/src/models/reservationModel.js:49-61`:

```js
  async checkAvailability(resource_id, start_time, end_time) {
    const query = `
      SELECT id FROM reservations 
      WHERE resource_id = $1 
      AND status != 'cancelled'
      AND (
        (start_time < $3 AND end_time > $2)
      )
      LIMIT 1;
    `;
    const result = await db.query(query, [resource_id, start_time, end_time]);
    return result.rows.length === 0;
  },
```

A **fórmula de sobreposição está correta** — é exatamente a documentada em
`Documentação Oficial SREC.md` (`Início_banco < Fim_novo AND Fim_banco >
Início_novo`). O defeito não está na fórmula: está em executá-la fora de
transação e sem nenhuma garantia no banco.

E o banco não ajuda. `server/src/config/initDb.js:14-23` cria a tabela
`reservations` sem **nenhuma** constraint além da PK e da FK:

```sql
    CREATE TABLE IF NOT EXISTS reservations (
      id SERIAL PRIMARY KEY,
      resource_id INTEGER REFERENCES resources(id) ON DELETE CASCADE,
      user_name VARCHAR(100) NOT NULL,
      start_time TIMESTAMP NOT NULL,
      end_time TIMESTAMP NOT NULL,
      status VARCHAR(20) DEFAULT 'scheduled', -- 'scheduled', 'cancelled', 'completed'
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
```

Consequência: duas pessoas que clicam "reservar" na mesma sala, no mesmo
horário, dentro da mesma janela de milissegundos, recebem **duas respostas
201**. A regra de negócio central do SREC — "um espaço, um ocupante por
período" — simplesmente não existe no sistema recebido.

## Evidência

Números do relatório de auditoria (`docs/auditoria/`), todos medidos:

| Métrica | Valor no código recebido |
|---|---|
| Constraints de integridade no schema | **0** |
| Índices além das PKs | **0** |
| Cobertura dos controllers | **0 %** |
| Testes de integração HTTP | **0** |

Reprodução manual, com o servidor de pé em `localhost:5000` e um recurso de
`id = 1` cadastrado:

```bash
for i in $(seq 1 20); do
  curl -s -o /dev/null -w "%{http_code}\n" \
    -X POST http://localhost:5000/api/reservations \
    -H 'Content-Type: application/json' \
    -d '{"resource_id":1,"user_name":"teste","start_time":"2030-01-10T14:00:00","end_time":"2030-01-10T15:00:00"}' &
done; wait
```

No código recebido, mais de um `201` aparece na saída (o número exato varia por
execução, porque depende do escalonamento). O que é determinístico é a
contagem final no banco:

```sql
SELECT COUNT(*) FROM reservations
WHERE resource_id = 1 AND status <> 'cancelled'
  AND tsrange(start_time, end_time) && tsrange('2030-01-10 14:00', '2030-01-10 15:00');
-- antes da correção: > 1
-- depois da correção: 1
```

O teste automatizado da seção **Testes** transforma essa reprodução manual em
asserção: **falha antes, passa depois**.

## Decisão

**Resolver no banco, com uma constraint de exclusão, e usar a aplicação apenas
para a mensagem amigável.**

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE reservations
  ADD CONSTRAINT reservations_no_overlap
  EXCLUDE USING gist (
    resource_id WITH =,
    tsrange(start_time, end_time) WITH &&
  ) WHERE (status <> 'cancelled');
```

`checkAvailability` **permanece** no caminho feliz: é uma checagem otimista,
barata, que produz um 409 com mensagem legível antes de tentar o `INSERT`. Ela
deixa de ser a garantia e passa a ser uma conveniência de UX. Quando ela
perder a corrida, o `INSERT` falha com SQLSTATE `23P01`
(`exclusion_violation`), e o controller traduz isso em **HTTP 409** com
exatamente a mesma mensagem — o cliente não percebe a diferença.

**Por que não `SELECT ... FOR UPDATE` dentro de uma transação?**

O `FOR UPDATE` bloqueia *linhas que existem*. O conflito aqui é entre duas
linhas que **ainda não existem** — as duas transações querem inserir. Não há o
que travar: cada uma faz seu `SELECT`, não encontra nada, e insere. Para que
`FOR UPDATE` funcionasse seria preciso travar algo que represente o recurso
inteiro (`SELECT * FROM resources WHERE id = $1 FOR UPDATE`), serializando
**todas** as reservas daquele recurso. Isso resolve, mas:

* serializa operações que não conflitam entre si (duas reservas em horários
  distintos do mesmo recurso passam a esperar uma pela outra);
* exige disciplina em todo escritor futuro — quem esquecer o lock fura a regra;
* vale apenas para a aplicação Node. Qualquer outro caminho de escrita (um
  `psql` do DevOps, um script de *seed*, um importador de planilha previsto
  para a N3, um job de *backfill*) grava sobreposição à vontade.

**Por que não um lock pessimista na aplicação** (um mutex em memória, por
`resource_id`)? Porque ele só vale dentro de **um** processo Node. Basta subir
duas réplicas atrás de um balanceador — que é o rumo natural do projeto na N3 —
e o mutex vira decoração. Vale o mesmo para `Promise` enfileiradas ou
bibliotecas de fila em memória.

A constraint `EXCLUDE` move a garantia para a **única camada por onde todo
mundo passa obrigatoriamente**. Ela é verificada pelo PostgreSQL dentro do
próprio `INSERT`, sob o mesmo mecanismo que garante unicidade de chave
primária: não há janela para escapar. Custo: um índice GiST que, de quebra,
ataca o CS-09 (zero índices) nas consultas por `resource_id`.

Detalhes da forma escolhida:

* `WHERE (status <> 'cancelled')` torna o índice **parcial**: reservas
  canceladas liberam o horário, que é o comportamento que o
  `checkAvailability` já implementava (`status != 'cancelled'`).
* Como `status` hoje é **nullable**, o predicado `status <> 'cancelled'`
  avaliaria `NULL` para uma linha com status nulo — e uma linha cujo predicado
  é `NULL` **não entra no índice parcial**, ou seja, escaparia da constraint.
  Por isso a migração também aplica `ALTER COLUMN status SET NOT NULL`.
  Sem isso, a constraint teria um buraco.
* `tsrange(start_time, end_time)` usa o padrão `[)` do PostgreSQL —
  semiaberto. Uma reserva que termina às 15:00 e outra que começa às 15:00
  **não** se sobrepõem, que é a mesma semântica dos operadores `<` e `>` da
  fórmula original. O comportamento observável não muda.

## Alterações

### 1. Criar `server/migrations/001_reservation_no_overlap.sql`

O repositório recebido não tem migrations versionadas (CS-06): o schema é
efeito colateral do boot, em `initDb.js`. Esta spec abre o diretório
`server/migrations/`, que as specs BE-02 e BE-03 continuam. O `initDb.js`
**permanece** como está — ele só roda `CREATE TABLE IF NOT EXISTS` e não
conflita com a migração.

```sql
-- 001_reservation_no_overlap.sql
-- BE-01 — garante no banco que duas reservas ativas não ocupem o mesmo
-- recurso em períodos que se sobrepõem (BUG-01, TOCTOU).

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- A constraint é parcial (ignora reservas canceladas). Um predicado que
-- avalie NULL deixaria a linha fora do índice parcial e, portanto, fora da
-- constraint. Travar status como NOT NULL fecha esse buraco.
UPDATE reservations SET status = 'scheduled' WHERE status IS NULL;
ALTER TABLE reservations ALTER COLUMN status SET DEFAULT 'scheduled';
ALTER TABLE reservations ALTER COLUMN status SET NOT NULL;

-- Falha cedo e com mensagem clara se a base já tiver sobreposições: a criação
-- da constraint abortaria com um erro críptico do índice GiST.
DO $$
DECLARE
  overlapping_count integer;
BEGIN
  SELECT COUNT(*) INTO overlapping_count
  FROM reservations a
  JOIN reservations b
    ON a.id < b.id
   AND a.resource_id = b.resource_id
   AND a.status <> 'cancelled'
   AND b.status <> 'cancelled'
   AND a.start_time < b.end_time
   AND a.end_time > b.start_time;

  IF overlapping_count > 0 THEN
    RAISE EXCEPTION
      'Existem % par(es) de reservas sobrepostas na base. Normalize os dados antes de aplicar a constraint (ver docs/specs/be-01-prevent-double-booking/implementacao.md).',
      overlapping_count;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reservations_no_overlap') THEN
    ALTER TABLE reservations
      ADD CONSTRAINT reservations_no_overlap
      EXCLUDE USING gist (
        resource_id WITH =,
        tsrange(start_time, end_time) WITH &&
      ) WHERE (status <> 'cancelled');
  END IF;
END $$;
```

> `CREATE EXTENSION btree_gist` exige um papel com privilégio para criar
> extensões no banco (o `postgres` padrão do contêiner tem). A extensão vem na
> distribuição `postgresql-contrib`, presente na imagem oficial `postgres:16`.

### 2. Criar `server/scripts/migrate.js`

Runner mínimo, sem dependência nova: lê os `.sql` de `server/migrations/` em
ordem alfabética, aplica cada um **dentro de uma transação** e registra em
`schema_migrations`.

```js
const fs = require('fs');
const path = require('path');
const { pool } = require('../src/config/database');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

const run = async () => {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    const { rows } = await client.query('SELECT filename FROM schema_migrations');
    const applied = new Set(rows.map((row) => row.filename));

    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((file) => file.endsWith('.sql'))
      .sort();

    let count = 0;
    for (const file of files) {
      if (applied.has(file)) continue;

      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
        await client.query('COMMIT');
        count += 1;
        console.log(`[migrate] aplicada: ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`[migrate] falhou em ${file}: ${err.message}`);
      }
    }

    console.log(`[migrate] ${count} migração(ões) aplicada(s); ${files.length} no diretório.`);
  } finally {
    client.release();
    await pool.end();
  }
};

run().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
```

### 3. Alterar `server/src/config/database.js`

Expor o `pool` para o runner de migrations e para o *teardown* dos testes de
integração (hoje o módulo só exporta `query`, e o pool fica preso — o Jest
reclama de *open handles*).

```js
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on('connect', () => {
  console.log('Connected to PostgreSQL Database');
});

module.exports = {
  pool,
  query: (text, params) => pool.query(text, params),
};
```

> O handler de `error` do pool (BUG-12) **não** entra aqui: é outra issue, outro
> PR. Esta spec mantém o escopo em BUG-01.

### 4. Alterar `server/src/controllers/reservationController.js`

Traduzir `23P01` em 409, com a mesma mensagem da checagem otimista. Diff sobre
`createReservation` (linhas 4-34 do arquivo recebido):

```js
const ReservationModel = require('../models/reservationModel');

// SQLSTATE 23P01 = exclusion_violation. Disparado pela constraint
// reservations_no_overlap quando a checagem otimista perde a corrida (BE-01).
const PG_EXCLUSION_VIOLATION = '23P01';
const OVERLAP_MESSAGE = 'Já existe uma reserva para este espaço no período selecionado.';

const ReservationController = {
  async createReservation(req, res) {
    try {
      const { resource_id, user_name, start_time, end_time } = req.body;
      if (!resource_id || !user_name || !start_time || !end_time) {
        return res.status(400).json({
          error: 'Todos os campos são obrigatórios.',
          code: 'RESERVATION_FIELDS_REQUIRED',
        });
      }

      // Checagem otimista: existe para dar a mensagem amigável no caminho
      // comum. A garantia de verdade é a constraint reservations_no_overlap.
      const isAvailable = await ReservationModel.checkAvailability(
        resource_id,
        start_time,
        end_time,
      );
      if (!isAvailable) {
        return res.status(409).json({ error: OVERLAP_MESSAGE, code: 'RESERVATION_OVERLAP' });
      }

      const newReservation = await ReservationModel.create(
        resource_id,
        user_name,
        start_time,
        end_time,
      );
      return res.status(201).json(newReservation);
    } catch (err) {
      if (err.code === PG_EXCLUSION_VIOLATION) {
        return res.status(409).json({ error: OVERLAP_MESSAGE, code: 'RESERVATION_OVERLAP' });
      }
      console.error(err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  },
```

Os outros quatro métodos **não mudam** nesta spec — os 10 blocos `try/catch`
duplicados são o alvo do BE-04 (CS-02).

Sobre o corpo da resposta: a chave `error` é preservada, porque
`client/src/services/api.js:59-60` lê exatamente ela (`err.error`) e exibe o
texto na tela. Por isso a mensagem é em **português** (é texto de UI) e o novo
campo `code` é o identificador estável, em **inglês**, para o cliente
programático. O BE-04 padroniza esse envelope em toda a API.

### 5. Alterar `server/src/index.js`

Exportar o `app` para que o Supertest consiga montar a aplicação sem abrir uma
porta, e só iniciar o servidor quando o arquivo for executado diretamente.

```js
// ... (restante do arquivo sem alteração)

// Initialize DB and start server
const startServer = async () => {
  await initDb();
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
};

if (require.main === module) {
  startServer();
}

module.exports = app;
```

### 6. Criar `server/jest.config.js`

Separar testes unitários (sem banco, rodam em qualquer lugar) de testes de
integração (exigem PostgreSQL).

```js
module.exports = {
  collectCoverageFrom: ['src/**/*.js'],
  coverageReporters: ['text', 'lcov'],
  projects: [
    {
      displayName: 'unit',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/src/**/*.test.js'],
    },
    {
      displayName: 'integration',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/integration/**/*.test.js'],
      setupFiles: ['<rootDir>/tests/setupEnv.js'],
      testTimeout: 20000,
      maxWorkers: 1,
    },
  ],
};
```

### 7. Criar `server/tests/setupEnv.js` e `server/.env.test.example`

```js
// tests/setupEnv.js
const path = require('path');

// Carregado antes dos módulos do teste. O dotenv não sobrescreve variáveis já
// definidas, então o DATABASE_URL do CI continua vencendo o arquivo local.
require('dotenv').config({ path: path.join(__dirname, '..', '.env.test') });
```

```
# .env.test.example
DATABASE_URL=postgres://postgres:postgres@localhost:5432/srec_test
```

### 8. Criar `server/tests/helpers/testDb.js`

```js
const { pool } = require('../../src/config/database');

const resetDatabase = async () => {
  await pool.query('TRUNCATE reservations, resources RESTART IDENTITY CASCADE');
};

const createResource = async (name = 'Sala Azul', type = 'meeting_room', capacity = 8) => {
  const { rows } = await pool.query(
    'INSERT INTO resources (name, type, capacity) VALUES ($1, $2, $3) RETURNING *',
    [name, type, capacity],
  );
  return rows[0];
};

module.exports = { pool, resetDatabase, createResource };
```

### 9. Alterar `server/package.json`

```json
  "scripts": {
    "start": "node src/index.js",
    "dev": "nodemon src/index.js",
    "lint": "eslint src/ tests/ scripts/",
    "lint:fix": "eslint src/ tests/ scripts/ --fix",
    "format": "prettier --write \"src/**/*.js\"",
    "db:migrate": "node scripts/migrate.js",
    "test": "jest --selectProjects unit",
    "test:integration": "jest --selectProjects integration",
    "test:all": "jest",
    "test:coverage": "jest --coverage"
  }
```

### 10. Alterar `server/eslint.config.js`

A lista de globals do arquivo recebido (`server/eslint.config.js:10-20`) só
declara `jest`, `describe`, `it`, `expect` e `afterEach`. Sem
`beforeEach`/`beforeAll`/`afterAll`/`__dirname`, os arquivos novos disparam
`no-undef` — que em `js.configs.recommended` é **erro**, não aviso, e quebraria
`npm run lint` no CI.

```js
      globals: {
        process: "readonly",
        console: "readonly",
        require: "readonly",
        module: "readonly",
        __dirname: "readonly",
        jest: "readonly",
        describe: "readonly",
        it: "readonly",
        test: "readonly",
        expect: "readonly",
        beforeAll: "readonly",
        beforeEach: "readonly",
        afterAll: "readonly",
        afterEach: "readonly"
      }
```

### 11. Alterar `.github/workflows/ci.yml`

O job `backend-lint-test` não tem banco, então hoje só poderia rodar testes
unitários. Adicionar o serviço PostgreSQL e rodar as migrations antes da suíte.

```yaml
  backend-lint-test:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: ./server
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: srec_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    env:
      DATABASE_URL: postgres://postgres:postgres@localhost:5432/srec_test
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm run lint
      - run: node -e "require('./src/config/initDb')()"
      - run: npm run db:migrate
      - run: npm run test:all
```

## Testes

### Teste que falha antes da correção

`server/tests/integration/reservations.concurrency.test.js` (novo):

```js
const request = require('supertest');
const app = require('../../src/index');
const { pool, resetDatabase, createResource } = require('../helpers/testDb');

const CONCURRENT_REQUESTS = 20;

const SLOT = {
  start_time: '2030-01-10T14:00:00',
  end_time: '2030-01-10T15:00:00',
};

describe('POST /api/reservations — concorrência (BUG-01)', () => {
  let resource;

  beforeEach(async () => {
    await resetDatabase();
    resource = await createResource('Sala Azul', 'meeting_room', 10);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('aceita exatamente 1 reserva quando N requisições idênticas chegam juntas', async () => {
    const responses = await Promise.all(
      Array.from({ length: CONCURRENT_REQUESTS }, (_, index) =>
        request(app)
          .post('/api/reservations')
          .send({ ...SLOT, resource_id: resource.id, user_name: `Pessoa ${index}` }),
      ),
    );

    const created = responses.filter((res) => res.status === 201);
    const conflicted = responses.filter((res) => res.status === 409);

    expect(created).toHaveLength(1);
    expect(conflicted).toHaveLength(CONCURRENT_REQUESTS - 1);
    expect(responses.every((res) => res.status === 201 || res.status === 409)).toBe(true);
    expect(conflicted[0].body).toHaveProperty('code', 'RESERVATION_OVERLAP');
  });

  it('não deixa sobreposição persistida no banco', async () => {
    await Promise.all(
      Array.from({ length: CONCURRENT_REQUESTS }, (_, index) =>
        request(app)
          .post('/api/reservations')
          .send({ ...SLOT, resource_id: resource.id, user_name: `Pessoa ${index}` }),
      ),
    );

    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS total
         FROM reservations
        WHERE resource_id = $1
          AND status <> 'cancelled'
          AND tsrange(start_time, end_time) && tsrange($2::timestamp, $3::timestamp)`,
      [resource.id, SLOT.start_time, SLOT.end_time],
    );

    expect(rows[0].total).toBe(1);
  });
});
```

**Comportamento antes da correção:** o primeiro caso falha em
`expect(created).toHaveLength(1)` recebendo um número **maior que 1** (o valor
oscila entre execuções porque depende do escalonamento do pool e do event
loop); o segundo falha com `total > 1`. **Depois da correção:** ambos passam,
de forma determinística — a contagem 1 é imposta pelo PostgreSQL, não pelo
tempo.

### Testes que continuam passando

`server/src/models/reservationModel.test.js` (2 casos, `checkAvailability`)
não é tocado e continua verde. A função não muda de assinatura nem de
comportamento nesta spec.

### Comandos

```bash
cd server
cp .env.test.example .env.test          # só na primeira vez
createdb srec_test                      # ou: docker run --rm -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:16
node -e "require('./src/config/initDb')()"
npm run db:migrate
npm run test:all
npm run lint
```

Para ver o teste falhar **antes** da correção (útil para o pitch), rode a
suíte com a migração revertida:

```bash
psql "$DATABASE_URL" -c 'ALTER TABLE reservations DROP CONSTRAINT reservations_no_overlap;'
npm run test:integration   # falha
npm run db:migrate         # não reaplica: schema_migrations já registra o arquivo
psql "$DATABASE_URL" -c 'DELETE FROM schema_migrations WHERE filename = $$001_reservation_no_overlap.sql$$;'
npm run db:migrate         # reaplica
npm run test:integration   # passa
```

## Critérios de aceite

* [ ] `server/migrations/001_reservation_no_overlap.sql` existe e é idempotente
      (rodar `npm run db:migrate` duas vezes não gera erro).
* [ ] `SELECT conname FROM pg_constraint WHERE conname = 'reservations_no_overlap'`
      retorna 1 linha depois da migração.
* [ ] `reservations.status` é `NOT NULL` com default `'scheduled'`.
* [ ] `POST /api/reservations` com 20 requisições concorrentes idênticas
      produz **exatamente 1** resposta 201 e **19** respostas 409.
* [ ] Nenhuma resposta 500 aparece no cenário concorrente.
* [ ] A resposta 409 traz `{ "error": "...", "code": "RESERVATION_OVERLAP" }`.
* [ ] `checkAvailability` continua existindo e continua retornando 409 no
      caminho sequencial (sem corrida), com a mesma mensagem.
* [ ] `src/index.js` exporta `app` e **não** sobe o `listen` quando importado.
* [ ] Números do PR, medidos: constraints de integridade no schema **0 → 1**;
      índices além das PKs **0 → 1** (o GiST da constraint); arquivos de teste
      **1 → 2**; casos de teste **2 → 4**; reservas sobrepostas gravadas sob 20
      requisições concorrentes **>1 → 1**.
* [ ] `npm run lint` com **0 erros**; `npm run test:all` verde.
* [ ] CI verde no PR, com o serviço PostgreSQL ativo.
* [ ] PR aprovado por **Igor Seberino (@igorSeberino)** no papel de QA.

## Passo a passo TBD

```bash
# 1. Partir de main atualizada (TBD: main é o único branch longevo)
git checkout main
git pull --ff-only origin main
git checkout -b fix/prevent-double-booking

# 2. Preparar o ambiente local
cd server
npm ci
cp .env.test.example .env.test
docker run --rm -d --name srec-pg -p 5432:5432 \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=srec_test postgres:16

# 3. Implementar na ordem: infraestrutura -> banco -> aplicação -> teste

git add server/scripts/migrate.js server/src/config/database.js server/package.json
git commit -m "build(server): adicionar runner de migrations versionadas"

git add server/migrations/001_reservation_no_overlap.sql
git commit -m "feat(db): impedir sobreposicao de reservas com constraint EXCLUDE"

git add server/src/controllers/reservationController.js server/src/index.js
git commit -m "fix(reservas): traduzir exclusion_violation em HTTP 409"

git add server/jest.config.js server/tests/ server/.env.test.example server/eslint.config.js
git commit -m "test(reservas): cobrir criacao concorrente de reservas"

git add .github/workflows/ci.yml
git commit -m "ci: subir Postgres e rodar migrations no job de backend"

git add docs/specs/be-01-prevent-double-booking/implementacao.md
git commit -m "docs(specs): registrar a spec BE-01 de dupla reserva"

# 4. Validar antes de abrir o PR
npm run lint
node -e "require('./src/config/initDb')()"
npm run db:migrate
npm run test:all

# 5. Publicar e abrir o PR
git push -u origin fix/prevent-double-booking
```

Título do PR: `fix(reservas): impedir dupla reserva concorrente (BUG-01)`

Corpo do PR: resumo em uma frase, link para `docs/specs/be-01-prevent-double-booking/implementacao.md`,
a tabela de números antes/depois dos critérios de aceite e a saída do
`npm run test:all`. Pedir revisão a **@igorSeberino** (QA). Merge só com
**1 aprovação do QA + CI verde**.

## Prompt para o Claude Code

```
Você está na raiz do repositório igorSeberino/srec. Leia CLAUDE.md e a skill de
backend em .claude/skills/ antes de escrever código.

Implemente integralmente a spec docs/specs/be-01-prevent-double-booking/implementacao.md
(BE-01 — Impedir dupla reserva concorrente, corrige o BUG-01, severidade CRÍTICO).

Regras:
- Trabalhe no branch fix/prevent-double-booking, criado a partir de main.
- Mantenha a stack: Node.js 20, Express 5, PostgreSQL via `pg` com SQL cru,
  CommonJS. Não introduza ORM, TypeScript nem dependência nova de runtime.
- Respeite o Prettier do projeto (printWidth 100, aspas simples, ponto e vírgula,
  trailingComma all) e o ESLint em server/eslint.config.js.
- Nomes de arquivo, identificadores e comentários de código em inglês.
  Mensagens de commit, de PR e textos de erro voltados ao usuário em português.

Ordem de execução:
1. server/scripts/migrate.js, server/src/config/database.js (exportar `pool`),
   scripts do package.json.
2. server/migrations/001_reservation_no_overlap.sql, exatamente como na spec.
3. server/src/controllers/reservationController.js (traduzir SQLSTATE 23P01 em
   409) e server/src/index.js (exportar `app`, guardar o listen com
   `require.main === module`).
4. jest.config.js, tests/setupEnv.js, tests/helpers/testDb.js,
   tests/integration/reservations.concurrency.test.js, .env.test.example,
   globals do eslint.config.js.
5. .github/workflows/ci.yml com o serviço postgres:16.

Não altere o frontend. Não mexa nos outros quatro métodos do
reservationController nem no resourceController: os 10 blocos try/catch são
escopo da spec BE-04.

Ao final, rode nesta ordem e cole a saída:
  cd server && npm run lint && npm run db:migrate && npm run test:all
Depois faça os commits exatamente com as mensagens listadas na seção
"Passo a passo TBD" da spec.
```
