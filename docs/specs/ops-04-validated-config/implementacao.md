# OPS-04 — Configuração validada no boot

* **Responsável:** Gabriel Carvalho (DevOps)
* **Issue:** #<a definir>
* **Branch:** `feature/validated-config`
* **Rubrica:** 4,0 — Onboarding e diagnóstico → 1,5 pt (um erro de configuração passa a dizer o que está errado, em vez de falhar na primeira requisição) e 2,5 pt (apoia a correção de **BUG-11** e **BUG-12**).
* **Depende de:** nada. **Habilita:** BE-08 (helmet, rate limit, CORS allowlist, pool error handler, `/health`) e OPS-01 (o compose injeta as variáveis que este módulo passa a exigir).

## Problema

### `dotenv` é carregado duas vezes, por dois arquivos diferentes

`server/src/index.js:3`:

```js
require('dotenv').config();
```

`server/src/config/database.js:2`:

```js
require('dotenv').config();
```

Nenhum dos dois sabe do outro. Qualquer arquivo novo que precise de uma variável
tem que repetir a linha ou confiar na sorte de alguém já ter carregado — e
"confiar na sorte" é literal: a ordem de resolução de `require` decide. Hoje
funciona porque `index.js` carrega antes de qualquer coisa; basta um teste
importar `database.js` isoladamente para a ordem mudar. Com 2 arquivos ainda é
tolerável; **BE-08** vai precisar de `CORS_ALLOWED_ORIGINS`,
`RATE_LIMIT_WINDOW_MS` e `RATE_LIMIT_MAX`, e o padrão se replica.

### `PORT` tem fallback mágico espalhado

`server/src/index.js:10`:

```js
const PORT = process.env.PORT || 5000;
```

O número `5000` aparece em mais três lugares, sem nenhum vínculo entre eles:

* `server/.env.example:1` — `PORT=5000`
* `README.md:54` — "O servidor rodará na porta `5000`"
* `client/src/services/api.js:1` — `const API_BASE_URL = 'http://localhost:5000/api';`

São 4 ocorrências do mesmo valor, nenhuma derivada das outras. Mudar a porta
exige lembrar de quatro arquivos, e esquecer qualquer um deles produz um erro
cujo sintoma (`Failed to fetch` no navegador) não aponta para a causa.

### Configuração inválida não impede o servidor de subir

`server/src/config/database.js:1-10`:

```js
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on('connect', () => {
  console.log('Connected to PostgreSQL Database');
});
```

Três problemas num arquivo de 14 linhas:

1. Se `DATABASE_URL` for **`undefined`**, o `pg` não reclama: cai nos defaults do
   libpq (`PGHOST=localhost`, usuário do sistema operacional, banco com o nome do
   usuário). O `new Pool` não conecta nada — o `Pool` é *lazy*, só abre conexão no
   primeiro `query()`. Resultado: o processo sobe, imprime
   `Server is running on port 5000` (`index.js:29`) e a falha só aparece quando a
   primeira requisição chega. Para quem está dando onboarding no projeto, o
   sintoma é "a API está no ar mas tudo dá 500".
2. Se `DATABASE_URL` estiver **malformada** (host errado, senha errada, porta
   errada), o comportamento é idêntico: sobe e falha na primeira requisição.
3. Há `pool.on('connect')` (linha 8) e **não há `pool.on('error')`** — é
   **BUG-12**: um erro em cliente idle do pool é emitido como evento `error` no
   `Pool`, e `EventEmitter` sem listener para `error` derruba o processo. Se o
   Postgres cair ou reiniciar, o Node morre com `Unhandled 'error' event`.

O ponto 3 é entregue por **BE-08**; os pontos 1 e 2 são desta spec.

### O `.env.example` não serve para o que existe

`server/.env.example` tem **2 linhas**:

```
PORT=5000
DATABASE_URL=postgres://postgres:***@localhost:5432/srec
```

A senha está mascarada com `***`. Quem clona e copia esse arquivo para `.env`
obtém uma `DATABASE_URL` **sintaticamente válida e funcionalmente errada** — e,
pelo item 1 acima, o servidor sobe de qualquer forma. É o pior formato de erro:
silencioso e com aparência de sucesso.

Nenhuma variável tem comentário, nenhuma indica se é obrigatória, nenhuma
documenta o formato aceito.

## Evidência

```bash
cd server

# dotenv carregado em dois lugares independentes
grep -rn "dotenv" src/
# => src/index.js:3:require('dotenv').config();
# => src/config/database.js:2:require('dotenv').config();

# o número 5000 repetido sem vínculo
grep -rn "5000" src/ .env.example ../README.md ../client/src/services/api.js
# => src/index.js:10:const PORT = process.env.PORT || 5000;
# => .env.example:1:PORT=5000
# => ../README.md:54:O servidor rodará na porta `5000` ...
# => ../client/src/services/api.js:1:const API_BASE_URL = 'http://localhost:5000/api';

# o .env.example tem 2 linhas, com a senha mascarada
wc -l < .env.example        # => 2
grep -c '\*\*\*' .env.example  # => 1

# nenhuma validação de env em nenhum lugar
grep -rniE "zod|joi|envalid|convict|validate.*env" src/ package.json | wc -l  # => 0

# BUG-12: há listener de 'connect', não há de 'error'
grep -n "pool.on" src/config/database.js
# => 8:pool.on('connect', () => {
```

### Reprodução — o servidor sobe sem `DATABASE_URL`

```bash
cd server
env -u DATABASE_URL node -e "
  const p = require('./src/config/database');
  console.log('modulo carregado sem erro');
"
# => modulo carregado sem erro
```

```bash
# e o processo inteiro sobe
cd server
mv .env .env.bak 2>/dev/null
env -u DATABASE_URL -u PORT node src/index.js &
sleep 2
curl -s -o /dev/null -w 'GET / => %{http_code}\n' http://localhost:5000/
curl -s -o /dev/null -w 'GET /api/resources => %{http_code}\n' http://localhost:5000/api/resources
kill %1
mv .env.bak .env 2>/dev/null
```

Saída observada, **antes** desta spec:

```
Error creating tables  error: password authentication failed ...   <- engolido
Server is running on port 5000
GET / => 200
GET /api/resources => 500
```

O servidor anuncia que está rodando, a raiz responde 200, e **todo** endpoint
funcional responde 500. O erro de configuração aparece enterrado num
`console.error` (de `initDb.js:29`, que **OPS-02** remove) e sem dizer qual
variável está errada.

### Reprodução — `DATABASE_URL` malformada

```bash
cd server
DATABASE_URL="isso-nao-e-uma-url" node src/index.js &
sleep 2
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:5000/api/resources  # => 500
kill %1
```

Mesmo resultado: sobe, falha depois.

Medição que esta spec move:

| Métrica | Antes (medido) | Depois (meta) |
|---|---|---|
| Chamadas de `require('dotenv').config()` | **2** (`index.js:3`, `database.js:2`) | **1** (só em `env.js`) |
| Ocorrências do literal `5000` no backend | **2** (`index.js:10`, `.env.example:1`) | **1** (`env.js`, como default documentado) |
| Variáveis de ambiente validadas no boot | **0** | **6** |
| Linhas do `.env.example` | **2** | **~30**, todas comentadas |
| Variáveis do `.env.example` documentadas | **0 de 2** | **6 de 6** |
| Configuração inválida que derruba o boot | **0** (sobe sempre) | **todas as obrigatórias** |
| Tempo até descobrir `DATABASE_URL` ausente | 1ª requisição HTTP, com 500 genérico | **0 s** — o boot falha com a variável nomeada |
| Código de saída com config inválida | **0** (continua rodando) | **1** |
| Cobertura de teste do módulo de config | n/d (não existe) | **100 %** (função pura) |

## Decisão

**Um módulo único `server/src/config/env.js` que carrega o `.env` uma só vez,
valida cada variável com uma função pura e memoiza o resultado. Sem dependência
nova.**

### Validação à mão, e não `zod` nem `envalid`

A alternativa óbvia é `zod` (ou `envalid`, feito exatamente para isto). Foi
descartada por três razões concretas deste projeto:

1. **Volume.** São **6** variáveis, 2 delas obrigatórias. Um schema de `zod` para
   6 campos ocupa aproximadamente o mesmo número de linhas que a validação
   escrita à mão — e a validação à mão produz a mensagem de erro que **nós**
   queremos, em português, dizendo exatamente qual variável falta e qual formato
   é esperado. Mensagem de erro é o entregável central desta spec; delegá-la à
   formatação padrão de uma biblioteca é entregar menos.
2. **Superfície de dependência sob auditoria.** O backend tem hoje **4**
   dependências de runtime (`cors`, `dotenv`, `express`, `pg`, em
   `server/package.json:18-23`). **BE-08** vai acrescentar `helmet` e
   `express-rate-limit`, que são insubstituíveis. Acrescentar `zod` por cima,
   para 6 variáveis, num projeto cuja entrega é um **relatório de auditoria**, é
   difícil de defender no pitch. `npm audit` (OPS-03) também fica com menos
   superfície.
3. **`zod` é ESM-first e o backend é CommonJS.** `server/package.json:17` declara
   `"type": "commonjs"` e todo o `src/` usa `require`. Dá para usar `zod` em
   CJS, mas é mais uma aresta de configuração para um ganho marginal.

O limite dessa decisão é explícito: **se o número de variáveis passar de ~12, ou
se aparecer necessidade de coerção/transformação não trivial, migre para
`envalid`.** Isso fica registrado em `docs/time/divida-tecnica.md`, não na
cabeça de ninguém.

### Função pura + memoização, e não `module.exports = env` avaliado no require

A forma mais curta seria validar no topo do módulo e exportar o objeto pronto:

```js
// NÃO é o que esta spec faz
const env = validar(process.env);
module.exports = env;
```

Problema: isso **lança no `require`**. Qualquer teste unitário que importe,
direta ou indiretamente, um módulo que importe `env.js` passaria a exigir
`DATABASE_URL` no ambiente — inclusive
`server/src/models/reservationModel.test.js`, que hoje roda com
`jest.mock('../config/database')` e nenhuma variável de ambiente. Quebrar os 2
únicos testes do projeto para adicionar validação de config seria péssimo
negócio.

A forma adotada exporta duas coisas:

* `parseEnv(source)` — **função pura**, recebe um objeto (normalmente
  `process.env`), devolve o objeto de config ou lança `ConfigError`. Totalmente
  testável sem tocar em `process.env`, sem `.env`, sem banco. É isso que permite
  **100 %** de cobertura num módulo de config, e é cobertura real, não inflada.
* `getEnv()` — memoiza `parseEnv(process.env)` na primeira chamada. Quem precisa
  de config chama `getEnv()`; quem só está sendo importado por um teste não
  dispara nada.

### Falha rápida no `index.js`, com `process.exit(1)`

A validação é invocada **explicitamente** no primeiro ato do `index.js`, dentro
de `try/catch`, imprimindo a lista completa de problemas e saindo com **código
1**. Duas consequências práticas:

* O `docker compose up` de OPS-01 mostra o erro no log e o container morre em vez
  de ficar "no ar e quebrado" — e `restart: unless-stopped` vai reiniciar, então
  a mensagem aparece repetidamente, o que é exatamente o comportamento desejável
  para um erro de configuração.
* O step de CI de OPS-03 falha imediatamente se o `env` do job estiver
  incompleto, em vez de falhar num teste de integração com erro confuso.

**Todos** os problemas são reportados de uma vez, não o primeiro. Quem tem duas
variáveis erradas descobre as duas num ciclo, não em dois.

### Validação de `DATABASE_URL` por `new URL()`, sem conectar

`parseEnv` verifica que `DATABASE_URL` existe, que é parseável como URL e que o
protocolo é `postgres:` ou `postgresql:`. Ela **não** tenta conectar: validação
de configuração tem que ser sincrônica, determinística e sem I/O, senão vira
teste de integração disfarçado e fica lenta e intermitente. A verificação de
conectividade real é o endpoint `/health` de **BE-08**, que é o lugar certo para
ela.

### Limite de escopo — o que esta spec NÃO entrega

| Item | Quem entrega |
|---|---|
| Endpoint `GET /health` com ping no banco | **BE-08** |
| `pool.on('error', ...)` — correção de **BUG-12** | **BE-08** |
| `helmet`, `express-rate-limit`, allowlist de CORS | **BE-08** |
| Remoção do `initDb.js` (**BUG-11**) | **OPS-02** |
| `API_BASE_URL` configurável no frontend (**CS-07**) | spec de frontend |

Esta spec entrega a **configuração validada de que esses quatro primeiros
dependem**: `CORS_ALLOWED_ORIGINS` já sai de `getEnv()` como array pronto, e
`RATE_LIMIT_WINDOW_MS`/`RATE_LIMIT_MAX` já saem como números validados. BE-08
consome, não valida de novo.

## Alterações

### Criar — `server/src/config/env.js`

```js
/**
 * Carregamento e validacao da configuracao de ambiente.
 *
 * Unico ponto do backend que chama `dotenv`. Nenhum outro arquivo deve chamar
 * `require('dotenv').config()` nem ler `process.env` direto.
 *
 * Exporta:
 *   - parseEnv(source): funcao PURA. Valida um objeto e devolve a config, ou
 *     lanca ConfigError com a lista completa de problemas. Testavel sem tocar
 *     em process.env.
 *   - getEnv(): memoiza parseEnv(process.env). Validar no require (em vez de
 *     numa funcao) obrigaria todo teste que importa qualquer modulo da arvore a
 *     definir DATABASE_URL, o que quebraria a suite existente.
 *
 * Ver docs/specs/ops-04-validated-config/implementacao.md
 */

const path = require('node:path');

/** Erro de configuracao: agrega TODOS os problemas, nao so o primeiro. */
class ConfigError extends Error {
  constructor(problemas) {
    const corpo = problemas.map((p) => `  - ${p}`).join('\n');
    super(
      `Configuracao de ambiente invalida (${problemas.length} problema(s)):\n${corpo}\n\n` +
        'Copie server/.env.example para server/.env e preencha os valores, ou\n' +
        'use `docker compose up`, que ja injeta as variaveis necessarias.',
    );
    this.name = 'ConfigError';
    this.problemas = problemas;
  }
}

const AMBIENTES_VALIDOS = ['development', 'test', 'production'];
const PROTOCOLOS_POSTGRES = ['postgres:', 'postgresql:'];

// Default unico e documentado da porta. Antes desta spec, o literal 5000
// aparecia em src/index.js:10 e em .env.example:1, sem vinculo entre os dois.
const PORT_PADRAO = 5000;

function exigirTexto(source, chave, problemas) {
  const valor = source[chave];
  if (valor === undefined || valor === null || String(valor).trim() === '') {
    problemas.push(`${chave} e obrigatoria e nao esta definida`);
    return undefined;
  }
  return String(valor).trim();
}

function lerInteiro(source, chave, padrao, { min, max }, problemas) {
  const bruto = source[chave];
  if (bruto === undefined || String(bruto).trim() === '') {
    return padrao;
  }
  if (!/^-?\d+$/.test(String(bruto).trim())) {
    problemas.push(`${chave} deve ser um numero inteiro, recebido "${bruto}"`);
    return padrao;
  }
  const numero = Number.parseInt(String(bruto).trim(), 10);
  if (numero < min || numero > max) {
    problemas.push(`${chave} deve estar entre ${min} e ${max}, recebido ${numero}`);
    return padrao;
  }
  return numero;
}

function validarDatabaseUrl(valor, problemas) {
  if (valor === undefined) {
    // exigirTexto ja registrou o problema de ausencia
    return undefined;
  }
  let url;
  try {
    url = new URL(valor);
  } catch {
    problemas.push(
      'DATABASE_URL nao e uma URL valida. ' +
        'Formato esperado: postgres://usuario:senha@host:porta/banco',
    );
    return undefined;
  }
  if (!PROTOCOLOS_POSTGRES.includes(url.protocol)) {
    problemas.push(
      `DATABASE_URL deve usar o protocolo postgres:// ou postgresql://, ` +
        `recebido "${url.protocol}//"`,
    );
    return undefined;
  }
  if (!url.hostname) {
    problemas.push('DATABASE_URL nao informa host');
    return undefined;
  }
  if (!url.pathname || url.pathname === '/') {
    problemas.push(
      'DATABASE_URL nao informa o nome do banco (o caminho depois da barra)',
    );
    return undefined;
  }
  // Senha mascarada: e exatamente o que server/.env.example:2 trazia no
  // recebimento (`postgres://postgres:***@localhost:5432/srec`), e o servidor
  // subia assim mesmo para falhar na primeira requisicao.
  if (url.password === '***' || url.password.includes('*')) {
    problemas.push(
      'DATABASE_URL contem senha mascarada ("***"). ' +
        'Substitua pelo valor real antes de iniciar o servidor.',
    );
    return undefined;
  }
  return valor;
}

function validarOrigens(source, problemas) {
  const bruto = source.CORS_ALLOWED_ORIGINS;
  if (bruto === undefined || String(bruto).trim() === '') {
    return [];
  }
  const origens = String(bruto)
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  for (const origem of origens) {
    try {
      const url = new URL(origem);
      if (url.pathname !== '/' && url.pathname !== '') {
        problemas.push(
          `CORS_ALLOWED_ORIGINS: "${origem}" deve ser apenas a origem ` +
            '(protocolo + host + porta), sem caminho',
        );
      }
    } catch {
      problemas.push(
        `CORS_ALLOWED_ORIGINS: "${origem}" nao e uma origem valida. ` +
          'Formato esperado: http://localhost:5173',
      );
    }
  }
  return origens;
}

/**
 * Valida um objeto no formato de process.env.
 *
 * @param {Record<string, string|undefined>} source
 * @returns {{
 *   nodeEnv: string, isProduction: boolean, isTest: boolean,
 *   port: number, databaseUrl: string, corsAllowedOrigins: string[],
 *   rateLimitWindowMs: number, rateLimitMax: number, pgPoolMax: number
 * }}
 * @throws {ConfigError} com a lista COMPLETA de problemas
 */
function parseEnv(source = {}) {
  const problemas = [];

  const nodeEnv = (source.NODE_ENV || 'development').trim();
  if (!AMBIENTES_VALIDOS.includes(nodeEnv)) {
    problemas.push(
      `NODE_ENV deve ser um de ${AMBIENTES_VALIDOS.join(', ')}, recebido "${nodeEnv}"`,
    );
  }

  const port = lerInteiro(source, 'PORT', PORT_PADRAO, { min: 1, max: 65535 }, problemas);

  const databaseUrlBruta = exigirTexto(source, 'DATABASE_URL', problemas);
  const databaseUrl = validarDatabaseUrl(databaseUrlBruta, problemas);

  const corsAllowedOrigins = validarOrigens(source, problemas);
  if (nodeEnv === 'production' && corsAllowedOrigins.length === 0) {
    problemas.push(
      'CORS_ALLOWED_ORIGINS e obrigatoria quando NODE_ENV=production ' +
        '(em producao nao se aceita qualquer origem)',
    );
  }

  const rateLimitWindowMs = lerInteiro(
    source,
    'RATE_LIMIT_WINDOW_MS',
    60_000,
    { min: 1_000, max: 3_600_000 },
    problemas,
  );
  const rateLimitMax = lerInteiro(
    source,
    'RATE_LIMIT_MAX',
    100,
    { min: 1, max: 100_000 },
    problemas,
  );
  const pgPoolMax = lerInteiro(source, 'PG_POOL_MAX', 10, { min: 1, max: 100 }, problemas);

  if (problemas.length > 0) {
    throw new ConfigError(problemas);
  }

  return Object.freeze({
    nodeEnv,
    isProduction: nodeEnv === 'production',
    isTest: nodeEnv === 'test',
    port,
    databaseUrl,
    corsAllowedOrigins: Object.freeze(corsAllowedOrigins),
    rateLimitWindowMs,
    rateLimitMax,
    pgPoolMax,
  });
}

let memo = null;
let dotenvCarregado = false;

/** Carrega o .env uma unica vez no processo inteiro. */
function carregarDotenv() {
  if (dotenvCarregado) return;
  // `override: false` e o padrao: variaveis ja presentes no ambiente (CI,
  // docker compose) vencem o arquivo .env local.
  require('dotenv').config({
    path: path.resolve(__dirname, '..', '..', '.env'),
    quiet: true,
  });
  dotenvCarregado = true;
}

/**
 * Config validada do processo, memoizada.
 * @returns {ReturnType<typeof parseEnv>}
 * @throws {ConfigError}
 */
function getEnv() {
  if (memo) return memo;
  carregarDotenv();
  memo = parseEnv(process.env);
  return memo;
}

/** Apenas para teste: descarta a memoizacao. */
function resetEnvCache() {
  memo = null;
  dotenvCarregado = false;
}

module.exports = { parseEnv, getEnv, resetEnvCache, ConfigError, PORT_PADRAO };
```

### Alterar — `server/src/index.js`

O arquivo tem 33 linhas. Após **OPS-02** (que remove o `initDb`) e esta spec,
fica:

```js
const express = require('express');
const cors = require('cors');

const { getEnv, ConfigError } = require('./config/env');

// Falha rapida: se a configuracao estiver invalida, o processo nao sobe.
// Antes desta spec, DATABASE_URL ausente ou errada deixava o servidor subir e
// responder 500 em todo endpoint funcional (ver "Evidencia" na spec OPS-04).
let env;
try {
  env = getEnv();
} catch (erro) {
  if (erro instanceof ConfigError) {
    console.error(`\n[SREC] ${erro.message}\n`);
    process.exit(1);
  }
  throw erro;
}

const resourceRoutes = require('./routes/resourceRoutes');
const reservationRoutes = require('./routes/reservationRoutes');

const app = express();

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

app.listen(env.port, () => {
  console.log(`[SREC] API ouvindo na porta ${env.port} (NODE_ENV=${env.nodeEnv})`);
});

module.exports = app;
```

Quatro mudanças, com o que cada uma substitui:

| Antes | Depois |
|---|---|
| `index.js:3` — `require('dotenv').config()` | removido; `env.js` é o único a carregar |
| `index.js:10` — `const PORT = process.env.PORT \|\| 5000` | `env.port`, com default e faixa validados em `env.js` |
| nenhuma validação antes do `listen` | `try/catch` com `process.exit(1)` |
| nenhum `module.exports` | `module.exports = app`, para o Supertest de **QA-01** |

O `require` das rotas vem **depois** do `getEnv()` de propósito: as rotas puxam
os controllers, que puxam os models, que puxam `database.js`, que agora chama
`getEnv()`. Validar antes garante que a mensagem de erro útil apareça em vez de
um stack trace de dentro do `pg`.

`app.use(cors())` continua liberado nesta spec — a allowlist que consome
`env.corsAllowedOrigins` é de **BE-08**.

### Alterar — `server/src/config/database.js`

O arquivo tem 14 linhas. Passa a:

```js
const { Pool } = require('pg');

const { getEnv } = require('./env');

const env = getEnv();

const pool = new Pool({
  connectionString: env.databaseUrl,
  max: env.pgPoolMax,
});

// BUG-12 (pool sem handler de 'error') e corrigido por BE-08, que adiciona
// pool.on('error', ...) e o endpoint /health. Esta spec apenas garante que
// env.databaseUrl ja chegou aqui validada.

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};
```

Mudanças:

| Antes | Depois |
|---|---|
| `database.js:2` — `require('dotenv').config()` | removido |
| `database.js:5` — `connectionString: process.env.DATABASE_URL` | `env.databaseUrl`, validada |
| nenhum `max` no pool | `max: env.pgPoolMax` (default 10, configurável) |
| `database.js:8-10` — `pool.on('connect')` logando a cada conexão | removido: com `max: 10`, o log aparecia até 10 vezes e não indicava nada de útil |
| exporta só `query` | exporta `query` **e** `pool`, para BE-08 (`pool.on('error')`, ping do `/health`) e QA-01 (`pool.end()` no teardown) |

`server/src/models/reservationModel.test.js:4` faz
`jest.mock('../config/database')`, o que substitui o módulo inteiro por um
automock — então o `getEnv()` de nível de módulo **não** executa nos testes
existentes. Confirmar isso rodando `npx jest` sem nenhuma variável de ambiente
definida é um critério de aceite.

### Criar — `server/src/config/env.test.js`

Testes de `parseEnv`, que é pura. Isto é cobertura real e barata — e é o
contraponto honesto ao baseline de **6,14 %**.

```js
const { parseEnv, ConfigError, PORT_PADRAO } = require('./env');

const BASE = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgres://srec:srec@localhost:5432/srec_test',
};

describe('parseEnv', () => {
  describe('caminho felizes', () => {
    it('aceita a configuracao minima e aplica os defaults', () => {
      const env = parseEnv(BASE);
      expect(env.port).toBe(PORT_PADRAO);
      expect(env.nodeEnv).toBe('test');
      expect(env.isTest).toBe(true);
      expect(env.isProduction).toBe(false);
      expect(env.corsAllowedOrigins).toEqual([]);
      expect(env.rateLimitWindowMs).toBe(60000);
      expect(env.rateLimitMax).toBe(100);
      expect(env.pgPoolMax).toBe(10);
    });

    it('usa development quando NODE_ENV nao e informado', () => {
      expect(parseEnv({ DATABASE_URL: BASE.DATABASE_URL }).nodeEnv).toBe('development');
    });

    it('aceita o protocolo postgresql://', () => {
      const env = parseEnv({ ...BASE, DATABASE_URL: 'postgresql://u:p@h:5432/d' });
      expect(env.databaseUrl).toBe('postgresql://u:p@h:5432/d');
    });

    it('converte PORT para numero', () => {
      expect(parseEnv({ ...BASE, PORT: '8080' }).port).toBe(8080);
    });

    it('divide CORS_ALLOWED_ORIGINS por virgula e remove espacos', () => {
      const env = parseEnv({
        ...BASE,
        CORS_ALLOWED_ORIGINS: 'http://localhost:5173 , https://srec.app',
      });
      expect(env.corsAllowedOrigins).toEqual([
        'http://localhost:5173',
        'https://srec.app',
      ]);
    });

    it('devolve um objeto congelado', () => {
      const env = parseEnv(BASE);
      expect(Object.isFrozen(env)).toBe(true);
    });
  });

  describe('DATABASE_URL', () => {
    it('falha quando esta ausente', () => {
      expect(() => parseEnv({ NODE_ENV: 'test' })).toThrow(ConfigError);
      expect(() => parseEnv({ NODE_ENV: 'test' })).toThrow(/DATABASE_URL e obrigatoria/);
    });

    it('falha quando esta vazia', () => {
      expect(() => parseEnv({ ...BASE, DATABASE_URL: '   ' })).toThrow(
        /DATABASE_URL e obrigatoria/,
      );
    });

    it('falha quando nao e uma URL', () => {
      expect(() => parseEnv({ ...BASE, DATABASE_URL: 'isso-nao-e-uma-url' })).toThrow(
        /nao e uma URL valida/,
      );
    });

    it('falha com protocolo diferente de postgres', () => {
      expect(() =>
        parseEnv({ ...BASE, DATABASE_URL: 'mysql://u:p@h:3306/d' }),
      ).toThrow(/protocolo postgres/);
    });

    it('falha quando nao informa o nome do banco', () => {
      expect(() => parseEnv({ ...BASE, DATABASE_URL: 'postgres://u:p@h:5432' })).toThrow(
        /nao informa o nome do banco/,
      );
    });

    // Regressao direta do server/.env.example:2 recebido.
    it('falha com a senha mascarada do .env.example original', () => {
      expect(() =>
        parseEnv({
          ...BASE,
          DATABASE_URL: 'postgres://postgres:***@localhost:5432/srec',
        }),
      ).toThrow(/senha mascarada/);
    });
  });

  describe('PORT', () => {
    it('falha quando nao e inteiro', () => {
      expect(() => parseEnv({ ...BASE, PORT: 'abc' })).toThrow(/numero inteiro/);
    });

    it('falha fora da faixa de portas', () => {
      expect(() => parseEnv({ ...BASE, PORT: '70000' })).toThrow(/entre 1 e 65535/);
      expect(() => parseEnv({ ...BASE, PORT: '0' })).toThrow(/entre 1 e 65535/);
    });
  });

  describe('NODE_ENV', () => {
    it('falha com valor fora da lista', () => {
      expect(() => parseEnv({ ...BASE, NODE_ENV: 'staging' })).toThrow(/NODE_ENV deve ser/);
    });
  });

  describe('CORS_ALLOWED_ORIGINS', () => {
    it('falha com origem invalida', () => {
      expect(() => parseEnv({ ...BASE, CORS_ALLOWED_ORIGINS: 'localhost:5173' })).toThrow(
        /nao e uma origem valida/,
      );
    });

    it('falha quando a origem tem caminho', () => {
      expect(() =>
        parseEnv({ ...BASE, CORS_ALLOWED_ORIGINS: 'http://localhost:5173/api' }),
      ).toThrow(/sem caminho/);
    });

    it('e obrigatoria em producao', () => {
      expect(() => parseEnv({ ...BASE, NODE_ENV: 'production' })).toThrow(
        /CORS_ALLOWED_ORIGINS e obrigatoria quando NODE_ENV=production/,
      );
    });
  });

  describe('agregacao de problemas', () => {
    it('reporta TODOS os problemas, nao apenas o primeiro', () => {
      let erro;
      try {
        parseEnv({ NODE_ENV: 'staging', PORT: 'abc' });
      } catch (e) {
        erro = e;
      }
      expect(erro).toBeInstanceOf(ConfigError);
      // NODE_ENV invalido + PORT nao-inteiro + DATABASE_URL ausente
      expect(erro.problemas).toHaveLength(3);
      expect(erro.message).toMatch(/3 problema\(s\)/);
    });

    it('a mensagem aponta o caminho da correcao', () => {
      try {
        parseEnv({});
      } catch (e) {
        expect(e.message).toMatch(/server\/\.env\.example/);
        expect(e.message).toMatch(/docker compose up/);
      }
    });
  });
});
```

### Substituir — `server/.env.example`

As 2 linhas atuais dão lugar a um arquivo documentado, em que cada variável diz
se é obrigatória, qual o formato e qual o default.

```bash
# =============================================================================
# SREC — backend. Configuracao de ambiente.
#
# Copie este arquivo para `server/.env` e preencha os valores:
#     cp server/.env.example server/.env
#
# Usando Docker (`docker compose up`), NAO e necessario criar o .env: as
# variaveis sao injetadas pelo docker-compose.yml.
#
# Todas as variaveis sao validadas no boot por src/config/env.js. Se algo
# estiver ausente ou malformado, o servidor NAO sobe e informa exatamente qual
# variavel esta errada. Ver docs/specs/ops-04-validated-config/.
# =============================================================================

# -----------------------------------------------------------------------------
# OBRIGATORIAS
# -----------------------------------------------------------------------------

# String de conexao do PostgreSQL.
# Formato: postgres://usuario:senha@host:porta/banco
# Protocolos aceitos: postgres:// e postgresql://
# Validado: URL parseavel, protocolo, host presente, nome do banco presente.
#           Senha contendo "*" e REJEITADA (era o caso do .env.example antigo,
#           que trazia `***` e deixava o servidor subir para falhar depois).
DATABASE_URL=postgres://srec:srec@localhost:5432/srec

# -----------------------------------------------------------------------------
# OPCIONAIS — os valores abaixo sao os defaults aplicados por env.js
# -----------------------------------------------------------------------------

# Ambiente de execucao. Aceita: development | test | production
# Default: development
NODE_ENV=development

# Porta HTTP da API. Inteiro entre 1 e 65535.
# Default: 5000
# Atencao: o frontend aponta para http://localhost:5000/api
# (client/src/services/api.js). Trocar aqui exige trocar lá também, até CS-07
# ser resolvido.
PORT=5000

# Origens autorizadas a chamar a API, separadas por virgula.
# Cada item deve ser apenas protocolo + host + porta, SEM caminho.
# Exemplo: http://localhost:5173,https://srec.exemplo.app
# Default: vazio (nenhuma restricao aplicada ate BE-08 entrar).
# OBRIGATORIA quando NODE_ENV=production.
CORS_ALLOWED_ORIGINS=http://localhost:5173

# Janela do rate limit, em milissegundos. Inteiro entre 1000 e 3600000.
# Default: 60000 (1 minuto). Consumido por BE-08.
RATE_LIMIT_WINDOW_MS=60000

# Maximo de requisicoes por janela, por IP. Inteiro entre 1 e 100000.
# Default: 100. Consumido por BE-08.
RATE_LIMIT_MAX=100

# Tamanho maximo do pool de conexoes do `pg`. Inteiro entre 1 e 100.
# Default: 10
PG_POOL_MAX=10
```

### Alterar — `README.md`

Na "Opção B — Execução local sem Docker" criada por OPS-01, acrescentar logo
após o passo do `.env`:

````markdown
#### Variáveis de ambiente

Todas as variáveis são validadas no boot por `server/src/config/env.js`. Se
alguma estiver ausente ou malformada, o servidor **não sobe** e lista o que está
errado:

```
[SREC] Configuracao de ambiente invalida (1 problema(s)):
  - DATABASE_URL e obrigatoria e nao esta definida

Copie server/.env.example para server/.env e preencha os valores, ou
use `docker compose up`, que ja injeta as variaveis necessarias.
```

| Variável | Obrigatória | Default | Formato |
|---|---|---|---|
| `DATABASE_URL` | **sim** | — | `postgres://usuario:senha@host:porta/banco` |
| `NODE_ENV` | não | `development` | `development` \| `test` \| `production` |
| `PORT` | não | `5000` | inteiro, 1–65535 |
| `CORS_ALLOWED_ORIGINS` | em produção | vazio | origens separadas por vírgula |
| `RATE_LIMIT_WINDOW_MS` | não | `60000` | inteiro, 1000–3600000 |
| `RATE_LIMIT_MAX` | não | `100` | inteiro, 1–100000 |
| `PG_POOL_MAX` | não | `10` | inteiro, 1–100 |

Com `docker compose up`, nada disso precisa ser configurado: as variáveis estão
em `docker-compose.yml`.
````

## Testes

### Teste que falha antes da correção

O caso central é o do **ponto 1** da seção "Problema": hoje o servidor sobe sem
`DATABASE_URL`.

```bash
cd server

# ANTES desta spec
mv .env .env.bak 2>/dev/null
env -u DATABASE_URL node src/index.js & sleep 2
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:5000/           # => 200
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:5000/api/resources  # => 500
kill %1

# DEPOIS desta spec
env -u DATABASE_URL node src/index.js; echo "exit=$?"
# => [SREC] Configuracao de ambiente invalida (1 problema(s)):
# =>   - DATABASE_URL e obrigatoria e nao esta definida
# => exit=1
mv .env.bak .env 2>/dev/null
```

Antes: sobe, 200 na raiz, 500 em todo endpoint útil, código de saída 0.
Depois: não sobe, diz qual variável falta, **código de saída 1**.

### Suíte automatizada — `server/src/config/env.test.js`

**20 casos** cobrindo:

| Grupo | Casos | O que verifica |
|---|---|---|
| Caminhos felizes | 6 | defaults aplicados, `postgresql://` aceito, `PORT` convertida, origens divididas, objeto congelado |
| `DATABASE_URL` | 6 | ausente, vazia, não-URL, protocolo errado, sem nome de banco, **senha mascarada `***`** |
| `PORT` | 2 | não-inteiro, fora da faixa 1–65535 |
| `NODE_ENV` | 1 | valor fora de `development`/`test`/`production` |
| `CORS_ALLOWED_ORIGINS` | 3 | origem inválida, origem com caminho, obrigatória em produção |
| Agregação | 2 | reporta **3** problemas de uma vez; a mensagem aponta `.env.example` e `docker compose up` |

```bash
cd server
npx jest src/config/env.test.js --coverage \
  --collectCoverageFrom='src/config/env.js' --coverageReporters=text
```

Aceite: **20 casos passando** e cobertura de `env.js` em **100 %** de statements
e branches. É possível e exigível porque `parseEnv` é pura — nenhum mock,
nenhum banco, nenhum `process.env`.

### Regressão — os 2 testes existentes continuam verdes sem nenhuma variável

É o critério que valida a decisão de usar `getEnv()` memoizado em vez de validar
no `require`.

```bash
cd server
env -u DATABASE_URL -u PORT -u NODE_ENV npx jest src/models/reservationModel.test.js
```

Aceite: **2 testes passando**, exit 0, sem `ConfigError`. Se isto falhar, a
validação está acontecendo no `require` em algum ponto da cadeia.

### Cobertura total do backend

```bash
cd server
npx jest --coverage --coverageReporters=text --collectCoverageFrom='src/**/*.js'
```

Aceite: a cobertura de statements **sobe** em relação aos **6,14 %** do baseline.
O ganho vem de `env.js` estar 100 % coberto; registrar o número exato no PR e
dizer de onde vem, sem atribuí-lo a melhoria nos controllers (que continuam em
0 % até QA-01).

### Caso manual — `DATABASE_URL` malformada

```bash
cd server
DATABASE_URL='isso-nao-e-url' node src/index.js; echo "exit=$?"
# => - DATABASE_URL nao e uma URL valida. Formato esperado: ...
# => exit=1

DATABASE_URL='mysql://u:p@h:3306/d' node src/index.js; echo "exit=$?"
# => - DATABASE_URL deve usar o protocolo postgres:// ou postgresql://, recebido "mysql://"
# => exit=1

DATABASE_URL='postgres://postgres:***@localhost:5432/srec' node src/index.js; echo "exit=$?"
# => - DATABASE_URL contem senha mascarada ("***"). ...
# => exit=1

NODE_ENV=producao DATABASE_URL='postgres://u:p@h:5432/d' node src/index.js; echo "exit=$?"
# => - NODE_ENV deve ser um de development, test, production, recebido "producao"
# => exit=1
```

### Caso manual — múltiplos problemas de uma vez

```bash
cd server
env -u DATABASE_URL NODE_ENV=staging PORT=abc node src/index.js; echo "exit=$?"
```

Aceite: a saída lista **3** problemas numa única execução (`NODE_ENV`, `PORT`,
`DATABASE_URL`) e sai **1**. É a diferença entre um ciclo de correção e três.

### Caso manual — o compose continua funcionando

```bash
docker compose down -v
docker compose up -d --wait --wait-timeout 180
docker compose logs server | grep 'API ouvindo'
# => [SREC] API ouvindo na porta 5000 (NODE_ENV=development)
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:5000/api/resources  # => 200
```

Aceite: nenhuma variável nova precisa ser adicionada ao `docker-compose.yml` além
das que **OPS-01** já declarou (`NODE_ENV`, `PORT`, `DATABASE_URL`,
`CORS_ALLOWED_ORIGINS`).

### Caso manual — a CI continua funcionando

O job `backend` de **OPS-03** declara `NODE_ENV: test`, `PORT: 5000`,
`DATABASE_URL` e `CORS_ALLOWED_ORIGINS` no bloco `env:`. Nenhuma alteração é
necessária. Verificar que o job passa.

## Critérios de aceite

* [ ] `server/src/config/env.js` existe e exporta `parseEnv`, `getEnv`,
      `resetEnvCache`, `ConfigError` e `PORT_PADRAO`.
* [ ] `grep -rn "require('dotenv')" server/src/` retorna **exatamente 1**
      ocorrência, em `env.js`.
* [ ] `grep -rn "process.env" server/src/` retorna **exatamente 1** ocorrência,
      em `env.js` (dentro de `getEnv`).
* [ ] `server/src/index.js` não tem mais `process.env.PORT || 5000`.
* [ ] `server/src/index.js` chama `getEnv()` **antes** de requisitar as rotas e
      sai com `process.exit(1)` em `ConfigError`.
* [ ] `server/src/index.js` exporta `app` (pré-requisito de QA-01).
* [ ] `server/src/config/database.js` não chama `dotenv` nem lê `process.env`, e
      exporta `query` **e** `pool`.
* [ ] `server/src/config/env.test.js` existe, tem **20 casos**, todos passando.
* [ ] `env.js` tem **100 %** de cobertura de statements e branches.
* [ ] `env -u DATABASE_URL -u PORT -u NODE_ENV npx jest src/models/reservationModel.test.js`
      continua passando com **2 testes** (a validação não acontece no `require`).
* [ ] Sem `DATABASE_URL`, `node src/index.js` sai com código **1** e nomeia a
      variável ausente.
* [ ] Com `NODE_ENV=staging`, `PORT=abc` e sem `DATABASE_URL`, a saída lista os
      **3** problemas de uma vez.
* [ ] `DATABASE_URL` com a senha mascarada `***` do `.env.example` original é
      **rejeitada**.
* [ ] `server/.env.example` tem as **6** variáveis, cada uma com comentário
      indicando obrigatoriedade, default e formato, e **sem** senha mascarada.
* [ ] `README.md` tem a subseção "Variáveis de ambiente" com a tabela das 6.
* [ ] `docker compose up` sobe e `GET /api/resources` responde **200**.
* [ ] O PR não implementa `/health`, `pool.on('error')`, `helmet`, rate limit nem
      allowlist de CORS — esses são de **BE-08**, e a spec explicita o limite.
* [ ] `npm run lint` e `npm run format:check` saem 0.
* [ ] PR aprovado por `@igorSeberino` (QA).

## Passo a passo TBD

```bash
# 1. Branch (OPS-02 de preferência já mesclada, para o index.js não ter initDb)
git checkout main
git pull origin main
git checkout -b feature/validated-config

# 2. Criar o módulo e os testes
#    server/src/config/env.js
#    server/src/config/env.test.js

# 3. Rodar só os testes novos, antes de mexer em mais nada
cd server
npx jest src/config/env.test.js --coverage \
  --collectCoverageFrom='src/config/env.js' --coverageReporters=text
# Aceite: 20 passando, env.js em 100 %

# 4. Ligar o módulo ao boot
#    editar server/src/index.js      (getEnv + try/catch + exit(1) + export app)
#    editar server/src/config/database.js (env.databaseUrl, exportar pool)

# 5. Provar que os testes antigos não quebraram, SEM nenhuma variável no ambiente
env -u DATABASE_URL -u PORT -u NODE_ENV npx jest src/models/reservationModel.test.js

# 6. Provar a falha rápida
mv .env .env.bak 2>/dev/null
env -u DATABASE_URL node src/index.js; echo "exit esperado=1, obtido=$?"
DATABASE_URL='isso-nao-e-url' node src/index.js; echo "exit=$?"
DATABASE_URL='postgres://postgres:***@localhost:5432/srec' node src/index.js; echo "exit=$?"
env -u DATABASE_URL NODE_ENV=staging PORT=abc node src/index.js; echo "exit=$?"
mv .env.bak .env 2>/dev/null

# 7. Substituir o .env.example e medir
#    server/.env.example  (2 linhas -> ~45, 6 variáveis documentadas)
wc -l < .env.example
npx jest --coverage --coverageReporters=text --collectCoverageFrom='src/**/*.js'
npm run lint
npm run format:check

# 8. Validar o caminho de Docker
cd ..
docker compose down -v
docker compose up -d --wait --wait-timeout 180
docker compose logs server | grep 'API ouvindo'
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:5000/api/resources
docker compose down

# 9. Commits
git add server/src/config/env.js server/src/config/env.test.js
git commit -m "feat(config): validar as variaveis de ambiente uma unica vez no boot"

git add server/src/index.js server/src/config/database.js
git commit -m "refactor(server): consumir a configuracao validada e falhar rapido no boot"

git add server/.env.example
git commit -m "docs(config): documentar as 6 variaveis de ambiente no .env.example"

git add README.md
git commit -m "docs: descrever as variaveis de ambiente e a falha rapida no README"

# 10. Publicar
git push -u origin feature/validated-config
```

Corpo do PR (colar e preencher):

```
Fecha #<a definir>
Apoia BE-08 e remove a causa de configuração silenciosa de BUG-11/BUG-12.

## O que muda
Um módulo único (server/src/config/env.js) carrega o .env uma vez e VALIDA as 6
variáveis no boot. Config inválida deixa de ser descoberta na primeira
requisição HTTP com 500 genérico e passa a derrubar o boot com o nome da
variável errada.

## Antes / depois
| Métrica | Antes (medido) | Depois |
|---|---|---|
| `require('dotenv').config()` em src/ | 2 (index.js:3, database.js:2) | 1 (env.js) |
| Leituras diretas de `process.env` em src/ | 2 | 1 |
| Ocorrências do literal 5000 no backend | 2 | 1 (default documentado) |
| Variáveis validadas no boot | 0 | 6 |
| Linhas do .env.example | 2 | <preencher> |
| Variáveis documentadas no .env.example | 0 de 2 | 6 de 6 |
| Código de saída sem DATABASE_URL | 0 (sobe e responde 500) | 1 (não sobe) |
| Problemas de config reportados por execução | 0 | todos de uma vez |
| Casos de teste no backend | 2 | 22 |
| Cobertura de env.js | n/d | 100 % |
| Cobertura de statements do backend | 6,14 % | <preencher> |

## Prova da falha rápida
<colar a saída de `env -u DATABASE_URL node src/index.js` com o exit=1>

## Prova de que os testes antigos não quebraram
<colar a saída de
 `env -u DATABASE_URL -u PORT -u NODE_ENV npx jest src/models/reservationModel.test.js`>

## Limite de escopo — para @adrian-cesar (BE-08)
Este PR NÃO entrega /health, pool.on('error'), helmet, express-rate-limit nem a
allowlist de CORS. Entrega a configuração de que eles dependem, já validada:
  env.corsAllowedOrigins  -> array de origens
  env.rateLimitWindowMs   -> inteiro validado (default 60000)
  env.rateLimitMax        -> inteiro validado (default 100)
  env.pgPoolMax           -> inteiro validado (default 10)
database.js passa a exportar `pool`, para o pool.on('error') e o ping do /health.

## Rubrica
4,0 — Onboarding (1,5 pt) + melhoria comprovada (2,5 pt)
```

## Prompt para o Claude Code

```
Implemente a spec OPS-04 deste repositório.

Leia primeiro, por inteiro:
- docs/specs/ops-04-validated-config/implementacao.md
- server/src/index.js (as 33 linhas)
- server/src/config/database.js (as 14 linhas)
- server/.env.example (as 2 linhas)
- server/src/models/reservationModel.test.js (atenção à linha 4, jest.mock)
- server/package.json
- docker-compose.yml (bloco environment do serviço server)

Carregue a skill de backend/configuração do time (.claude/skills) antes de começar.

Crie a branch feature/validated-config e execute a seção "Alterações" da spec.

Regras não negociáveis:
1. NÃO instale zod, joi, envalid nem nenhuma dependência nova. A spec justifica a
   validação à mão na seção "Decisão": 6 variáveis, backend CommonJS, superfície
   de dependência sob auditoria. Se você discordar, diga, mas não mude sozinho.
2. `parseEnv` tem que ser uma função PURA que recebe um objeto. A validação NÃO
   pode acontecer no topo do módulo (no require), senão todo teste que importar
   qualquer arquivo da árvore passa a exigir DATABASE_URL e os 2 testes
   existentes quebram. Use getEnv() memoizado.
3. O erro tem que agregar TODOS os problemas, não parar no primeiro.
4. As mensagens de erro são em português, sem acento (o console pode não ter
   UTF-8 em todos os ambientes do time), e precisam nomear a variável e o
   formato esperado.
5. Não implemente /health, não adicione pool.on('error'), não instale helmet nem
   express-rate-limit, não troque app.use(cors()) por allowlist. Tudo isso é
   BE-08. Apenas exporte env.corsAllowedOrigins, env.rateLimitWindowMs,
   env.rateLimitMax e env.pgPoolMax, e exporte `pool` de database.js.
6. server/src/index.js tem que terminar com `module.exports = app` (QA-01
   precisa disso para o Supertest).
7. O novo .env.example NÃO pode conter senha mascarada com `***`, e o validador
   tem que REJEITAR esse formato — era exatamente o conteúdo de
   server/.env.example:2 no recebimento.

Ao terminar, rode e me mostre a saída REAL de cada comando:
  cd server
  npx jest src/config/env.test.js --coverage --collectCoverageFrom='src/config/env.js' --coverageReporters=text
  env -u DATABASE_URL -u PORT -u NODE_ENV npx jest src/models/reservationModel.test.js
  env -u DATABASE_URL node src/index.js; echo "exit=$?"
  DATABASE_URL='isso-nao-e-url' node src/index.js; echo "exit=$?"
  DATABASE_URL='mysql://u:p@h:3306/d' node src/index.js; echo "exit=$?"
  DATABASE_URL='postgres://postgres:***@localhost:5432/srec' node src/index.js; echo "exit=$?"
  env -u DATABASE_URL NODE_ENV=staging PORT=abc node src/index.js; echo "exit=$?"
  grep -rn "require('dotenv')" src/ | wc -l
  grep -rn "process.env" src/ | wc -l
  wc -l < .env.example
  npx jest --coverage --coverageReporters=text --collectCoverageFrom='src/**/*.js'
  npm run lint
  npm run format:check

Depois me responda, com número medido:
- quantos casos de teste a suíte de env.js tem e quantos passaram
- a cobertura de env.js (statements e branches)
- a cobertura de statements do backend inteiro, antes (6,14 %) e depois
- quantos problemas o último comando listou numa única execução (esperado: 3)

Não invente nenhuma saída. Se `grep -rn "require('dotenv')" src/ | wc -l` não
der exatamente 1, você não terminou.

Por fim, crie os 4 commits com as mensagens exatas da seção "Passo a passo TBD",
nessa ordem. Não abra o PR nem rode git push.
```
