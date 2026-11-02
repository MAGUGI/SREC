# Estado atual do backend recebido — `server/`

Tudo aqui foi verificado por leitura do código em `igorSeberino/srec`. Números
medidos, não estimados. Se você encontrar divergência, o código vence: corrija
este documento no mesmo PR.

## Inventário real

```
server/src/
  index.js                          33 linhas   bootstrap express
  config/database.js                14 linhas   Pool do pg
  config/initDb.js                  33 linhas   CREATE TABLE IF NOT EXISTS no boot
  models/resourceModel.js           44 linhas   SQL cru
  models/reservationModel.js        64 linhas   SQL cru + checkAvailability
  models/reservationModel.test.js   38 linhas   ÚNICO arquivo de teste (2 casos)
  controllers/resourceController.js      72 linhas
  controllers/reservationController.js   90 linhas
  routes/resourceRoutes.js          11 linhas
  routes/reservationRoutes.js       11 linhas
```

Não existe `services/`, `domain/`, `errors/`, `middlewares/`, `migrations/`,
`app.js`, Dockerfile, docker-compose, Swagger/OpenAPI nem coleção Postman.

Cobertura medida com
`cd server && npx jest --coverage --coverageReporters=text --collectCoverageFrom='src/**/*.js'`:

| Métrica | Valor |
|---|---|
| Statements | 6,14 % |
| Branches | 0 % |
| Funções | 3,57 % |
| Controllers | 0 % |
| Rotas | 0 % |
| `resourceModel.js` | 0 % |
| `index.js` / `initDb.js` | 0 % |

## `src/index.js` — bootstrap

```js
app.use(cors());            // liberado para qualquer origem (CS-14)
app.use(express.json());
app.use('/api/resources', resourceRoutes);
app.use('/api/reservations', reservationRoutes);

const startServer = async () => {
  await initDb();           // cria tabela no boot (CS-06)
  app.listen(PORT, ...);
};
```

Problemas:

* **Não há middleware de erro.** Nenhum `app.use((err, req, res, next) => ...)`.
  É por isso que cada controller carrega o seu `try/catch` (CS-02).
* **Não há `app.js` separado.** O `app` e o `listen` moram no mesmo arquivo, o
  que impede o Supertest de importar o app sem abrir porta — razão direta dos 0 %
  de cobertura em controllers e rotas.
* **Não há `helmet`, nem rate limit, e `cors()` é irrestrito** (CS-14).
* **Não há rota 404 explícita** para caminho inexistente.
* `PORT` tem fallback `5000`; `DATABASE_URL` não tem validação alguma — o
  servidor sobe e só falha na primeira query.

## `src/config/database.js` — 14 linhas

```js
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.on('connect', () => console.log('Connected to PostgreSQL Database'));
module.exports = { query: (text, params) => pool.query(text, params) };
```

* **Sem `pool.on('error', ...)`** — BUG-12. Um erro em client idle do `pg` é
  emitido no pool; sem handler, o Node derruba o processo. Postgres reiniciando
  mata a API.
* **Exporta só `query`.** Não há como pegar um client dedicado, ou seja **não há
  como abrir transação** — causa estrutural do BUG-01.
* O log de `connect` dispara a cada nova conexão do pool, não uma vez.

## `src/config/initDb.js` — 33 linhas

Schema real criado no boot:

```sql
CREATE TABLE IF NOT EXISTS resources (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  type VARCHAR(50) NOT NULL,            -- 'workstation' | 'meeting_room', sem CHECK
  capacity INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reservations (
  id SERIAL PRIMARY KEY,
  resource_id INTEGER REFERENCES resources(id) ON DELETE CASCADE,
  user_name VARCHAR(100) NOT NULL,
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP NOT NULL,
  status VARCHAR(20) DEFAULT 'scheduled',  -- sem CHECK
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

Medido: **0 `CHECK`, 0 `UNIQUE`, 0 `EXCLUDE`, 0 índice além das PKs.**

Consequências diretas:

* `end_time` anterior a `start_time` é aceito e, pela fórmula de sobreposição,
  **nunca colide com nada** — BUG-02, CRÍTICO.
* `status` aceita qualquer string — BUG-03.
* `type` aceita qualquer string; o front renderiza tudo que não é `meeting_room`
  como estação de trabalho — BUG-10.
* `capacity` negativo é gravado — BUG-09.
* `TIMESTAMP` sem fuso, combinado com `<input type="datetime-local">` sem offset,
  desloca o horário da reserva — BUG-07.
* `ON DELETE CASCADE` em `resource_id`: excluir um recurso apaga silenciosamente
  todas as reservas dele — BUG-06.
* `resource_id` não é `NOT NULL`.
* Toda consulta filtra `resource_id` e `start_time` sem índice — CS-09.

E o `catch` do `initDb`:

```js
} catch (err) {
  console.error('Error creating tables', err);   // engolido: o boot continua
}
```

BUG-11: falha de criação de tabela não impede o servidor de subir. A API fica de
pé respondendo 500 em tudo.

## `src/models/*.js` — SQL cru

`resourceModel.js`: `create`, `findAll`, `findById`, `update`, `delete`. Tudo
parametrizado — isso está correto, não há injeção de SQL.

O defeito está em `update` (linhas 26-35):

```js
SET name = $1, type = $2, capacity = $3, updated_at = CURRENT_TIMESTAMP
```

Corpo parcial (`PUT /api/resources/:id` com só `{ name }`) manda `undefined` nos
outros parâmetros, o `pg` traduz para `NULL`, e `name`/`type` são `NOT NULL` —
retorna 500. BUG-05.

`reservationModel.js`: `create`, `findAll`, `findById`, `findByResourceId`,
`updateStatus`, `delete`, `checkAvailability`.

```js
async checkAvailability(resource_id, start_time, end_time) {
  const query = `
    SELECT id FROM reservations
    WHERE resource_id = $1
    AND status != 'cancelled'
    AND ((start_time < $3 AND end_time > $2))
    LIMIT 1;
  `;
  ...
  return result.rows.length === 0;
}
```

**A fórmula está certa.** É a mesma documentada
(`Início_banco < Fim_novo AND Fim_banco > Início_novo`) e é o único ponto em que
a doc recebida confere com o código. Não mexa nela.

O que está errado em volta dela:

* `'cancelled'` é magic string dentro do SQL (CS-05).
* Ela roda numa chamada separada do `create`, sem transação e sem lock — janela
  TOCTOU do BUG-01.
* `findByResourceId` não é chamada por nenhum controller nem por nenhuma rota.
  Código morto.

## `src/controllers/*.js` — o coração dos smells

As 5 ações de cada controller seguem o mesmo molde:

```js
async getResourceById(req, res) {
  try {
    const { id } = req.params;
    const resource = await ResourceModel.findById(id);
    if (!resource) return res.status(404).json({ error: 'Resource not found' });
    res.json(resource);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
}
```

Medido: `grep -c "} catch (err) {" server/src/controllers/*.js` → **5 e 5**, e
`grep -h "Internal server error" server/src/controllers/*.js | wc -l` → **10**.
É o CS-02 inteiro em um número.

Além da duplicação:

* **Regra de negócio no controller.** `reservationController.js:12-28` decide
  disponibilidade e cria a reserva. Não há como testar a regra sem HTTP e sem
  banco — CS-03.
* **Validação ad-hoc.** `if (!name || !type)` (`resourceController.js:7`) e
  `if (!resource_id || !user_name || !start_time || !end_time)`
  (`reservationController.js:7`). Dois lugares, sem schema, e `0` é falsy — CS-04.
* **`capacity || 1`** (`resourceController.js:10`): `capacity: 0` vira 1
  silenciosamente, negativo passa — BUG-09.
* **`updateReservationStatus`** (linhas 60-64) grava `status` sem validar nada —
  BUG-03.
* **`id` não numérico** vai direto para o SQL; o `pg` erra, cai no `catch` e
  responde 500 em vez de 400. Vale para as 6 rotas com `:id` — BUG-04.
* **Reserva no passado é aceita** — BUG-08.

## `src/routes/*.js`

Os 10 endpoints, todos sem middleware de validação:

```
POST   /api/resources            GET /api/resources       GET    /api/resources/:id
PUT    /api/resources/:id        DELETE /api/resources/:id
POST   /api/reservations         GET /api/reservations    GET    /api/reservations/:id
PATCH  /api/reservations/:id/status                       DELETE /api/reservations/:id
```

A doc recebida lista 5. O front consome 8 — `PUT /api/resources/:id` existe no
backend e em `client/src/services/api.js` e **nenhuma tela chama** (BUG-15), e
`findByResourceId` não tem rota.

## O único teste existente

`src/models/reservationModel.test.js`, 38 linhas, 2 casos, ambos de
`checkAvailability` com `jest.mock('../config/database')`. Verificam `true` para
`rows: []` e `false` para `rows: [{ id: 1 }]`.

Ou seja: o único comportamento testado é o retorno de um mock, e o parâmetro
passado para o SQL não é verificado. Nenhum controller, nenhuma rota, nenhuma
regra de negócio, nenhum caminho de erro.

## Scripts disponíveis em `server/package.json`

```json
"start": "node src/index.js",
"dev": "nodemon src/index.js",
"lint": "eslint src/",
"lint:fix": "eslint src/ --fix",
"format": "prettier --write \"src/**/*.js\"",
"test": "jest"
```

`supertest@^7.2.2` já está em `devDependencies` e **nenhum teste o usa**. Não
existe script `migrate`, `test:coverage` nem `test:watch`.

## Como subir o que foi recebido

```bash
cd server
cp .env.example .env          # ajuste DATABASE_URL para o seu Postgres local
npm ci
npm start                     # initDb cria as tabelas no boot
```

`server/.env.example`:

```
PORT=5000
DATABASE_URL=postgres://postgres:<senha>@localhost:5432/srec
```

Não há container: o Postgres precisa existir na máquina e o banco `srec` precisa
ser criado à mão (`CREATE DATABASE srec;`). Isso é parte do atrito de onboarding
que a N2 precisa resolver.
