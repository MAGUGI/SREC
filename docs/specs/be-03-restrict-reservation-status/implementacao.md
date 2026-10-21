# BE-03 — Restringir o status da reserva

* **Responsável:** Adrian Cesar Gonçalves (Desenvolvedor Backend)
* **Issue:** #<a definir>
* **Branch:** `fix/restrict-reservation-status`
* **Rubrica:** Onboarding e diagnóstico → 2,5 pt (melhoria comprovada do código recebido: correção do BUG-03, severidade ALTO, e do CS-05, *magic strings*)
* **Depende de:** BE-01 (`fix/prevent-double-booking`) — usa o diretório `server/migrations/`, o runner `npm run db:migrate` e o harness de testes de integração. Convive com a BE-02 sem conflito (arquivos diferentes), mas a ordem recomendada de merge é BE-01 → BE-02 → BE-03.

## Problema

### BUG-03 — qualquer string vira status

`PATCH /api/reservations/:id/status` pega `req.body.status` e manda direto
para o `UPDATE`. Nenhuma validação, em lugar nenhum.

`server/src/controllers/reservationController.js:60-73`:

```js
  async updateReservationStatus(req, res) {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const updatedReservation = await ReservationModel.updateStatus(id, status);
      if (!updatedReservation) {
        return res.status(404).json({ error: 'Reservation not found' });
      }
      res.json(updatedReservation);
```

`server/src/models/reservationModel.js:32-41`:

```js
  async updateStatus(id, status) {
    const query = `
      UPDATE reservations
      SET status = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *;
    `;
    const result = await db.query(query, [status, id]);
    return result.rows[0];
  },
```

E o banco não filtra nada. `server/src/config/initDb.js:20`:

```sql
      status VARCHAR(20) DEFAULT 'scheduled', -- 'scheduled', 'cancelled', 'completed'
```

O comentário diz quais são os valores. O **comentário**. A coluna aceita
qualquer texto de até 20 caracteres, inclusive string vazia.

Três consequências concretas:

1. **Corrupção silenciosa.** `{"status":"concluída"}`, `{"status":"CANCELLED"}`
   ou `{"status":"ok"}` são gravados e devolvidos com **200**.
2. **A regra de disponibilidade fura.** `checkAvailability`
   (`reservationModel.js:53`) só ignora reservas com status **exatamente**
   `'cancelled'`. Um status escrito errado mantém a reserva bloqueando o
   horário para sempre, e a interface não oferece botão para desfazer —
   `client/src/App.jsx:309` só mostra os botões quando
   `rev.status === 'scheduled'`. A reserva fica presa num estado sem saída.
3. **A interface quebra.** `client/src/App.jsx:306` monta a classe CSS como
   `status-${rev.status}`; um valor desconhecido simplesmente não tem estilo.

### Não há máquina de estados

Mesmo com os três valores certos, nada impede um retrocesso. Hoje é possível,
em sequência, `completed` → `scheduled` → `cancelled` → `scheduled`. Uma
reserva cancelada pode voltar a ocupar o horário **mesmo que outra pessoa já
tenha reservado aquele período no intervalo** — o "descancelamento" não passa
por `checkAvailability`. Com a constraint da BE-01 no lugar, esse caso vira um
`23P01` cru e, portanto, um **500**.

### CS-05 — magic strings

Os três valores aparecem como literal, sem nenhuma definição canônica:

| Onde | Linha | Literal |
|---|---|---|
| `server/src/models/reservationModel.js` | 53 | `'cancelled'` |
| `server/src/config/initDb.js` | 20 | `'scheduled'` (default) |
| `client/src/App.jsx` | 309 | `'scheduled'` |
| `client/src/App.jsx` | 317 | `'completed'` |
| `client/src/App.jsx` | 324 | `'cancelled'` |

Não existe um único arquivo no repositório onde esteja escrito "os status de
uma reserva são estes três". Quem chega no projeto precisa fazer `grep`.

## Evidência

Reprodução, com uma reserva de `id = 1` existente:

```bash
# BUG-03 — status arbitrário. Código recebido: responde 200.
curl -i -X PATCH http://localhost:5000/api/reservations/1/status \
  -H 'Content-Type: application/json' \
  -d '{"status":"banana"}'

# Retrocesso de estado. Código recebido: responde 200 nas duas chamadas.
curl -s -X PATCH http://localhost:5000/api/reservations/1/status \
  -H 'Content-Type: application/json' -d '{"status":"completed"}'
curl -i -X PATCH http://localhost:5000/api/reservations/1/status \
  -H 'Content-Type: application/json' -d '{"status":"scheduled"}'
```

Varredura da base por status fora do conjunto:

```sql
SELECT status, COUNT(*) FROM reservations
 WHERE status IS NULL OR status NOT IN ('scheduled', 'cancelled', 'completed')
 GROUP BY status;
```

Números da auditoria que sustentam o diagnóstico:

| Métrica | Valor no código recebido |
|---|---|
| Valores de status aceitos pela API | **ilimitados** (qualquer texto ≤ 20 caracteres) |
| Constraints de integridade no schema | **0** (2 após BE-01 e BE-02) |
| Transições de estado definidas em código | **0** |
| Ocorrências de literal de status no repositório | **5** |
| Cobertura dos controllers | **0 %** |

## Decisão

**Um único módulo de domínio como fonte da verdade, replicado como `CHECK` no
banco e aplicado na borda — e a transição validada dentro do próprio `UPDATE`,
não antes dele.**

Quatro peças:

1. **`src/domain/reservationStatus.js`** — enum congelado com
   `Object.freeze`, a tabela de transições permitidas e as funções puras que
   respondem às três perguntas do domínio (`isValidStatus`, `canTransition`,
   `allowedSources`). É o arquivo que faltava: "os status de uma reserva são
   estes três" passa a estar escrito em **um** lugar.
2. **`CHECK (status IN (...))`** no banco — pelo mesmo motivo da BE-02: a
   borda HTTP não é o único caminho de escrita.
3. **Validação na borda com 400** — o 400 é a resposta correta para "esse
   valor não existe no vocabulário da API", e a mensagem lista os valores
   aceitos, o que torna a API autoexplicativa.
4. **Transição validada no `WHERE` do `UPDATE`** — não numa leitura prévia.

**Por que `Object.freeze` e não só um objeto literal?** Porque um objeto
comum pode ser mutado em tempo de execução por qualquer módulo
(`ReservationStatus.SCHEDULED = 'agendada'`), e o bug resultante é
praticamente impossível de rastrear. `Object.freeze` transforma isso em falha
silenciosa em modo não-estrito e em `TypeError` em módulo estrito — e, mais
importante, documenta a intenção. Não há `enum` nativo em CommonJS; isto é o
mais próximo disso sem trocar a stack, o que a N2 proíbe.

**Por que validar a transição no `WHERE` e não com um `SELECT` antes?**
Porque um `SELECT` seguido de `UPDATE` é exatamente o TOCTOU do BUG-01 outra
vez: duas requisições concorrentes leem `scheduled`, as duas aprovam a
transição, e uma delas sobrescreve a outra. Escrevendo

```sql
UPDATE reservations
   SET status = $1, updated_at = CURRENT_TIMESTAMP
 WHERE id = $2 AND status = ANY($3::varchar[])
RETURNING *;
```

a verificação e a escrita acontecem na **mesma** instrução atômica. O
`SELECT` posterior existe apenas para distinguir 404 de 409 na resposta — se
ele mentir, ninguém se machuca, porque a escrita já foi decidida. Teria sido
tentador usar uma transação com `SELECT ... FOR UPDATE`; o `WHERE` resolve o
mesmo problema com uma viagem ao banco a menos e sem transação explícita.

**Por que 400 para status inválido e 409 para transição proibida?** São erros
diferentes. `"banana"` é um valor que não existe no vocabulário da API —
nenhum estado do servidor faria essa requisição funcionar: **400**.
`completed → cancelled` é uma requisição bem formada que conflita com o estado
atual do recurso; ela funcionaria se a reserva estivesse `scheduled`: **409**.

**Tabela de transições.** Com 3 estados há 9 pares possíveis. São permitidos
**2**:

| De \\ Para | `scheduled` | `cancelled` | `completed` |
|---|---|---|---|
| **`scheduled`** | ✘ 409 | ✔ 200 | ✔ 200 |
| **`cancelled`** | ✘ 409 | ✘ 409 | ✘ 409 |
| **`completed`** | ✘ 409 | ✘ 409 | ✘ 409 |

`cancelled` e `completed` são **estados finais**: não voltam. É o que a
interface já pressupõe (`App.jsx:309` só oferece ações quando o status é
`scheduled`) — o backend apenas passa a garantir o que o frontend já assumia.
Transições para o mesmo estado também são recusadas: não há caso de uso, e
aceitá-las silenciosamente esconderia duplo clique do usuário.

**Sobre o CS-05 no SQL.** As migrações e o `initDb.js` continuam com os
literais escritos — SQL não importa módulo JavaScript. O que muda é que cada
ocorrência em SQL ganha um comentário apontando o módulo canônico, e **nenhum
código JavaScript do backend** volta a escrever esses literais. Os 3 literais
do `client/src/App.jsx` são escopo do time de frontend (Renato) e ficam
registrados na dívida técnica em `docs/time/`.

## Alterações

### 1. Criar `server/src/domain/reservationStatus.js`

```js
/**
 * Canonical vocabulary for reservation statuses.
 *
 * This module is the single source of truth: any status literal written
 * elsewhere in the backend JavaScript is a defect (CS-05). The database
 * mirrors this list in the `reservations_status_check` constraint
 * (migrations/003_reservation_status_check.sql) — keep both in sync.
 */
const ReservationStatus = Object.freeze({
  SCHEDULED: 'scheduled',
  CANCELLED: 'cancelled',
  COMPLETED: 'completed',
});

const RESERVATION_STATUSES = Object.freeze(Object.values(ReservationStatus));

/**
 * Allowed state transitions. Final states map to an empty list: once a
 * reservation is cancelled or completed it never goes back.
 */
const ALLOWED_TRANSITIONS = Object.freeze({
  [ReservationStatus.SCHEDULED]: Object.freeze([
    ReservationStatus.COMPLETED,
    ReservationStatus.CANCELLED,
  ]),
  [ReservationStatus.CANCELLED]: Object.freeze([]),
  [ReservationStatus.COMPLETED]: Object.freeze([]),
});

const isValidStatus = (value) => RESERVATION_STATUSES.includes(value);

const isFinalStatus = (value) => isValidStatus(value) && ALLOWED_TRANSITIONS[value].length === 0;

const canTransition = (from, to) =>
  isValidStatus(from) && isValidStatus(to) && ALLOWED_TRANSITIONS[from].includes(to);

/** Statuses a reservation may currently hold to legally move to `to`. */
const allowedSources = (to) =>
  RESERVATION_STATUSES.filter((from) => ALLOWED_TRANSITIONS[from].includes(to));

module.exports = {
  ReservationStatus,
  RESERVATION_STATUSES,
  ALLOWED_TRANSITIONS,
  isValidStatus,
  isFinalStatus,
  canTransition,
  allowedSources,
};
```

### 2. Criar `server/migrations/003_reservation_status_check.sql`

```sql
-- 003_reservation_status_check.sql
-- BE-03 — restringe reservations.status ao vocabulário do domínio (BUG-03).
-- Espelho de src/domain/reservationStatus.js. Alterou um, altere o outro.

-- Falha com mensagem útil em vez de deixar o ADD CONSTRAINT abortar cru.
-- Normalizar automaticamente seria pior: 'concluída' pode significar
-- 'completed' ou 'cancelled', e só uma pessoa sabe qual.
DO $$
DECLARE
  invalid_count integer;
BEGIN
  SELECT COUNT(*) INTO invalid_count
    FROM reservations
   WHERE status IS NULL OR status NOT IN ('scheduled', 'cancelled', 'completed');

  IF invalid_count > 0 THEN
    RAISE EXCEPTION
      'Existem % reserva(s) com status fora do enum. Normalize antes de migrar (ver docs/specs/be-03-restrict-reservation-status/implementacao.md).',
      invalid_count;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reservations_status_check') THEN
    ALTER TABLE reservations
      ADD CONSTRAINT reservations_status_check
      CHECK (status IN ('scheduled', 'cancelled', 'completed'));
  END IF;
END $$;
```

Consulta de remediação, se o `RAISE EXCEPTION` disparar:

```sql
SELECT id, user_name, start_time, end_time, status
  FROM reservations
 WHERE status IS NULL OR status NOT IN ('scheduled', 'cancelled', 'completed')
 ORDER BY id;
-- Decidir caso a caso e aplicar UPDATE explícito. Registrar a decisão em
-- docs/handoff/ para o grupo da N3.
```

### 3. Alterar `server/src/models/reservationModel.js`

Duas mudanças. A primeira troca o literal `'cancelled'` da linha 53 por um
parâmetro vindo do enum (CS-05). A segunda move a verificação da transição
para dentro do `UPDATE`.

```js
const db = require('../config/database');
const { ReservationStatus } = require('../domain/reservationStatus');

const ReservationModel = {
  // ... create, findAll, findById, findByResourceId sem alteração

  /**
   * Atomically moves a reservation to `status`, but only if its current
   * status is one of `allowedCurrentStatuses`. Returns undefined when the
   * reservation does not exist OR when the transition is not allowed — the
   * caller tells the two apart.
   */
  async updateStatus(id, status, allowedCurrentStatuses) {
    const query = `
      UPDATE reservations
      SET status = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2 AND status = ANY($3::varchar[])
      RETURNING *;
    `;
    const result = await db.query(query, [status, id, allowedCurrentStatuses]);
    return result.rows[0];
  },

  // ... delete sem alteração

  async checkAvailability(resource_id, start_time, end_time) {
    const query = `
      SELECT id FROM reservations
      WHERE resource_id = $1
        AND status <> $4
        AND start_time < $3
        AND end_time > $2
      LIMIT 1;
    `;
    const result = await db.query(query, [
      resource_id,
      start_time,
      end_time,
      ReservationStatus.CANCELLED,
    ]);
    return result.rows.length === 0;
  },
};
```

> O teste existente `server/src/models/reservationModel.test.js` (2 casos)
> mocka `db.query` e verifica apenas o retorno e a contagem de chamadas — não
> os argumentos. Continua verde sem alteração.

### 4. Alterar `server/src/controllers/reservationController.js`

Estado do método **após a BE-01 e a BE-02**:

```js
const ReservationModel = require('../models/reservationModel');
const { validateReservationWindow } = require('../validators/reservationValidator');
const {
  RESERVATION_STATUSES,
  isValidStatus,
  allowedSources,
} = require('../domain/reservationStatus');

// ... createReservation, getAllReservations, getReservationById sem alteração

  async updateReservationStatus(req, res) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!isValidStatus(status)) {
        return res.status(400).json({
          error: `Status inválido. Valores aceitos: ${RESERVATION_STATUSES.join(', ')}.`,
          code: 'INVALID_RESERVATION_STATUS',
        });
      }

      // A transição é verificada dentro do próprio UPDATE (WHERE status = ANY),
      // para não reintroduzir o TOCTOU que o BUG-01 expôs.
      const updated = await ReservationModel.updateStatus(id, status, allowedSources(status));
      if (updated) {
        return res.json(updated);
      }

      // Zero linhas afetadas: ou a reserva não existe, ou a transição é
      // proibida. Esta leitura só serve para escolher o código de resposta.
      const current = await ReservationModel.findById(id);
      if (!current) {
        return res.status(404).json({
          error: 'Reserva não encontrada.',
          code: 'RESERVATION_NOT_FOUND',
        });
      }

      return res.status(409).json({
        error: `Não é possível mudar o status de "${current.status}" para "${status}".`,
        code: 'INVALID_STATUS_TRANSITION',
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  },
```

### 5. Alterar `server/src/config/initDb.js`

Só o comentário da linha 20, para apontar a casa canônica (convenção "uma casa
canônica por assunto"):

```sql
      -- Vocabulário definido em src/domain/reservationStatus.js e imposto pela
      -- constraint reservations_status_check (migrations/003).
      status VARCHAR(20) DEFAULT 'scheduled',
```

## Testes

### Testes unitários — `server/src/domain/reservationStatus.test.js` (novo)

Projeto `unit`, sem banco.

```js
const {
  ReservationStatus,
  RESERVATION_STATUSES,
  isValidStatus,
  isFinalStatus,
  canTransition,
  allowedSources,
} = require('./reservationStatus');

describe('ReservationStatus', () => {
  it('expõe exatamente três status', () => {
    expect(RESERVATION_STATUSES).toEqual(['scheduled', 'cancelled', 'completed']);
  });

  it('é congelado contra mutação em tempo de execução', () => {
    expect(Object.isFrozen(ReservationStatus)).toBe(true);
    expect(Object.isFrozen(RESERVATION_STATUSES)).toBe(true);
  });

  it('aceita os três status canônicos', () => {
    RESERVATION_STATUSES.forEach((status) => expect(isValidStatus(status)).toBe(true));
  });

  it('recusa qualquer outro valor (BUG-03)', () => {
    ['banana', 'CANCELLED', 'concluída', '', null, undefined, 1].forEach((value) =>
      expect(isValidStatus(value)).toBe(false),
    );
  });

  it('permite scheduled -> completed e scheduled -> cancelled', () => {
    expect(canTransition('scheduled', 'completed')).toBe(true);
    expect(canTransition('scheduled', 'cancelled')).toBe(true);
  });

  it('não deixa estado final voltar atrás', () => {
    expect(canTransition('cancelled', 'scheduled')).toBe(false);
    expect(canTransition('completed', 'scheduled')).toBe(false);
    expect(canTransition('completed', 'cancelled')).toBe(false);
    expect(canTransition('cancelled', 'completed')).toBe(false);
  });

  it('recusa transição para o mesmo status', () => {
    RESERVATION_STATUSES.forEach((status) => expect(canTransition(status, status)).toBe(false));
  });

  it('marca cancelled e completed como finais e scheduled como não final', () => {
    expect(isFinalStatus('cancelled')).toBe(true);
    expect(isFinalStatus('completed')).toBe(true);
    expect(isFinalStatus('scheduled')).toBe(false);
  });

  it('allowedSources devolve apenas scheduled para os dois estados finais', () => {
    expect(allowedSources('completed')).toEqual(['scheduled']);
    expect(allowedSources('cancelled')).toEqual(['scheduled']);
    expect(allowedSources('scheduled')).toEqual([]);
  });
});
```

**Comportamento antes da correção:** o arquivo não roda — o módulo
`reservationStatus` não existe. Dos 9 casos, 6 descrevem regras que hoje não
estão implementadas em lugar nenhum.

### Testes de integração — `server/tests/integration/reservations.status.test.js` (novo)

```js
const request = require('supertest');
const app = require('../../src/index');
const { pool, resetDatabase, createResource } = require('../helpers/testDb');

const createReservation = async (resourceId) => {
  const { rows } = await pool.query(
    `INSERT INTO reservations (resource_id, user_name, start_time, end_time)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [resourceId, 'Adrian', '2030-03-01T14:00:00', '2030-03-01T15:00:00'],
  );
  return rows[0];
};

describe('PATCH /api/reservations/:id/status (BUG-03)', () => {
  let resource;
  let reservation;

  beforeEach(async () => {
    await resetDatabase();
    resource = await createResource('Sala Vermelha', 'meeting_room', 4);
    reservation = await createReservation(resource.id);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('recusa com 400 um status fora do enum e não grava nada', async () => {
    const response = await request(app)
      .patch(`/api/reservations/${reservation.id}/status`)
      .send({ status: 'banana' });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('code', 'INVALID_RESERVATION_STATUS');

    const { rows } = await pool.query('SELECT status FROM reservations WHERE id = $1', [
      reservation.id,
    ]);
    expect(rows[0].status).toBe('scheduled');
  });

  it('aceita a transição scheduled -> completed', async () => {
    const response = await request(app)
      .patch(`/api/reservations/${reservation.id}/status`)
      .send({ status: 'completed' });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('completed');
  });

  it('recusa com 409 o retrocesso a partir de um estado final', async () => {
    await request(app)
      .patch(`/api/reservations/${reservation.id}/status`)
      .send({ status: 'completed' });

    const response = await request(app)
      .patch(`/api/reservations/${reservation.id}/status`)
      .send({ status: 'cancelled' });

    expect(response.status).toBe(409);
    expect(response.body).toHaveProperty('code', 'INVALID_STATUS_TRANSITION');

    const { rows } = await pool.query('SELECT status FROM reservations WHERE id = $1', [
      reservation.id,
    ]);
    expect(rows[0].status).toBe('completed');
  });

  it('responde 404 para reserva inexistente, mesmo com status válido', async () => {
    const response = await request(app)
      .patch('/api/reservations/999999/status')
      .send({ status: 'cancelled' });

    expect(response.status).toBe(404);
    expect(response.body).toHaveProperty('code', 'RESERVATION_NOT_FOUND');
  });

  it('o banco recusa um UPDATE fora do enum feito por fora da API', async () => {
    await expect(
      pool.query('UPDATE reservations SET status = $1 WHERE id = $2', ['banana', reservation.id]),
    ).rejects.toMatchObject({ code: '23514', constraint: 'reservations_status_check' });
  });
});
```

### Comandos

```bash
cd server
npm run db:migrate
npm test                 # unitários, sem banco
npm run test:integration # exige PostgreSQL de pé
npm run test:all
npm run lint
```

## Critérios de aceite

* [ ] `server/src/domain/reservationStatus.js` existe, é congelado com
      `Object.freeze` e não importa `config/database`.
* [ ] `server/migrations/003_reservation_status_check.sql` é idempotente
      (`npm run db:migrate` duas vezes não gera erro).
* [ ] `SELECT conname FROM pg_constraint WHERE conname = 'reservations_status_check'`
      retorna 1 linha.
* [ ] `PATCH /api/reservations/:id/status` com `"banana"` responde **400**,
      `code: "INVALID_RESERVATION_STATUS"`, e a linha no banco permanece
      inalterada.
* [ ] `scheduled → completed` e `scheduled → cancelled` respondem **200**.
* [ ] Qualquer uma das outras **7** combinações responde **409**,
      `code: "INVALID_STATUS_TRANSITION"`.
* [ ] `PATCH` em id inexistente com status válido responde **404**.
* [ ] Um `UPDATE` direto no banco com status inválido falha com SQLSTATE
      `23514`.
* [ ] `grep -rn "'scheduled'\|'cancelled'\|'completed'" server/src --include='*.js'`
      não retorna nenhuma ocorrência fora de `src/domain/reservationStatus.js`
      e do comentário de `src/config/initDb.js`.
* [ ] Números do PR, medidos: valores de status aceitos pela API
      **ilimitados → 3**; transições permitidas definidas em código
      **0 → 2 de 9**; constraints de integridade no schema **2 → 3**;
      literais de status em JavaScript do backend **1 → 0**; fontes da verdade
      sobre o vocabulário de status **0 → 1**; arquivos de teste **4 → 6**;
      casos de teste **15 → 29**.
* [ ] `npm run lint` com **0 erros**; `npm run test:all` verde.
* [ ] PR aprovado por **Igor Seberino (@igorSeberino)** no papel de QA.

## Passo a passo TBD

```bash
# 1. Partir de main já com BE-01 e BE-02 integradas
git checkout main
git pull --ff-only origin main
git checkout -b fix/restrict-reservation-status

cd server
npm ci
npm run db:migrate

# 2. Implementar: domínio -> banco -> model -> borda -> testes

git add server/src/domain/reservationStatus.js
git commit -m "feat(dominio): criar enum congelado de status de reserva"

git add server/migrations/003_reservation_status_check.sql server/src/config/initDb.js
git commit -m "feat(db): restringir status de reserva com CHECK"

git add server/src/models/reservationModel.js
git commit -m "refactor(reservas): substituir magic strings pelo enum de status"

git add server/src/controllers/reservationController.js
git commit -m "fix(reservas): validar status e transicoes permitidas"

git add server/src/domain/reservationStatus.test.js server/tests/integration/reservations.status.test.js
git commit -m "test(reservas): cobrir status invalido e transicoes proibidas"

git add docs/specs/be-03-restrict-reservation-status/implementacao.md
git commit -m "docs(specs): registrar a spec BE-03 de status de reserva"

# 3. Validar antes de abrir o PR
npm run lint
npm run db:migrate
npm run test:all
grep -rn "'scheduled'\|'cancelled'\|'completed'" src --include='*.js'

# 4. Publicar e abrir o PR
git push -u origin fix/restrict-reservation-status
```

Título do PR: `fix(reservas): restringir o status da reserva (BUG-03, CS-05)`

Corpo do PR: a tabela de transições desta spec, link para
`docs/specs/be-03-restrict-reservation-status/implementacao.md`, os números
antes/depois e a saída do `npm run test:all`. Revisão de **@igorSeberino**
(QA). Merge com **1 aprovação do QA + CI verde**.

## Prompt para o Claude Code

```
Você está na raiz do repositório igorSeberino/srec. Leia CLAUDE.md e a skill de
backend em .claude/skills/ antes de escrever código.

Implemente integralmente a spec docs/specs/be-03-restrict-reservation-status/implementacao.md
(BE-03 — Restringir o status da reserva, corrige BUG-03 ALTO e CS-05).

Pré-requisito: BE-01 e BE-02 já em main — confira que existem
server/migrations/001_reservation_no_overlap.sql,
server/migrations/002_reservation_time_window_check.sql, server/scripts/migrate.js
e server/tests/helpers/testDb.js. Se não existirem, pare e avise.

Regras:
- Trabalhe no branch fix/restrict-reservation-status, criado a partir de main.
- Mantenha a stack: Node.js 20, Express 5, PostgreSQL via `pg` com SQL cru,
  CommonJS. Não use ENUM nativo do PostgreSQL (CREATE TYPE): um CHECK é mais
  barato de evoluir em migração e é o que a spec decidiu. Não adicione dependência.
- Respeite o Prettier do projeto (printWidth 100, aspas simples, ponto e vírgula,
  trailingComma all) e o ESLint em server/eslint.config.js.
- Nomes de arquivo, identificadores e comentários de código em inglês. Mensagens
  de commit e textos de erro voltados ao usuário em português.

Ordem de execução:
1. server/src/domain/reservationStatus.js, exatamente como na spec.
2. server/migrations/003_reservation_status_check.sql e o comentário em
   server/src/config/initDb.js.
3. server/src/models/reservationModel.js — updateStatus com
   `WHERE id = $2 AND status = ANY($3::varchar[])` e checkAvailability com o
   status cancelado vindo do enum como parâmetro $4.
4. server/src/controllers/reservationController.js — só o método
   updateReservationStatus.
5. server/src/domain/reservationStatus.test.js (9 casos) e
   server/tests/integration/reservations.status.test.js (5 casos).

NÃO toque no client/. NÃO toque nos try/catch dos controllers: é escopo da BE-04.
NÃO normalize automaticamente dados de status inválidos na migração — ela deve
falhar com RAISE EXCEPTION e deixar a decisão para uma pessoa.

Ao final, rode nesta ordem e cole a saída:
  cd server && npm run lint && npm run db:migrate && npm run test:all
  grep -rn "'scheduled'\|'cancelled'\|'completed'" src --include='*.js'
O grep só pode retornar linhas de src/domain/reservationStatus.js e o comentário
de src/config/initDb.js. Depois faça os commits exatamente com as mensagens
listadas na seção "Passo a passo TBD" da spec.
```
