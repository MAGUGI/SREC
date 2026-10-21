# QA-02 — Testes de regra de domínio

* **Responsável:** Igor Thiago Seberino (Product Owner + QA)
* **Issue:** #<a definir>
* **Branch:** `test/domain-rule-tests`
* **Rubrica:** 4,0 — Onboarding e diagnóstico → 2,5 de melhoria comprovada. Também sustenta o item de 1,5 de documentação para a N3: esta suíte é a especificação executável da regra de negócio do SREC.
* **Depende de:** BE-06 (camada de serviço), BE-03 (enum de status). Complementar a QA-01: aqui não há HTTP e não há banco.

## Problema

A regra de negócio central do SREC — "um recurso não pode ter duas reservas que
se sobrepõem no tempo" — hoje vive **dentro de uma string SQL**, em
`server/src/models/reservationModel.js:49-61`:

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
```

Isso produz três problemas distintos:

1. **A regra não é testável isoladamente.** Para saber se `09:00–10:00` conflita
   com `10:00–11:00` é preciso um Postgres. O único teste existente
   (`reservationModel.test.js`) contorna isso mockando `db.query`
   (linha 4: `jest.mock('../config/database')`) e afirmando que `rows: []`
   devolve `true` (linhas 12-23) e `rows: [{ id: 1 }]` devolve `false`
   (linhas 25-36). **Esse teste não testa a fórmula** — testa o `if` de
   `result.rows.length === 0`. Troque `start_time < $3` por `start_time <= $3` e
   os dois casos continuam verdes.
2. **Nenhum teste cobre as bordas.** Branches em **0 %** no baseline. A fórmula
   usa comparação estrita (`<` e `>`), o que é o comportamento correto — duas
   reservas que apenas se encostam não conflitam. Mas *correto por acaso não é
   correto*: não existe um único teste que impeça alguém de "corrigir" para `<=`
   e `>=` na N3 e passar a recusar a reserva de 11h só porque a de 10h termina
   às 11h. Esse é o erro clássico de *off by one* neste domínio, e ele é
   silencioso: o sistema não quebra, só passa a recusar reservas legítimas.
3. **Validação de janela e de status não existem como conceito.**
   `reservationController.js:7` só checa presença de campo:

   ```js
   if (!resource_id || !user_name || !start_time || !end_time) {
   ```

   Nada compara `end_time` com `start_time` (BUG-02) nem com o instante atual
   (BUG-08). E `reservationController.js:60-73` repassa o corpo direto para
   `ReservationModel.updateStatus(id, status)` (`reservationModel.js:32-41`),
   que executa `SET status = $1` sem validação alguma — a coluna é
   `VARCHAR(20) DEFAULT 'scheduled'` sem `CHECK` (`initDb.js:20`), então
   `'banana'` é gravado com 200 e o corpo sem `status` grava `NULL` (BUG-03).

Há uma interação perversa entre 2 e 3 que merece registro, porque é o que
transforma BUG-02 de "validação faltando" em CRÍTICO: uma reserva invertida
(`start_time = 11:00`, `end_time = 09:00`) passa pela fórmula e **nunca colide
com nada**. Avalie `start_time < $3 AND end_time > $2` com a janela do banco
`10:00–11:00` e a nova invertida `11:00–09:00`: `10:00 < 09:00` é falso. Zero
linhas, "disponível". Pior: uma vez gravada, essa reserva também nunca aparece
como obstáculo para as próximas. É um registro invisível para a regra de
negócio — dado corrompido que o sistema ignora.

## Evidência

Baseline medido:

```bash
cd server && npm ci
npx jest --coverage --coverageReporters=text --collectCoverageFrom='src/**/*.js'
```

| Métrica | Valor medido |
|---|---|
| Cobertura de branches (backend) | **0 %** |
| Cobertura de funções (backend) | **3,57 %** |
| Casos de teste | **2** |
| Casos que exercitam borda de intervalo | **0** |
| Casos que exercitam transição de status | **0** |
| Casos que exercitam janela inválida | **0** |

Demonstração do ponto 1 — o teste existente não protege a fórmula. Edite
`reservationModel.js:55`, trocando `(start_time < $3 AND end_time > $2)` por
`(start_time <= $3 AND end_time >= $2)` e rode:

```bash
npx jest src/models/reservationModel.test.js
```

Dois testes passam. A regra de negócio acabou de mudar — reservas consecutivas
passaram a ser recusadas — e a suíte não notou.

Demonstração do ponto 3, com o servidor rodando e uma reserva de id 1:

```bash
curl -i -X PATCH http://localhost:5000/api/reservations/1/status \
  -H 'Content-Type: application/json' -d '{"status":"banana"}'
# HTTP/1.1 200 OK ... "status":"banana"

curl -i -X PATCH http://localhost:5000/api/reservations/1/status \
  -H 'Content-Type: application/json' -d '{}'
# HTTP/1.1 200 OK ... "status":null
```

## Decisão

**Escolha: extrair a regra para funções puras em `src/domain/` e testá-las sem
banco, com `it.each` sobre tabela de casos.**

BE-06 cria a camada de serviço; QA-02 define e testa o **núcleo determinístico**
que essa camada consome. A divisão de responsabilidade combinada com o Backend:

| Camada | Responsabilidade | Quem testa |
|---|---|---|
| `src/domain/` | funções puras: sobreposição, janela, transição de status | **QA-02** (sem banco, projeto `unit`) |
| `src/services/` | orquestração, transação, tradução para `AppError` | QA-01 via HTTP |
| `src/models/` | SQL | QA-01 via HTTP |
| banco | constraint `EXCLUDE` de BE-01 como última linha de defesa | QA-01, caso V-12 |

Por que funções puras e não testar só pelo HTTP de QA-01: os nove casos de
sobreposição por HTTP custam nove requisições, nove `INSERT` e nove `TRUNCATE`
— alguns segundos. Em memória custam milissegundos, e isso muda o
comportamento de quem desenvolve: uma suíte de domínio que roda em menos de um
segundo é rodada a cada salvamento. A de integração é rodada antes do commit.
Precisamos das duas, em velocidades diferentes.

Por que **duplicar** a verificação de sobreposição em três lugares (domínio,
serviço com `SELECT ... FOR UPDATE`, constraint `EXCLUDE`) não é duplicação
ruim: são três papéis diferentes. O domínio dá a resposta rápida e a mensagem de
erro legível; o serviço decide a transação; a constraint é a garantia que
nenhum caminho de código consegue furar — inclusive um `psql` manual. Remover
qualquer uma delas é regressão: a constraint sozinha dá 500 em vez de 409, e o
domínio sozinho é exatamente o BUG-01 que recebemos.

Por que `it.each` e não um `it` por caso: a tabela de sobreposição precisa ser
**exaustiva e legível como tabela**. Com `it.each` a tabela do código é a
mesma tabela desta spec, linha por linha; acrescentar um caso é acrescentar uma
linha. Com nove `it` copiados e colados, a chance de um deles ficar com a
expectativa trocada e ninguém notar é alta — e foi assim que o `cancelled`
ficou de fora da consulta por `status != 'cancelled'` sem nenhum teste.

Por que a validação de janela devolve **código** e não lança: a camada de
serviço de BE-06 precisa mapear cada motivo de recusa para uma mensagem e um
status HTTP distintos. Uma função pura que devolve `{ valid: false, code:
'END_BEFORE_START' }` é testável sem `expect().rejects` e deixa a decisão de
lançar `AppError` (BE-04) na borda, onde ela pertence.

Por que a ordem de avaliação é **janela antes de sobreposição**, e isso é um
teste: como demonstrado no Problema, uma janela invertida passa pela fórmula de
sobreposição sem conflito. Se o serviço checasse disponibilidade primeiro, a
reserva invertida seria aceita mesmo com a validação implementada. A ordem é
regra, não detalhe, e QA-02 tem um caso que a trava.

## Alterações

### 1. `server/src/domain/timeWindow.js` — criar (contrato acordado com BE-06)

```js
const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

const MIN_DURATION_MS = 15 * MINUTE_MS;
const MAX_DURATION_MS = 8 * HOUR_MS;

const WINDOW_ERROR = {
  MISSING_FIELD: 'MISSING_FIELD',
  INVALID_DATE: 'INVALID_DATE',
  END_BEFORE_START: 'END_BEFORE_START',
  ZERO_DURATION: 'ZERO_DURATION',
  START_IN_PAST: 'START_IN_PAST',
  DURATION_TOO_SHORT: 'DURATION_TOO_SHORT',
  DURATION_TOO_LONG: 'DURATION_TOO_LONG',
};

/** Converte entrada em Date, ou null se não for uma data utilizável. */
const parseInstant = (value) => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value !== 'string' || value.trim() === '') {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

/**
 * Intervalos semiabertos [start, end): dois intervalos que apenas se tocam
 * NÃO se sobrepõem. É a mesma semântica da fórmula em
 * reservationModel.js:49-61 e do operador && de tstzrange usado pela
 * constraint EXCLUDE de BE-01.
 */
const overlaps = (a, b) => {
  const aStart = parseInstant(a.start_time);
  const aEnd = parseInstant(a.end_time);
  const bStart = parseInstant(b.start_time);
  const bEnd = parseInstant(b.end_time);

  if (!aStart || !aEnd || !bStart || !bEnd) {
    return false;
  }
  return aStart.getTime() < bEnd.getTime() && aEnd.getTime() > bStart.getTime();
};

/**
 * Valida a janela de uma reserva. Devolve { valid } ou
 * { valid: false, code } — nunca lança. Quem traduz code em AppError é a
 * camada de serviço (BE-06 + BE-04).
 */
const validateWindow = ({ start_time, end_time } = {}, now = new Date()) => {
  if (start_time === undefined || start_time === null || end_time === undefined || end_time === null) {
    return { valid: false, code: WINDOW_ERROR.MISSING_FIELD };
  }

  const start = parseInstant(start_time);
  const end = parseInstant(end_time);
  if (!start || !end) {
    return { valid: false, code: WINDOW_ERROR.INVALID_DATE };
  }

  const duration = end.getTime() - start.getTime();
  if (duration === 0) {
    return { valid: false, code: WINDOW_ERROR.ZERO_DURATION };
  }
  if (duration < 0) {
    return { valid: false, code: WINDOW_ERROR.END_BEFORE_START };
  }
  if (start.getTime() < now.getTime()) {
    return { valid: false, code: WINDOW_ERROR.START_IN_PAST };
  }
  if (duration < MIN_DURATION_MS) {
    return { valid: false, code: WINDOW_ERROR.DURATION_TOO_SHORT };
  }
  if (duration > MAX_DURATION_MS) {
    return { valid: false, code: WINDOW_ERROR.DURATION_TOO_LONG };
  }

  return { valid: true };
};

module.exports = {
  WINDOW_ERROR,
  MIN_DURATION_MS,
  MAX_DURATION_MS,
  parseInstant,
  overlaps,
  validateWindow,
};
```

Duas decisões de ordenação dentro de `validateWindow` que os testes travam:

* `ZERO_DURATION` **antes** de `END_BEFORE_START`, porque duração zero não é
  "fim antes do início" e merece mensagem própria para o usuário.
* `END_BEFORE_START` **antes** de `START_IN_PAST`, porque numa janela invertida
  o campo que está errado é o `end_time`; apontar "início no passado" mandaria a
  pessoa corrigir o campo certo pelo motivo errado.

### 2. `server/src/domain/reservationStatus.js` — criar (BE-03)

Esta é a casa canônica dos literais de status, que hoje estão espalhados como
magic strings (CS-05): `'cancelled'` em `reservationModel.js:53`,
`'scheduled'` em `initDb.js:20`, e `'scheduled'`/`'completed'`/`'cancelled'`
em `App.jsx:306-324`.

```js
const RESERVATION_STATUS = {
  SCHEDULED: 'scheduled',
  CANCELLED: 'cancelled',
  COMPLETED: 'completed',
};

const RESERVATION_STATUSES = Object.values(RESERVATION_STATUS);

/** Estados finais não têm saída: cancelada não volta, concluída não volta. */
const ALLOWED_TRANSITIONS = {
  [RESERVATION_STATUS.SCHEDULED]: [RESERVATION_STATUS.CANCELLED, RESERVATION_STATUS.COMPLETED],
  [RESERVATION_STATUS.CANCELLED]: [],
  [RESERVATION_STATUS.COMPLETED]: [],
};

const isValidStatus = (status) =>
  typeof status === 'string' && RESERVATION_STATUSES.includes(status);

/**
 * Transição permitida? Repetir o mesmo status é recusado de propósito: um
 * PATCH que não muda nada é erro do cliente, não um no-op silencioso.
 */
const canTransition = (from, to) => {
  if (!isValidStatus(from) || !isValidStatus(to)) {
    return false;
  }
  return ALLOWED_TRANSITIONS[from].includes(to);
};

const isFinal = (status) =>
  isValidStatus(status) && ALLOWED_TRANSITIONS[status].length === 0;

module.exports = {
  RESERVATION_STATUS,
  RESERVATION_STATUSES,
  ALLOWED_TRANSITIONS,
  isValidStatus,
  canTransition,
  isFinal,
};
```

### 3. `server/src/domain/resourceType.js` — criar (BUG-10, CS-05)

Pequeno, mas fecha a mesma classe de defeito do lado dos recursos: `type` é
`VARCHAR(50)` sem `CHECK` (`initDb.js:8`) e o front renderiza qualquer coisa
diferente de `'meeting_room'` como estação de trabalho (`App.jsx:212`).

```js
const RESOURCE_TYPE = {
  WORKSTATION: 'workstation',
  MEETING_ROOM: 'meeting_room',
};

const RESOURCE_TYPES = Object.values(RESOURCE_TYPE);

const isValidResourceType = (type) =>
  typeof type === 'string' && RESOURCE_TYPES.includes(type);

const MIN_CAPACITY = 1;
const MAX_CAPACITY = 100;

/** BUG-09: `capacity || 1` em resourceController.js:10 engole o zero. */
const isValidCapacity = (capacity) =>
  Number.isInteger(capacity) && capacity >= MIN_CAPACITY && capacity <= MAX_CAPACITY;

module.exports = {
  RESOURCE_TYPE,
  RESOURCE_TYPES,
  MIN_CAPACITY,
  MAX_CAPACITY,
  isValidResourceType,
  isValidCapacity,
};
```

### 4. `server/src/domain/timeWindow.test.js` — criar

```js
const {
  WINDOW_ERROR,
  overlaps,
  parseInstant,
  validateWindow,
} = require('./timeWindow');

/** Açúcar para montar janelas no dia 10/11/2026 em UTC. */
const w = (start, end) => ({
  start_time: `2026-11-10T${start}:00.000Z`,
  end_time: `2026-11-10T${end}:00.000Z`,
});

const EXISTING = w('10:00', '11:00'); // reserva já no banco: 10:00 → 11:00

describe('overlaps — intervalos semiabertos [start, end)', () => {
  // A tabela abaixo é a mesma da spec QA-02, linha por linha.
  it.each([
    ['O-01 antes, disjunto', w('08:00', '09:00'), false],
    ['O-02 encostando antes (termina 10:00)', w('09:00', '10:00'), false],
    ['O-03 parcial à esquerda', w('09:30', '10:30'), true],
    ['O-04 idêntico', w('10:00', '11:00'), true],
    ['O-05 contido', w('10:15', '10:45'), true],
    ['O-06 contendo', w('09:00', '12:00'), true],
    ['O-07 parcial à direita', w('10:30', '11:30'), true],
    ['O-08 encostando depois (começa 11:00)', w('11:00', '12:00'), false],
    ['O-09 depois, disjunto', w('12:00', '13:00'), false],
  ])('%s → %s', (_cenario, candidate, expected) => {
    expect(overlaps(EXISTING, candidate)).toBe(expected);
  });

  it('O-10 é simétrico: overlaps(a, b) === overlaps(b, a)', () => {
    const candidates = [
      w('08:00', '09:00'),
      w('09:00', '10:00'),
      w('09:30', '10:30'),
      w('10:00', '11:00'),
      w('10:15', '10:45'),
      w('09:00', '12:00'),
      w('10:30', '11:30'),
      w('11:00', '12:00'),
      w('12:00', '13:00'),
    ];

    for (const candidate of candidates) {
      expect(overlaps(EXISTING, candidate)).toBe(overlaps(candidate, EXISTING));
    }
  });

  // Este é o teste que impede o "off by one" na N3.
  it('O-02/O-08 NÃO conflita quando uma reserva termina exatamente quando a outra começa', () => {
    const manha = {
      start_time: '2026-11-10T09:00:00.000Z',
      end_time: '2026-11-10T10:00:00.000Z',
    };
    const tarde = {
      start_time: '2026-11-10T10:00:00.000Z',
      end_time: '2026-11-10T11:00:00.000Z',
    };

    expect(overlaps(manha, tarde)).toBe(false);
    expect(overlaps(tarde, manha)).toBe(false);
  });

  it('O-11/O-12 trocar < por <= quebraria a agenda: milissegundos de folga não criam conflito', () => {
    const anterior = {
      start_time: '2026-11-10T09:00:00.000Z',
      end_time: '2026-11-10T10:00:00.000Z',
    };
    const umMsDepois = {
      start_time: '2026-11-10T10:00:00.001Z',
      end_time: '2026-11-10T11:00:00.000Z',
    };
    const umMsAntes = {
      start_time: '2026-11-10T09:59:59.999Z',
      end_time: '2026-11-10T11:00:00.000Z',
    };

    expect(overlaps(anterior, umMsDepois)).toBe(false);
    expect(overlaps(anterior, umMsAntes)).toBe(true);
  });

  it('O-13 considera dia inteiro contendo a reserva como sobreposição', () => {
    const diaInteiro = {
      start_time: '2026-11-10T00:00:00.000Z',
      end_time: '2026-11-11T00:00:00.000Z',
    };

    expect(overlaps(EXISTING, diaInteiro)).toBe(true);
  });

  it('O-14 não conflita quando é o mesmo horário em dias diferentes', () => {
    const diaSeguinte = {
      start_time: '2026-11-11T10:00:00.000Z',
      end_time: '2026-11-11T11:00:00.000Z',
    };

    expect(overlaps(EXISTING, diaSeguinte)).toBe(false);
  });

  // BUG-02: é por isso que validateWindow tem de rodar ANTES de overlaps.
  it('O-15 uma janela invertida não colide com nada — o motivo de BUG-02 ser crítico', () => {
    const invertida = {
      start_time: '2026-11-10T11:00:00.000Z',
      end_time: '2026-11-10T09:00:00.000Z',
    };

    expect(overlaps(EXISTING, invertida)).toBe(false);
    expect(validateWindow(invertida).code).toBe(WINDOW_ERROR.END_BEFORE_START);
  });

  it('O-16 devolve false quando alguma data é inutilizável', () => {
    expect(overlaps(EXISTING, { start_time: 'ontem', end_time: 'amanhã' })).toBe(false);
    expect(overlaps(EXISTING, {})).toBe(false);
  });

  it('O-17 aceita Date e string ISO indistintamente', () => {
    const comoDate = {
      start_time: new Date('2026-11-10T10:30:00.000Z'),
      end_time: new Date('2026-11-10T11:30:00.000Z'),
    };

    expect(overlaps(EXISTING, comoDate)).toBe(true);
  });
});

describe('parseInstant', () => {
  it.each([
    ['ISO com Z', '2026-11-10T10:00:00.000Z', true],
    // BUG-07: datetime-local do App.jsx:264 manda string sem offset.
    ['ISO sem offset', '2026-11-10T10:00', true],
    ['Date válido', new Date('2026-11-10T10:00:00.000Z'), true],
    ['string vazia', '', false],
    ['só espaços', '   ', false],
    ['texto', 'amanhã às dez', false],
    ['Date inválido', new Date('nada'), false],
    ['null', null, false],
    ['undefined', undefined, false],
    ['número', 1763000000000, false],
  ])('%s → %s', (_cenario, value, deveParsear) => {
    expect(parseInstant(value) !== null).toBe(deveParsear);
  });
});

describe('validateWindow', () => {
  const NOW = new Date('2026-11-10T08:00:00.000Z');

  it.each([
    ['W-01 janela válida de 1h no futuro', w('10:00', '11:00'), null],
    ['W-02 duração mínima de 15 min', w('10:00', '10:15'), null],
    ['W-03 duração máxima de 8h', w('10:00', '18:00'), null],
    ['W-04 fim antes do início (BUG-02)', w('11:00', '09:00'), WINDOW_ERROR.END_BEFORE_START],
    ['W-05 duração zero', w('10:00', '10:00'), WINDOW_ERROR.ZERO_DURATION],
    ['W-06 início no passado (BUG-08)', w('07:00', '09:00'), WINDOW_ERROR.START_IN_PAST],
    ['W-07 curta demais, 10 min', w('10:00', '10:10'), WINDOW_ERROR.DURATION_TOO_SHORT],
    ['W-08 longa demais, 9h', w('10:00', '19:00'), WINDOW_ERROR.DURATION_TOO_LONG],
    ['W-09 data ilegível', { start_time: 'amanhã', end_time: 'depois' }, WINDOW_ERROR.INVALID_DATE],
    ['W-10 sem start_time', { end_time: '2026-11-10T11:00:00.000Z' }, WINDOW_ERROR.MISSING_FIELD],
    ['W-11 sem end_time', { start_time: '2026-11-10T10:00:00.000Z' }, WINDOW_ERROR.MISSING_FIELD],
    ['W-12 objeto vazio', {}, WINDOW_ERROR.MISSING_FIELD],
  ])('%s → %s', (_cenario, window, expectedCode) => {
    const result = validateWindow(window, NOW);

    if (expectedCode === null) {
      expect(result).toEqual({ valid: true });
    } else {
      expect(result).toEqual({ valid: false, code: expectedCode });
    }
  });

  it('W-13 aceita janela que começa exatamente agora', () => {
    const result = validateWindow(
      { start_time: NOW.toISOString(), end_time: '2026-11-10T09:00:00.000Z' },
      NOW,
    );

    expect(result).toEqual({ valid: true });
  });

  it('W-14 recusa janela que começou um milissegundo atrás', () => {
    const result = validateWindow(
      {
        start_time: new Date(NOW.getTime() - 1).toISOString(),
        end_time: '2026-11-10T09:00:00.000Z',
      },
      NOW,
    );

    expect(result).toEqual({ valid: false, code: WINDOW_ERROR.START_IN_PAST });
  });

  // Ordem de precedência: a janela invertida reporta o campo certo.
  it('W-15 reporta END_BEFORE_START, não START_IN_PAST, quando a janela está invertida no passado', () => {
    const result = validateWindow(
      {
        start_time: '2026-11-10T07:00:00.000Z',
        end_time: '2026-11-10T06:00:00.000Z',
      },
      NOW,
    );

    expect(result.code).toBe(WINDOW_ERROR.END_BEFORE_START);
  });

  it('W-16 não lança para nenhuma entrada, nem sem argumento', () => {
    expect(() => validateWindow()).not.toThrow();
    expect(validateWindow().valid).toBe(false);
  });

  it('W-17 usa o relógio real quando `now` não é informado', () => {
    const umaHora = 60 * 60 * 1000;
    const futuro = {
      start_time: new Date(Date.now() + 24 * umaHora).toISOString(),
      end_time: new Date(Date.now() + 25 * umaHora).toISOString(),
    };

    expect(validateWindow(futuro)).toEqual({ valid: true });
  });
});
```

### 5. `server/src/domain/reservationStatus.test.js` — criar

```js
const {
  RESERVATION_STATUS,
  RESERVATION_STATUSES,
  isValidStatus,
  canTransition,
  isFinal,
} = require('./reservationStatus');

const { SCHEDULED, CANCELLED, COMPLETED } = RESERVATION_STATUS;

describe('enum de status', () => {
  it('tem exatamente os três status do sistema recebido', () => {
    expect(RESERVATION_STATUSES).toEqual(['scheduled', 'cancelled', 'completed']);
  });

  // Os literais vêm de initDb.js:20 e reservationModel.js:53; mudar qualquer
  // um deles quebra dado já gravado.
  it('mantém os literais gravados no banco', () => {
    expect(SCHEDULED).toBe('scheduled');
    expect(CANCELLED).toBe('cancelled');
    expect(COMPLETED).toBe('completed');
  });

  it.each([
    ['scheduled', 'scheduled', true],
    ['cancelled', 'cancelled', true],
    ['completed', 'completed', true],
    ['string fora do enum (BUG-03)', 'banana', false],
    ['variação de caixa', 'Scheduled', false],
    ['com espaço', ' scheduled', false],
    ['string vazia', '', false],
    ['null (corpo sem status, BUG-03)', null, false],
    ['undefined', undefined, false],
    ['número', 1, false],
    ['objeto', { status: 'scheduled' }, false],
  ])('isValidStatus — %s → %s', (_cenario, value, expected) => {
    expect(isValidStatus(value)).toBe(expected);
  });
});

describe('canTransition', () => {
  it.each([
    ['agendada → cancelada', SCHEDULED, CANCELLED, true],
    ['agendada → concluída', SCHEDULED, COMPLETED, true],
    ['agendada → agendada (sem efeito)', SCHEDULED, SCHEDULED, false],
    ['cancelada → agendada (ressuscitar)', CANCELLED, SCHEDULED, false],
    ['cancelada → concluída', CANCELLED, COMPLETED, false],
    ['cancelada → cancelada', CANCELLED, CANCELLED, false],
    ['concluída → agendada', COMPLETED, SCHEDULED, false],
    ['concluída → cancelada', COMPLETED, CANCELLED, false],
    ['concluída → concluída', COMPLETED, COMPLETED, false],
    ['agendada → fora do enum (BUG-03)', SCHEDULED, 'banana', false],
    ['agendada → string vazia', SCHEDULED, '', false],
    ['agendada → null (BUG-03)', SCHEDULED, null, false],
    ['agendada → undefined', SCHEDULED, undefined, false],
    ['origem fora do enum', 'banana', CANCELLED, false],
    ['origem null', null, CANCELLED, false],
  ])('%s → %s', (_cenario, from, to, expected) => {
    expect(canTransition(from, to)).toBe(expected);
  });

  it('cobre as nove combinações do enum sem deixar nenhuma de fora', () => {
    const combinacoes = RESERVATION_STATUSES.flatMap((from) =>
      RESERVATION_STATUSES.map((to) => [from, to]),
    );

    expect(combinacoes).toHaveLength(9);

    const permitidas = combinacoes.filter(([from, to]) => canTransition(from, to));

    expect(permitidas).toEqual([
      [SCHEDULED, CANCELLED],
      [SCHEDULED, COMPLETED],
    ]);
  });

  it('não lança para nenhuma entrada', () => {
    expect(() => canTransition(undefined, undefined)).not.toThrow();
    expect(() => canTransition({}, [])).not.toThrow();
  });
});

describe('isFinal', () => {
  it.each([
    [SCHEDULED, false],
    [CANCELLED, true],
    [COMPLETED, true],
    ['banana', false],
    [null, false],
  ])('%s → %s', (status, expected) => {
    expect(isFinal(status)).toBe(expected);
  });

  it('todo status final recusa qualquer transição de saída', () => {
    for (const from of RESERVATION_STATUSES.filter(isFinal)) {
      for (const to of RESERVATION_STATUSES) {
        expect(canTransition(from, to)).toBe(false);
      }
    }
  });
});
```

### 6. `server/src/domain/resourceType.test.js` — criar

```js
const {
  RESOURCE_TYPE,
  RESOURCE_TYPES,
  isValidResourceType,
  isValidCapacity,
} = require('./resourceType');

describe('tipos de recurso', () => {
  it('tem exatamente os dois tipos que o front oferece', () => {
    // App.jsx:180-181 oferece só estas duas opções no <select>.
    expect(RESOURCE_TYPES).toEqual(['workstation', 'meeting_room']);
  });

  it.each([
    ['workstation', 'workstation', true],
    ['meeting_room', 'meeting_room', true],
    ['tipo inventado (BUG-10)', 'sofa', false],
    ['variação de caixa', 'Workstation', false],
    ['com espaço', 'meeting_room ', false],
    ['string vazia', '', false],
    ['null', null, false],
    ['undefined', undefined, false],
  ])('isValidResourceType — %s → %s', (_cenario, value, expected) => {
    expect(isValidResourceType(value)).toBe(expected);
  });

  it('o enum cobre o que o front renderiza', () => {
    // App.jsx:212 trata tudo que não é meeting_room como workstation.
    expect(RESOURCE_TYPES).toContain(RESOURCE_TYPE.MEETING_ROOM);
    expect(RESOURCE_TYPES).toContain(RESOURCE_TYPE.WORKSTATION);
    expect(RESOURCE_TYPES).toHaveLength(2);
  });
});

describe('isValidCapacity', () => {
  it.each([
    ['mínimo', 1, true],
    ['típico', 6, true],
    ['máximo', 100, true],
    ['zero (BUG-09)', 0, false],
    ['negativo (BUG-09)', -5, false],
    ['acima do máximo', 101, false],
    ['fracionário', 2.5, false],
    ['string numérica', '6', false],
    ['NaN', Number.NaN, false],
    ['Infinity', Number.POSITIVE_INFINITY, false],
    ['null', null, false],
    ['undefined', undefined, false],
  ])('%s → %s', (_cenario, value, expected) => {
    expect(isValidCapacity(value)).toBe(expected);
  });
});
```

### 7. `server/src/models/reservationModel.test.js` — alterar

O teste herdado continua, mas ganha a assertion que faltava: hoje ele afirma
que `db.query` foi chamado uma vez (linhas 22 e 35) e não olha a consulta. Como
a fórmula de sobreposição passa a ter dono em `src/domain/timeWindow.js`, este
teste passa a verificar o que é dele — que a comparação enviada ao Postgres é
**estrita**, coerente com `overlaps`.

```js
    it('usa comparação estrita, coerente com overlaps do domínio', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });

      await ReservationModel.checkAvailability(
        1,
        '2026-11-10T10:00:00.000Z',
        '2026-11-10T11:00:00.000Z',
      );

      const [sql] = db.query.mock.calls[0];

      expect(sql).toContain('start_time < $3');
      expect(sql).toContain('end_time > $2');
      expect(sql).not.toContain('<=');
      expect(sql).not.toContain('>=');
    });
```

É um teste de implementação, e deliberadamente: ele existe só para que a
mudança de `<` para `<=` no SQL quebre a suíte em vez de mudar a regra de
negócio em silêncio. Vai junto um comentário no arquivo apontando para
`src/domain/timeWindow.js` como fonte da regra.

### 8. `server/jest.config.js` — nenhuma alteração necessária

A configuração criada por QA-01 já dá `testMatch: ['<rootDir>/src/**/*.test.js']`
ao projeto `unit`, então os três arquivos novos em `src/domain/` são coletados
automaticamente e rodam **sem Postgres**.

## Testes

### Tabela exaustiva de sobreposição

Referência fixa: reserva já existente de **10:00 → 11:00** no mesmo recurso.
Semântica de intervalo semiaberto `[start, end)`.

| # | Caso | Janela candidata | `overlaps` | Por que |
|---|---|---|---|---|
| O-01 | antes, disjunto | 08:00 → 09:00 | **false** | termina antes de começar a existente |
| O-02 | encostando antes | 09:00 → **10:00** | **false** | fim toca o início; `10:00 > 10:00` é falso |
| O-03 | parcial à esquerda | 09:30 → 10:30 | **true** | invade das 10:00 às 10:30 |
| O-04 | idêntico | 10:00 → 11:00 | **true** | mesmo intervalo |
| O-05 | contido | 10:15 → 10:45 | **true** | inteiramente dentro |
| O-06 | contendo | 09:00 → 12:00 | **true** | engole a existente |
| O-07 | parcial à direita | 10:30 → 11:30 | **true** | invade das 10:30 às 11:00 |
| O-08 | encostando depois | **11:00** → 12:00 | **false** | início toca o fim; `10:00 < 11:00` e `11:00 > 11:00` é falso |
| O-09 | depois, disjunto | 12:00 → 13:00 | **false** | começa depois de a existente terminar |

Os dois casos que **importam de verdade** nesta tabela são O-02 e O-08. Eles são
a diferença entre uma agenda utilizável e uma que recusa a reserva das 11h
porque a das 10h "termina às 11h". É o *off by one* clássico deste domínio e a
razão pela qual a comparação é `<`/`>` e não `<=`/`>=`.

Casos de borda fina que acompanham a tabela:

| # | Caso | `overlaps` |
|---|---|---|
| O-10 | simetria: `overlaps(a,b) === overlaps(b,a)` para os 9 casos acima | consistente |
| O-11 | 1 ms depois do fim (10:00:00.001 → 11:00) vs 09:00→10:00 | **false** |
| O-12 | 1 ms antes do fim (09:59:59.999 → 11:00) vs 09:00→10:00 | **true** |
| O-13 | dia inteiro 00:00 → 00:00 do dia seguinte | **true** |
| O-14 | mesmo horário, dia seguinte | **false** |
| O-15 | janela invertida 11:00 → 09:00 (BUG-02) | **false** — e é exatamente o problema |
| O-16 | data ilegível em qualquer lado | **false** |
| O-17 | `Date` e string ISO misturados | **true** (10:30→11:30) |

### Casos de validação de janela

`now` fixo em `2026-11-10T08:00:00Z`.

| # | Entrada | Resultado |
|---|---|---|
| W-01 | 10:00 → 11:00 | `{ valid: true }` |
| W-02 | 10:00 → 10:15 (mínimo) | `{ valid: true }` |
| W-03 | 10:00 → 18:00 (máximo) | `{ valid: true }` |
| W-04 | 11:00 → 09:00 | `END_BEFORE_START` (BUG-02) |
| W-05 | 10:00 → 10:00 | `ZERO_DURATION` |
| W-06 | 07:00 → 09:00 | `START_IN_PAST` (BUG-08) |
| W-07 | 10:00 → 10:10 | `DURATION_TOO_SHORT` |
| W-08 | 10:00 → 19:00 | `DURATION_TOO_LONG` |
| W-09 | `'amanhã'` → `'depois'` | `INVALID_DATE` |
| W-10 | sem `start_time` | `MISSING_FIELD` |
| W-11 | sem `end_time` | `MISSING_FIELD` |
| W-12 | `{}` | `MISSING_FIELD` |
| W-13 | começa exatamente `now` | `{ valid: true }` |
| W-14 | começa 1 ms antes de `now` | `START_IN_PAST` |
| W-15 | 07:00 → 06:00 (invertida e no passado) | `END_BEFORE_START`, **não** `START_IN_PAST` |
| W-16 | sem argumento algum | `{ valid: false }`, sem lançar |
| W-17 | `now` omitido, janela em +24h | `{ valid: true }` |

Mais 10 casos de `parseInstant` (P-01 a P-10), que incluem a string sem offset
produzida pelo `datetime-local` de `App.jsx:264` — a entrada que BUG-07
desloca.

### Casos de transição de status

| # | De | Para | `canTransition` | Por que |
|---|---|---|---|---|
| S-01 | `scheduled` | `cancelled` | **true** | cancelamento é o fluxo do `App.jsx:324` |
| S-02 | `scheduled` | `completed` | **true** | conclusão é o fluxo do `App.jsx:317` |
| S-03 | `scheduled` | `scheduled` | **false** | PATCH sem efeito é erro do cliente |
| S-04 | `cancelled` | `scheduled` | **false** | ressuscitar liberaria horário já reocupado |
| S-05 | `cancelled` | `completed` | **false** | não se conclui o que foi cancelado |
| S-06 | `cancelled` | `cancelled` | **false** | estado final |
| S-07 | `completed` | `scheduled` | **false** | estado final |
| S-08 | `completed` | `cancelled` | **false** | estado final |
| S-09 | `completed` | `completed` | **false** | estado final |
| S-10 | `scheduled` | `'banana'` | **false** | BUG-03 |
| S-11 | `scheduled` | `''` | **false** | BUG-03 |
| S-12 | `scheduled` | `null` | **false** | BUG-03, corpo sem `status` |
| S-13 | `scheduled` | `undefined` | **false** | BUG-03 |
| S-14 | `'banana'` | `cancelled` | **false** | origem corrompida já no banco |
| S-15 | `null` | `cancelled` | **false** | linha com `status NULL` gravada por BUG-03 |

Mais: 11 casos de `isValidStatus`, 5 de `isFinal`, um caso que enumera as **9**
combinações do enum e afirma que exatamente **2** são permitidas (guarda-chuva
contra alguém acrescentar transição sem revisar a tabela), e um caso que varre
todo status final confirmando que nenhuma saída é aceita.

S-04 merece explicação, porque é decisão de produto e não detalhe técnico:
reabrir uma reserva cancelada parece inofensivo, mas o horário dela pode ter
sido tomado por outra pessoa no intervalo — justamente porque
`checkAvailability` ignora `status != 'cancelled'` (`reservationModel.js:53`).
Permitir `cancelled → scheduled` reabriria BUG-01 por outra porta. Quem quer o
horário de volta cria reserva nova, que passa pela verificação.

### Casos de tipo de recurso e capacidade

8 casos de `isValidResourceType` (incluindo `'sofa'` de BUG-10 e variações de
caixa e espaço) e 12 de `isValidCapacity` (incluindo `0` e `-5` de BUG-09,
fracionário, string numérica, `NaN`, `Infinity`).

### Contagem

| | Antes | Depois de QA-02 |
|---|---|---|
| Arquivos de teste de domínio | 0 | **3** |
| Casos de sobreposição | 0 | **17** (9 da tabela + 8 de borda) |
| Casos de validação de janela | 0 | **27** (17 de janela + 10 de `parseInstant`) |
| Casos de transição de status | 0 | **33** (15 de transição + 11 de validação + 5 de `isFinal` + 2 agregados) |
| Casos de tipo e capacidade | 0 | **23** |
| **Total de casos novos** | 0 | **100** |
| Tempo de execução da suíte de domínio | — | **< 1 s** (sem banco, sem rede) |

Somando com QA-01: **2 → 155 casos** no repositório, e **1 → 7 arquivos** de
teste.

### Comandos

```bash
cd server

# A suíte de domínio não precisa de Postgres nem de Docker.
npm run test:unit

# Só o domínio, em modo observação, durante o desenvolvimento
npx jest --selectProjects unit src/domain --watch

# Cobertura só do domínio, que precisa ser 100%: é função pura
npx jest --selectProjects unit --coverage --collectCoverageFrom='src/domain/**/*.js'
```

## Critérios de aceite

* [ ] `src/domain/timeWindow.js`, `src/domain/reservationStatus.js` e
      `src/domain/resourceType.js` existem e **não importam** `pg`,
      `../config/database`, `express` nem nada de I/O.
* [ ] Nenhum arquivo de teste em `src/domain/` usa `jest.mock`. Se precisou
      mockar, a função não era pura.
* [ ] `npm run test:unit` passa com o Postgres **desligado**, e em menos de
      5 segundos no total.
* [ ] Cobertura de `src/domain/` em **100 %** de statements, branches e
      funções. É função pura: qualquer linha descoberta é caso de teste
      faltando, não limitação.
* [ ] As tabelas O-01 a O-09, W-01 a W-17 e S-01 a S-15 estão implementadas como
      `it.each`, com os mesmos rótulos desta spec, e a tabela do código bate
      linha por linha com a tabela do documento.
* [ ] Existe caso explícito e nomeado para "termina 10:00 / começa 10:00 não
      conflitam", nos dois sentidos (O-02 e O-08).
* [ ] Existe caso que prova a simetria de `overlaps` (O-10).
* [ ] Existe caso provando que janela invertida não colide com nada (O-15) e que
      `validateWindow` a recusa com `END_BEFORE_START`.
* [ ] A precedência `ZERO_DURATION` → `END_BEFORE_START` → `START_IN_PAST` está
      coberta por W-05, W-15 e W-14.
* [ ] O caso agregado confirma: 9 combinações possíveis de status, exatamente 2
      permitidas.
* [ ] Nenhuma função do domínio lança para entrada inválida; todas devolvem
      `false` ou `{ valid: false, code }`.
* [ ] `reservationModel.test.js` ganhou a assertion de comparação estrita e os
      2 testes herdados continuam passando.
* [ ] Os literais `'scheduled'`, `'cancelled'`, `'completed'`, `'workstation'` e
      `'meeting_room'` não aparecem mais soltos em `src/controllers/` nem em
      `src/services/` — só vêm de `src/domain/` (fecha CS-05 no backend).
* [ ] `npm run lint` passa.

## Passo a passo TBD

```bash
# 1. Branch a partir de main, já com QA-01 e BE-06 integrados
git checkout main
git pull --ff-only origin main
git checkout -b test/domain-rule-tests

# 2. Domínio de tempo + teste, na mesma leva: a função e a tabela nascem juntas
npx jest --selectProjects unit src/domain/timeWindow.test.js
git add server/src/domain/timeWindow.js server/src/domain/timeWindow.test.js
git commit -m "test(domain): cobrir sobreposição de intervalos e validação da janela"

# 3. Enum e máquina de estados do status
npx jest --selectProjects unit src/domain/reservationStatus.test.js
git add server/src/domain/reservationStatus.js server/src/domain/reservationStatus.test.js
git commit -m "test(domain): cobrir transições válidas e inválidas de status"

# 4. Tipo de recurso e capacidade
npx jest --selectProjects unit src/domain/resourceType.test.js
git add server/src/domain/resourceType.js server/src/domain/resourceType.test.js
git commit -m "test(domain): cobrir enum de tipo de recurso e faixa de capacidade"

# 5. Travar a comparação estrita no teste herdado do model
npx jest --selectProjects unit src/models
git add server/src/models/reservationModel.test.js
git commit -m "test(reservations): travar comparação estrita na consulta de disponibilidade"

# 6. Conferir cobertura do domínio — precisa ser 100%
npx jest --selectProjects unit --coverage --collectCoverageFrom='src/domain/**/*.js' \
  2>&1 | tee ../docs/auditoria/evidencias/qa-02-dominio.txt
git add ../docs/auditoria/evidencias/qa-02-dominio.txt
git commit -m "docs(qa): registrar cobertura de 100% da camada de domínio"

# 7. Abrir PR
git push -u origin test/domain-rule-tests
# PR: "QA-02 — Testes de regra de domínio"
# Corpo: colar as três tabelas (O, W, S) e a contagem de 0 → 100 casos.
# Revisor obrigatório: @igorSeberino (QA). Fecha a issue #<a definir>.
```

Coordenação com BE-06 e BE-03: se o Backend já tiver criado os módulos de
domínio com outros nomes de arquivo ou de função, **o contrato do Backend
vence** — ajuste apenas os `require` e os nomes nos testes, e preserve todas as
tabelas de caso. Se o Backend mudar o **comportamento** esperado (por exemplo,
passar a permitir `cancelled → scheduled`), isso não é ajuste de import: é
decisão de produto, e precisa de aprovação do PO antes de qualquer teste mudar
de expectativa.

## Prompt para o Claude Code

```
Implemente a spec docs/specs/qa-02-domain-rule-tests/implementacao.md neste
repositório. Leia a spec inteira antes de escrever, e carregue as skills de
backend e de testes disponíveis em .claude/skills/.

Antes de começar, verifique no código:
- se BE-06 já criou src/domain/ ou src/services/ com funções de sobreposição,
  janela ou status. Se sim, REUSE o que existe e só acrescente os testes,
  ajustando os require. Não duplique a regra.
- a fórmula atual em server/src/models/reservationModel.js:49-61 — comparação
  estrita, que é o comportamento correto e precisa ser preservado.
- os literais de status em server/src/config/initDb.js:20 e
  server/src/models/reservationModel.js:53, e os de tipo em
  server/src/client App.jsx:180-181 e 212.

Entregue, um commit por etapa (mensagens na seção "Passo a passo TBD"):
1. src/domain/timeWindow.js + timeWindow.test.js, com as tabelas O-01..O-17,
   W-01..W-17 e P-01..P-10 escritas como it.each, rótulos idênticos aos da spec.
2. src/domain/reservationStatus.js + teste, com S-01..S-15 como it.each, mais o
   caso agregado que enumera as 9 combinações e exige exatamente 2 permitidas.
3. src/domain/resourceType.js + teste.
4. A assertion de comparação estrita em src/models/reservationModel.test.js,
   preservando os 2 testes que já existem lá.

Regras rígidas:
- Nada em src/domain/ pode importar pg, express, ../config/database ou
  qualquer I/O. Nenhum jest.mock nos testes de domínio.
- Toda tabela de caso vira it.each. Não escreva nove it() copiados.
- Os casos O-02 ("termina 10:00") e O-08 ("começa 11:00") precisam existir
  nomeados e nos dois sentidos: são a proteção contra off by one e são o
  coração desta spec.
- Nenhuma função do domínio lança para entrada inválida; devolve false ou
  { valid: false, code }.
- Cobertura de src/domain/ precisa fechar em 100% de statements, branches e
  funções. Rode e confirme.
- npm run test:unit precisa passar com o Postgres desligado.
- Código e identificadores em inglês; comentários e commits em português, no
  imperativo.

Ao terminar, reporte: número de casos por tabela (O, W, P, S, tipo/capacidade),
o total, o tempo de execução da suíte unit, e os quatro números de cobertura de
src/domain/.
```
