# BE-08 — Endurecer a superfície HTTP e o boot do servidor

* **Responsável:** Adrian Cesar Gonçalves (Desenvolvedor Backend)
* **Issue:** #<a definir>
* **Branch:** `feature/harden-http-surface`
* **Rubrica:** 4,0 — Onboarding e diagnóstico → 2,5 (melhoria comprovada: CS-14, BUG-12 e BUG-11); 3,0 — Processo, Git & Documentação → 1,5 (operação e onboarding documentados para a N3)
* **Depende de:** BE-04 (classe `AppError`, wrapper `asyncHandler` e middleware central de erro registrado por último)

## Problema

Cinco falhas distintas, todas na borda entre o processo Node e o mundo, todas
ausentes do código recebido por **omissão** — não há o que corrigir, há o que
acrescentar.

### 1. CORS liberado para qualquer origem

`server/src/index.js:13`:

```js
app.use(cors());
```

`cors()` sem opções responde `Access-Control-Allow-Origin: *`. Qualquer página
de qualquer domínio que a pessoa abrir no navegador pode chamar os **10**
endpoints do SREC — e como não há autenticação nenhuma, pode criar, alterar e
**apagar** recursos e reservas. Não é teórico: `DELETE /api/resources/:id` apaga
em cascata todas as reservas do recurso (BUG-06,
`server/src/config/initDb.js:16`).

### 2. Nenhum cabeçalho de segurança

Não há `helmet` em `server/package.json:18-23` — as dependências de produção são
`cors`, `dotenv`, `express` e `pg`. E `app.disable('x-powered-by')` não aparece
em nenhum lugar, então a API anuncia `X-Powered-By: Express` em toda resposta.

```bash
grep -rn "helmet" server/   # 0 linhas
```

### 3. Nenhum limite de requisições

Não há `express-rate-limit` nem contador próprio. As **6** rotas de escrita
aceitam volume ilimitado, incluindo `POST /api/reservations`, que faz 2 ou 3
consultas ao banco por chamada. Um laço de `curl` enche a tabela `reservations`
ou satura o pool de conexões do `pg` (padrão: 10 clientes) sem esforço.

### 4. BUG-12 — `pool` sem handler de `'error'` derruba o processo

`server/src/config/database.js:1-14` tem um listener, e é o de `'connect'`:

```js
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on('connect', () => {
  console.log('Connected to PostgreSQL Database');
});

module.exports = {
  query: (text, params) => pool.query(text, params),
};
```

O `Pool` do `pg` emite `'error'` quando um cliente **ocioso** falha — Postgres
reiniciado, conexão derrubada por firewall ou `idle_in_transaction_session_timeout`.
`Pool` é um `EventEmitter`: evento `'error'` sem listener algum vira exceção não
tratada e o Node encerra o processo. O serviço cai sem nenhuma requisição em
andamento, por um erro que era recuperável — o `pg` descarta o cliente ruim e
abre outro sozinho, se alguém estiver ouvindo.

### 5. BUG-11 — falha ao criar tabelas não impede o servidor de subir

`server/src/config/initDb.js:25-30`:

```js
  try {
    await db.query(queryText);
    console.log('Database tables ensured');
  } catch (err) {
    console.error('Error creating tables', err);
  }
```

O `catch` engole. E `server/src/index.js:26-31` segue em frente:

```js
const startServer = async () => {
  await initDb();
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
};
```

Resultado: com `DATABASE_URL` errada, Postgres fora do ar ou usuário sem
permissão de `CREATE TABLE`, o servidor sobe, imprime
`Server is running on port 5000`, responde 200 em `/` e devolve **500 em 10 de
10 endpoints**. Para qualquer orquestrador, monitoramento ou colega de turma, o
processo está saudável. Esse é o pior estado que um serviço pode ter: aparência
de vivo e incapacidade total.

### 6. Nenhum endpoint de saúde

`server/src/index.js:21-23` tem só:

```js
app.get('/', (req, res) => {
  res.send('SREC Coworking API is running...');
});
```

Que responde 200 mesmo com o banco inacessível — ele não consulta nada. Não há
como responder "o SREC está funcionando?" sem criar uma reserva de teste.

## Evidência

```bash
# 1. CORS aberto
curl -s -I -H 'Origin: https://exemplo-malicioso.test' http://localhost:5000/api/resources \
  | grep -i 'access-control-allow-origin'
# access-control-allow-origin: *

# 2. Zero cabeçalhos de segurança, e o servidor se identifica
curl -s -I http://localhost:5000/api/resources
# ... X-Powered-By: Express
# nenhum Content-Security-Policy, X-Content-Type-Options, X-Frame-Options,
# Referrer-Policy ou Strict-Transport-Security

# 3. Sem limite de requisições: 100 escritas seguidas, todas aceitas
for i in $(seq 1 100); do
  curl -s -o /dev/null -w '%{http_code} ' -X POST http://localhost:5000/api/resources \
    -H 'Content-Type: application/json' -d '{"name":"flood","type":"workstation"}'
done; echo
# 201 201 201 ... (100 vezes), nenhum 429

# 4. BUG-12: derrubar o Postgres mata o processo Node
#    (terminal A) cd server && npm run dev
#    (terminal B)
sudo systemctl stop postgresql    # ou: docker stop <container>
#    terminal A: 'Error: Connection terminated unexpectedly' e o processo encerra

# 5. BUG-11: boot com banco inacessível "funciona"
DATABASE_URL=postgres://postgres:errado@localhost:5432/inexistente npm start --prefix server
# Error creating tables ...
# Server is running on port 5000        <-- subiu
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:5000/
# 200                                   <-- "saudável"
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:5000/api/resources
# 500                                   <-- e 500 nos 10 endpoints

# 6. Sem /health
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:5000/health
# 404
```

Números medidos no código recebido:

| Métrica | Antes |
|---|---|
| Origens aceitas por CORS | **qualquer** (`Access-Control-Allow-Origin: *`) |
| Cabeçalhos de segurança na resposta | **0** |
| `X-Powered-By` exposto | **sim** |
| Limite de requisições nas 6 rotas de escrita | **nenhum** |
| Escritas aceitas em sequência no teste de 100 chamadas | **100 de 100** |
| Listeners registrados no `pool` | **1** (`connect`) |
| Queda do processo ao Postgres cair | **sim** (evento `'error'` sem listener) |
| Caminhos de falha de DDL engolidos | **1** (`initDb.js:28-30`) |
| Código de saída do processo com schema inválido | **0** (processo vivo) |
| Endpoints respondendo 500 com schema inválido | **10 de 10** |
| Endpoints de observabilidade | **0** |
| Tratamento de `SIGTERM`/`SIGINT` | **nenhum** |
| Dependências de produção relacionadas a segurança | **1** (`cors`, mal configurada) |

## Decisão

**1. `helmet` com a configuração padrão, sem CSP customizada.**

`helmet()` sem opções cobre o conjunto de cabeçalhos que faz sentido para uma API
JSON. Não há customização de `Content-Security-Policy` aqui: a API não serve
HTML (o React é servido pelo Vite, em outra origem), então a CSP padrão não tem o
que quebrar e ajustá-la seria configuração sem consumidor.

**2. `express-rate-limit` só nas escritas, e não globalmente.**

O frontend recebido faz **refetch total a cada mutação** (CS-08:
`client/src/App.jsx:37-51`, `loadData()` em `handleCreateResource`,
`handleDeleteResource`, `handleCreateReservation`, `handleStatusChange`). Uma
pessoa cadastrando cinco salas gera facilmente dezenas de `GET` em um minuto.
Limite global com janela curta transformaria o uso normal em 429 — o limite
puniria o usuário e não o abuso. Escrita tem custo de banco e é o que importa
conter; leitura entra no escopo de cache/paginação, que é débito de N3.

Valor escolhido: **20 escritas por minuto por IP**. Justificativa quantitativa:
o fluxo mais pesado da tela é cadastrar um recurso (1 `POST`) ou uma reserva
(1 `POST`), com confirmação manual no formulário; 20/min é cerca de **uma escrita
a cada 3 segundos**, muito acima do que um humano consegue no formulário e muito
abaixo das 100/min que o teste de carga da seção Evidência alcançou sem esforço.
Configurável por `RATE_LIMIT_WRITE_MAX` para que a demonstração do pitch possa
ser ajustada sem recompilar nada.

**3. CORS com allowlist vinda de variável de ambiente, com padrão de
desenvolvimento que funciona sem configuração.**

Padrão `http://localhost:5173` (porta do Vite, `client/vite.config.js`), para que
`git clone && npm install && npm run dev` continue funcionando — onboarding é
item de rubrica (1,5 em "o grupo conseguiu subir o sistema do colega?") e não se
sabota o próprio onboarding. Em ambiente publicado, `CORS_ALLOWED_ORIGINS` recebe
a lista separada por vírgula.

Requisição **sem** cabeçalho `Origin` é permitida. Decisão consciente: `curl`,
`healthcheck` de orquestrador e chamada servidor-a-servidor não mandam `Origin`,
e CORS é um mecanismo de navegador — bloquear sem `Origin` não protege nada e
quebra a operação. CORS não é controle de acesso; é o que impede uma página de
terceiros de usar o navegador do usuário como procurador. O controle de acesso
de verdade é autenticação, e é o §6 desta decisão.

**4. `pool.on('error')` com log e encerramento controlado por reincidência, não
no primeiro erro.**

Erro de cliente ocioso é, isoladamente, recuperável: o `pg` remove o cliente do
pool e abre outro na próxima query. Encerrar no primeiro evento transformaria um
soluço de rede numa queda de serviço — trocaria um bug por outro. Mas erro de
cliente ocioso **repetido** significa banco inacessível, e aí seguir de pé
servindo 500 é o mesmo antipadrão do BUG-11.

Regra: **3 erros de pool em 30 segundos** disparam encerramento controlado
(parar de aceitar conexões, drenar as em andamento, fechar o pool, `exit(1)`).
O `exit(1)` é o sinal que o orquestrador precisa para reiniciar o processo; sem
ele, "reinicie-me" não tem como ser dito.

**5. Boot falha quando o schema não pode ser garantido.**

`initDb` deixa de ter `try/catch` — ele não tem como decidir o que fazer com a
falha, e por isso escolheu a pior opção possível (ignorar). Quem decide é o
`startServer`, e a decisão é: logar e `process.exit(1)` **antes** do
`app.listen`. Um serviço que não pode garantir o schema não deve aceitar
requisição. Isso troca "processo vivo respondendo 500 em 10 de 10 endpoints" por
"processo não sobe, com a causa no log" — que é diagnosticável em 5 segundos em
vez de 20 minutos.

`CREATE TABLE IF NOT EXISTS` é idempotente, então falhar o boot não cria risco de
dado: ou o DDL roda inteiro, ou não roda.

**6. Por que *não* introduzir autenticação nesta entrega.**

Tentador, porque a documentação recebida (`Documentação Oficial SREC.md`) marca
`POST /api/resources` como **"Nível de acesso Admin"** e o diagrama de casos de
uso separa Usuário e Administrador. Mas isso **nunca existiu no código**: são as
divergências 6 e 8 do relatório de auditoria. A doc descreve um sistema que o
grupo anterior não escreveu.

Três razões para não implementar:

* **Está fora do escopo recebido.** A N2 audita, corrige e refatora o que existe.
  Autenticação não é correção de defeito — é um requisito funcional novo, com
  tela de login, sessão e política de permissão. Implementá-la é escrever a
  funcionalidade que o grupo anterior não entregou, não melhorar a que entregou.
* **O custo é desproporcional e cruza todas as camadas.** Exige tabela `users`,
  trocar `reservations.user_name VARCHAR(100)` por `user_id` com chave
  estrangeira (que é a divergência 3 do MER), migração do dado existente, hash de
  senha, emissão e verificação de token, middleware de autorização em 10
  endpoints, **401/403 em todo o contrato da API**, tela de login no `App.jsx`
  que já tem 351 linhas e é o smell CS-01, e persistência de sessão no client.
  Em **23/10**, com BE-01 a BE-07 e as specs de frontend no mesmo sprint, é a
  decisão que arrisca a entrega inteira por um item que a rubrica não cobra.
* **Autenticação mal feita é pior que a ausência declarada.** Um JWT com segredo
  no repositório ou senha sem hash dá a aparência de controle sem o controle —
  e deixa o grupo da N3 herdando uma falsa garantia. Ausência documentada é
  honesta; segurança de fachada não é.

O que este PR entrega são **controles compensatórios**: reduzem a superfície sem
tocar no modelo de dados nem no contrato. CORS com allowlist tira a API do
alcance de páginas de terceiros; rate limit torna o abuso automatizado caro;
helmet fecha as classes de ataque de navegador. Nenhum deles substitui
autenticação, e o PR diz isso em voz alta.

Registrado em `docs/time/divida-tecnica.md` e em `docs/handoff/` como **item de
alta prioridade para a N3**, com o escopo acima detalhado e a observação de que o
MER recebido já descreve `user_id UUID` — ou seja, o grupo da N3 recebe o desenho
pronto e a decisão justificada de por que ele não foi executado agora.

## Alterações

### 1. Alterar `server/package.json` — duas dependências novas

```bash
cd server
npm install helmet express-rate-limit
```

Dependências de produção passam de **4** (`cors`, `dotenv`, `express`, `pg`)
para **6**. Registrar no PR as versões exatas que o `npm` resolveu.

### 2. Criar `server/src/config/cors.js`

```js
const AppError = require('../errors/AppError');

// Vite dev server default port, so a fresh clone works with no configuration.
const DEFAULT_ORIGINS = 'http://localhost:5173';

const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS || DEFAULT_ORIGINS)
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const corsOptions = {
  origin(origin, callback) {
    // No Origin header: curl, server-to-server calls and orchestrator health
    // checks. CORS is a browser mechanism; blocking these protects nothing and
    // breaks operations.
    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(
      new AppError(403, 'ORIGIN_NOT_ALLOWED', `Origem não permitida: ${origin}`, { origin }),
    );
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
  maxAge: 600,
};

module.exports = { corsOptions, allowedOrigins };
```

### 3. Criar `server/src/middlewares/rateLimit.js`

```js
const rateLimit = require('express-rate-limit');

const WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000);
const WRITE_MAX = Number(process.env.RATE_LIMIT_WRITE_MAX || 20);

// Reads are exempt: the received frontend refetches everything after every
// mutation (CS-08), so a global limit would turn normal usage into HTTP 429.
const READ_ONLY_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const writeLimiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: WRITE_MAX,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: (req) => READ_ONLY_METHODS.has(req.method),
  message: {
    error: {
      code: 'RATE_LIMITED',
      message: 'Muitas operações de escrita em sequência. Tente novamente em instantes.',
    },
  },
});

module.exports = { writeLimiter, WINDOW_MS, WRITE_MAX };
```

### 4. Alterar `server/src/config/database.js` — handler de `'error'` (BUG-12)

Exporta também o `pool`, para que o encerramento controlado e o `/health`
possam usá-lo.

```js
const { Pool } = require('pg');
require('dotenv').config();

const { APP_TIMEZONE } = require('./time'); // BE-07

// Idle-client failures are individually recoverable: pg discards the broken
// client and opens another one. Repeated failures mean the database is gone,
// and staying up to serve 500s is the BUG-11 antipattern all over again.
const POOL_ERROR_THRESHOLD = Number(process.env.POOL_ERROR_THRESHOLD || 3);
const POOL_ERROR_WINDOW_MS = Number(process.env.POOL_ERROR_WINDOW_MS || 30_000);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  options: `-c timezone=${APP_TIMEZONE}`,
});

let recentErrors = [];
let onFatal = null;

pool.on('connect', () => {
  console.log('[db] conexão estabelecida com o PostgreSQL');
});

// Without this listener the Pool EventEmitter throws on 'error' and Node exits
// with no diagnosis (BUG-12).
pool.on('error', (err) => {
  console.error('[db] erro em cliente ocioso do pool', {
    code: err.code,
    message: err.message,
  });

  const now = Date.now();
  recentErrors = recentErrors.filter((at) => now - at < POOL_ERROR_WINDOW_MS);
  recentErrors.push(now);

  if (recentErrors.length >= POOL_ERROR_THRESHOLD) {
    console.error(
      `[db] ${recentErrors.length} erros de pool em ${POOL_ERROR_WINDOW_MS} ms; ` +
        'encerrando de forma controlada para que o supervisor reinicie o processo',
    );
    if (typeof onFatal === 'function') {
      onFatal(new Error('pool_unavailable'));
    } else {
      process.exit(1);
    }
  }
});

/** Registers the shutdown routine invoked when the pool is considered lost. */
function onPoolFatal(handler) {
  onFatal = handler;
}

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
  onPoolFatal,
};
```

> `module.exports.query` continua existindo com a mesma assinatura, então os dois
> models e o teste existente (`reservationModel.test.js:2,4`) seguem funcionando
> sem edição.

### 5. Alterar `server/src/config/initDb.js` — deixar de engolir a falha (BUG-11)

Remover o `try/catch` das linhas 25-30:

```js
/**
 * Ensures the schema exists. Deliberately does NOT catch: this function cannot
 * decide what to do with a DDL failure, and the previous version decided the
 * worst option available — ignore it and let the server boot broken (BUG-11).
 * The caller owns the decision.
 */
const createTables = async () => {
  await db.query(queryText);
  console.log('[db] schema garantido');
};
```

### 6. Criar `server/src/routes/healthRoutes.js`

```js
const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { APP_TIMEZONE } = require('../config/time'); // BE-07

const { version } = require('../../package.json');

/**
 * Liveness + readiness in one endpoint. Unlike `GET /`, it actually touches the
 * database, so a 200 here means the API can serve traffic.
 *
 * 200 -> ok | 503 -> degraded (process alive, database unreachable)
 */
router.get('/', async (req, res) => {
  const startedAt = process.hrtime.bigint();

  try {
    await db.query('SELECT 1');
  } catch (err) {
    console.error('[health] banco inacessível', { code: err.code, message: err.message });
    return res.status(503).json({
      status: 'degraded',
      database: 'down',
      reason: err.code || 'unknown',
      uptimeSeconds: Math.round(process.uptime()),
      version,
    });
  }

  const latencyMs = Number(process.hrtime.bigint() - startedAt) / 1e6;

  return res.json({
    status: 'ok',
    database: 'up',
    databaseLatencyMs: Number(latencyMs.toFixed(2)),
    timezone: APP_TIMEZONE,
    uptimeSeconds: Math.round(process.uptime()),
    version,
  });
});

module.exports = router;
```

> Este handler tem `try/catch` próprio de propósito, e é a **única** exceção à
> regra de BE-04: `/health` precisa responder **503 com corpo de diagnóstico**,
> não o erro genérico do middleware central. Está anotado como exceção no
> comentário e na spec de BE-04.

### 7. Criar `server/src/app.js` — fábrica da aplicação

Separar a montagem do app do bootstrap do processo. Sem isso, `index.js` chama
`startServer()` no momento do `require` (`index.js:33`), o que impede qualquer
teste com Supertest de importar a aplicação sem subir servidor e abrir conexão
com o banco.

```js
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const { corsOptions } = require('./config/cors');
const { writeLimiter } = require('./middlewares/rateLimit');
const errorHandler = require('./middlewares/errorHandler'); // BE-04
const notFoundHandler = require('./middlewares/notFoundHandler'); // BE-04
const healthRoutes = require('./routes/healthRoutes');
const resourceRoutes = require('./routes/resourceRoutes');
const reservationRoutes = require('./routes/reservationRoutes');

function createApp() {
  const app = express();

  app.disable('x-powered-by');

  app.use(helmet());
  app.use(cors(corsOptions));
  app.use(express.json({ limit: '100kb' }));

  // Before the limiter on purpose: a health check must never be throttled.
  app.use('/health', healthRoutes);

  app.use('/api', writeLimiter);
  app.use('/api/resources', resourceRoutes);
  app.use('/api/reservations', reservationRoutes);

  app.get('/', (req, res) => {
    res.json({ name: 'SREC Coworking API', status: 'running', health: '/health' });
  });

  // Error handling is always last (BE-04).
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = createApp;
```

### 8. Alterar `server/src/index.js` — boot que falha quando deve

```js
require('dotenv').config();

const { APP_TIMEZONE } = require('./config/time'); // BE-07
process.env.TZ = process.env.TZ || APP_TIMEZONE;

const createApp = require('./app');
const initDb = require('./config/initDb');
const { pool, onPoolFatal } = require('./config/database');
const { allowedOrigins } = require('./config/cors');
const { WRITE_MAX, WINDOW_MS } = require('./middlewares/rateLimit');

const PORT = Number(process.env.PORT || 5000);
const SHUTDOWN_TIMEOUT_MS = Number(process.env.SHUTDOWN_TIMEOUT_MS || 10_000);

let shuttingDown = false;

async function shutdown(server, reason, exitCode) {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`[boot] encerrando: ${reason}`);

  // Hard deadline: never hang forever draining connections.
  const deadline = setTimeout(() => {
    console.error('[boot] encerramento excedeu o tempo limite; saindo à força');
    process.exit(exitCode);
  }, SHUTDOWN_TIMEOUT_MS);
  deadline.unref();

  server.close(async () => {
    try {
      await pool.end();
      console.log('[boot] pool de conexões encerrado');
    } catch (err) {
      console.error('[boot] falha ao encerrar o pool', err.message);
    }
    clearTimeout(deadline);
    process.exit(exitCode);
  });
}

async function startServer() {
  try {
    await initDb();
  } catch (err) {
    // A service that cannot guarantee its schema must not accept requests.
    // The previous version swallowed this and served 500 on 10 of 10 endpoints.
    console.error('[boot] não foi possível garantir o schema; abortando', {
      code: err.code,
      message: err.message,
    });
    await pool.end().catch(() => {});
    process.exit(1);
  }

  const app = createApp();
  const server = app.listen(PORT, () => {
    console.log(`[boot] SREC ouvindo na porta ${PORT}`);
    console.log(`[boot] fuso da aplicação: ${APP_TIMEZONE}`);
    console.log(`[boot] origens permitidas: ${allowedOrigins.join(', ')}`);
    console.log(`[boot] limite de escrita: ${WRITE_MAX} req / ${WINDOW_MS} ms por IP`);
  });

  onPoolFatal(() => shutdown(server, 'pool de conexões indisponível', 1));

  process.on('SIGTERM', () => shutdown(server, 'SIGTERM recebido', 0));
  process.on('SIGINT', () => shutdown(server, 'SIGINT recebido', 0));

  process.on('unhandledRejection', (reason) => {
    console.error('[boot] promessa rejeitada sem tratamento', reason);
    shutdown(server, 'unhandledRejection', 1);
  });
}

startServer();
```

### 9. Alterar `server/.env.example`

```env
PORT=5000
DATABASE_URL=postgres://postgres:***@localhost:5432/srec
APP_TIMEZONE=America/Sao_Paulo

# Origens autorizadas a chamar a API pelo navegador, separadas por vírgula.
# Padrão: http://localhost:5173 (servidor de desenvolvimento do Vite).
CORS_ALLOWED_ORIGINS=http://localhost:5173

# Limite de requisições de escrita por IP. Leituras não são limitadas.
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_WRITE_MAX=20

# Encerramento controlado quando o pool do Postgres falha de forma reincidente.
POOL_ERROR_THRESHOLD=3
POOL_ERROR_WINDOW_MS=30000
SHUTDOWN_TIMEOUT_MS=10000
```

### 10. Criar `server/src/app.test.js` e `server/src/routes/healthRoutes.test.js`

### 11. Alterar `README.md`

Seção de operação: variáveis de ambiente novas, `GET /health` e seu contrato
(200 `ok` / 503 `degraded`), e o aviso explícito de que **a API não tem
autenticação** — com link para o item de dívida técnica. Onboarding é rubrica
(1,5) e o próximo grupo precisa saber disso na primeira leitura, não na auditoria.

### 12. Alterar `docs/time/divida-tecnica.md` e `docs/handoff/`

Registrar autenticação e autorização como item de alta prioridade para a N3, com
o escopo da Decisão §6 e a observação de que o MER recebido já prevê
`reservations.user_id UUID` (divergência 3).

## Testes

### `server/src/app.test.js`

```js
const request = require('supertest');

jest.mock('./config/database');

const db = require('./config/database');
const createApp = require('./app');

describe('superfície HTTP', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    db.query.mockResolvedValue({ rows: [] });
    app = createApp();
  });

  // FALHA ANTES DA CORREÇÃO: sem helmet, nenhum destes cabeçalhos existe.
  it('deve enviar os cabeçalhos de segurança do helmet', async () => {
    const res = await request(app).get('/api/resources');

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBeDefined();
    expect(res.headers['referrer-policy']).toBeDefined();
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  // FALHA ANTES DA CORREÇÃO: hoje responde 'access-control-allow-origin: *'.
  it('não deve liberar origem fora da allowlist', async () => {
    const res = await request(app)
      .get('/api/resources')
      .set('Origin', 'https://exemplo-malicioso.test');

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ORIGIN_NOT_ALLOWED');
  });

  it('deve liberar a origem do servidor de desenvolvimento do Vite', async () => {
    const res = await request(app).get('/api/resources').set('Origin', 'http://localhost:5173');

    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(res.status).toBe(200);
  });

  it('deve aceitar requisição sem cabeçalho Origin (curl, health check)', async () => {
    await request(app).get('/api/resources').expect(200);
  });

  // FALHA ANTES DA CORREÇÃO: 100 de 100 escritas aceitas, nenhum 429.
  it('deve responder 429 depois do limite de escritas por janela', async () => {
    process.env.RATE_LIMIT_WRITE_MAX = '3';
    jest.resetModules();
    const freshApp = require('./app')();

    const payload = { name: 'Sala X', type: 'meeting_room', capacity: 4 };
    const codes = [];
    for (let i = 0; i < 5; i += 1) {
      const res = await request(freshApp).post('/api/resources').send(payload);
      codes.push(res.status);
    }

    expect(codes.filter((code) => code === 429).length).toBeGreaterThan(0);
    delete process.env.RATE_LIMIT_WRITE_MAX;
  });

  it('não deve limitar leituras', async () => {
    const codes = [];
    for (let i = 0; i < 40; i += 1) {
      codes.push((await request(app).get('/api/resources')).status);
    }
    expect(codes.every((code) => code === 200)).toBe(true);
  });
});
```

### `server/src/routes/healthRoutes.test.js`

```js
const request = require('supertest');

jest.mock('../config/database');

const db = require('../config/database');
const createApp = require('../app');

describe('GET /health', () => {
  afterEach(() => jest.clearAllMocks());

  // FALHA ANTES DA CORREÇÃO: a rota não existe (404).
  it('deve responder 200 com status ok quando o banco responde', async () => {
    db.query.mockResolvedValue({ rows: [{ '?column?': 1 }] });

    const res = await request(createApp()).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.database).toBe('up');
    expect(db.query).toHaveBeenCalledWith('SELECT 1');
  });

  it('deve responder 503 com status degraded quando o banco está inacessível', async () => {
    db.query.mockRejectedValue(Object.assign(new Error('ECONNREFUSED'), { code: 'ECONNREFUSED' }));

    const res = await request(createApp()).get('/health');

    expect(res.status).toBe(503);
    expect(res.body.status).toBe('degraded');
    expect(res.body.database).toBe('down');
  });

  it('não deve ser afetado pelo limite de escrita', async () => {
    db.query.mockResolvedValue({ rows: [{ '?column?': 1 }] });
    const app = createApp();

    for (let i = 0; i < 40; i += 1) {
      await request(app).get('/health').expect(200);
    }
  });
});
```

### Verificação manual (as provas que vão no PR)

```bash
# BUG-12 — derrubar o Postgres não mata mais o processo
#   (terminal A) cd server && npm run dev
#   (terminal B)
docker stop srec-postgres
#   terminal A esperado: '[db] erro em cliente ocioso do pool' e o processo VIVO
curl -s -o /dev/null -w 'health com banco fora: %{http_code}\n' http://localhost:5000/health
# esperado: 503
docker start srec-postgres
curl -s -o /dev/null -w 'health com banco de volta: %{http_code}\n' http://localhost:5000/health
# esperado: 200

# BUG-11 — boot com banco inacessível agora falha
DATABASE_URL=postgres://postgres:errado@localhost:5432/inexistente npm start --prefix server
echo "codigo de saida: $?"
# esperado: '[boot] não foi possível garantir o schema; abortando' e codigo de saida: 1

# Encerramento controlado
npm run dev --prefix server &
PID=$!
kill -TERM $PID
# esperado: '[boot] encerrando: SIGTERM recebido' e '[boot] pool de conexões encerrado'
```

Comando da suíte:

```bash
cd server
npx jest --coverage --coverageReporters=text --collectCoverageFrom='src/**/*.js'
```

## Critérios de aceite

* [ ] `curl -I http://localhost:5000/api/resources` traz **≥ 6** cabeçalhos de
      segurança (antes: **0**) e **nenhum** `X-Powered-By` (antes: presente).
      O número exato medido vai colado na descrição do PR.
* [ ] `Origin: https://exemplo-malicioso.test` recebe **403 `ORIGIN_NOT_ALLOWED`**
      e **nenhum** `Access-Control-Allow-Origin` (antes: `*`).
* [ ] `Origin: http://localhost:5173` recebe **200** com
      `Access-Control-Allow-Origin: http://localhost:5173`; o frontend recebido
      continua funcionando sem nenhuma configuração extra.
* [ ] Requisição sem `Origin` (`curl` puro) recebe **200**.
* [ ] O laço de 100 `POST` da seção Evidência produz **≥ 80 respostas 429**
      (antes: **0 de 100**; limite de 20/min por IP).
* [ ] 40 `GET` seguidos: **40 de 40** com 200 — leitura não é limitada.
* [ ] `grep -c "pool.on('error'" server/src/config/database.js` retorna **1**;
      listeners no pool passam de **1** para **2**.
* [ ] Derrubar o Postgres com o servidor de pé **não** encerra o processo; o log
      traz `[db] erro em cliente ocioso do pool` (antes: processo encerrado).
* [ ] Três erros de pool em 30 s disparam encerramento controlado com código de
      saída **1** (antes: queda imediata e sem código útil).
* [ ] `GET /health` responde **200** com `status: "ok"` e `databaseLatencyMs`
      com banco de pé, e **503** com `status: "degraded"` com banco fora
      (antes: **404** nos dois casos).
* [ ] `/health` não é limitado pelo rate limit: 40 chamadas seguidas, 40
      respostas 200.
* [ ] Boot com `DATABASE_URL` inválida **não** sobe e sai com código **1**
      (antes: subia, código **0**, e respondia 500 em **10 de 10** endpoints).
* [ ] `grep -c "catch" server/src/config/initDb.js` retorna **0** (antes: **1**).
* [ ] `SIGTERM` encerra drenando: log de `pool de conexões encerrado` e código de
      saída **0** (antes: nenhum tratamento de sinal).
* [ ] Dependências de produção: **6** (antes: **4**); as duas novas são `helmet`
      e `express-rate-limit`, com versão registrada no PR.
* [ ] Cobertura de statements de `src/app.js` e `src/routes/healthRoutes.js`
      ≥ **85 %** (antes: `app.js` não existia; `index.js` tinha **0 %**).
* [ ] `README.md` documenta as 6 variáveis de ambiente novas, o contrato de
      `/health` e, em texto explícito, que **a API não tem autenticação**, com
      link para a dívida técnica.
* [ ] `docs/time/divida-tecnica.md` registra autenticação como item de alta
      prioridade para a N3, citando as divergências 3, 6 e 8 da auditoria.
* [ ] `npm run lint` no `server/` com **0** erros.
* [ ] PR com **1 aprovação** de Igor Seberino (`@igorSeberino`, QA) e CI verde.

## Passo a passo TBD

```bash
# 1. Branch
git checkout main
git pull origin main
git checkout -b feature/harden-http-surface

# 2. Confirmar BE-04 em main (o app.js registra errorHandler por último)
ls server/src/errors/AppError.js server/src/middlewares/errorHandler.js \
   server/src/middlewares/notFoundHandler.js

# 3. Registrar o estado ANTES (números do pitch)
curl -s -I http://localhost:5000/api/resources > /tmp/antes_headers.txt
grep -ciE '^(content-security-policy|x-content-type-options|x-frame-options|referrer-policy|strict-transport-security|cross-origin|origin-agent-cluster)' \
  /tmp/antes_headers.txt   # esperado: 0
grep -i 'x-powered-by' /tmp/antes_headers.txt            # esperado: presente
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:5000/health  # esperado: 404

# 4. Dependências
cd server && npm install helmet express-rate-limit && cd ..

# 5. Implementar
#    - criar   server/src/config/cors.js
#    - criar   server/src/middlewares/rateLimit.js
#    - criar   server/src/routes/healthRoutes.js
#    - criar   server/src/app.js
#    - alterar server/src/config/database.js   (pool.on('error'), exportar pool)
#    - alterar server/src/config/initDb.js     (remover o try/catch)
#    - alterar server/src/index.js             (boot que falha, shutdown, sinais)
#    - alterar server/.env.example

# 6. Testes
#    - criar server/src/app.test.js
#    - criar server/src/routes/healthRoutes.test.js
cd server
npx jest --coverage --coverageReporters=text --collectCoverageFrom='src/**/*.js'
npm run lint
cd ..

# 7. Registrar o estado DEPOIS
curl -s -I http://localhost:5000/api/resources > /tmp/depois_headers.txt
diff /tmp/antes_headers.txt /tmp/depois_headers.txt
#    E rodar as três verificações manuais da seção "Testes".

# 8. Commits
git add server/package.json server/package-lock.json
git commit -m "build(server): adicionar helmet e express-rate-limit"

git add server/src/config/cors.js server/src/middlewares/rateLimit.js server/src/app.js
git commit -m "feat(http): aplicar helmet, allowlist de CORS e limite de escrita por IP"

git add server/src/config/database.js
git commit -m "fix(db): tratar erro de cliente ocioso do pool e encerrar de forma controlada"

git add server/src/config/initDb.js server/src/index.js
git commit -m "fix(boot): abortar a inicializacao quando o schema nao pode ser garantido"

git add server/src/routes/healthRoutes.js server/src/app.test.js \
        server/src/routes/healthRoutes.test.js
git commit -m "feat(health): expor GET /health verificando o banco com SELECT 1"

git add server/.env.example README.md docs/time/divida-tecnica.md \
        docs/handoff docs/specs/be-08-harden-http-surface
git commit -m "docs(server): documentar variaveis de ambiente, /health e a ausencia de autenticacao"

# 9. PR
git push -u origin feature/harden-http-surface
#    Título: "feat(http): endurecer a superficie HTTP e o boot do servidor (CS-14, BUG-11, BUG-12)"
#    Descrição: link para esta spec; diff de cabeçalhos antes/depois; contagem de
#    429 no laço de 100 POST; print do processo sobrevivendo à queda do Postgres;
#    código de saída 1 no boot com banco inválido; e o parágrafo explicando por
#    que autenticação NÃO entrou e onde ficou registrada.
#    Revisor obrigatório: @igorSeberino (QA).
```

## Prompt para o Claude Code

```text
Você está na raiz do repositório igorSeberino/srec, na branch
feature/harden-http-surface. Carregue antes de começar:

  - docs/specs/be-08-harden-http-surface/implementacao.md        (esta spec)
  - docs/specs/be-04-centralized-error-handling/implementacao.md (dependência)
  - docs/specs/be-07-timezone-aware-timestamps/implementacao.md  (APP_TIMEZONE)
  - docs/auditoria/ (divergências 3, 6 e 8: o "Nível de acesso Admin" que nunca existiu)
  - a skill de arquitetura de backend do repositório, em .claude/skills/
  - CLAUDE.md

Tarefa: implementar exatamente a seção "Alterações" — helmet, CORS com
allowlist, rate limit nas escritas, handler de erro do pool, GET /health e boot
que falha quando o schema não pode ser garantido.

Restrições duras:
  - NÃO implemente autenticação, autorização, tabela de usuários, JWT nem
    tela de login. Está fora do escopo desta entrega e a spec explica por quê.
    Se achar que falta, escreva no PR e no arquivo de dívida técnica — não
    escreva código.
  - NÃO toque em client/.
  - O middleware de erro de BE-04 continua sendo o ÚLTIMO registrado em app.js.
    A única exceção permitida é o try/catch dentro de healthRoutes.js, que
    precisa devolver 503 com corpo de diagnóstico.
  - `module.exports.query` de config/database.js mantém a assinatura atual:
    os dois models e reservationModel.test.js não podem precisar de edição.
  - pool.on('error') NÃO encerra no primeiro erro. Só por reincidência
    (3 erros em 30 s), e com encerramento controlado + exit(1).
  - initDb.js fica SEM try/catch. Quem decide é o startServer.
  - Rate limit só em escrita: GET, HEAD e OPTIONS passam. /health é montado
    antes do limiter.
  - Padrões de ambiente têm que fazer um clone novo funcionar sem configuração
    (CORS_ALLOWED_ORIGINS=http://localhost:5173).
  - Node 20, Express 5, pg com SQL cru, CommonJS. As únicas dependências novas
    são helmet e express-rate-limit.

Entregue nesta ordem e me mostre a saída de cada passo:
  1. curl -I ANTES, com a contagem de cabeçalhos de segurança (esperado 0) e o
     X-Powered-By presente;
  2. o código implementado;
  3. jest --coverage com a tabela completa;
  4. npm run lint do server;
  5. curl -I DEPOIS, com a contagem de cabeçalhos e a ausência do X-Powered-By;
  6. o laço de 100 POST, com a contagem de 429;
  7. o processo sobrevivendo à queda do Postgres e /health respondendo 503 e
     depois 200;
  8. o boot com DATABASE_URL inválida, mostrando o código de saída 1;
  9. SIGTERM encerrando com log de drenagem e código de saída 0.

Por fim, proponha as 6 mensagens de commit da seção "Passo a passo TBD" sem
executar nenhum comando git.
```
