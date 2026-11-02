# FE-02 — Camada de API única e configuração por ambiente

* **Responsável:** Renato Colin Neto (Desenvolvedor Frontend)
* **Issue:** #<a definir>
* **Branch:** `refactor/api-layer-and-env-config`
* **Rubrica:** 2,5 — Melhoria comprovada do código recebido (CS-07, MÉDIO); 1,5 — Clareza nas alterações feitas, para a N3
* **Depende de:** FE-01 (apenas para evitar conflito de merge — o contrato público do objeto `api` não muda); BE-07 (contrato de horário ISO 8601 com offset)

## Problema

### 1. URL do backend cravada no código

`client/src/services/api.js:1`:

```js
const API_BASE_URL = 'http://localhost:5000/api';
```

É a **primeira linha do arquivo** e é a única fonte de verdade do endereço do
backend. Consequências diretas:

* Apontar o frontend para qualquer coisa que não seja `localhost:5000` exige
  **editar código-fonte e recompilar**. Não há `.env`, não há `.env.example`,
  não há leitura de `import.meta.env` em lugar nenhum do client —
  `grep -rn "import.meta.env" client/src/` retorna zero linhas.
* `client/vite.config.js` tem 7 linhas e nenhum `define`, nenhum `envPrefix`,
  nenhum `server.proxy`. Não existe caminho alternativo de configuração.
* O grupo da N3, que vai receber este pacote, não consegue subir o client
  contra um backend em container, em outra porta ou em um ambiente de
  homologação sem fazer commit de alteração de código.
* Combinado com a ausência de Dockerfile/docker-compose (métrica da auditoria:
  **nenhum**), o onboarding de qualquer pessoa nova depende de o backend estar
  exatamente em `http://localhost:5000`.

### 2. Tratamento de erro inconsistente entre os 8 métodos

`api.js` tem 82 linhas e 8 métodos. Cada um reimplementa fetch, cabeçalho,
checagem de `res.ok` e parse — e **em dois dialetos diferentes**:

| Método | Linha do `throw` | O que faz com o erro do servidor |
|---|---|---|
| `getResources` | 7 | descarta: `throw new Error('Falha ao carregar recursos')` |
| `createResource` | 17-20 | lê `err.error` do corpo |
| `updateResource` | 30-33 | lê `err.error` do corpo |
| `deleteResource` | 41 | descarta: `'Erro ao deletar recurso'` |
| `getReservations` | 48 | descarta: `'Falha ao carregar reservas'` |
| `createReservation` | 58-61 | lê `err.error` do corpo |
| `updateReservationStatus` | 71 | descarta: `'Erro ao atualizar status'` |
| `deleteReservation` | 79 | descarta: `'Erro ao cancelar reserva'` |

**3 de 8 métodos** leem `err.error`; **5 de 8** jogam a mensagem do servidor no
lixo. O caso que mais dói é `updateReservationStatus` (linha 71): o backend
devolve `400` com uma mensagem específica, e o usuário lê "Erro ao atualizar
status". O mesmo para `deleteResource` (linha 41) — o backend pode devolver
`404 Resource not found` e a tela diz "Erro ao deletar recurso".

Problemas estruturais que vêm de brinde:

* **Nenhum método expõe o `status` HTTP.** `App.jsx` só recebe
  `err.message` (linhas 47, 72, 83, 102, 112, 123) e não tem como distinguir
  "404, o recurso sumiu, recarregue a lista" de "409, horário ocupado" de
  "500, servidor caiu". Isso bloqueia a FE-03 e a FE-05, que precisam reagir
  diferente por status.
* **`await res.json()` sem proteção.** Se o backend responder `500` com um
  corpo HTML (o default do Express para erro não tratado) ou corpo vazio, o
  `res.json()` da linha 18/31/59 lança `SyntaxError: Unexpected token '<'` e o
  usuário vê isso na barra de feedback em vez da mensagem de erro.
* **`deleteResource` e `deleteReservation` chamam `res.json()`** (linhas 42 e
  80) presumindo corpo JSON. Hoje funciona por acidente — o backend devolve
  `{ message: ... }` em `resourceController.js:64`. Um `204 No Content` quebra
  a chamada.
* **Zero `Accept` header** e zero `AbortSignal`: nenhuma requisição é
  cancelável nem tem timeout.
* **8 duplicações** do bloco `fetch` + `if (!res.ok)` + `return res.json()`:
  é o CS-02 (Duplicated Code) na sua versão frontend, espelhando os 10
  `try/catch` idênticos dos controllers.

### 3. O horário sai do navegador sem fuso (metade cliente do BUG-07)

`App.jsx:263-269` e `:273-279` usam `<input type="datetime-local">`, cujo
`value` é uma string **sem offset**, do tipo `2026-10-21T14:00`. Ela é enviada
crua no corpo do POST (`App.jsx:93-94`) e gravada numa coluna `TIMESTAMP`
(sem fuso, `initDb.js:18-19`). Depois, na leitura, `App.jsx:303-304` faz
`new Date(rev.start_time).toLocaleString('pt-BR')` — e aí o `pg` devolve
`2026-10-21T14:00:00.000Z` para um horário que o usuário digitou como 14:00
**local**, deslocando a reserva em 3 horas no fuso de Santa Catarina.

A correção do lado do banco é a **BE-07** (`timestamptz`). O lado do cliente —
emitir ISO 8601 **com offset** — é o que entra aqui, porque é a camada de API
que define o formato do que sai.

## Evidência

```bash
cd client

# 1. A URL cravada, e o fato de ser a única configuração que existe
grep -rn "localhost" src/           # => src/services/api.js:1
grep -rn "import.meta.env" src/     # => 0 linhas
ls -a | grep -E '^\.env'            # => nada
grep -rn "define\|envPrefix\|proxy" vite.config.js  # => 0 linhas

# 2. A inconsistência de erro, contada
grep -c "await fetch" src/services/api.js          # => 8
grep -c "err.error" src/services/api.js            # => 3
grep -c "throw new Error" src/services/api.js      # => 8
grep -c "'Content-Type'" src/services/api.js       # => 4

# 3. Reproduzir o erro mascarado (com o servidor rodando)
curl -i -X PATCH http://localhost:5000/api/reservations/99999/status \
  -H 'Content-Type: application/json' -d '{"status":"completed"}'
# o corpo tem a mensagem do servidor; a tela mostra "Erro ao atualizar status"
```

| Métrica | Baseline medido |
|---|---|
| `api.js` | **82 linhas**, 8 métodos |
| Chamadas `fetch` duplicadas | **8** |
| Blocos de tratamento de erro | **8** (dois dialetos) |
| Métodos que repassam a mensagem do servidor | **3 de 8 (37,5 %)** |
| Métodos que expõem o `status` HTTP | **0 de 8** |
| URLs de backend cravadas no fonte | **1** |
| Variáveis de ambiente lidas pelo client | **0** |
| Arquivos `.env*` no client | **0** |
| Requisições com `Accept` header | **0 de 8** |
| Requisições canceláveis (`AbortSignal`) | **0 de 8** |
| Pontos que enviam horário sem offset | **2** (`App.jsx:263`, `:273`) |
| Build | **201,86 kB** (63,26 kB gzip) |

## Decisão

**Um helper `request()` em `services/http.js`, `ApiError` como tipo de erro, e
`import.meta.env.VITE_API_BASE_URL` com fallback para o valor atual.**

Sobre a configuração: a alternativa óbvia era `vite.config.js` com
`server.proxy` apontando `/api` para `localhost:5000`. Recusada porque `proxy`
só existe no **dev server** — o `npm run build` gera um bundle que continuaria
sem saber para onde apontar, e o SREC é entregue como artefato de build para o
grupo da N3. `import.meta.env.VITE_*` é substituído em tempo de build pelo
Vite, funciona em dev e em produção, e é o mecanismo nativo do Vite 8 (zero
dependência nova).

Sobre o **fallback**: `VITE_API_BASE_URL` tem default
`'http://localhost:5000/api'` — exatamente o valor da linha 1 de hoje. Isso é
deliberado: quem clonar o repositório e rodar `npm run dev` sem criar `.env`
tem o mesmo comportamento de antes. A spec não pode quebrar o onboarding que a
rubrica cobra em "o grupo conseguiu subir o sistema do colega".

Sobre o erro: a alternativa óbvia era manter `Error` e só padronizar a
mensagem. Recusada porque **FE-03 e FE-05 precisam do `status`** — FE-03 para
distinguir validação (400) de conflito (409, depois da BE-02/BE-01) e FE-05
para tratar 404 ao editar um recurso que outro usuário já apagou. `ApiError
extends Error` carrega `status`, `body` e a mensagem do servidor, continua
funcionando em todo `catch (err) { ...err.message }` existente (nenhum chamador
precisa mudar) e custa 12 linhas.

Sobre **não** introduzir cliente HTTP: Axios resolveria interceptors e parse
automático, mas adiciona ~13 kB gzip e um segundo modelo de erro ao projeto. O
sistema tem 8 chamadas; `fetch` nativo com um helper de 30 linhas cobre tudo.
Zero dependência de produção adicionada nesta spec — o bundle não deve mudar
além do ruído de minificação.

Sobre o horário: `src/lib/datetime.js` com `localInputToIso()` converte o
`value` do `datetime-local` para ISO 8601 com offset (`2026-10-21T14:00:00-03:00`)
**no ponto de saída**, e `isoToLocalInput()` faz o caminho de volta para quando
a FE-05 precisar preencher um formulário de edição. O contrato é o definido na
**BE-07**; esta spec implementa o lado do cliente. A conversão é aplicada
dentro de `api.createReservation`, não no componente, porque é exatamente a
responsabilidade de uma camada de API: traduzir o formato da interface para o
formato do contrato.

> **Ordem de merge com a BE-07:** a função é aditiva e segura nos dois estados.
> Com o banco ainda em `TIMESTAMP`, o Postgres descarta o offset e o
> comportamento fica idêntico ao de hoje (o BUG-07 segue aberto). Quando a
> BE-07 migrar para `timestamptz`, o offset passa a ser respeitado e o BUG-07
> fecha **sem mais nenhuma alteração no cliente**. Por isso esta spec **não**
> declara o BUG-07 como resolvido — ela só entrega o lado do cliente do
> contrato, e a verificação fica no PR da BE-07.

## Alterações

```
client/
  .env.example                    (NOVO ~12 linhas)
  .gitignore                      (alterado: ignorar .env e .env.local)
  README.md                       (alterado: seção de configuração)
  src/
    config/env.js                 (NOVO ~14 linhas)
    services/
      http.js                     (NOVO ~58 linhas)
      api.js                      (reescrito: 82 → ~48 linhas)
      http.test.js                (NOVO ~72 linhas)
    lib/
      datetime.js                 (NOVO ~34 linhas)
      datetime.test.js            (NOVO ~38 linhas)
```

### `client/.env.example` (novo)

```dotenv
# Endereço base da API do SREC, incluindo o prefixo /api.
# Só variáveis com prefixo VITE_ chegam ao código do cliente (Vite 8).
# Copie este arquivo para .env e ajuste conforme o ambiente:
#   cp .env.example .env
#
# Desenvolvimento local (default se a variável não existir):
VITE_API_BASE_URL=http://localhost:5000/api
#
# Backend em container na mesma rede:
# VITE_API_BASE_URL=http://server:5000/api
#
# Homologação:
# VITE_API_BASE_URL=https://srec-hml.example.com/api

# Timeout de cada requisição, em milissegundos.
VITE_API_TIMEOUT_MS=10000
```

### `client/.gitignore` (alterado)

```gitignore
.env
.env.local
.env.*.local
```

`.env.example` **é versionado** — é a documentação executável da configuração,
e é o que o grupo da N3 vai ler primeiro.

### `client/src/config/env.js` (novo)

Um único ponto de leitura de `import.meta.env` em todo o client. Normaliza a
barra final para que `http://host/api` e `http://host/api/` produzam a mesma
URL — hoje essa diferença geraria `//resources`.

```js
const DEFAULT_API_BASE_URL = 'http://localhost:5000/api';
const DEFAULT_TIMEOUT_MS = 10000;

function stripTrailingSlash(value) {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

export const env = {
  apiBaseUrl: stripTrailingSlash(
    import.meta.env.VITE_API_BASE_URL?.trim() || DEFAULT_API_BASE_URL
  ),
  apiTimeoutMs: Number(import.meta.env.VITE_API_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
};
```

### `client/src/services/http.js` (novo)

```js
import { env } from '../config/env';

export class ApiError extends Error {
  constructor(message, { status, body, url } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status ?? 0;
    this.body = body ?? null;
    this.url = url ?? '';
  }

  get isNotFound() {
    return this.status === 404;
  }

  get isConflict() {
    return this.status === 409;
  }

  get isValidation() {
    return this.status === 400 || this.status === 422;
  }

  get isNetwork() {
    return this.status === 0;
  }
}

// Lê o corpo uma única vez e nunca lança: um 500 com HTML do Express
// não pode derrubar o tratamento de erro (hoje derruba, api.js:18/31/59).
async function readBody(response) {
  const raw = await response.text().catch(() => '');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return { error: raw.slice(0, 200) };
  }
}

function messageFrom(body, response) {
  return (
    body?.error ||
    body?.message ||
    `${response.status} ${response.statusText || 'Erro na requisição'}`
  );
}

export async function request(path, { method = 'GET', body, signal } = {}) {
  const url = `${env.apiBaseUrl}${path}`;
  const hasBody = body !== undefined;

  let response;
  try {
    response = await fetch(url, {
      method,
      signal: signal ?? AbortSignal.timeout(env.apiTimeoutMs),
      headers: {
        Accept: 'application/json',
        ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
      },
      body: hasBody ? JSON.stringify(body) : undefined,
    });
  } catch (cause) {
    throw new ApiError('Não foi possível falar com o servidor do SREC.', { url });
  }

  const payload = await readBody(response);
  if (!response.ok) {
    throw new ApiError(messageFrom(payload, response), {
      status: response.status,
      body: payload,
      url,
    });
  }
  return payload;
}
```

Pontos que isto resolve, um por um:

* 8 blocos de `fetch` → **1**;
* `Content-Type` só quando há corpo (hoje é enviado em 4 lugares e omitido
  nos `DELETE`, que não têm corpo — correto por acidente);
* `Accept: application/json` em **8 de 8** requisições (hoje: 0);
* timeout em 8 de 8 via `AbortSignal.timeout` (hoje: nenhum), com `signal`
  injetável para a FE-04 cancelar no cleanup do efeito;
* corpo vazio devolve `null` em vez de lançar — o `res.json()` dos `DELETE`
  (linhas 42 e 80) deixa de ser aposta;
* mensagem do servidor repassada em **8 de 8** métodos (hoje: 3).

### `client/src/lib/datetime.js` (novo)

```js
function pad(value) {
  return String(value).padStart(2, '0');
}

/**
 * Converte o value de um <input type="datetime-local"> ("2026-10-21T14:00")
 * para ISO 8601 com offset ("2026-10-21T14:00:00-03:00"), que é o contrato
 * definido na BE-07. Sem o offset, o horário local do usuário é gravado como
 * se fosse UTC (BUG-07).
 */
export function localInputToIso(localValue) {
  if (!localValue) return '';
  const date = new Date(localValue);
  if (Number.isNaN(date.getTime())) return '';

  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absolute = Math.abs(offsetMinutes);
  const offset = `${sign}${pad(Math.floor(absolute / 60))}:${pad(absolute % 60)}`;

  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}${offset}`
  );
}

/** Caminho inverso, para preencher formulário de edição (usado pela FE-05). */
export function isoToLocalInput(isoValue) {
  if (!isoValue) return '';
  const date = new Date(isoValue);
  if (Number.isNaN(date.getTime())) return '';
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}
```

### `client/src/services/api.js` (reescrito, 82 → ~48 linhas)

O **contrato público não muda**: o objeto exportado continua chamado `api` e
continua tendo os mesmos 8 métodos com as mesmas assinaturas. Nenhum chamador
(`hooks/useResources.js`, `hooks/useReservations.js` depois da FE-01) precisa
ser tocado.

```js
import { request } from './http';
import { localInputToIso } from '../lib/datetime';

export const api = {
  // Resources
  getResources(options) {
    return request('/resources', options);
  },

  getResource(id, options) {
    return request(`/resources/${id}`, options);
  },

  createResource(data) {
    return request('/resources', { method: 'POST', body: data });
  },

  updateResource(id, data) {
    return request(`/resources/${id}`, { method: 'PUT', body: data });
  },

  deleteResource(id) {
    return request(`/resources/${id}`, { method: 'DELETE' });
  },

  // Reservations
  getReservations(options) {
    return request('/reservations', options);
  },

  createReservation(data) {
    return request('/reservations', {
      method: 'POST',
      body: {
        ...data,
        // Contrato BE-07: horário sempre ISO 8601 com offset.
        start_time: localInputToIso(data.start_time),
        end_time: localInputToIso(data.end_time),
      },
    });
  },

  updateReservationStatus(id, status) {
    return request(`/reservations/${id}/status`, { method: 'PATCH', body: { status } });
  },

  deleteReservation(id) {
    return request(`/reservations/${id}`, { method: 'DELETE' });
  },
};
```

Ganho lateral: `getResource(id)` passa a existir. Dos 10 endpoints do backend,
`api.js` cobria **8** (faltavam `GET /api/resources/:id` e
`GET /api/reservations/:id`); agora cobre **9**. O `GET /api/reservations/:id`
fica de fora porque nenhuma tela o usa — endpoint órfão novo seria dívida nova,
e isso está registrado em `docs/arquitetura/contrato-api.md`.

### `client/README.md` (alterado)

Acrescentar, antes das instruções de `npm run dev`:

```markdown
## Configuração

O client lê o endereço do backend de `VITE_API_BASE_URL`. Sem `.env`, o valor
padrão é `http://localhost:5000/api`.

    cp .env.example .env
    # edite VITE_API_BASE_URL se o backend não estiver em localhost:5000

Variáveis são substituídas em **tempo de build**: alterar o `.env` exige
reiniciar o `npm run dev` ou refazer o `npm run build`.
```

## Testes

### `client/src/services/http.test.js` (novo) — o teste que falha antes

Os dois primeiros casos **falham contra o `api.js` recebido** e passam depois.

```js
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';
import { ApiError } from './http';

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function respond({ status = 200, body = null, text = null, ok = status < 400 }) {
  return Promise.resolve({
    ok,
    status,
    statusText: 'Erro',
    text: () => Promise.resolve(text ?? (body === null ? '' : JSON.stringify(body))),
  });
}

describe('camada de API', () => {
  // FALHA ANTES: api.js:71 descarta o corpo e lança 'Erro ao atualizar status'.
  it('repassa a mensagem do servidor no PATCH de status', async () => {
    fetch.mockReturnValue(respond({ status: 400, body: { error: 'status inválido' } }));
    await expect(api.updateReservationStatus(1, 'xpto')).rejects.toThrow('status inválido');
  });

  // FALHA ANTES: api.js:41 descarta o corpo e lança 'Erro ao deletar recurso'.
  it('repassa a mensagem do servidor no DELETE de recurso', async () => {
    fetch.mockReturnValue(respond({ status: 404, body: { error: 'Resource not found' } }));
    await expect(api.deleteResource(999)).rejects.toThrow('Resource not found');
  });

  it('expõe o status HTTP no ApiError', async () => {
    fetch.mockReturnValue(respond({ status: 404, body: { error: 'nao achei' } }));
    const error = await api.getResources().catch((err) => err);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(404);
    expect(error.isNotFound).toBe(true);
  });

  // FALHA ANTES: api.js:18 faz res.json() direto e estoura SyntaxError.
  it('não quebra quando o servidor responde HTML em vez de JSON', async () => {
    fetch.mockReturnValue(respond({ status: 500, text: '<!DOCTYPE html><h1>Error</h1>' }));
    const error = await api.createResource({ name: 'x', type: 'workstation' }).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.message).not.toMatch(/Unexpected token/);
  });

  it('transforma falha de rede em ApiError de status 0', async () => {
    fetch.mockRejectedValue(new TypeError('Failed to fetch'));
    const error = await api.getResources().catch((err) => err);
    expect(error.isNetwork).toBe(true);
  });

  it('usa VITE_API_BASE_URL e manda Accept: application/json', async () => {
    fetch.mockReturnValue(respond({ body: [] }));
    await api.getResources();
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe(`${import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5000/api'}/resources`);
    expect(init.headers.Accept).toBe('application/json');
  });

  it('não envia Content-Type em requisição sem corpo', async () => {
    fetch.mockReturnValue(respond({ body: { message: 'ok' } }));
    await api.deleteReservation(1);
    expect(fetch.mock.calls[0][1].headers['Content-Type']).toBeUndefined();
  });

  it('devolve null quando o corpo é vazio (204)', async () => {
    fetch.mockReturnValue(respond({ status: 204, text: '' }));
    await expect(api.deleteResource(1)).resolves.toBeNull();
  });
});
```

### `client/src/lib/datetime.test.js` (novo)

```js
import { describe, expect, it } from 'vitest';
import { isoToLocalInput, localInputToIso } from './datetime';

describe('localInputToIso', () => {
  it('acrescenta o offset do fuso ao value do datetime-local', () => {
    const result = localInputToIso('2026-10-21T14:00');
    expect(result).toMatch(/^2026-10-21T14:00:00[+-]\d{2}:\d{2}$/);
  });

  it('é idempotente na ida e volta', () => {
    expect(isoToLocalInput(localInputToIso('2026-10-21T14:00'))).toBe('2026-10-21T14:00');
  });

  it('devolve string vazia para entrada vazia ou inválida', () => {
    expect(localInputToIso('')).toBe('');
    expect(localInputToIso('não é data')).toBe('');
  });
});
```

Para travar o fuso no CI (evitando um teste verde em São Paulo e vermelho em
um runner UTC), rodar com `TZ`:

```bash
cd client
TZ=America/Sao_Paulo npm run test     # 11 casos novos
npm run lint
npm run build
```

E a verificação de que a configuração realmente funciona — o ponto desta spec:

```bash
# aponta para uma porta errada de propósito: a tela precisa dizer que não
# conseguiu falar com o servidor, em vez de "Falha ao carregar recursos"
VITE_API_BASE_URL=http://localhost:9999/api npm run dev
```

## Critérios de aceite

* [ ] `grep -rn "localhost:5000" client/src/` retorna **1 linha** — o fallback
      em `src/config/env.js` (baseline: `src/services/api.js:1`, chamada em 8
      lugares).
* [ ] `client/.env.example` existe e está versionado; `.env` está no
      `.gitignore` (baseline: nenhum dos dois).
* [ ] `npm run build` com `VITE_API_BASE_URL=https://exemplo/api` gera bundle
      que aponta para `https://exemplo/api` — verificar com
      `grep -c "exemplo" dist/assets/*.js` ≥ 1.
* [ ] Chamadas `fetch` em `client/src/`: **1** (baseline: 8).
* [ ] Blocos de tratamento de erro em `services/`: **1** (baseline: 8).
* [ ] Métodos que repassam a mensagem do servidor: **8 de 8, 100 %**
      (baseline: 3 de 8, 37,5 %).
* [ ] Métodos que expõem o `status` HTTP ao chamador: **8 de 8**
      (baseline: 0 de 8).
* [ ] Requisições com `Accept: application/json`: **8 de 8** (baseline: 0).
* [ ] Requisições com timeout: **8 de 8** (baseline: 0).
* [ ] `ApiError` exportada com `status`, `body`, `url` e os atalhos
      `isNotFound` / `isConflict` / `isValidation` / `isNetwork`.
* [ ] Resposta `500` com corpo HTML produz `ApiError` legível, não
      `SyntaxError` (teste automatizado cobrindo).
* [ ] `api.js`: **≤ 60 linhas** (baseline: 82) e nenhum arquivo em
      `client/src/` acima de 120 linhas.
* [ ] `createReservation` envia `start_time`/`end_time` em ISO 8601 com
      offset — conferir no corpo da requisição em DevTools → Network
      (baseline: `2026-10-21T14:00`, sem offset).
* [ ] Testes de frontend: **4 da FE-01 + 11 novos = 15 passando**.
* [ ] `npm run lint`: 0 erros. `npm run build` verde e bundle ≤ **206 kB**
      (baseline 201,86 kB); **nenhuma `dependency` de produção adicionada**.
* [ ] BUG-07 **não** é declarado resolvido: a spec entrega o lado do cliente do
      contrato e isso está escrito na descrição do PR, com link para a BE-07.
* [ ] `docs/arquitetura/contrato-api.md` atualizado com o formato de horário e
      com o mapa de cobertura dos 10 endpoints (9 em `api.js`).
* [ ] PR aprovado por Igor Seberino (`@igorSeberino`, QA) com CI verde.

## Passo a passo TBD

```bash
git checkout main
git pull origin main
git checkout -b refactor/api-layer-and-env-config

cd client
npm ci --legacy-peer-deps

# Baseline
grep -c "await fetch" src/services/api.js      # 8
grep -c "err.error" src/services/api.js        # 3
wc -l src/services/api.js                      # 82
npm run build | tee ../docs/auditoria/evidencias/fe-02-build-antes.txt

# 1. Testes que falham primeiro (RED) — contra o api.js recebido
# criar src/services/http.test.js e src/lib/datetime.test.js
TZ=America/Sao_Paulo npm run test   # os 2 primeiros casos de http.test.js
                                    # DEVEM falhar aqui
cd ..
git add client/src/services/http.test.js client/src/lib/datetime.test.js
git commit -m "test(client): cobrir repasse de erro do servidor e horario com offset"

# 2. Configuração por ambiente
# criar client/.env.example, client/src/config/env.js; ajustar client/.gitignore
git add client/.env.example client/.gitignore client/src/config/env.js
git commit -m "feat(client): ler a URL da API de VITE_API_BASE_URL com fallback local"

# 3. Helper de requisição e ApiError
git add client/src/services/http.js
git commit -m "refactor(client): centralizar fetch, cabecalhos e erro em request() e ApiError"

# 4. Contrato de horário (lado do cliente da BE-07)
git add client/src/lib/datetime.js
git commit -m "feat(client): emitir horario em ISO 8601 com offset conforme contrato BE-07"

# 5. Reescrever api.js sobre o helper
git add client/src/services/api.js
git commit -m "refactor(client): reescrever api.js sobre request() e reduzir de 82 para 48 linhas"

# 6. Documentação
git add client/README.md docs/arquitetura/contrato-api.md
git commit -m "docs(arquitetura): documentar configuracao por ambiente e formato de horario da API"

# 7. Verificação (GREEN)
cd client
TZ=America/Sao_Paulo npm run test && npm run lint && npm run build
VITE_API_BASE_URL=https://exemplo/api npm run build && grep -c "exemplo" dist/assets/*.js
cd ..

git push -u origin refactor/api-layer-and-env-config
# PR para main, título:
#   refactor(client): centralizar camada de API e configurar a URL por ambiente
# Corpo: link para docs/specs/fe-02-api-layer-and-env-config/implementacao.md,
#   tabela antes/depois (8 fetch -> 1; 3/8 -> 8/8 no repasse de erro;
#   0 -> 1 variável de ambiente), print do Network mostrando o offset no corpo,
#   e a nota de que o BUG-07 só fecha com a BE-07.
# Revisor obrigatório: @igorSeberino (QA).
```

## Prompt para o Claude Code

```text
Você está na raiz do repositório igorSeberino/srec, na branch
refactor/api-layer-and-env-config. Carregue a skill de arquitetura de frontend
do repositório antes de começar.

Leia, por inteiro:
  1. docs/specs/fe-02-api-layer-and-env-config/implementacao.md  (ordem de serviço)
  2. docs/specs/be-07-*/implementacao.md  (o contrato de horário ISO 8601 com offset)
  3. client/src/services/api.js
  4. client/vite.config.js, client/package.json, client/.gitignore
  5. client/src/hooks/useResources.js e useReservations.js (chamadores, pós-FE-01)

Tarefa: implementar a camada de API única e a configuração por ambiente
descritas na seção "Alterações" da spec, com o código proposto lá.

Regras não negociáveis:
- O contrato público de `api` NÃO muda: mesmo nome, mesmos 8 métodos, mesmas
  assinaturas. Nenhum chamador em src/hooks/ pode precisar de alteração além
  de nada. Se você achar que precisa mudar um chamador, pare e me explique.
- Trabalhe em TDD: crie src/services/http.test.js e src/lib/datetime.test.js
  PRIMEIRO e confirme que os dois primeiros casos de http.test.js falham contra
  o api.js atual. Me mostre a saída vermelha antes de seguir.
- NÃO adicione Axios, ky, ou qualquer dependency de produção. Só fetch nativo.
- O fallback de VITE_API_BASE_URL tem de ser exatamente 'http://localhost:5000/api',
  para que clonar e rodar `npm run dev` sem .env continue funcionando.
- `import.meta.env` só pode ser lido em src/config/env.js. Em nenhum outro arquivo.
- localInputToIso() é aplicada dentro de api.createReservation, não nos
  componentes de formulário.
- NÃO declare o BUG-07 resolvido: sem a BE-07 (timestamptz) o Postgres ainda
  descarta o offset. Deixe isso em comentário no código e na saída final.
- Rode os testes com TZ=America/Sao_Paulo.
- Um commit por passo do "Passo a passo TBD", com as mensagens prontas de lá.
- Não rode comandos git push nem abra PR.

Ao terminar, me devolva: `wc -l client/src/services/api.js`, a contagem de
`grep -rn "await fetch" client/src/`, a contagem de
`grep -rn "localhost:5000" client/src/`, o resultado de
`TZ=America/Sao_Paulo npm run test`, e o tamanho do bundle comparado com
201,86 kB (63,26 kB gzip).
```
