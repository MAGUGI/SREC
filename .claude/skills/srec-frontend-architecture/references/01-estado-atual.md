# Estado atual do frontend recebido — `client/`

Verificado por leitura do código em `igorSeberino/srec`. Se divergir, o código
vence: corrija este documento no mesmo PR.

## Inventário real

```
client/src/
  App.jsx            351 linhas   componente único, tudo dentro
  services/api.js     82 linhas   fetch, URL cravada
  main.jsx            10 linhas
  index.css          \  427 linhas somadas
  App.css            /
  assets/            hero.png, react.svg, vite.svg
client/
  client.txt         0 bytes, placeholder versionado (CS-11)
```

Medido com `wc -l`: `App.jsx` = **351 linhas**, o maior arquivo do projeto,
**41 % das 853 linhas de JS/JSX**. Não existe `components/`, `features/`,
`hooks/`, `domain/`, `config/`. Não existe teste nem runner de teste.

Lint: `cd client && npm run lint` → **0 erros**. Build:
`cd client && npm run build` → OK, **201,86 kB (63,26 kB gzip)**.

## `src/App.jsx` — o God Component (CS-01)

### Nove `useState` no topo (linhas 15-30)

```js
const [activeTab, setActiveTab] = useState('resources');
const [resources, setResources] = useState([]);
const [reservations, setReservations] = useState([]);
const [loading, setLoading] = useState(false);
const [message, setMessage] = useState({ text: '', type: '' });
const [resName, setResName] = useState('');
const [resType, setResType] = useState('workstation');
const [resCapacity, setResCapacity] = useState(1);
const [selectedResourceId, setSelectedResourceId] = useState('');
const [userName, setUserName] = useState('');
const [startTime, setStartTime] = useState('');
const [endTime, setEndTime] = useState('');
```

Doze estados, de três naturezas misturadas: navegação (`activeTab`), dado de
servidor (`resources`, `reservations`, `loading`), e campo de formulário de duas
features diferentes. Digitar no campo "Nome do Espaço" re-renderiza a lista de
reservas inteira.

### `showFeedback` (linhas 32-35) — BUG-14

```js
const showFeedback = (text, type = 'success') => {
  setMessage({ text, type });
  setTimeout(() => setMessage({ text: '', type: '' }), 4000);
};
```

O timer nunca é limpo. Se o componente desmontar antes dos 4 s, há `setState`
após desmontagem; se dois feedbacks dispararem em sequência, o primeiro timer
apaga a mensagem do segundo.

### `loadData` + `useEffect` (linhas 37-57) — CS-08 e CS-12

```js
const loadData = async () => {
  const [resData, resvData] = await Promise.all([api.getResources(), api.getReservations()]);
  setResources(resData);
  setReservations(resvData);
  if (resData.length > 0) setSelectedResourceId((prev) => prev || resData[0].id);
};

useEffect(() => {
  // eslint-disable-next-line react-hooks/set-state-in-effect
  loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);
```

* **Refetch total a cada mutação** (CS-08): `loadData()` é chamada ao final dos 5
  handlers. Criar um recurso recarrega também todas as reservas. Com N mutações
  são 2N requisições; o mínimo seria N.
* **Duas supressões de lint** (CS-12), medido:
  `grep -c "eslint-disable" client/src/App.jsx` → **2**.
* `loadData` acumula três responsabilidades: buscar recurso, buscar reserva e
  escolher o recurso padrão do formulário.
* Erro de carga vira só um toast de 4 s — não há estado de erro na tela, nem
  possibilidade de tentar de novo.

### Os cinco handlers (linhas 59-125) — duplicação de 5 blocos

`handleCreateResource`, `handleDeleteResource`, `handleCreateReservation`,
`handleStatusChange`, `handleDeleteReservation` têm o mesmo molde:

```js
try {
  await api.algumaCoisa(...);
  showFeedback('mensagem');
  loadData();
} catch (err) {
  showFeedback(err.message, 'error');
}
```

É o espelho do CS-02 do backend, no frontend.

Defeitos específicos:

* **BUG-13 (linhas 87-104):** `handleCreateReservation` não tem estado de
  submissão. O botão `type="submit"` (linha 281) nunca desabilita — duplo clique
  dispara dois `POST /api/reservations` e, sem a transação no backend (BUG-01),
  cria duas reservas.
* **BUG-07 (linha 264):** `<input type="datetime-local">` devolve
  `"2026-10-23T14:00"`, sem fuso. O valor vai cru para a API, e o backend grava
  em `TIMESTAMP` sem fuso; na leitura, `new Date(rev.start_time).toLocaleString('pt-BR')`
  (linha 303) interpreta como UTC e desloca o horário exibido.
* `window.confirm` nas duas exclusões (linhas 77 e 117) — bloqueia a thread e não
  é estilizável.
* `handleCreateResource` não limpa `resType`, só `resName` e `resCapacity`.

### O render (linhas 127-348) — 222 linhas de JSX num arquivo

Estrutura: `header` → `container` → alerta → abas → painel de recursos (form +
lista) → painel de reservas (form + lista).

* **CS-13, medido:** `grep -c "<label>" client/src/App.jsx` → **7**. Nenhum tem
  `htmlFor`, nenhum campo tem `id`. Clicar no rótulo não foca o campo e leitor de
  tela não associa.
* **BUG-10 (linha 212):** `res.type === 'meeting_room' ? 'Sala de Reunião' : 'Estação de Trabalho'`.
  Como o schema não tem `CHECK` em `type`, qualquer string gravada pela API é
  renderizada como "Estação de Trabalho".
* **Linha 245:** o `<option>` do seletor de espaço exibe `{r.type}` cru
  (`workstation`), sem rótulo em português — inconsistente com a linha 212.
* **Linha 306:** `<span className={...}>{rev.status}</span>` exibe o status cru
  (`scheduled`, `cancelled`), também sem rótulo em português.
* **Linha 293:** `resources.find((r) => r.id === rev.resource_id)` dentro do
  `map` — busca linear por reserva.
* **Estilo inline** em `style={{ display: 'inline' }}` (linhas 213, 302) e
  `style={{ borderColor: '#16a34a', color: '#16a34a' }}` (linhas 313-316),
  misturado com as classes de `App.css`.
* **`btn-outline-danger` usado para ação de concluir** (linha 312), com a cor
  sobrescrita inline — classe semanticamente errada.
* **Não há estado vazio nem de erro consistente**: `{loading && <p>Carregando...</p>}`
  repetido em dois painéis, texto duplicado.
* O formulário de reserva não valida que `endTime > startTime` no cliente.
* `badge` fixo `v1.0.0` (linha 135), hardcoded.

## `src/services/api.js` — 82 linhas

```js
const API_BASE_URL = 'http://localhost:5000/api';
```

**CS-07:** a URL está cravada na linha 1. Não há `.env`, não há
`import.meta.env.VITE_*`. O frontend só funciona contra `localhost:5000` — não dá
para apontar para outro ambiente sem editar código e rebuildar.

Os 8 métodos (`getResources`, `createResource`, `updateResource`,
`deleteResource`, `getReservations`, `createReservation`,
`updateReservationStatus`, `deleteReservation`) repetem duas variantes de
tratamento de erro:

```js
// variante A — lê o corpo do backend
if (!res.ok) {
  const err = await res.json();
  throw new Error(err.error || 'Erro ao criar recurso');
}

// variante B — descarta o corpo e usa mensagem genérica
if (!res.ok) throw new Error('Erro ao atualizar status');
```

Consequência prática: quando o backend responde `409 { error: 'Resource is not
available for the selected time slot' }`, o usuário vê a mensagem certa no
`createReservation` (variante A) e uma genérica no `updateReservationStatus`
(variante B). Dois dos métodos mais usados tratam erro de forma diferente.

Além disso: `headers` e `JSON.stringify` repetidos em 4 métodos; nenhum
`timeout`; nenhum tratamento de falha de rede (`fetch` rejeitando) distinta de
erro HTTP; `GET /api/resources/:id` e `GET /api/reservations/:id` existem no
backend e **não** têm método aqui.

**BUG-15:** `updateResource` (linhas 24-35) existe aqui e no backend
(`PUT /api/resources/:id`) e **nenhuma tela chama**. Código órfão nas duas pontas.

## `src/main.jsx` — 10 linhas

Bootstrap padrão do Vite: `createRoot`, `StrictMode`, import de `index.css` e
`App.css`. Nada a apontar.

## Scripts disponíveis em `client/package.json`

```json
"dev": "vite",
"build": "vite build",
"lint": "eslint .",
"lint:fix": "eslint . --fix",
"format": "prettier --write \"src/**/*.{js,jsx,css}\"",
"preview": "vite preview"
```

Não há `test`. Não há `vitest`, `jest`, `@testing-library/react` nem
`jsdom` instalado — **adicionar teste de frontend exige decidir e instalar um
runner, o que precisa estar escrito na spec**, não ser escolhido na hora.
`oxlint@^1.79.0` está em `devDependencies` com `.oxlintrc.json` na raiz do
`client/`, mas nenhum script o invoca.

## Como subir o que foi recebido

```bash
cd client
npm ci --legacy-peer-deps      # a flag é obrigatória: React 19 + Vite 8
npm run dev                    # Vite em http://localhost:5173
```

O backend precisa estar em `http://localhost:5000` — a URL está cravada em
`api.js:1` e `cors()` no servidor está liberado para qualquer origem, então
funciona sem configuração extra. Mudar a porta do backend quebra o frontend
silenciosamente (erro de rede vira toast genérico de 4 s).
