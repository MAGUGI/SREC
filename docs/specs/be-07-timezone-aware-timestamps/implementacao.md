# BE-07 — Timestamps com fuso horário

* **Responsável:** Adrian Cesar Gonçalves (Desenvolvedor Backend)
* **Issue:** #<a definir>
* **Branch:** `fix/timezone-aware-timestamps`
* **Rubrica:** 4,0 — Onboarding e diagnóstico → 2,5 (melhoria comprovada: BUG-07, ALTO, defeito na regra central do produto); 3,0 — Processo, Git & Documentação → 1,5 (contrato da API e DER atualizados para a N3)
* **Depende de:** nada tecnicamente; **interage com BE-01** (a constraint `EXCLUDE` troca `tsrange` por `tstzrange`) e exige **FE-02** no mesmo release

## Problema

O SREC existe para responder "quem usa qual espaço, em que horário". Em três
pontos da pilha o horário é tratado sem fuso, e nos três o dado perde o
significado.

### 1. O banco armazena horário sem fuso

`server/src/config/initDb.js:10-11,18-19,21-22` — as 6 colunas de horário são
`TIMESTAMP` (ou seja, `timestamp without time zone`):

```sql
    CREATE TABLE IF NOT EXISTS resources (
      ...
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS reservations (
      ...
      start_time TIMESTAMP NOT NULL,
      end_time TIMESTAMP NOT NULL,
      status VARCHAR(20) DEFAULT 'scheduled',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
```

`timestamp without time zone` guarda um relógio de parede sem dizer **de qual
parede**. "2026-10-23 14:00" no banco não é um instante; é um texto que só vira
instante se alguém souber o fuso — e ninguém sabe, porque o fuso não é
armazenado nem fixado em nenhum lugar do código.

### 2. A API aceita entrada sem offset

`client/src/App.jsx:263-269` usa `<input type="datetime-local">`, que produz
exatamente `"2026-10-23T14:00"` — **sem** offset, por especificação do HTML. Esse
valor é enviado cru em `client/src/App.jsx:90-95`:

```js
      await api.createReservation({
        resource_id: selectedResourceId,
        user_name: userName,
        start_time: startTime,
        end_time: endTime,
      });
```

O backend o repassa igualmente cru ao Postgres em
`server/src/models/reservationModel.js:4-10`. Não há uma única linha de
normalização de data em todo o backend:

```bash
grep -rniE "timezone|offset|toISOString|Date\(" server/src   # 0 linhas
```

### 3. O frontend reinterpreta o que recebe

`client/src/App.jsx:303-304`:

```jsx
                          {new Date(rev.start_time).toLocaleString('pt-BR')} até{' '}
                          {new Date(rev.end_time).toLocaleString('pt-BR')}
```

O que chega aqui depende do fuso do **processo Node**, e é aí que o defeito muda
de tamanho conforme o ambiente. O driver `pg` desserializa
`timestamp without time zone` (OID 1114) construindo um `Date` no fuso local do
processo. Em seguida `res.json` chama `toISOString()`, que sempre emite UTC.
Logo:

| Fuso do processo Node | Valor no banco | JSON enviado ao client | Exibido pelo `toLocaleString('pt-BR')` | Erro |
|---|---|---|---|---|
| `TZ=UTC` (padrão em container) | `2026-10-23 14:00` | `2026-10-23T14:00:00.000Z` | `23/10/2026 11:00:00` | **−3 h** |
| `TZ=America/Sao_Paulo` | `2026-10-23 14:00` | `2026-10-23T17:00:00.000Z` | `23/10/2026 14:00:00` | 0 |

Ou seja: **o sistema está certo na máquina do desenvolvedor e errado em
produção.** Um erro de 180 minutos (o Brasil não observa horário de verão desde
2019, então o desvio é fixo em 3 h) aparece ao implantar e não ao desenvolver —
o pior formato possível de defeito. Em um sistema de reserva de sala, isso
significa duas pessoas chegando na mesma sala ou a sala vazia na hora marcada.

Agravante: `checkAvailability` (`server/src/models/reservationModel.js:49-61`)
compara os valores crus. Como a comparação é feita entre textos sem fuso
gravados pelo mesmo caminho, ela é **internamente consistente** — a detecção de
sobreposição funciona. O que não funciona é o horário exibido e o horário
armazenado concordarem com a realidade. É defeito de domínio silencioso: nada
quebra, só o dado está errado.

## Evidência

Reprodução completa, com o servidor de pé:

```bash
# 1. Criar um recurso e uma reserva às 14h, como o frontend faria
curl -s -X POST http://localhost:5000/api/resources \
  -H 'Content-Type: application/json' \
  -d '{"name":"Sala Alfa","type":"meeting_room","capacity":8}'

curl -s -X POST http://localhost:5000/api/reservations \
  -H 'Content-Type: application/json' \
  -d '{"resource_id":1,"user_name":"Carlos","start_time":"2026-10-23T14:00","end_time":"2026-10-23T15:00"}'

# 2. Ver o que o banco guardou (sem fuso nenhum)
psql "$DATABASE_URL" -c \
  "SELECT start_time, pg_typeof(start_time) FROM reservations ORDER BY id DESC LIMIT 1;"
#        start_time      |          pg_typeof
#  2026-10-23 14:00:00   | timestamp without time zone

# 3. Ver o que a API devolve
curl -s http://localhost:5000/api/reservations | tail -c 300
```

O deslocamento depende do fuso do processo, e isso se demonstra sem o servidor:

```bash
TZ=UTC node -e "const d=new Date(2026,9,23,14,0,0); console.log('UTC   ->', d.toISOString())"
# UTC   -> 2026-10-23T14:00:00.000Z     => o client exibe 11:00  (erro de 180 min)

TZ=America/Sao_Paulo node -e "const d=new Date(2026,9,23,14,0,0); console.log('SP    ->', d.toISOString())"
# SP    -> 2026-10-23T17:00:00.000Z     => o client exibe 14:00  (correto por acidente)
```

Números medidos no código recebido:

| Métrica | Antes |
|---|---|
| Colunas de horário com fuso (`TIMESTAMPTZ`) | **0 de 6** |
| Colunas de horário sem fuso (`TIMESTAMP`) | **6 de 6** (4 em `reservations`, 2 em `resources`) |
| Fuso da aplicação fixado em código ou configuração | **não existe** |
| Linhas de normalização de data no backend | **0** |
| Deslocamento do horário exibido com `TZ=UTC` | **−180 min** |
| Deslocamento do horário exibido com `TZ=America/Sao_Paulo` | **0 min** |
| Testes que cobrem fuso horário | **0** |
| Menções a fuso horário na documentação recebida | **0** |
| Campos de data no contrato da API com formato especificado | **0 de 6** |

## Decisão

**1. `TIMESTAMPTZ` nas 6 colunas de horário, com as 4 de `reservations` como o
alvo de domínio.**

`timestamptz` no Postgres **não** guarda o fuso: guarda o instante (microssegundos
desde a época, em UTC) e converte na entrada e na saída usando o parâmetro
`TimeZone` da sessão. Isso é exatamente o que o SREC precisa — reserva é
instante, não relógio de parede. As 4 colunas de `reservations` (`start_time`,
`end_time`, `created_at`, `updated_at`) são as que carregam semântica de domínio
e as que a API expõe; as 2 de `resources` (`created_at`, `updated_at`) migram no
mesmo script por coerência, para não deixar dois regimes de tempo no mesmo banco.

Alternativa recusada: manter `TIMESTAMP` e combinar que "tudo é horário de
Brasília". É a solução de custo zero e de risco máximo — uma convenção não
verificável, que o próximo grupo (N3) não tem como descobrir e que o Postgres não
consegue defender. O `timestamptz` transforma a convenção em tipo, e tipo o banco
garante.

Alternativa recusada: guardar `TIMESTAMP` + coluna `timezone VARCHAR`. Só faz
sentido quando o relógio de parede é a informação relevante (alarme às 7h,
independente de onde você esteja) ou em coworking multifuso. Não é o caso: um
coworking tem endereço físico e as salas estão nele.

**2. Fuso da aplicação fixado em `America/Sao_Paulo` via variável de ambiente,
nos dois lados (Node e sessão do Postgres).**

Fixar só no Node não basta: `CURRENT_TIMESTAMP`/`now()` e a conversão de saída do
`timestamptz` usam o `TimeZone` da **sessão do banco**, que por padrão vem do
`postgresql.conf` do servidor — fora do nosso controle. Fixar nas duas pontas
remove a dependência de configuração de máquina, que é a causa da tabela de
"erro depende do ambiente" acima.

**3. Normalização na borda: a API exige ISO 8601 **com** offset e rejeita o que
não tiver, com 400.**

A alternativa óbvia é aceitar `"2026-10-23T14:00"` e assumir `America/Sao_Paulo`.
Recusada: **adivinhar o fuso é literalmente o bug.** Se o backend assume, o
defeito sai do código e vira contrato implícito — o próximo cliente da API (o
app móvel que a N3 escrever, o script de carga do coworking) herda a adivinhação
sem saber. Melhor um 400 explícito, que é detectável em teste e visível na
primeira chamada, do que um horário plausível e errado.

Consequência honesta: **BE-07 quebra o frontend recebido** até FE-02 entrar.
Por isso os dois PRs vão no **mesmo release**, nesta ordem: FE-02 primeiro
(passa a mandar offset, e mandar offset já funciona hoje, porque o Postgres
aceita `timestamptz` literal em coluna `timestamp` descartando o offset — vai
continuar errado, mas não quebra), BE-07 depois. Considerei um período de
tolerância com *feature flag* (`ACCEPT_NAIVE_DATETIME=true` por um release) e
recusei: é uma terceira semântica de tempo convivendo no código por um prazo
que, num trabalho que entrega em **23/10**, não existe.

**4. A conversão de dado existente usa `AT TIME ZONE 'America/Sao_Paulo'`.**

Os valores já gravados foram digitados por pessoas num `datetime-local` em
Joinville, portanto são relógio de parede de São Paulo. `AT TIME ZONE` aplicado a
um `timestamp without time zone` faz exatamente a pergunta certa: "este relógio
de parede, lido no fuso X, corresponde a qual instante?". Converter assumindo UTC
(o padrão se `USING` for omitido e o servidor estiver em UTC) deslocaria **todo
o histórico em 3 horas** — transformaria o bug de exibição em corrupção
permanente de dado.

**5. Interação com BE-01: `tsrange` → `tstzrange`.**

BE-01 cria a constraint anti-dupla-reserva:

```sql
ALTER TABLE reservations
  ADD CONSTRAINT reservations_no_overlap
  EXCLUDE USING gist (
    resource_id WITH =,
    tsrange(start_time, end_time, '[)') WITH &&
  ) WHERE (status <> 'cancelled');
```

`tsrange` é um intervalo de `timestamp` **sem** fuso. Depois desta migração,
`start_time` é `timestamptz` e `tsrange(...)` passa a não ter função
correspondente — o `ALTER COLUMN ... TYPE` falha com
`cannot alter type of a column used by a view or rule` / erro de dependência da
expressão de índice, porque a constraint depende da coluna. A ordem é obrigatória
e o script cuida dela:

1. `DROP CONSTRAINT reservations_no_overlap` (se existir);
2. `ALTER COLUMN ... TYPE TIMESTAMPTZ USING ... AT TIME ZONE ...`;
3. recriar a constraint com **`tstzrange(start_time, end_time, '[)')`**.

Quem integrar depois decide a ordem de merge; o script abaixo é idempotente e
funciona nos dois casos (BE-01 antes ou depois). Se BE-01 entrar depois desta
spec, **a definição dela já nasce com `tstzrange`** e o passo 3 daqui não faz
nada. A spec de BE-01 precisa ser atualizada nesse cenário — está anotado na
descrição do PR.

**6. Migração como arquivo SQL versionado, não como `ALTER` dentro de `initDb`.**

O repositório recebido não tem migrations (CS-06): o schema é efeito colateral de
boot, com `CREATE TABLE IF NOT EXISTS`. `IF NOT EXISTS` **não** altera tabela que
já existe, então mudar só o DDL de `initDb.js` corrigiria bancos novos e deixaria
os existentes quebrados — inclusive o do próprio avaliador, que já subiu o sistema.
Então: um arquivo em `server/migrations/`, aplicado à mão com `psql` e
documentado no README, **e** o DDL de `initDb.js` atualizado para que banco novo
nasça certo. Pipeline de migration automatizada (`node-pg-migrate`, Flyway) é
débito de N3 — pertence ao item de CI/CD da N3, não a um PR de correção de bug.

## Alterações

### 1. Criar `server/migrations/0001_timestamptz.sql`

> Se BE-01 já tiver criado `server/migrations/`, use o próximo número livre.

```sql
-- BE-07 — Converte as colunas de horário para TIMESTAMPTZ.
--
-- Existing values were typed by humans through an HTML <input type="datetime-local">
-- in Joinville/SC, so they are America/Sao_Paulo wall clock readings. Converting
-- them with AT TIME ZONE 'America/Sao_Paulo' preserves the instant the user meant.
-- Omitting the USING clause would reinterpret them as UTC and shift the whole
-- history by 3 hours.

BEGIN;

-- 1. The EXCLUDE constraint from BE-01 depends on start_time/end_time through a
--    tsrange() expression, which has no timestamptz counterpart. Drop it first.
ALTER TABLE reservations
  DROP CONSTRAINT IF EXISTS reservations_no_overlap;

-- 2. Convert the 4 time columns of reservations (domain + audit).
ALTER TABLE reservations
  ALTER COLUMN start_time TYPE TIMESTAMPTZ
    USING start_time AT TIME ZONE 'America/Sao_Paulo',
  ALTER COLUMN end_time   TYPE TIMESTAMPTZ
    USING end_time   AT TIME ZONE 'America/Sao_Paulo',
  ALTER COLUMN created_at TYPE TIMESTAMPTZ
    USING created_at AT TIME ZONE 'America/Sao_Paulo',
  ALTER COLUMN updated_at TYPE TIMESTAMPTZ
    USING updated_at AT TIME ZONE 'America/Sao_Paulo',
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET DEFAULT now();

-- 3. Convert the 2 audit columns of resources, so the database has a single
--    time regime.
ALTER TABLE resources
  ALTER COLUMN created_at TYPE TIMESTAMPTZ
    USING created_at AT TIME ZONE 'America/Sao_Paulo',
  ALTER COLUMN updated_at TYPE TIMESTAMPTZ
    USING updated_at AT TIME ZONE 'America/Sao_Paulo',
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET DEFAULT now();

-- 4. Recreate BE-01's constraint over tstzrange. Harmless when BE-01 has not
--    landed yet: it simply creates the constraint this project wants anyway.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE reservations
  ADD CONSTRAINT reservations_no_overlap
  EXCLUDE USING gist (
    resource_id WITH =,
    tstzrange(start_time, end_time, '[)') WITH &&
  ) WHERE (status <> 'cancelled');

COMMIT;
```

Verificação pós-migração:

```sql
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_name IN ('resources', 'reservations')
  AND data_type LIKE 'timestamp%'
ORDER BY table_name, column_name;
-- esperado: 6 linhas, todas com data_type = 'timestamp with time zone'
```

### 2. Criar `server/migrations/0001_timestamptz_rollback.sql`

```sql
-- Rollback for BE-07. Loses the offset information by design: going back to
-- timestamp without time zone means picking a wall clock, and the project's
-- wall clock is America/Sao_Paulo.
BEGIN;

ALTER TABLE reservations DROP CONSTRAINT IF EXISTS reservations_no_overlap;

ALTER TABLE reservations
  ALTER COLUMN start_time TYPE TIMESTAMP USING start_time AT TIME ZONE 'America/Sao_Paulo',
  ALTER COLUMN end_time   TYPE TIMESTAMP USING end_time   AT TIME ZONE 'America/Sao_Paulo',
  ALTER COLUMN created_at TYPE TIMESTAMP USING created_at AT TIME ZONE 'America/Sao_Paulo',
  ALTER COLUMN updated_at TYPE TIMESTAMP USING updated_at AT TIME ZONE 'America/Sao_Paulo',
  ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP,
  ALTER COLUMN updated_at SET DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE resources
  ALTER COLUMN created_at TYPE TIMESTAMP USING created_at AT TIME ZONE 'America/Sao_Paulo',
  ALTER COLUMN updated_at TYPE TIMESTAMP USING updated_at AT TIME ZONE 'America/Sao_Paulo',
  ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP,
  ALTER COLUMN updated_at SET DEFAULT CURRENT_TIMESTAMP;

COMMIT;
```

### 3. Alterar `server/src/config/initDb.js`

O DDL de boot passa a nascer com `TIMESTAMPTZ`, para banco novo (o avaliador que
clonar o repositório hoje) não precisar da migration.

```js
    CREATE TABLE IF NOT EXISTS resources (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      type VARCHAR(50) NOT NULL, -- 'workstation' or 'meeting_room'
      capacity INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS reservations (
      id SERIAL PRIMARY KEY,
      resource_id INTEGER REFERENCES resources(id) ON DELETE CASCADE,
      user_name VARCHAR(100) NOT NULL,
      start_time TIMESTAMPTZ NOT NULL,
      end_time TIMESTAMPTZ NOT NULL,
      status VARCHAR(20) DEFAULT 'scheduled', -- 'scheduled', 'cancelled', 'completed'
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
```

### 4. Criar `server/src/config/time.js`

```js
// Single source of truth for the application timezone. The coworking space has
// a physical address, so the business clock is a single zone, not per user.
const APP_TIMEZONE = process.env.APP_TIMEZONE || 'America/Sao_Paulo';

module.exports = { APP_TIMEZONE };
```

### 5. Alterar `server/src/config/database.js`

Fixar o `TimeZone` da sessão do Postgres. Sem isso, `now()` e a formatação de
saída do `timestamptz` seguem o `postgresql.conf` da máquina, que é justamente a
variável de ambiente que não controlamos.

```js
const { Pool } = require('pg');
require('dotenv').config();

const { APP_TIMEZONE } = require('./time');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Startup parameter: every connection of this pool opens its session already
  // in the application timezone, regardless of the server's postgresql.conf.
  options: `-c timezone=${APP_TIMEZONE}`,
});

pool.on('connect', () => {
  console.log('Connected to PostgreSQL Database');
});

module.exports = {
  query: (text, params) => pool.query(text, params),
};
```

E o processo Node roda no mesmo fuso, para que log e `new Date()` em código
futuro concordem com o banco — `server/src/index.js`, **antes** de qualquer
`require` que use data:

```js
const { APP_TIMEZONE } = require('./config/time');

// Must run before anything builds a Date. Node reads TZ once, lazily.
process.env.TZ = process.env.TZ || APP_TIMEZONE;
```

> O `TZ` do processo é defesa secundária. A correção de verdade é o
> `timestamptz`: com ele, o instante está certo mesmo que o processo rode em UTC,
> porque o `pg` desserializa OID 1184 (`timestamptz`) usando o offset que o
> servidor envia. É isso que elimina a tabela "o erro depende do ambiente".

### 6. Alterar `server/.env.example`

```env
PORT=5000
DATABASE_URL=postgres://postgres:***@localhost:5432/srec
# Fuso de negócio da aplicação (IANA). Usado no Node e na sessão do Postgres.
APP_TIMEZONE=America/Sao_Paulo
```

### 7. Criar `server/src/utils/datetime.js`

Normalização na borda: a única porta de entrada de data no backend.

```js
const AppError = require('../errors/AppError');

// ISO 8601 with a mandatory offset: 2026-10-23T14:00:00-03:00 or ...Z.
// A naive value such as 2026-10-23T14:00 is rejected on purpose: guessing the
// zone is exactly the defect this module exists to kill (BUG-07).
const ISO_8601_WITH_OFFSET =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$/;

/**
 * Parses an API datetime into a JS Date (an absolute instant).
 *
 * @param {unknown} value raw value from the request body
 * @param {string} field field name, used in the error payload
 * @returns {Date}
 * @throws {AppError} 400 INVALID_DATETIME
 */
function parseInstant(value, field) {
  if (typeof value !== 'string' || !ISO_8601_WITH_OFFSET.test(value.trim())) {
    throw new AppError(
      400,
      'INVALID_DATETIME',
      `O campo "${field}" deve estar em ISO 8601 com offset, por exemplo 2026-10-23T14:00:00-03:00.`,
      { field, received: value },
    );
  }

  const instant = new Date(value.trim());

  if (Number.isNaN(instant.getTime())) {
    throw new AppError(400, 'INVALID_DATETIME', `O campo "${field}" não é uma data válida.`, {
      field,
      received: value,
    });
  }

  return instant;
}

module.exports = { parseInstant, ISO_8601_WITH_OFFSET };
```

### 8. Alterar `server/src/services/reservationService.js` (BE-06)

O serviço converte antes de falar com o model. Objeto `Date` entregue ao `pg` é
serializado como `timestamptz` com offset, então o instante atravessa a fronteira
sem adivinhação:

```js
const { parseInstant } = require('../utils/datetime');

  async create(input) {
    // ... validação de campos obrigatórios e existência do recurso ...

    const startTime = parseInstant(input.startTime, 'start_time');
    const endTime = parseInstant(input.endTime, 'end_time');

    // A ordem start < end é regra de BE-02 e é validada lá, sobre estes Date.

    const isAvailable = await ReservationModel.checkAvailability(
      input.resourceId,
      startTime,
      endTime,
    );
    // ...
    return ReservationModel.create(input.resourceId, input.userName, startTime, endTime);
  },
```

> Se BE-06 ainda não estiver em `main`, as duas linhas de `parseInstant` entram
> no começo de `createReservation` em
> `server/src/controllers/reservationController.js:6`. Mesmo efeito, endereço
> provisório; trocar no rebase.

### 9. Não alterar `server/src/models/reservationModel.js`

Nenhum SQL muda. `checkAvailability` (`reservationModel.js:49-61`) continua com a
mesma fórmula `start_time < $3 AND end_time > $2` — a documentação recebida
acerta nela e o problema nunca foi a fórmula. Com `timestamptz` nas colunas e
`Date` nos parâmetros, a comparação passa a ser entre instantes de verdade em vez
de entre relógios de parede de fuso desconhecido.

### 10. Frontend: FE-02, **não** este PR

`client/src/App.jsx:263-279` (os dois `datetime-local`) e
`client/src/App.jsx:303-304` (a exibição com `toLocaleString('pt-BR')`) precisam
mudar junto, no mesmo release:

* converter o valor do `datetime-local` para ISO 8601 com offset antes do envio;
* exibir sempre no fuso de negócio, com `Intl.DateTimeFormat('pt-BR', { timeZone })`,
  em vez de depender do fuso do navegador do usuário;
* tratar o novo **400 `INVALID_DATETIME`** na mensagem de erro.

Especificado em `docs/specs/fe-02-timezone-aware-datetime-input/implementacao.md`
(responsável: Renato Colin Neto, Frontend). **Não implementar aqui**: PR de
backend que mexe em `client/` perde a revisão independente e embaralha o
antes/depois que a rubrica cobra.

### 11. Alterar `docs/arquitetura/contrato-api.md`

Registrar o contrato de tempo, que hoje não existe em lugar algum (0 de 6 campos
de data com formato especificado):

* **Entrada.** `start_time` e `end_time` em `POST /api/reservations` exigem ISO
  8601 **com offset**: `2026-10-23T14:00:00-03:00` ou `2026-10-23T17:00:00Z`.
  Valor sem offset responde **400 `INVALID_DATETIME`**.
* **Saída.** Todo campo de data (`start_time`, `end_time`, `created_at`,
  `updated_at`) é ISO 8601 com offset, na forma UTC emitida pelo
  `JSON.stringify` de `Date`: `2026-10-23T17:00:00.000Z`. É o mesmo instante;
  cabe ao cliente formatar no fuso que quiser exibir.
* **Fuso de negócio.** `America/Sao_Paulo`, configurável por `APP_TIMEZONE`.
  Afeta `now()`/defaults do banco e o log, não a interpretação da entrada — a
  entrada é explícita por definição.

### 12. Alterar `docs/arquitetura/der.md` e `README.md`

DER: as 6 colunas passam a `TIMESTAMPTZ`. README: passo de onboarding
`psql "$DATABASE_URL" -f server/migrations/0001_timestamptz.sql` para quem já
subiu o banco antes deste PR, e a variável `APP_TIMEZONE` na lista de ambiente.

## Testes

### `server/src/utils/datetime.test.js` — unitário, sem banco

```js
const { parseInstant } = require('./datetime');

describe('parseInstant', () => {
  // FALHA ANTES DA CORREÇÃO: o módulo não existe e nenhuma validação de data
  // existia no backend (grep -c "offset" server/src == 0).
  it('deve rejeitar datetime sem offset com 400 INVALID_DATETIME', () => {
    expect(() => parseInstant('2026-10-23T14:00', 'start_time')).toThrow(
      expect.objectContaining({ statusCode: 400, code: 'INVALID_DATETIME' }),
    );
  });

  it.each(['2026-10-23 14:00:00', '23/10/2026 14:00', '', null, undefined, 1761237600000])(
    'deve rejeitar o valor inválido %p',
    (value) => {
      expect(() => parseInstant(value, 'start_time')).toThrow(
        expect.objectContaining({ statusCode: 400 }),
      );
    },
  );

  it('deve aceitar offset explícito de Brasília e preservar o instante', () => {
    const instant = parseInstant('2026-10-23T14:00:00-03:00', 'start_time');
    expect(instant.toISOString()).toBe('2026-10-23T17:00:00.000Z');
  });

  it('deve aceitar a forma UTC com Z', () => {
    expect(parseInstant('2026-10-23T17:00:00Z', 'start_time').toISOString()).toBe(
      '2026-10-23T17:00:00.000Z',
    );
  });

  it('deve produzir o mesmo instante para -03:00 e para o Z equivalente', () => {
    expect(parseInstant('2026-10-23T14:00:00-03:00', 'a').getTime()).toBe(
      parseInstant('2026-10-23T17:00:00Z', 'b').getTime(),
    );
  });

  it('deve independer do fuso do processo', () => {
    const original = process.env.TZ;
    try {
      process.env.TZ = 'UTC';
      const emUtc = parseInstant('2026-10-23T14:00:00-03:00', 'a').getTime();
      process.env.TZ = 'Pacific/Kiritimati';
      const emKiritimati = parseInstant('2026-10-23T14:00:00-03:00', 'a').getTime();
      expect(emUtc).toBe(emKiritimati);
    } finally {
      process.env.TZ = original;
    }
  });
});
```

### `server/src/services/reservationService.test.js` — acréscimo

```js
  it('deve repassar Date ao model, não string', async () => {
    ResourceModel.findById.mockResolvedValue({ id: 1 });
    ReservationModel.checkAvailability.mockResolvedValue(true);
    ReservationModel.create.mockResolvedValue({ id: 1 });

    await ReservationService.create({
      resourceId: 1,
      userName: 'Carlos',
      startTime: '2026-10-23T14:00:00-03:00',
      endTime: '2026-10-23T15:00:00-03:00',
    });

    const [, , start, end] = ReservationModel.create.mock.calls[0];
    expect(start).toBeInstanceOf(Date);
    expect(end).toBeInstanceOf(Date);
    expect(start.toISOString()).toBe('2026-10-23T17:00:00.000Z');
  });

  // FALHA ANTES DA CORREÇÃO: hoje '2026-10-23T14:00' é aceito e gravado.
  it('deve responder 400 para start_time sem offset', async () => {
    ResourceModel.findById.mockResolvedValue({ id: 1 });

    await expect(
      ReservationService.create({
        resourceId: 1,
        userName: 'Carlos',
        startTime: '2026-10-23T14:00',
        endTime: '2026-10-23T15:00:00-03:00',
      }),
    ).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_DATETIME' });
  });
```

### Verificação manual de ponta a ponta (a prova do PR)

O número antes/depois que vai colado na descrição do PR:

```bash
# Com a migration aplicada e o servidor rodando em TZ=UTC de propósito —
# o ambiente onde o bug aparecia.
TZ=UTC npm start --prefix server &

curl -s -X POST http://localhost:5000/api/reservations \
  -H 'Content-Type: application/json' \
  -d '{"resource_id":1,"user_name":"Carlos","start_time":"2026-10-23T14:00:00-03:00","end_time":"2026-10-23T15:00:00-03:00"}' \
  | python -c "import sys,json; d=json.load(sys.stdin); print(d['start_time'])"
# esperado: 2026-10-23T17:00:00.000Z   (= 14:00 em America/Sao_Paulo)

psql "$DATABASE_URL" -c "SET TIME ZONE 'America/Sao_Paulo';
  SELECT start_time FROM reservations ORDER BY id DESC LIMIT 1;"
# esperado: 2026-10-23 14:00:00-03

psql "$DATABASE_URL" -c "SET TIME ZONE 'UTC';
  SELECT start_time FROM reservations ORDER BY id DESC LIMIT 1;"
# esperado: 2026-10-23 17:00:00+00   (mesmo instante, outro relógio)

# Entrada sem offset agora é 400, não um horário plausível e errado:
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:5000/api/reservations \
  -H 'Content-Type: application/json' \
  -d '{"resource_id":1,"user_name":"Carlos","start_time":"2026-10-23T14:00","end_time":"2026-10-23T15:00"}'
# esperado: 400
```

Comando da suíte:

```bash
cd server
npx jest --coverage --coverageReporters=text --collectCoverageFrom='src/**/*.js'
```

## Critérios de aceite

* [ ] As **6** colunas de horário são `timestamp with time zone`, verificado pela
      consulta a `information_schema.columns` da seção Alterações §1
      (antes: **0 de 6**; depois: **6 de 6**).
* [ ] A reserva criada com `start_time=2026-10-23T14:00:00-03:00` é devolvida
      pela API como `2026-10-23T17:00:00.000Z` **com o servidor em `TZ=UTC`**
      (antes, com `TZ=UTC`: o client exibia 11:00 — erro de **180 min**; depois:
      exibe 14:00 — erro de **0 min**).
* [ ] O mesmo teste roda com `TZ=America/Sao_Paulo` e produz **o mesmo** instante
      — o resultado deixou de depender do ambiente (antes: 2 resultados
      diferentes para a mesma entrada; depois: 1).
* [ ] `POST /api/reservations` com datetime sem offset responde **400
      `INVALID_DATETIME`** (antes: **201**, com horário deslocado).
* [ ] Reserva criada **antes** da migração mantém o relógio de parede original:
      exportar `SELECT id, start_time FROM reservations` antes e depois e
      conferir que `start_time` lido com `SET TIME ZONE 'America/Sao_Paulo'`
      é idêntico ao valor anterior. **Zero** linha deslocada.
* [ ] A constraint `reservations_no_overlap` existe e usa `tstzrange`:
      `psql "$DATABASE_URL" -c "\d reservations"` mostra `tstzrange` e **não**
      `tsrange`.
* [ ] `APP_TIMEZONE` documentada em `server/.env.example` e no README; o valor
      padrão (`America/Sao_Paulo`) funciona sem configuração.
* [ ] `grep -rniE "timezone|offset|parseInstant" server/src | wc -l` ≥ **6**
      (antes: **0**).
* [ ] Testes de fuso horário ≥ **8** casos (antes: **0**).
* [ ] `server/migrations/0001_timestamptz_rollback.sql` aplicado e reaplicado
      sem erro, em banco de teste.
* [ ] `docs/arquitetura/contrato-api.md` especifica formato de entrada e de saída
      para os **6** campos de data (antes: **0 de 6** especificados).
* [ ] FE-02 referenciada no PR e marcada como bloqueadora do release — este PR
      **não** vai para `main` sem ela.
* [ ] `npm run lint` no `server/` com **0** erros.
* [ ] PR com **1 aprovação** de Igor Seberino (`@igorSeberino`, QA) e CI verde.

## Passo a passo TBD

```bash
# 1. Branch
git checkout main
git pull origin main
git checkout -b fix/timezone-aware-timestamps

# 2. Registrar o estado ANTES (o número que vai no pitch)
psql "$DATABASE_URL" -c "SELECT table_name, column_name, data_type
  FROM information_schema.columns
  WHERE table_name IN ('resources','reservations') AND data_type LIKE 'timestamp%'
  ORDER BY table_name, column_name;" > /tmp/antes_colunas.txt
psql "$DATABASE_URL" -c "SELECT id, start_time, end_time FROM reservations ORDER BY id;" \
  > /tmp/antes_reservas.txt
cat /tmp/antes_colunas.txt   # esperado: 6 linhas 'timestamp without time zone'

# 3. Escrever a migração e o rollback
#    - server/migrations/0001_timestamptz.sql
#    - server/migrations/0001_timestamptz_rollback.sql

# 4. Aplicar e conferir
psql "$DATABASE_URL" -f server/migrations/0001_timestamptz.sql
psql "$DATABASE_URL" -c "SELECT table_name, column_name, data_type
  FROM information_schema.columns
  WHERE table_name IN ('resources','reservations') AND data_type LIKE 'timestamp%'
  ORDER BY table_name, column_name;"
# esperado: 6 linhas 'timestamp with time zone'

psql "$DATABASE_URL" -c "SET TIME ZONE 'America/Sao_Paulo';
  SELECT id, start_time, end_time FROM reservations ORDER BY id;" > /tmp/depois_reservas.txt
diff /tmp/antes_reservas.txt /tmp/depois_reservas.txt
# esperado: só diferença de sufixo de fuso (-03), nunca de hora

# 5. Testar o rollback em banco descartável antes de confiar nele
createdb srec_rollback_test
psql srec_rollback_test -f server/migrations/0001_timestamptz.sql
psql srec_rollback_test -f server/migrations/0001_timestamptz_rollback.sql
dropdb srec_rollback_test

# 6. Implementar o backend
#    - alterar server/src/config/initDb.js        (DDL com TIMESTAMPTZ)
#    - criar   server/src/config/time.js          (APP_TIMEZONE)
#    - alterar server/src/config/database.js      (options -c timezone)
#    - alterar server/src/index.js                (process.env.TZ)
#    - criar   server/src/utils/datetime.js       (parseInstant)
#    - alterar server/src/services/reservationService.js  (BE-06) ou o controller
#    - alterar server/.env.example                (APP_TIMEZONE)

# 7. Testes
#    - criar   server/src/utils/datetime.test.js
#    - alterar server/src/services/reservationService.test.js
cd server
npx jest --coverage --coverageReporters=text --collectCoverageFrom='src/**/*.js'
npm run lint
cd ..

# 8. Provar com o servidor em TZ=UTC (o ambiente onde o bug aparecia)
#    Rodar os curl e psql da seção "Verificação manual de ponta a ponta".

# 9. Commits
git add server/migrations
git commit -m "feat(db): migrar colunas de horario para TIMESTAMPTZ com fuso de Sao Paulo"

git add server/src/config server/src/index.js server/.env.example
git commit -m "fix(config): fixar o fuso da aplicacao no Node e na sessao do Postgres"

git add server/src/utils/datetime.js server/src/services/reservationService.js
git commit -m "fix(reservations): exigir ISO 8601 com offset na entrada de horario"

git add server/src/utils/datetime.test.js server/src/services/reservationService.test.js
git commit -m "test(reservations): cobrir normalizacao de fuso e rejeicao de data sem offset"

git add docs/arquitetura/contrato-api.md docs/arquitetura/der.md README.md \
        docs/specs/be-07-timezone-aware-timestamps
git commit -m "docs(api): documentar contrato de data em ISO 8601 com offset"

# 10. PR
git push -u origin fix/timezone-aware-timestamps
#     Título: "fix(reservations): corrigir deslocamento de horario por falta de fuso (BUG-07)"
#     Descrição: link para esta spec; tabela 'TZ=UTC antes/depois'; diff do
#     item 4; aviso de que FE-02 é bloqueadora do release e de que a spec de
#     BE-01 precisa trocar tsrange por tstzrange.
#     Revisor obrigatório: @igorSeberino (QA).
```

## Prompt para o Claude Code

```text
Você está na raiz do repositório igorSeberino/srec, na branch
fix/timezone-aware-timestamps. Carregue antes de começar:

  - docs/specs/be-07-timezone-aware-timestamps/implementacao.md  (esta spec)
  - docs/specs/be-01-exclude-constraint-no-double-booking/implementacao.md
  - docs/specs/be-06-extract-service-layer/implementacao.md
  - docs/arquitetura/contrato-api.md e docs/arquitetura/der.md
  - a skill de arquitetura de backend do repositório, em .claude/skills/
  - CLAUDE.md

Tarefa: corrigir BUG-07 implementando exatamente a seção "Alterações" da spec
BE-07 — migração para TIMESTAMPTZ, fuso fixado nas duas pontas, normalização da
entrada e documentação do contrato.

Restrições duras:
  - NÃO toque em client/. O frontend é FE-02, de outra pessoa. Se algo no
    client/ parecer quebrado, anote na descrição do PR e siga.
  - A migração de dado existente usa AT TIME ZONE 'America/Sao_Paulo'. Nunca
    converta assumindo UTC: deslocaria todo o histórico em 3 horas.
  - DROP da constraint EXCLUDE de BE-01 antes do ALTER TYPE, e recriação com
    tstzrange (não tsrange). O script tem que ser idempotente e rodar com ou
    sem BE-01 aplicada.
  - Entrada sem offset é 400 INVALID_DATETIME. NÃO adivinhe o fuso, nem atrás
    de feature flag.
  - Nenhum SQL de reservationModel.js muda; checkAvailability fica como está.
  - Node 20, Express 5, pg com SQL cru, CommonJS. Sem moment, sem date-fns,
    sem luxon: Date nativo e Intl bastam para o que esta spec pede.
  - BE-02 (ordem start < end) e BE-08 não são deste PR.

Entregue nesta ordem e me mostre a saída de cada passo:
  1. a consulta a information_schema ANTES (esperado: 6 'timestamp without
     time zone');
  2. os dois arquivos de migração, aplicados, e a mesma consulta DEPOIS
     (esperado: 6 'timestamp with time zone');
  3. o diff de SELECT id, start_time FROM reservations antes/depois, provando
     que nenhuma linha deslocou de hora;
  4. o rollback aplicado e revertido em banco descartável;
  5. o código do backend e jest --coverage, com a tabela completa;
  6. os curl da seção "Verificação manual de ponta a ponta", com o servidor
     rodando em TZ=UTC de propósito.

Por fim, proponha as 5 mensagens de commit da seção "Passo a passo TBD" sem
executar nenhum comando git.
```
