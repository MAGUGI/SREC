# BE-02 — Validar a janela da reserva

* **Responsável:** Adrian Cesar Gonçalves (Desenvolvedor Backend)
* **Issue:** #<a definir>
* **Branch:** `fix/validate-reservation-window`
* **Rubrica:** Onboarding e diagnóstico → 2,5 pt (melhoria comprovada do código recebido: correção do BUG-02, severidade CRÍTICO, e do BUG-08, severidade MÉDIO)
* **Depende de:** BE-01 (`fix/prevent-double-booking`) — reaproveita o diretório `server/migrations/`, o runner `npm run db:migrate` e o harness de testes de integração; além disso, a constraint criada na BE-01 muda o sintoma do intervalo invertido, como explicado abaixo.

## Problema

`POST /api/reservations` valida **presença** dos campos e nada mais.
`server/src/controllers/reservationController.js:6-9`:

```js
      const { resource_id, user_name, start_time, end_time } = req.body;
      if (!resource_id || !user_name || !start_time || !end_time) {
        return res.status(400).json({ error: 'All fields are required' });
      }
```

Depois disso, `start_time` e `end_time` seguem direto para o `INSERT` em
`server/src/models/reservationModel.js:4-12`, sem que ninguém verifique a
relação entre os dois valores nem a posição deles na linha do tempo. O schema
em `server/src/config/initDb.js:18-19` declara apenas:

```sql
      start_time TIMESTAMP NOT NULL,
      end_time TIMESTAMP NOT NULL,
```

Duas coisas erradas, portanto:

* **BUG-02 (CRÍTICO)** — `end_time` anterior a `start_time` é aceito.
* **BUG-08 (MÉDIO)** — uma reserva inteiramente no passado é aceita.

### O efeito perverso do intervalo invertido

Não é "só" um dado feio no banco. Um intervalo invertido **deixa de
representar um período e passa a representar o complemento do buraco entre os
dois instantes**, por causa da forma da condição de sobreposição em
`server/src/models/reservationModel.js:55`:

```sql
        (start_time < $3 AND end_time > $2)
```

onde `$2` é o início do novo pedido e `$3` o fim. Suponha que alguém quisesse
reservar das 16:00 às 17:00 e trocasse os campos, gravando
`start_time = 16:00, end_time = 15:00`. Confrontando essa linha fantasma `R`
com pedidos futuros `N`:

| Pedido novo `N` | `R.start_time < N.end_time` | `R.end_time > N.start_time` | Resultado |
|---|---|---|---|
| 16:00 – 17:00 (o horário que o usuário acha que reservou) | `16:00 < 17:00` ✔ | `15:00 > 16:00` ✘ | **livre** — ninguém é bloqueado |
| 15:00 – 16:00 | `16:00 < 16:00` ✘ | — | **livre** |
| 09:00 – 12:00 | `16:00 < 12:00` ✘ | — | **livre** |
| 14:00 – 18:00 | `16:00 < 18:00` ✔ | `15:00 > 14:00` ✔ | **409** sem motivo visível |

Ou seja, a reserva fantasma falha nas duas direções ao mesmo tempo: **não
protege o horário que o usuário pediu** (a sala das 16:00 às 17:00 continua
livre e vai ser reservada por outra pessoa) e **bloqueia, sem explicação,
quem atravessa o buraco**. Na tela, `client/src/App.jsx:303-304` ainda a
exibe como "16:00 até 15:00" — um item que o usuário não consegue interpretar
e que o suporte não consegue explicar.

### E depois da BE-01 fica pior, não melhor

Com a constraint `reservations_no_overlap` da BE-01 no lugar, o PostgreSQL
precisa construir `tsrange(start_time, end_time)` para cada linha inserida.
Com `start_time > end_time`, isso falha com:

```
ERROR:  range lower bound must be less than or equal to range upper bound
SQLSTATE: 22000
```

Esse SQLSTATE não é traduzido por ninguém e cai no `catch` genérico de
`reservationController.js:30-33`, virando **HTTP 500 "Internal server error"**
para um erro que é, claramente, do cliente. Trocar um dado corrompido por um
500 não é conserto. É por isso que esta spec vem logo depois da BE-01.

## Evidência

Reprodução, com o servidor de pé e um recurso de `id = 1`:

```bash
# BUG-02 — intervalo invertido. Código recebido: responde 201.
curl -i -X POST http://localhost:5000/api/reservations \
  -H 'Content-Type: application/json' \
  -d '{"resource_id":1,"user_name":"teste","start_time":"2030-01-10T16:00:00","end_time":"2030-01-10T15:00:00"}'

# BUG-08 — reserva no passado. Código recebido: responde 201.
curl -i -X POST http://localhost:5000/api/reservations \
  -H 'Content-Type: application/json' \
  -d '{"resource_id":1,"user_name":"teste","start_time":"2020-01-10T09:00:00","end_time":"2020-01-10T10:00:00"}'
```

Contagem de linhas inválidas já gravadas numa base existente:

```sql
SELECT COUNT(*) FROM reservations WHERE end_time <= start_time;
```

Números do relatório de auditoria que sustentam o diagnóstico:

| Métrica | Valor no código recebido |
|---|---|
| Constraints de integridade no schema | **0** (1 após a BE-01) |
| Validações de regra de negócio sobre a janela | **0** |
| Cobertura de branches do backend | **0 %** |
| Cobertura dos controllers | **0 %** |

## Decisão

**Defesa em profundidade: validar na borda E travar no banco.** As duas
camadas, não uma.

**Na borda** (`src/validators/reservationValidator.js`, função pura): rejeita
antes de tocar no banco e devolve **400** com mensagem acionável — qual campo,
qual regra. É o que a pessoa vê na tela, e é o único lugar onde dá para
explicar *o que fazer*. Um erro de banco nunca produz uma boa mensagem de UI.

**No banco** (`CHECK (end_time > start_time)`): a borda é só o caminho HTTP. O
`psql` do DevOps, o *seed*, o importador de planilha previsto para a N3 e
qualquer novo endpoint passam **por fora** dela. O `CHECK` não passa.

Não é redundância inútil: as duas camadas respondem perguntas diferentes.
A borda responde "por que meu pedido foi recusado?"; o `CHECK` responde "esse
dado pode existir?".

**Por que só o `CHECK` não basta?** Porque a resposta seria um SQLSTATE
`23514` cru, e a melhor mensagem que o middleware conseguiria produzir é
genérica ("a operação viola uma regra de integridade"). Pior: o cliente só
descobriria o erro depois de uma ida ao banco.

**Por que só a validação na borda não basta?** Porque ela não é uma garantia,
é uma convenção — exatamente o mesmo erro de desenho que produziu o BUG-01.
O sistema recebido já tinha a fórmula certa no lugar errado.

**Por que `CHECK` e não `EXCLUDE`/trigger para a regra do passado?** A regra
"não reservar no passado" depende de `now()`, que é **não imutável**: o
PostgreSQL recusa `CHECK (start_time >= now())`, e com razão — a cada segundo
que passa, linhas válidas no momento da gravação virariam inválidas, e um
`pg_dump`/`pg_restore` do histórico quebraria. Portanto:

* `end_time > start_time` é uma invariante atemporal → vai para o `CHECK`.
* `start_time` no passado é uma regra de **momento da criação** → fica só na
  borda, que é o lugar semanticamente correto.

Tolerância de relógio: a regra do passado usa 60 s de folga
(`MAX_CLOCK_SKEW_MS`). Sem isso, um usuário que escolhe "agora" e leva alguns
segundos para enviar o formulário recebe 400 sem entender por quê.

> **Limitação conhecida, declarada de propósito.** O BUG-07 (colunas
> `TIMESTAMP` sem fuso + `datetime-local` sem offset) **não é escopo desta
> spec**. Enquanto ele existir, a comparação com "agora" só é correta se o
> processo Node rodar no mesmo fuso do usuário. Por isso esta spec fixa
> `TZ=America/Sao_Paulo` no `.env.example` e no CI — é um paliativo explícito,
> não a solução. A solução é migrar as colunas para `TIMESTAMPTZ`, que é a
> issue do BUG-07.

## Alterações

### 1. Criar `server/src/validators/reservationValidator.js`

Função pura, sem `require` de banco: roda no projeto `unit` do Jest, sem
PostgreSQL, e é o primeiro pedaço de regra de negócio testável isoladamente
deste backend (ataca também o CS-03 e o CS-04).

```js
// Tolerance for clock drift between the client's picker and the server.
const MAX_CLOCK_SKEW_MS = 60 * 1000;

const parseTimestamp = (value) => {
  if (!(typeof value === 'string' || value instanceof Date)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

/**
 * Validates the business rules of a reservation window.
 * Pure function: no I/O, no clock reading unless `now` is omitted.
 *
 * @returns {{valid: true, start: Date, end: Date}
 *          |{valid: false, code: string, message: string}}
 */
const validateReservationWindow = ({ start_time, end_time }, now = new Date()) => {
  const start = parseTimestamp(start_time);
  if (!start) {
    return {
      valid: false,
      code: 'INVALID_START_TIME',
      message: 'O início da reserva não é uma data/hora válida.',
    };
  }

  const end = parseTimestamp(end_time);
  if (!end) {
    return {
      valid: false,
      code: 'INVALID_END_TIME',
      message: 'O término da reserva não é uma data/hora válida.',
    };
  }

  if (end.getTime() <= start.getTime()) {
    return {
      valid: false,
      code: 'END_BEFORE_START',
      message: 'O término da reserva deve ser posterior ao início.',
    };
  }

  if (start.getTime() < now.getTime() - MAX_CLOCK_SKEW_MS) {
    return {
      valid: false,
      code: 'START_IN_THE_PAST',
      message: 'Não é possível reservar um horário que já passou.',
    };
  }

  return { valid: true, start, end };
};

module.exports = { validateReservationWindow, MAX_CLOCK_SKEW_MS };
```

São **4 regras** onde hoje existem **0**: início parseável, término parseável,
término posterior ao início, início não no passado.

### 2. Criar `server/migrations/002_reservation_time_window_check.sql`

```sql
-- 002_reservation_time_window_check.sql
-- BE-02 — o término de uma reserva precisa ser posterior ao início (BUG-02).

-- Falha cedo e com mensagem útil se a base já tiver intervalos invertidos: o
-- ADD CONSTRAINT abortaria com um erro que não diz quantas linhas estão ruins.
DO $$
DECLARE
  inverted_count integer;
BEGIN
  SELECT COUNT(*) INTO inverted_count FROM reservations WHERE end_time <= start_time;

  IF inverted_count > 0 THEN
    RAISE EXCEPTION
      'Existem % reserva(s) com end_time <= start_time. Corrija ou remova essas linhas antes de migrar (ver docs/specs/be-02-validate-reservation-window/implementacao.md).',
      inverted_count;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reservations_time_window_check') THEN
    ALTER TABLE reservations
      ADD CONSTRAINT reservations_time_window_check CHECK (end_time > start_time);
  END IF;
END $$;
```

Ordem de avaliação, que importa: o PostgreSQL verifica os `CHECK` de tabela
**antes** de inserir as entradas de índice. Com a migração 002 aplicada, um
`INSERT` invertido falha com `23514` (`check_violation`) e **não** chega a
tentar construir o `tsrange` da constraint da BE-01 — some o `22000`
intraduzível descrito na seção Problema.

Comando de remediação, caso o `RAISE EXCEPTION` dispare numa base existente:

```sql
-- Inspecionar antes de decidir:
SELECT id, resource_id, user_name, start_time, end_time, status
  FROM reservations WHERE end_time <= start_time ORDER BY id;

-- Opção adotada pelo time: marcar como cancelada e registrar no handoff.
UPDATE reservations SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
 WHERE end_time <= start_time;
-- Observação: isso NÃO basta, porque o CHECK não é parcial. Linhas
-- irrecuperáveis devem ser removidas:
DELETE FROM reservations WHERE end_time <= start_time;
```

### 3. Alterar `server/src/controllers/reservationController.js`

Plugar o validador logo depois da checagem de presença, antes de qualquer
acesso a banco. Estado do método **após a BE-01**:

```js
const ReservationModel = require('../models/reservationModel');
const { validateReservationWindow } = require('../validators/reservationValidator');

// SQLSTATE 23P01 = exclusion_violation (BE-01).
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

      const window = validateReservationWindow({ start_time, end_time });
      if (!window.valid) {
        return res.status(400).json({ error: window.message, code: window.code });
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

Os demais métodos continuam intocados — os `try/catch` são escopo da BE-04.

### 4. Alterar `server/.env.example` e o job de backend do CI

Fixar o fuso do processo enquanto o BUG-07 não é resolvido (ver a limitação
declarada na seção Decisão).

```
# .env.example
PORT=5000
DATABASE_URL=postgres://postgres:***@localhost:5432/srec
# Paliativo enquanto as colunas forem TIMESTAMP sem fuso (BUG-07).
TZ=America/Sao_Paulo
```

Em `.github/workflows/ci.yml`, no bloco `env:` do job `backend-lint-test`
criado pela BE-01:

```yaml
    env:
      DATABASE_URL: postgres://postgres:postgres@localhost:5432/srec_test
      TZ: America/Sao_Paulo
```

## Testes

### Testes unitários — `server/src/validators/reservationValidator.test.js` (novo)

Rodam sem banco, no projeto `unit`. Usam um `now` fixo: nenhum teste depende
do relógio da máquina.

```js
const { validateReservationWindow } = require('./reservationValidator');

const NOW = new Date('2030-01-10T12:00:00');

describe('validateReservationWindow', () => {
  it('aceita uma janela válida no futuro', () => {
    const result = validateReservationWindow(
      { start_time: '2030-01-10T14:00:00', end_time: '2030-01-10T15:00:00' },
      NOW,
    );
    expect(result.valid).toBe(true);
  });

  it('recusa start_time que não é data/hora válida', () => {
    const result = validateReservationWindow(
      { start_time: 'amanhã de manhã', end_time: '2030-01-10T15:00:00' },
      NOW,
    );
    expect(result).toMatchObject({ valid: false, code: 'INVALID_START_TIME' });
  });

  it('recusa end_time que não é data/hora válida', () => {
    const result = validateReservationWindow(
      { start_time: '2030-01-10T14:00:00', end_time: null },
      NOW,
    );
    expect(result).toMatchObject({ valid: false, code: 'INVALID_END_TIME' });
  });

  it('recusa término anterior ao início (BUG-02)', () => {
    const result = validateReservationWindow(
      { start_time: '2030-01-10T16:00:00', end_time: '2030-01-10T15:00:00' },
      NOW,
    );
    expect(result).toMatchObject({ valid: false, code: 'END_BEFORE_START' });
  });

  it('recusa término igual ao início (reserva de duração zero)', () => {
    const result = validateReservationWindow(
      { start_time: '2030-01-10T14:00:00', end_time: '2030-01-10T14:00:00' },
      NOW,
    );
    expect(result).toMatchObject({ valid: false, code: 'END_BEFORE_START' });
  });

  it('recusa início no passado (BUG-08)', () => {
    const result = validateReservationWindow(
      { start_time: '2020-01-10T09:00:00', end_time: '2020-01-10T10:00:00' },
      NOW,
    );
    expect(result).toMatchObject({ valid: false, code: 'START_IN_THE_PAST' });
  });

  it('tolera até 60 s de atraso de relógio no início', () => {
    const result = validateReservationWindow(
      { start_time: '2030-01-10T11:59:30', end_time: '2030-01-10T13:00:00' },
      NOW,
    );
    expect(result.valid).toBe(true);
  });
});
```

**Comportamento antes da correção:** o arquivo nem compila — o módulo
`reservationValidator` não existe. Os 4 casos de recusa descrevem
comportamento que hoje **não existe em lugar nenhum do backend**.

### Testes de integração — `server/tests/integration/reservations.window.test.js` (novo)

```js
const request = require('supertest');
const app = require('../../src/index');
const { pool, resetDatabase, createResource } = require('../helpers/testDb');

describe('POST /api/reservations — janela da reserva (BUG-02 e BUG-08)', () => {
  let resource;

  beforeEach(async () => {
    await resetDatabase();
    resource = await createResource('Sala Verde', 'meeting_room', 6);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('recusa com 400 uma reserva com término anterior ao início', async () => {
    const response = await request(app).post('/api/reservations').send({
      resource_id: resource.id,
      user_name: 'Adrian',
      start_time: '2030-01-10T16:00:00',
      end_time: '2030-01-10T15:00:00',
    });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('code', 'END_BEFORE_START');

    const { rows } = await pool.query('SELECT COUNT(*)::int AS total FROM reservations');
    expect(rows[0].total).toBe(0);
  });

  it('recusa com 400 uma reserva inteiramente no passado', async () => {
    const response = await request(app).post('/api/reservations').send({
      resource_id: resource.id,
      user_name: 'Adrian',
      start_time: '2020-01-10T09:00:00',
      end_time: '2020-01-10T10:00:00',
    });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('code', 'START_IN_THE_PAST');
  });

  it('continua aceitando uma reserva válida no futuro', async () => {
    const response = await request(app).post('/api/reservations').send({
      resource_id: resource.id,
      user_name: 'Adrian',
      start_time: '2030-01-10T14:00:00',
      end_time: '2030-01-10T15:00:00',
    });

    expect(response.status).toBe(201);
    expect(response.body).toHaveProperty('id');
  });

  it('o banco recusa um INSERT invertido feito por fora da API', async () => {
    await expect(
      pool.query(
        `INSERT INTO reservations (resource_id, user_name, start_time, end_time)
         VALUES ($1, $2, $3, $4)`,
        [resource.id, 'script externo', '2030-02-01T16:00:00', '2030-02-01T15:00:00'],
      ),
    ).rejects.toMatchObject({ code: '23514', constraint: 'reservations_time_window_check' });
  });
});
```

O último caso é o que comprova a camada de banco: é exatamente o caminho que a
validação de borda **não** cobre.

### Comandos

```bash
cd server
npm run db:migrate
npm test                 # só unitários, sem banco
npm run test:integration # exige PostgreSQL de pé
npm run test:all
npm run lint
```

Para ver o teste de banco falhar **antes** da migração:

```bash
psql "$DATABASE_URL" -c 'ALTER TABLE reservations DROP CONSTRAINT reservations_time_window_check;'
npm run test:integration   # o 4º caso falha
```

## Critérios de aceite

* [ ] `server/src/validators/reservationValidator.js` existe, é uma função
      pura e não importa `config/database`.
* [ ] `server/migrations/002_reservation_time_window_check.sql` é idempotente
      (`npm run db:migrate` duas vezes não gera erro).
* [ ] `SELECT conname FROM pg_constraint WHERE conname = 'reservations_time_window_check'`
      retorna 1 linha.
* [ ] `POST /api/reservations` com `end_time <= start_time` responde **400**
      com `code: "END_BEFORE_START"` e **não** grava linha alguma.
* [ ] `POST /api/reservations` com `start_time` no passado responde **400**
      com `code: "START_IN_THE_PAST"`.
* [ ] Um `INSERT` direto no banco com intervalo invertido falha com SQLSTATE
      `23514`.
* [ ] Nenhuma dessas rotas responde **500** nos cenários acima.
* [ ] Uma reserva válida no futuro continua respondendo **201**.
* [ ] Números do PR, medidos: constraints de integridade no schema **1 → 2**
      (4 → 5 contando PKs e FK); validações de janela na borda **0 → 4**;
      resposta a intervalo invertido **201 → 400**; resposta a reserva no
      passado **201 → 400**; arquivos de teste **2 → 4**; casos de teste
      **4 → 15**.
* [ ] `npm run lint` com **0 erros**; `npm run test:all` verde.
* [ ] PR aprovado por **Igor Seberino (@igorSeberino)** no papel de QA.

## Passo a passo TBD

```bash
# 1. Partir de main já com a BE-01 integrada
git checkout main
git pull --ff-only origin main
git checkout -b fix/validate-reservation-window

cd server
npm ci
npm run db:migrate   # garante que a 001 já está aplicada

# 2. Implementar: banco -> domínio -> borda -> testes

git add server/migrations/002_reservation_time_window_check.sql
git commit -m "feat(db): exigir end_time posterior a start_time"

git add server/src/validators/reservationValidator.js
git commit -m "feat(reservas): criar validador da janela da reserva"

git add server/src/controllers/reservationController.js
git commit -m "fix(reservas): recusar janela invertida e inicio no passado"

git add server/src/validators/reservationValidator.test.js server/tests/integration/reservations.window.test.js
git commit -m "test(reservas): cobrir janela invertida e inicio no passado"

git add server/.env.example .github/workflows/ci.yml
git commit -m "chore(server): fixar TZ enquanto o BUG-07 nao e resolvido"

git add docs/specs/be-02-validate-reservation-window/implementacao.md
git commit -m "docs(specs): registrar a spec BE-02 de janela da reserva"

# 3. Validar antes de abrir o PR
npm run lint
npm run db:migrate
npm run test:all

# 4. Publicar e abrir o PR
git push -u origin fix/validate-reservation-window
```

Título do PR: `fix(reservas): validar a janela da reserva (BUG-02, BUG-08)`

Corpo do PR: a tabela do "efeito perverso" desta spec (é o argumento que
convence no pitch), link para
`docs/specs/be-02-validate-reservation-window/implementacao.md`, os números
antes/depois e a saída do `npm run test:all`. Revisão de **@igorSeberino**
(QA). Merge com **1 aprovação do QA + CI verde**.

## Prompt para o Claude Code

```
Você está na raiz do repositório igorSeberino/srec. Leia CLAUDE.md e a skill de
backend em .claude/skills/ antes de escrever código.

Implemente integralmente a spec docs/specs/be-02-validate-reservation-window/implementacao.md
(BE-02 — Validar a janela da reserva, corrige BUG-02 CRÍTICO e BUG-08 MÉDIO).

Pré-requisito: a BE-01 (fix/prevent-double-booking) já precisa estar em main —
confira que existem server/migrations/001_reservation_no_overlap.sql,
server/scripts/migrate.js e server/tests/helpers/testDb.js. Se não existirem,
pare e avise.

Regras:
- Trabalhe no branch fix/validate-reservation-window, criado a partir de main.
- Mantenha a stack: Node.js 20, Express 5, PostgreSQL via `pg` com SQL cru,
  CommonJS. Não introduza biblioteca de validação (zod, joi, yup) — a spec pede
  uma função pura de ~45 linhas, e adicionar dependência é escopo de outra issue.
- Respeite o Prettier do projeto (printWidth 100, aspas simples, ponto e vírgula,
  trailingComma all) e o ESLint em server/eslint.config.js.
- Nomes de arquivo, identificadores e comentários de código em inglês. Mensagens
  de commit e textos de erro voltados ao usuário em português.

Ordem de execução:
1. server/migrations/002_reservation_time_window_check.sql, exatamente como na
   spec, incluindo os dois blocos DO $$ (pré-checagem e idempotência).
2. server/src/validators/reservationValidator.js.
3. server/src/controllers/reservationController.js — inserir a validação logo
   após a checagem de presença dos campos, antes de qualquer acesso ao banco.
4. server/src/validators/reservationValidator.test.js (7 casos) e
   server/tests/integration/reservations.window.test.js (4 casos).
5. server/.env.example e o bloco env do job backend-lint-test do CI (TZ).

NÃO toque nos demais métodos do reservationController nem no resourceController:
os 10 blocos try/catch são escopo da spec BE-04. NÃO altere as colunas para
TIMESTAMPTZ: o BUG-07 é outra issue.

Ao final, rode nesta ordem e cole a saída:
  cd server && npm run lint && npm run db:migrate && npm run test:all
Depois faça os commits exatamente com as mensagens listadas na seção
"Passo a passo TBD" da spec.
```
