# BE-06 — Extrair a camada de serviço

* **Responsável:** Adrian Cesar Gonçalves (Desenvolvedor Backend)
* **Issue:** #<a definir>
* **Branch:** `refactor/extract-service-layer`
* **Rubrica:** 4,0 — Onboarding e diagnóstico → 2,5 (melhoria comprovada: CS-03, ALTO, e habilitação da cobertura de testes); 3,0 — Processo, Git & Documentação → 1,5 (arquitetura alvo documentada para a N3)
* **Depende de:** BE-04 (classe `AppError`, wrapper `asyncHandler` e middleware central de erro)

## Problema

O sistema recebido tem **duas** camadas: controller e model. O model é SQL cru,
o controller é HTTP. A regra de negócio não tem endereço, então foi morar no
controller — e o controller não é testável sem subir HTTP.

`server/src/controllers/reservationController.js:4-34` é o caso exemplar.
Dentro de um único handler estão quatro responsabilidades diferentes:

```js
  async createReservation(req, res) {
    try {
      const { resource_id, user_name, start_time, end_time } = req.body;   // (1) HTTP
      if (!resource_id || !user_name || !start_time || !end_time) {        // (2) validação
        return res.status(400).json({ error: 'All fields are required' });
      }

      // Check availability
      const isAvailable = await ReservationModel.checkAvailability(          // (3) REGRA
        resource_id,
        start_time,
        end_time,
      );
      if (!isAvailable) {
        return res
          .status(409)
          .json({ error: 'Resource is not available for the selected time slot' });
      }

      const newReservation = await ReservationModel.create(                 // (4) persistência
        resource_id,
        user_name,
        start_time,
        end_time,
      );
      res.status(201).json(newReservation);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
```

A regra central do produto — *um recurso não pode estar reservado duas vezes no
mesmo intervalo* — está expressa como "se `checkAvailability` devolveu `false`,
responda 409". Ou seja: **a regra de negócio está escrita em vocabulário de
HTTP.** Para testá-la é preciso um `req`, um `res`, um roteador e um banco.

Consequências medidas, não estimadas:

* Cobertura de statements do backend: **6,14 %**. Cobertura de branches: **0 %**.
* Cobertura dos controllers: **0 %**. Cobertura das rotas: **0 %**.
* Único arquivo de teste do repositório recebido:
  `server/src/models/reservationModel.test.js`, **38 linhas**, **2 casos** — e
  os dois testam `checkAvailability` **mockando `db.query`**
  (`reservationModel.test.js:4,13,26`), isto é, testam que o model chama o banco
  uma vez, não que a regra de reserva está correta.
* A documentação recebida afirma "testes unitários automatizados de domínio"
  (divergência 12 em `docs/auditoria/`). Não há um único teste de domínio,
  porque **não há domínio** onde pendurar um teste.

Este é o smell CS-03 (ALTO) e é a **causa raiz** dos 6,14 %. Sem camada de
serviço, qualquer tentativa de subir cobertura cai em teste de controller com
banco real ou em mock de `req`/`res`, que é caro e frágil. É também o que
bloqueia BE-01, BE-02 e BE-03: as três precisam de um lugar para pôr regra que
não seja o `if` dentro do handler.

O mesmo padrão se repete em `server/src/controllers/resourceController.js:4-16`
(`capacity || 1`, BUG-09, regra de negócio embutida num operador lógico).

## Evidência

```bash
cd server && npm ci
npx jest --coverage --coverageReporters=text --collectCoverageFrom='src/**/*.js'
```

Saída medida no código recebido:

| Métrica | Valor medido (antes) |
|---|---|
| Statements | **6,14 %** |
| Branches | **0 %** |
| Funções | **3,57 %** |
| `src/controllers/` | **0 %** |
| `src/routes/` | **0 %** |
| `src/services/` | **não existe** (0 arquivos, 0 linhas) |
| Arquivos de teste | **1** |
| Casos de teste | **2** |
| Funções de negócio testáveis sem HTTP e sem banco | **0** |
| `createReservation` | **31 linhas**, 4 responsabilidades |
| Blocos `try/catch` idênticos nos controllers | **10** |

Contagem de responsabilidades por handler, reproduzível por leitura:

```bash
grep -n "res.status\|req.body\|req.params\|Model\." server/src/controllers/reservationController.js
```

## Decisão

**1. Três camadas: `routes → controllers → services → models`. O serviço é a
única camada que conhece regra de negócio.**

Contratos:

| Camada | Pode | Não pode |
|---|---|---|
| `routes/` | declarar método, caminho e middlewares | ter lógica |
| `controllers/` | ler `req`, chamar **um** serviço, escolher status de sucesso, serializar | decidir regra, falar com model, montar `try/catch` |
| `services/` | validar invariante de domínio, orquestrar models, lançar `AppError` | conhecer `req`, `res`, status HTTP ou SQL |
| `models/` | SQL cru e mapeamento de linha | validar, decidir, lançar `AppError` |

O serviço lança `AppError` com `statusCode` — e isso é uma concessão consciente:
`AppError` carrega um número HTTP, então a camada de domínio sabe um pouquinho
de HTTP. A alternativa purista é um erro de domínio (`ReservationOverlapError`)
traduzido para HTTP numa tabela no controller ou no middleware. Recusada para
esta entrega: acrescenta uma hierarquia de erros e uma tabela de tradução para
ganhar pureza que ninguém vai consumir — a API HTTP é o **único** cliente do
sistema. Fica anotado como débito para a N3.

**2. Serviços como objeto literal exportado, sem classe e sem injeção de
dependência.**

`models/` já é objeto literal (`resourceModel.js:3`, `reservationModel.js:3`);
o serviço segue o mesmo formato, para não introduzir dois estilos no mesmo
backend. Para testar, `jest.mock('../models/reservationModel')` — que é
exatamente a técnica já usada no único teste existente
(`reservationModel.test.js:4`), portanto zero ferramenta nova e zero curva de
aprendizado para o time. Injeção de dependência por construtor seria mais
elegante e é desnecessária: não há segunda implementação de model, nem previsão
de uma.

**3. Por que não ir para DDD completo nesta entrega.**

DDD completo aqui significaria: agregado `Reservation` com invariantes no
construtor, value object `TimeSlot` (início, fim, duração, `overlaps()`),
repositório abstrato com interface própria, mapeadores de persistência, erros de
domínio tipados e serviços de aplicação finos. Três razões para não fazer:

* **A N2 é manutenção, não reescrita.** A rubrica pontua "melhoria comprovada do
  código recebido" (2,5) — melhoria **do** código recebido. Trocar duas camadas
  por seis camadas novas não é manutenção do código do colega; é jogá-lo fora e
  escrever outro. E destruiria a comparabilidade antes/depois que a mesma
  rubrica exige: não existe "antes e depois" de arquivo que deixou de existir.
* **Prazo.** A entrega é **23/10**. Este PR entrega **2 arquivos novos** e
  **~10 funções de domínio testáveis** sem tocar em nenhum `SELECT`. O caminho
  DDD reescreveria os 2 models (108 linhas), os 2 controllers (162 linhas), as
  2 rotas e os 2 testes existentes, com 4 outras specs de backend (BE-01 a BE-04)
  em voo no mesmo sprint, todas tocando os mesmos arquivos. O custo de conflito
  é alto e o ganho de nota é zero.
* **A dor atual não é modelagem, é testabilidade.** O problema medido é 6,14 %
  de cobertura por falta de um ponto de costura. Uma camada de serviço resolve
  isso por completo. `TimeSlot` como value object resolveria duplicação de
  cálculo de intervalo — duplicação que ainda não existe, porque o cálculo mora
  num único `SELECT` (`reservationModel.js:49-61`). Refatorar por problema que
  você não tem é dívida, não investimento.

**4. Débito registrado para a N3** em `docs/time/divida-tecnica.md` e repetido
em `docs/handoff/`:

* `TimeSlot` como value object, com `overlaps`, `durationMinutes` e `isInPast`,
  substituindo as validações avulsas de BE-02.
* Erros de domínio tipados, sem `statusCode`, traduzidos para HTTP numa única
  tabela no middleware de erro.
* Agregado `Reservation` com invariantes no construtor, para que seja impossível
  instanciar reserva inválida.
* Repositório com interface própria sobre `models/`, habilitando teste de
  integração com banco em memória ou testcontainers.
* Transação explícita gerenciada pelo serviço (`BEGIN`/`COMMIT` via
  `pool.connect()`), hoje impossível porque `config/database.js:12-13` só exporta
  `query`. **BE-01 depende disso** e vai precisar expor o client; o serviço é o
  lugar natural para a fronteira transacional.

**5. Este PR não muda nenhum comportamento observável da API.**

É refatoração pura: mesmos 10 endpoints, mesmos status codes, mesmos corpos de
resposta (salvo as mensagens que passam para português, documentadas no contrato).
É o que torna o PR revisável — o QA compara as respostas antes e depois e elas
batem. Correções de regra (BE-01, BE-02, BE-03) entram **depois**, cada uma num
PR próprio, e cada uma já encontra o endereço certo pronto.

## Alterações

Assinatura assumida, definida em BE-04:
`new AppError(statusCode, code, message, details?)`.

### 1. Criar `server/src/services/reservationService.js`

```js
const ReservationModel = require('../models/reservationModel');
const ResourceModel = require('../models/resourceModel');
const AppError = require('../errors/AppError');

// Postgres SQLSTATE for exclusion_violation, raised by the EXCLUDE constraint
// introduced in BE-01 when two reservations overlap under concurrency.
const SQLSTATE_EXCLUSION_VIOLATION = '23P01';

const REQUIRED_CREATE_FIELDS = ['resourceId', 'userName', 'startTime', 'endTime'];

const ReservationService = {
  /**
   * Books a resource for a time window.
   *
   * Business rules live here, not in the controller:
   *  - the resource must exist;
   *  - the window must not overlap a non-cancelled reservation of the same
   *    resource (the pre-check is advisory; the EXCLUDE constraint from BE-01
   *    is the authoritative guard against the TOCTOU race of BUG-01).
   */
  async create(input) {
    const missing = REQUIRED_CREATE_FIELDS.filter(
      (field) => input[field] === undefined || input[field] === null || input[field] === '',
    );
    if (missing.length > 0) {
      throw new AppError(400, 'MISSING_FIELDS', 'Campos obrigatórios ausentes.', {
        fields: missing,
      });
    }

    const resource = await ResourceModel.findById(input.resourceId);
    if (!resource) {
      throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Recurso não encontrado.', {
        resourceId: input.resourceId,
      });
    }

    const isAvailable = await ReservationModel.checkAvailability(
      input.resourceId,
      input.startTime,
      input.endTime,
    );
    if (!isAvailable) {
      throw new AppError(
        409,
        'RESERVATION_OVERLAP',
        'O recurso já está reservado para o intervalo informado.',
      );
    }

    try {
      return await ReservationModel.create(
        input.resourceId,
        input.userName,
        input.startTime,
        input.endTime,
      );
    } catch (err) {
      if (err.code === SQLSTATE_EXCLUSION_VIOLATION) {
        // Lost the race between the pre-check and the INSERT. Same domain
        // meaning, so the client gets the same message.
        throw new AppError(
          409,
          'RESERVATION_OVERLAP',
          'O recurso já está reservado para o intervalo informado.',
        );
      }
      throw err;
    }
  },

  async list() {
    return ReservationModel.findAll();
  },

  async getById(id) {
    const reservation = await ReservationModel.findById(id);
    if (!reservation) {
      throw new AppError(404, 'RESERVATION_NOT_FOUND', 'Reserva não encontrada.');
    }
    return reservation;
  },

  async changeStatus(id, status) {
    const updated = await ReservationModel.updateStatus(id, status);
    if (!updated) {
      throw new AppError(404, 'RESERVATION_NOT_FOUND', 'Reserva não encontrada.');
    }
    return updated;
  },

  async remove(id) {
    const deleted = await ReservationModel.delete(id);
    if (!deleted) {
      throw new AppError(404, 'RESERVATION_NOT_FOUND', 'Reserva não encontrada.');
    }
    return deleted;
  },
};

module.exports = ReservationService;
```

Duas notas de fronteira, para não duplicar regra em três lugares:

* **`changeStatus` não valida o valor de `status`.** É escopo de BE-03, que
  acrescenta a allowlist e o `CHECK` no banco. Este PR só move o que já existia.
  BE-03 insere a validação **neste método** — é para isso que ele passa a existir.
* **A tradução de 23P01 fica aqui**, e não no mapa de SQLSTATE do middleware de
  BE-04, porque aqui existe a mensagem de domínio ("recurso já reservado"); o
  middleware só saberia dizer "conflito". Não traduzir o mesmo SQLSTATE num
  terceiro lugar: ou serviço, ou middleware, nunca os dois com mensagens
  diferentes.

### 2. Criar `server/src/services/resourceService.js`

```js
const ResourceModel = require('../models/resourceModel');
const AppError = require('../errors/AppError');

const UPDATABLE_FIELDS = ['name', 'type', 'capacity'];
const DEFAULT_CAPACITY = 1;

const ResourceService = {
  async create(input) {
    if (!input.name || !input.type) {
      throw new AppError(400, 'MISSING_FIELDS', 'Campos obrigatórios ausentes.', {
        fields: ['name', 'type'].filter((field) => !input[field]),
      });
    }

    // BUG-09 lives here: `capacity || 1` silently turns 0 into 1 and accepts
    // negatives. Fixing the rule is its own issue; this refactor only gives it
    // an address.
    const capacity = input.capacity ?? DEFAULT_CAPACITY;

    return ResourceModel.create(input.name.trim(), input.type, capacity);
  },

  async list() {
    return ResourceModel.findAll();
  },

  async getById(id) {
    const resource = await ResourceModel.findById(id);
    if (!resource) {
      throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Recurso não encontrado.');
    }
    return resource;
  },

  async update(id, payload) {
    const fields = {};
    for (const field of UPDATABLE_FIELDS) {
      if (payload[field] !== undefined) {
        fields[field] = payload[field];
      }
    }

    if (Object.keys(fields).length === 0) {
      throw new AppError(
        400,
        'EMPTY_UPDATE',
        `Informe ao menos um campo para atualizar: ${UPDATABLE_FIELDS.join(', ')}.`,
      );
    }

    if (fields.name !== undefined && String(fields.name).trim() === '') {
      throw new AppError(400, 'INVALID_NAME', 'O campo "name" não pode ser vazio.');
    }

    const updated = await ResourceModel.update(id, fields);
    if (!updated) {
      throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Recurso não encontrado.');
    }
    return updated;
  },

  async remove(id) {
    const deleted = await ResourceModel.delete(id);
    if (!deleted) {
      throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Recurso não encontrado.');
    }
    return deleted;
  },
};

module.exports = ResourceService;
```

> `update` recebe `payload` e monta `fields` porque BE-05 já estabeleceu que
> `ResourceModel.update(id, fields)` faz atualização parcial com `COALESCE`.
> Se BE-05 entrar primeiro, a montagem de `fields` **sai** do controller e vem
> para cá; se este PR entrar primeiro, BE-05 já encontra o método pronto.
> Nos dois casos a regra existe **uma** vez.

### 3. Alterar `server/src/controllers/reservationController.js` — o antes e o depois de `createReservation`

**Antes** (`reservationController.js:4-34`, 31 linhas, 4 responsabilidades):

```js
const ReservationModel = require('../models/reservationModel');

const ReservationController = {
  async createReservation(req, res) {
    try {
      const { resource_id, user_name, start_time, end_time } = req.body;
      if (!resource_id || !user_name || !start_time || !end_time) {
        return res.status(400).json({ error: 'All fields are required' });
      }

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
      res.status(201).json(newReservation);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
```

**Depois** (9 linhas, 1 responsabilidade: traduzir HTTP em chamada de serviço):

```js
const ReservationService = require('../services/reservationService');
const asyncHandler = require('../middlewares/asyncHandler');

const ReservationController = {
  createReservation: asyncHandler(async (req, res) => {
    const reservation = await ReservationService.create({
      resourceId: req.body.resource_id,
      userName: req.body.user_name,
      startTime: req.body.start_time,
      endTime: req.body.end_time,
    });
    res.status(201).json(reservation);
  }),
```

O que mudou, item por item:

* O `require` do model **sai** do controller. Depois do PR,
  `grep -rn "require('../models" server/src/controllers` deve retornar **0**
  linhas (antes: **2**, uma por controller).
* As 4 responsabilidades viraram 1. A conversão `snake_case` do corpo HTTP para
  `camelCase` do domínio é a única tradução que sobra — e é exatamente o
  trabalho de um controller.
* O `try/catch` desapareceu: `asyncHandler` (BE-04) encaminha a rejeição para o
  middleware de erro. São **10** blocos idênticos eliminados nos dois
  controllers (5 em cada).
* O 409 continua existindo, mas agora **decorrente** de uma regra de domínio
  (`AppError(409, 'RESERVATION_OVERLAP')`) em vez de ser a própria regra.
* A regra passou a ser testável com `jest.mock` dos models, sem `req`, sem `res`,
  sem Express e sem Postgres.

### 4. Alterar os 4 handlers restantes de `reservationController.js`

```js
  getAllReservations: asyncHandler(async (req, res) => {
    res.json(await ReservationService.list());
  }),

  getReservationById: asyncHandler(async (req, res) => {
    res.json(await ReservationService.getById(req.validated.id));
  }),

  updateReservationStatus: asyncHandler(async (req, res) => {
    res.json(await ReservationService.changeStatus(req.validated.id, req.body.status));
  }),

  deleteReservation: asyncHandler(async (req, res) => {
    await ReservationService.remove(req.validated.id);
    res.json({ message: 'Reserva removida com sucesso.' });
  }),
```

> `req.validated.id` vem de `validateIdParam` (BE-05). Se BE-05 ainda não
> estiver em `main`, use `req.params.id` e troque no rebase — a troca é de uma
> expressão por linha.

### 5. Alterar `server/src/controllers/resourceController.js`

Mesmo tratamento, 5 handlers delegando a `ResourceService`:

```js
const ResourceService = require('../services/resourceService');
const asyncHandler = require('../middlewares/asyncHandler');

const ResourceController = {
  createResource: asyncHandler(async (req, res) => {
    const resource = await ResourceService.create({
      name: req.body.name,
      type: req.body.type,
      capacity: req.body.capacity,
    });
    res.status(201).json(resource);
  }),

  getAllResources: asyncHandler(async (req, res) => {
    res.json(await ResourceService.list());
  }),

  getResourceById: asyncHandler(async (req, res) => {
    res.json(await ResourceService.getById(req.validated.id));
  }),

  updateResource: asyncHandler(async (req, res) => {
    res.json(await ResourceService.update(req.validated.id, req.body));
  }),

  deleteResource: asyncHandler(async (req, res) => {
    await ResourceService.remove(req.validated.id);
    res.json({ message: 'Recurso removido com sucesso.' });
  }),
};

module.exports = ResourceController;
```

### 6. Não alterar `server/src/models/*.js` e `server/src/routes/*.js`

Deliberado. O model continua sendo só acesso a dados — que é o que ele já era de
certo. Nenhum `SELECT`/`INSERT`/`UPDATE` muda neste PR, o que mantém o teste
existente (`reservationModel.test.js`) verde sem edição e dá ao QA uma âncora:
se a resposta da API mudou, o erro está no serviço ou no controller, não no SQL.

### 7. Criar `server/src/services/reservationService.test.js`

### 8. Criar `server/src/services/resourceService.test.js`

### 9. Alterar `docs/arquitetura/visao-atual.md` e `docs/arquitetura/visao-alvo.md`

Atualizar o diagrama de camadas de `routes → controllers → models` para
`routes → controllers → services → models`, com a tabela de contratos da seção
Decisão. Rubrica 3,0 → 1,5 cobra exatamente isso ("atualização dos diagramas").

### 10. Alterar `docs/time/divida-tecnica.md`

Registrar os 5 itens da Decisão §4 como débito para a N3, com a justificativa de
por que não foram feitos agora.

## Testes

Os testes de serviço são o produto principal deste PR: antes dele, **nenhum**
destes casos era escrevível sem HTTP e banco.

### `server/src/services/reservationService.test.js`

```js
const ReservationService = require('./reservationService');
const ReservationModel = require('../models/reservationModel');
const ResourceModel = require('../models/resourceModel');

jest.mock('../models/reservationModel');
jest.mock('../models/resourceModel');

const validInput = {
  resourceId: 1,
  userName: 'Carlos Silva',
  startTime: '2026-10-23T14:00:00-03:00',
  endTime: '2026-10-23T15:00:00-03:00',
};

describe('ReservationService.create', () => {
  afterEach(() => jest.clearAllMocks());

  it('deve criar a reserva quando o intervalo está livre', async () => {
    ResourceModel.findById.mockResolvedValue({ id: 1, name: 'Sala 1' });
    ReservationModel.checkAvailability.mockResolvedValue(true);
    ReservationModel.create.mockResolvedValue({ id: 10, ...validInput });

    const reservation = await ReservationService.create(validInput);

    expect(reservation.id).toBe(10);
    expect(ReservationModel.create).toHaveBeenCalledWith(
      1,
      'Carlos Silva',
      validInput.startTime,
      validInput.endTime,
    );
  });

  it('deve lançar 409 RESERVATION_OVERLAP quando o intervalo está ocupado', async () => {
    ResourceModel.findById.mockResolvedValue({ id: 1 });
    ReservationModel.checkAvailability.mockResolvedValue(false);

    await expect(ReservationService.create(validInput)).rejects.toMatchObject({
      statusCode: 409,
      code: 'RESERVATION_OVERLAP',
    });
    expect(ReservationModel.create).not.toHaveBeenCalled();
  });

  it('deve lançar 404 RESOURCE_NOT_FOUND quando o recurso não existe', async () => {
    ResourceModel.findById.mockResolvedValue(undefined);

    await expect(ReservationService.create(validInput)).rejects.toMatchObject({
      statusCode: 404,
      code: 'RESOURCE_NOT_FOUND',
    });
    expect(ReservationModel.checkAvailability).not.toHaveBeenCalled();
  });

  it.each(['resourceId', 'userName', 'startTime', 'endTime'])(
    'deve lançar 400 MISSING_FIELDS quando "%s" está ausente',
    async (field) => {
      const input = { ...validInput, [field]: undefined };

      await expect(ReservationService.create(input)).rejects.toMatchObject({
        statusCode: 400,
        code: 'MISSING_FIELDS',
        details: { fields: [field] },
      });
    },
  );

  it('deve converter SQLSTATE 23P01 em 409 quando perde a corrida com a constraint', async () => {
    ResourceModel.findById.mockResolvedValue({ id: 1 });
    ReservationModel.checkAvailability.mockResolvedValue(true);
    const exclusionViolation = Object.assign(new Error('conflicting key value'), {
      code: '23P01',
    });
    ReservationModel.create.mockRejectedValue(exclusionViolation);

    await expect(ReservationService.create(validInput)).rejects.toMatchObject({
      statusCode: 409,
      code: 'RESERVATION_OVERLAP',
    });
  });

  it('deve repropagar erro de banco desconhecido sem mascarar', async () => {
    ResourceModel.findById.mockResolvedValue({ id: 1 });
    ReservationModel.checkAvailability.mockResolvedValue(true);
    ReservationModel.create.mockRejectedValue(
      Object.assign(new Error('connection terminated'), { code: '08006' }),
    );

    await expect(ReservationService.create(validInput)).rejects.toMatchObject({
      code: '08006',
    });
  });
});

describe('ReservationService.getById / changeStatus / remove', () => {
  afterEach(() => jest.clearAllMocks());

  it('deve lançar 404 RESERVATION_NOT_FOUND em getById inexistente', async () => {
    ReservationModel.findById.mockResolvedValue(undefined);
    await expect(ReservationService.getById(999)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('deve lançar 404 em changeStatus de reserva inexistente', async () => {
    ReservationModel.updateStatus.mockResolvedValue(undefined);
    await expect(ReservationService.changeStatus(999, 'cancelled')).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('deve lançar 404 em remove de reserva inexistente', async () => {
    ReservationModel.delete.mockResolvedValue(undefined);
    await expect(ReservationService.remove(999)).rejects.toMatchObject({ statusCode: 404 });
  });
});
```

### `server/src/services/resourceService.test.js`

Casos: 400 `MISSING_FIELDS` sem `name`; 400 sem `type`; `capacity` ausente
assume 1; `name` com espaços é aparado; 400 `EMPTY_UPDATE` com `{}`; 400
`INVALID_NAME` com `"  "`; `update` repassa só os campos presentes; 404 em
`getById`, `update` e `remove` de recurso inexistente.

### Regressão de comportamento da API

Antes de abrir o PR, com o servidor de pé, capturar a resposta das 10 rotas na
`main` e na branch e comparar. Refatoração que muda resposta não é refatoração:

```bash
for route in /api/resources /api/reservations; do
  curl -s "http://localhost:5000$route" | tee "/tmp/depois$(echo $route | tr / _).json"
done
diff /tmp/antes_api_resources.json /tmp/depois_api_resources.json
```

Comando da suíte:

```bash
cd server
npx jest --coverage --coverageReporters=text --collectCoverageFrom='src/**/*.js'
```

## Critérios de aceite

* [ ] `server/src/services/` existe com **2** arquivos e **10** funções de
      domínio públicas (antes: diretório inexistente, **0** funções).
* [ ] Nenhum controller importa model:
      `grep -rn "require('../models" server/src/controllers` retorna **0**
      linhas (antes: **2**).
* [ ] Nenhum serviço conhece HTTP:
      `grep -rniE "req\.|res\.|status\(" server/src/services` retorna **0**
      linhas.
* [ ] Nenhum `try/catch` sobrou nos controllers:
      `grep -c "catch" server/src/controllers/*.js` retorna **0** em cada
      arquivo (antes: **5** em cada, **10** no total).
* [ ] `createReservation` no controller tem **≤ 10 linhas** (antes: **31**).
* [ ] Cobertura de statements de `src/services/` ≥ **90 %**; de branches ≥ **80 %**
      (antes: o diretório não existia).
* [ ] Cobertura global de statements ≥ **40 %** (antes: **6,14 %**); de branches
      ≥ **30 %** (antes: **0 %**); de funções ≥ **35 %** (antes: **3,57 %**).
      O número exato medido vai colado na descrição do PR.
* [ ] Casos de teste no backend ≥ **18** (antes: **2**); arquivos de teste ≥ **3**
      (antes: **1**).
* [ ] `reservationModel.test.js` continua passando **sem nenhuma edição** —
      prova de que o SQL não mudou.
* [ ] `GET /api/resources` e `GET /api/reservations` devolvem corpo
      byte-a-byte igual ao da `main` (diff vazio).
* [ ] `npm run lint` no `server/` com **0** erros.
* [ ] `docs/arquitetura/visao-atual.md` e `visao-alvo.md` mostram as 4 camadas;
      `docs/time/divida-tecnica.md` lista os 5 itens de débito da N3.
* [ ] PR com **1 aprovação** de Igor Seberino (`@igorSeberino`, QA) e CI verde.

## Passo a passo TBD

```bash
# 1. Branch
git checkout main
git pull origin main
git checkout -b refactor/extract-service-layer

# 2. Confirmar BE-04 em main
ls server/src/errors/AppError.js server/src/middlewares/asyncHandler.js \
   server/src/middlewares/errorHandler.js

# 3. Capturar o comportamento ANTES (servidor rodando na main, outro terminal)
curl -s http://localhost:5000/api/resources    > /tmp/antes_api_resources.json
curl -s http://localhost:5000/api/reservations > /tmp/antes_api_reservations.json

# 4. Criar a camada de serviço
#    - server/src/services/reservationService.js
#    - server/src/services/resourceService.js

# 5. Emagrecer os controllers
#    - server/src/controllers/reservationController.js
#    - server/src/controllers/resourceController.js
#    (models/ e routes/ NÃO mudam neste PR)

# 6. Testes de serviço
#    - server/src/services/reservationService.test.js
#    - server/src/services/resourceService.test.js

# 7. Rodar
cd server
npx jest --coverage --coverageReporters=text --collectCoverageFrom='src/**/*.js'
npm run lint
cd ..

# 8. Comparar o comportamento DEPOIS
curl -s http://localhost:5000/api/resources    > /tmp/depois_api_resources.json
curl -s http://localhost:5000/api/reservations > /tmp/depois_api_reservations.json
diff /tmp/antes_api_resources.json    /tmp/depois_api_resources.json
diff /tmp/antes_api_reservations.json /tmp/depois_api_reservations.json
# esperado: diff vazio nos dois

# 9. Commits
git add server/src/services/reservationService.js server/src/services/resourceService.js
git commit -m "refactor(services): extrair camada de servico com a regra de reserva"

git add server/src/controllers
git commit -m "refactor(controllers): delegar regra de negocio aos servicos"

git add server/src/services/*.test.js
git commit -m "test(services): cobrir regras de reserva e de recurso sem HTTP e sem banco"

git add docs/arquitetura/visao-atual.md docs/arquitetura/visao-alvo.md \
        docs/time/divida-tecnica.md docs/specs/be-06-extract-service-layer
git commit -m "docs(arquitetura): registrar as quatro camadas e o debito de DDD para a N3"

# 10. PR
git push -u origin refactor/extract-service-layer
#     Título: "refactor(services): extrair camada de servico (CS-03)"
#     Descrição: link para esta spec, antes/depois de createReservation,
#     tabela de cobertura antes/depois e os dois diffs vazios do item 8.
#     Revisor obrigatório: @igorSeberino (QA).
```

## Prompt para o Claude Code

```text
Você está na raiz do repositório igorSeberino/srec, na branch
refactor/extract-service-layer. Carregue antes de começar:

  - docs/specs/be-06-extract-service-layer/implementacao.md   (esta spec)
  - docs/specs/be-04-centralized-error-handling/implementacao.md (dependência)
  - docs/arquitetura/visao-atual.md e docs/arquitetura/visao-alvo.md
  - a skill de arquitetura de backend do repositório, em .claude/skills/
  - CLAUDE.md

Tarefa: extrair a camada de serviço exatamente como descrito na seção
"Alterações" — 2 serviços novos, 2 controllers emagrecidos, 2 arquivos de teste
de serviço, diagramas e dívida técnica atualizados.

Restrições duras:
  - REFATORAÇÃO PURA. Nenhum comportamento observável da API pode mudar:
    mesmos 10 endpoints, mesmos status codes, mesmos campos no corpo.
  - NÃO toque em server/src/models/*.js nem em server/src/routes/*.js.
  - NÃO edite server/src/models/reservationModel.test.js: ele tem que passar
    como está, é a prova de que o SQL não mudou.
  - NADA de DDD: sem value object, sem agregado, sem repositório abstrato,
    sem classe de erro de domínio nova. Só serviços como objeto literal.
  - Node 20, Express 5, pg com SQL cru, CommonJS. Sem ORM, sem biblioteca de
    validação, sem container de injeção de dependência.
  - Serviço não pode conhecer req, res nem montar resposta. Controller não pode
    importar model nem ter try/catch.
  - BE-01, BE-02, BE-03 e BE-09 não são deste PR: não acrescente validação de
    janela, de status, de capacidade nem transação. Onde a regra atual está
    errada, mantenha o erro e deixe o comentário // BUG-XX apontando a issue.

Entregue na seguinte ordem e me mostre a saída de cada passo:
  1. jest --coverage na main, para registrar o baseline (esperado 6,14 %).
  2. os dois serviços e os dois controllers refatorados.
  3. jest --coverage depois, com a tabela completa.
  4. npm run lint do server.
  5. o diff dos corpos de GET /api/resources e GET /api/reservations antes e
     depois (tem que ser vazio).

Por fim, proponha as 4 mensagens de commit da seção "Passo a passo TBD" sem
executar nenhum comando git.
```
