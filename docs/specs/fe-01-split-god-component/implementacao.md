# FE-01 — Quebrar o God Component `App.jsx` em features e hooks

* **Responsável:** Renato Colin Neto (Desenvolvedor Frontend)
* **Issue:** #<a definir>
* **Branch:** `refactor/split-god-component`
* **Rubrica:** 2,5 — Melhoria comprovada do código recebido (CS-01, ALTO); 1,5 — Clareza nas alterações feitas, para a N3
* **Depende de:** nada (é a primeira spec de frontend; FE-02, FE-03, FE-04 e FE-05 dependem dela)

## Problema

`client/src/App.jsx` é um God Component. Em **351 linhas** e um único componente
de função, ele acumula:

* **9 `useState`** — `activeTab`, `resources`, `reservations`, `loading`,
  `message` (linhas 15-19), mais `resName`, `resType`, `resCapacity`
  (linhas 22-24) e `selectedResourceId`, `userName`, `startTime`, `endTime`
  (linhas 27-30). Dois formulários inteiros vivem como estado solto do
  componente raiz.
* **Toda a orquestração de dados** — `loadData` (linhas 37-51) dispara
  `Promise.all([api.getResources(), api.getReservations()])` e ainda decide o
  recurso pré-selecionado do formulário de reserva (linha 44), misturando
  carregamento de lista com regra de formulário.
* **Cinco handlers de mutação** — `handleCreateResource` (59-74),
  `handleDeleteResource` (76-85), `handleCreateReservation` (87-104),
  `handleStatusChange` (106-114) e `handleDeleteReservation` (116-125). Os cinco
  repetem o mesmo esqueleto `try { await api.X(); showFeedback(...); loadData(); }
  catch (err) { showFeedback(err.message, 'error'); }` — é o CS-02 (Duplicated
  Code) na sua versão frontend.
* **Uma barra de feedback** com `setTimeout` sem limpeza (linhas 32-35, BUG-14).
* **Duas abas** controladas por `activeTab` e dois blocos de JSX mutuamente
  exclusivos de ~70 e ~115 linhas (157-228 e 230-345).
* **Dois formulários** (161-198 e 234-284), **duas listas** (201-226 e 287-343)
  e a tradução de domínio `res.type === 'meeting_room' ? 'Sala de Reunião' :
  'Estação de Trabalho'` inline na linha 212 — magic string (CS-05) e também a
  causa de o BUG-10 ser invisível na tela: qualquer `type` desconhecido é
  renderizado como "Estação de Trabalho".
* **Estilo inline** em vez de classe, em 4 pontos: linhas 213, 302, 308 e
  313-316.

Não existe pasta `client/src/components/`. Não existe pasta
`client/src/features/`. Não existe pasta `client/src/hooks/`. A árvore do
frontend recebido é literalmente:

```
client/src/
  App.jsx            351 linhas
  services/api.js     82 linhas
  main.jsx            10 linhas
  index.css          245 linhas
  App.css            182 linhas   (nunca importado — ver "Alterações")
```

Consequência prática para a N2: **não existe unidade testável menor que a
aplicação inteira**, e qualquer uma das outras quatro specs de frontend
(FE-02 a FE-05) teria que editar o mesmo arquivo de 351 linhas, garantindo
conflito de merge entre PRs.

## Evidência

Baseline medido (comandos reproduzíveis na raiz do repositório):

```bash
cd client && npm ci --legacy-peer-deps && npm run lint && npm run build
find src -name '*.js' -o -name '*.jsx' | xargs wc -l | sort -n
```

| Métrica | Valor medido (baseline) |
|---|---|
| `App.jsx` | **351 linhas** |
| Maior arquivo `.jsx` do projeto | **351 linhas** (`App.jsx`) |
| `App.jsx` sobre o JS/JSX do projeto (853 LOC) | **41,1 %** |
| `App.jsx` sobre o JS/JSX do client (443 LOC) | **79,2 %** |
| Arquivos `.jsx` no client | **2** (`App.jsx`, `main.jsx`) |
| Componentes React declarados | **1** |
| Hooks customizados | **0** |
| `useState` em um único componente | **9** |
| Handlers de mutação em um único componente | **5** |
| Blocos `try/catch` idênticos no `App.jsx` | **6** |
| Testes de frontend | **0** |
| Erros de ESLint | **0** |
| Build | OK — **201,86 kB** (63,26 kB gzip) |

Os 41,1 % confirmam a métrica da auditoria: um arquivo concentra quase metade do
código JavaScript do sistema.

## Decisão

**Organização por feature (vertical slice) com hooks de dados, não por tipo
técnico.**

A alternativa óbvia era a divisão clássica por camada técnica —
`components/`, `containers/`, `pages/`, `utils/`. Recusada porque espalha uma
mudança de domínio por quatro pastas: adicionar a edição de recurso (FE-05)
tocaria `pages/Resources.jsx`, `containers/ResourceFormContainer.jsx`,
`components/ResourceForm.jsx` e `utils/resource.js`. Com o corte vertical,
FE-05 é contido em `src/features/resources/`.

A segunda alternativa recusada foi **introduzir biblioteca de estado ou de
dados** (Redux Toolkit, Zustand, TanStack Query). O ganho real existiria no
CS-08 (refetch total a cada mutação), mas:

* a N2 é **manutenção com entrega em 23/10** e o CS-08 não está no escopo desta
  spec;
* TanStack Query resolveria cache e invalidação, mas adiciona ~13 kB gzip ao
  bundle e um modelo mental novo que o grupo da N3 herdaria sem contexto;
* o estado deste sistema é duas listas e dois formulários — `useState` +
  `useEffect` dentro de dois hooks customizados cobre o caso com zero
  dependência nova de produção.

Fica registrado como dívida consciente em `docs/time/divida-tecnica.md`:
CS-08 (refetch total) **não** é resolvido aqui; `reloadAll()` continua
recarregando as duas listas a cada mutação, exatamente como `loadData()` fazia.

**Introduzimos Vitest + Testing Library (apenas devDependencies).** Esta é a
única dependência nova e ela se justifica pelo próprio trabalho: refatorar 351
linhas sem rede de proteção é apostar. Vitest reaproveita o `vite.config.js` já
existente (zero configuração de transform/JSX), não entra no bundle de produção
e dá o teste de caracterização que roda **antes** e **depois** do corte. O
alternativo seria Jest, que exigiria Babel ou SWC e um segundo pipeline de
transformação para JSX num projeto que já tem Vite 8.

**Comportamento preservado é requisito, não consequência.** Nenhum texto,
nenhuma classe CSS, nenhuma chamada de API e nenhuma ordem de requisição muda.
É por isso que o roteiro de regressão da **QA-03** precisa rodar **antes** do
primeiro commit (para capturar o comportamento atual como baseline) e **depois**
do último (para provar a equivalência). Os bugs visíveis hoje — BUG-13
(duplo clique), BUG-14 (`setTimeout` não limpo), BUG-15 (`updateResource`
órfão) e CS-13 (`<label>` sem `htmlFor`) — **continuam presentes** no fim desta
spec, de propósito; cada um tem sua spec (FE-03, FE-04, FE-05) e misturá-los
aqui destruiria a propriedade de "refatoração sem mudança de comportamento",
que é o único jeito de defender este PR com dados no pitch.

Uma exceção declarada: `src/App.css` (182 linhas) **não é importado por
ninguém** — `main.jsx:3` importa apenas `./index.css`, e `App.jsx` não tem
`import './App.css'`. É resíduo do template do Vite (classes `.hero`, `.vite`,
`#next-steps`, `.counter`). Removê-lo é morte de código sem efeito observável,
então entra nesta spec como commit próprio.

## Alterações

### Árvore final

```
client/
  .gitignore                              (alterado)
  package.json                            (alterado: deps de teste + script)
  vite.config.js                          (alterado: bloco test)
  src/
    main.jsx                              (alterado: 10 → 10 linhas)
    App.jsx                               (reescrito: 351 → ~48 linhas)
    App.css                               (REMOVIDO — 182 linhas, nunca importado)
    index.css                             (alterado: +2 classes utilitárias)
    setupTests.js                          (NOVO ~2 linhas)
    App.test.jsx                           (NOVO ~62 linhas — caracterização)
    constants/
      domain.js                            (NOVO ~22 linhas)
    components/
      Alert.jsx                            (NOVO ~16 linhas)
      Tabs.jsx                             (NOVO ~24 linhas)
      Card.jsx                             (NOVO ~12 linhas)
      EmptyState.jsx                       (NOVO ~10 linhas)
    hooks/
      useFeedback.js                       (NOVO ~18 linhas)
      useResources.js                      (NOVO ~44 linhas)
      useReservations.js                   (NOVO ~44 linhas)
    features/
      resources/
        ResourcesPanel.jsx                 (NOVO ~30 linhas)
        ResourceForm.jsx                   (NOVO ~86 linhas)
        ResourceList.jsx                   (NOVO ~26 linhas)
        ResourceListItem.jsx               (NOVO ~32 linhas)
      reservations/
        ReservationsPanel.jsx              (NOVO ~32 linhas)
        ReservationForm.jsx                (NOVO ~104 linhas)
        ReservationList.jsx                (NOVO ~30 linhas)
        ReservationListItem.jsx            (NOVO ~62 linhas)
    services/
      api.js                               (INTOCADO — é escopo da FE-02)
```

Maior arquivo `.jsx` projetado: `ReservationForm.jsx`, ~104 linhas. `App.jsx`
projetado: ~48 linhas. Ambos dentro da meta.

### `client/package.json`

```json
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "lint": "eslint .",
    "lint:fix": "eslint . --fix",
    "format": "prettier --write \"src/**/*.{js,jsx,css}\"",
    "test": "vitest run",
    "test:watch": "vitest",
    "preview": "vite preview"
  },
```

Novas `devDependencies` (nenhuma `dependency` de produção é adicionada):

```json
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.1.0",
    "@testing-library/user-event": "^14.5.2",
    "jsdom": "^25.0.1",
    "vitest": "^2.1.8"
```

### `client/vite.config.js`

```js
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/setupTests.js'],
    css: false,
  },
});
```

### `client/src/setupTests.js` (novo)

```js
import '@testing-library/jest-dom/vitest';
```

### `client/src/constants/domain.js` (novo)

Mata as magic strings de domínio do `App.jsx:212`, `:245`, `:306` e `:309`
(CS-05 no cliente). O mapa tem `fallback` justamente para que o BUG-10 (`type`
arbitrário) deixe de ser mascarado como "Estação de Trabalho".

```js
export const RESOURCE_TYPE = {
  WORKSTATION: 'workstation',
  MEETING_ROOM: 'meeting_room',
};

export const RESOURCE_TYPE_LABEL = {
  [RESOURCE_TYPE.WORKSTATION]: 'Estação de Trabalho',
  [RESOURCE_TYPE.MEETING_ROOM]: 'Sala de Reunião',
};

export const RESERVATION_STATUS = {
  SCHEDULED: 'scheduled',
  CANCELLED: 'cancelled',
  COMPLETED: 'completed',
};

// Mantém o texto atual para os dois tipos conhecidos e deixa visível
// qualquer `type` fora do contrato (BUG-10), em vez de chamá-lo de estação.
export function resourceTypeLabel(type) {
  return RESOURCE_TYPE_LABEL[type] ?? type;
}
```

> Nota de comportamento: para os dados válidos (`workstation` e
> `meeting_room`) o texto renderizado é **idêntico** ao atual. A diferença só
> aparece com dado fora do contrato, que hoje é renderizado errado.

### `client/src/hooks/useFeedback.js` (novo)

Extrai `App.jsx:32-35` **sem corrigir o BUG-14** — o `setTimeout` continua sem
`clearTimeout`, e o comentário aponta para a FE-04, que é a spec que corrige.

```js
import { useCallback, useState } from 'react';

export function useFeedback() {
  const [message, setMessage] = useState({ text: '', type: '' });

  // TODO(FE-04): o timeout não é limpo (BUG-14). Preservado aqui de propósito:
  // esta spec é refatoração de comportamento preservado.
  const showFeedback = useCallback((text, type = 'success') => {
    setMessage({ text, type });
    setTimeout(() => setMessage({ text: '', type: '' }), 4000);
  }, []);

  return { message, showFeedback };
}
```

### `client/src/hooks/useResources.js` (novo)

```js
import { useCallback, useState } from 'react';
import { api } from '../services/api';

export function useResources() {
  const [resources, setResources] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setResources(await api.getResources());
    } finally {
      setLoading(false);
    }
  }, []);

  const createResource = useCallback(
    (payload) =>
      api.createResource({
        name: payload.name,
        type: payload.type,
        capacity: Number(payload.capacity),
      }),
    []
  );

  const removeResource = useCallback((id) => api.deleteResource(id), []);

  return { resources, loading, load, createResource, removeResource };
}
```

### `client/src/hooks/useReservations.js` (novo)

```js
import { useCallback, useState } from 'react';
import { api } from '../services/api';

export function useReservations() {
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setReservations(await api.getReservations());
    } finally {
      setLoading(false);
    }
  }, []);

  const createReservation = useCallback((payload) => api.createReservation(payload), []);

  const changeStatus = useCallback(
    (id, status) => api.updateReservationStatus(id, status),
    []
  );

  const removeReservation = useCallback((id) => api.deleteReservation(id), []);

  return {
    reservations,
    loading,
    load,
    createReservation,
    changeStatus,
    removeReservation,
  };
}
```

### `client/src/components/Alert.jsx` (novo)

Mesmo markup de `App.jsx:140`. `role`/`aria-live` são escopo da FE-04.

```js
export function Alert({ text, type }) {
  if (!text) return null;
  return <div className={`alert alert-${type}`}>{text}</div>;
}
```

### `client/src/components/Tabs.jsx` (novo)

Mesmo markup de `App.jsx:142-155`, agora orientado a dados.

```js
export function Tabs({ items, activeId, onChange }) {
  return (
    <div className="nav-tabs">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`tab-btn ${activeId === item.id ? 'active' : ''}`}
          onClick={() => onChange(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
```

### `client/src/components/Card.jsx` (novo)

```js
export function Card({ title, children }) {
  return (
    <div className="card">
      <h3 className="card-title">{title}</h3>
      {children}
    </div>
  );
}
```

### `client/src/components/EmptyState.jsx` (novo)

```js
export function EmptyState({ loading, isEmpty, emptyText }) {
  if (loading) return <p>Carregando...</p>;
  if (isEmpty) return <p>{emptyText}</p>;
  return null;
}
```

### `client/src/features/resources/ResourceForm.jsx` (novo, ~86 linhas)

Recorte literal de `App.jsx:159-199` + o estado das linhas 22-24 + o handler
das linhas 59-74. O `<label>` continua sem `htmlFor` (CS-13 é FE-04) e o botão
continua sem trava (BUG-13 é FE-03).

```js
import { useState } from 'react';
import { PlusCircle } from 'lucide-react';
import { Card } from '../../components/Card';
import { RESOURCE_TYPE } from '../../constants/domain';

export function ResourceForm({ onCreate, onSuccess, onError }) {
  const [name, setName] = useState('');
  const [type, setType] = useState(RESOURCE_TYPE.WORKSTATION);
  const [capacity, setCapacity] = useState(1);

  const handleSubmit = async (event) => {
    event.preventDefault();
    try {
      await onCreate({ name, type, capacity });
      setName('');
      setCapacity(1);
      onSuccess('Espaço cadastrado com sucesso!');
    } catch (err) {
      onError(err.message);
    }
  };

  return (
    <Card title="Novo Espaço">
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Nome do Espaço / Estação</label>
          <input
            type="text"
            className="form-control"
            placeholder="Ex: Sala de Reunião Alpha"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div className="form-group">
          <label>Tipo</label>
          <select
            className="form-control"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option value={RESOURCE_TYPE.WORKSTATION}>Estação de Trabalho</option>
            <option value={RESOURCE_TYPE.MEETING_ROOM}>Sala de Reunião</option>
          </select>
        </div>
        <div className="form-group">
          <label>Capacidade (pessoas)</label>
          <input
            type="number"
            min="1"
            className="form-control"
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
            required
          />
        </div>
        <button type="submit" className="btn btn-primary">
          <PlusCircle size={18} /> Cadastrar Espaço
        </button>
      </form>
    </Card>
  );
}
```

### `client/src/features/resources/ResourceListItem.jsx` (novo, ~32 linhas)

Recorte de `App.jsx:206-224`. O estilo inline da linha 213 vira a classe
`.icon-inline` (ver `index.css`).

```js
import { Trash2, Users } from 'lucide-react';
import { resourceTypeLabel } from '../../constants/domain';

export function ResourceListItem({ resource, onDelete }) {
  return (
    <div className="item-card">
      <div className="item-details">
        <h4>{resource.name}</h4>
        <p>
          Tipo: {resourceTypeLabel(resource.type)} |{' '}
          <Users size={14} className="icon-inline" /> Capacidade: {resource.capacity}
        </p>
      </div>
      <button className="btn-outline-danger" onClick={() => onDelete(resource.id)} title="Excluir Espaço">
        <Trash2 size={16} />
      </button>
    </div>
  );
}
```

### `client/src/features/resources/ResourceList.jsx` (novo, ~26 linhas)

```js
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { ResourceListItem } from './ResourceListItem';

export function ResourceList({ resources, loading, onDelete }) {
  return (
    <Card title="Espaços Cadastrados">
      <EmptyState
        loading={loading}
        isEmpty={resources.length === 0}
        emptyText="Nenhum espaço cadastrado ainda."
      />
      <div className="item-list">
        {resources.map((resource) => (
          <ResourceListItem key={resource.id} resource={resource} onDelete={onDelete} />
        ))}
      </div>
    </Card>
  );
}
```

### `client/src/features/resources/ResourcesPanel.jsx` (novo, ~30 linhas)

```js
import { ResourceForm } from './ResourceForm';
import { ResourceList } from './ResourceList';

export function ResourcesPanel({ resources, loading, onCreate, onDelete, onSuccess, onError }) {
  const handleDelete = async (id) => {
    if (!window.confirm('Deseja realmente remover este espaço?')) return;
    try {
      await onDelete(id);
      onSuccess('Espaço removido com sucesso!');
    } catch (err) {
      onError(err.message);
    }
  };

  return (
    <div className="grid grid-2">
      <ResourceForm onCreate={onCreate} onSuccess={onSuccess} onError={onError} />
      <ResourceList resources={resources} loading={loading} onDelete={handleDelete} />
    </div>
  );
}
```

> `window.confirm` é preservado aqui porque o diálogo rico de exclusão com
> contagem de reservas afetadas é escopo da **FE-05** (BUG-06).

### `client/src/features/reservations/ReservationForm.jsx` (novo, ~104 linhas)

Recorte de `App.jsx:232-285` + estado das linhas 27-30 + handler das 87-104. A
pré-seleção do primeiro recurso, que hoje mora dentro de `loadData`
(`App.jsx:43-45`), passa a morar no formulário que a usa.

```js
import { useEffect, useState } from 'react';
import { Calendar } from 'lucide-react';
import { Card } from '../../components/Card';

export function ReservationForm({ resources, onCreate, onSuccess, onError }) {
  const [resourceId, setResourceId] = useState('');
  const [userName, setUserName] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');

  // Equivalente ao App.jsx:43-45: pré-seleciona o primeiro recurso,
  // sem sobrescrever uma escolha já feita pelo usuário.
  useEffect(() => {
    if (resources.length > 0) {
      setResourceId((previous) => previous || resources[0].id);
    }
  }, [resources]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    try {
      await onCreate({
        resource_id: resourceId,
        user_name: userName,
        start_time: startTime,
        end_time: endTime,
      });
      setUserName('');
      setStartTime('');
      setEndTime('');
      onSuccess('Reserva confirmada com sucesso!');
    } catch (err) {
      onError(err.message);
    }
  };

  return (
    <Card title="Novo Agendamento">
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Selecione o Espaço</label>
          <select
            className="form-control"
            value={resourceId}
            onChange={(e) => setResourceId(e.target.value)}
            required
          >
            {resources.map((resource) => (
              <option key={resource.id} value={resource.id}>
                {resource.name} ({resource.type})
              </option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label>Nome do Responsável</label>
          <input
            type="text"
            className="form-control"
            placeholder="Ex: Carlos Silva"
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            required
          />
        </div>
        <div className="form-group">
          <label>Horário de Início</label>
          <input
            type="datetime-local"
            className="form-control"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            required
          />
        </div>
        <div className="form-group">
          <label>Horário de Término</label>
          <input
            type="datetime-local"
            className="form-control"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            required
          />
        </div>
        <button type="submit" className="btn btn-primary">
          <Calendar size={18} /> Confirmar Reserva
        </button>
      </form>
    </Card>
  );
}
```

### `client/src/features/reservations/ReservationListItem.jsx` (novo, ~62 linhas)

Recorte de `App.jsx:292-341`. Os estilos inline das linhas 302, 308 e 313-316
viram as classes `.icon-inline`, `.item-actions` e `.btn-outline-success`.

```js
import { CheckCircle2, Clock, Trash2, XCircle } from 'lucide-react';
import { RESERVATION_STATUS } from '../../constants/domain';

export function ReservationListItem({ reservation, resourceName, onChangeStatus, onDelete }) {
  return (
    <div className="item-card">
      <div className="item-details">
        <h4>{resourceName}</h4>
        <p>
          <strong>Responsável:</strong> {reservation.user_name}
        </p>
        <p>
          <Clock size={14} className="icon-inline" />{' '}
          {new Date(reservation.start_time).toLocaleString('pt-BR')} até{' '}
          {new Date(reservation.end_time).toLocaleString('pt-BR')}
        </p>
        <span className={`status-tag status-${reservation.status}`}>{reservation.status}</span>
      </div>
      <div className="item-actions">
        {reservation.status === RESERVATION_STATUS.SCHEDULED && (
          <>
            <button
              className="btn-outline-danger btn-outline-success"
              onClick={() => onChangeStatus(reservation.id, RESERVATION_STATUS.COMPLETED)}
              title="Concluir"
            >
              <CheckCircle2 size={16} />
            </button>
            <button
              className="btn-outline-danger"
              onClick={() => onChangeStatus(reservation.id, RESERVATION_STATUS.CANCELLED)}
              title="Cancelar Reserva"
            >
              <XCircle size={16} />
            </button>
          </>
        )}
        <button
          className="btn-outline-danger"
          onClick={() => onDelete(reservation.id)}
          title="Excluir Definitivamente"
        >
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
}
```

### `client/src/features/reservations/ReservationList.jsx` (novo, ~30 linhas)

```js
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { ReservationListItem } from './ReservationListItem';

export function ReservationList({ reservations, resources, loading, onChangeStatus, onDelete }) {
  const nameOf = (resourceId) =>
    resources.find((resource) => resource.id === resourceId)?.name ?? `Espaço #${resourceId}`;

  return (
    <Card title="Reservas Realizadas">
      <EmptyState
        loading={loading}
        isEmpty={reservations.length === 0}
        emptyText="Nenhuma reserva registrada."
      />
      <div className="item-list">
        {reservations.map((reservation) => (
          <ReservationListItem
            key={reservation.id}
            reservation={reservation}
            resourceName={nameOf(reservation.resource_id)}
            onChangeStatus={onChangeStatus}
            onDelete={onDelete}
          />
        ))}
      </div>
    </Card>
  );
}
```

### `client/src/features/reservations/ReservationsPanel.jsx` (novo, ~32 linhas)

```js
import { ReservationForm } from './ReservationForm';
import { ReservationList } from './ReservationList';

export function ReservationsPanel({ reservations, resources, loading, actions, onSuccess, onError }) {
  const run = async (operation, successText) => {
    try {
      await operation();
      onSuccess(successText);
    } catch (err) {
      onError(err.message);
    }
  };

  const handleDelete = (id) => {
    if (!window.confirm('Deseja cancelar esta reserva permanentemente?')) return;
    run(() => actions.removeReservation(id), 'Reserva removida!');
  };

  return (
    <div className="grid grid-2">
      <ReservationForm
        resources={resources}
        onCreate={actions.createReservation}
        onSuccess={onSuccess}
        onError={onError}
      />
      <ReservationList
        reservations={reservations}
        resources={resources}
        loading={loading}
        onChangeStatus={(id, status) =>
          run(() => actions.changeStatus(id, status), 'Status da reserva atualizado!')
        }
        onDelete={handleDelete}
      />
    </div>
  );
}
```

### `client/src/App.jsx` (reescrito, 351 → ~48 linhas)

`loadData` vira `reloadAll`, mantendo o `Promise.all` e o refetch das duas
listas a cada mutação (CS-08 preservado de propósito). As **duas supressões de
lint** das linhas 54 e 56 continuam aqui — removê-las é escopo da FE-04
(CS-12), e o `useCallback` já deixa a dependência estável para quando chegar a
hora.

```js
import { useCallback, useEffect, useState } from 'react';
import { Building2 } from 'lucide-react';
import { Alert } from './components/Alert';
import { Tabs } from './components/Tabs';
import { useFeedback } from './hooks/useFeedback';
import { useResources } from './hooks/useResources';
import { useReservations } from './hooks/useReservations';
import { ResourcesPanel } from './features/resources/ResourcesPanel';
import { ReservationsPanel } from './features/reservations/ReservationsPanel';

const TABS = [
  { id: 'resources', label: 'Espaços e Salas' },
  { id: 'reservations', label: 'Agendamentos' },
];

function App() {
  const [activeTab, setActiveTab] = useState('resources');
  const { message, showFeedback } = useFeedback();
  const { resources, loading: loadingResources, load: loadResources, ...resourceActions } = useResources();
  const { reservations, loading: loadingReservations, load: loadReservations, ...reservationActions } = useReservations();

  const reloadAll = useCallback(async () => {
    try {
      await Promise.all([loadResources(), loadReservations()]);
    } catch (err) {
      showFeedback(err.message, 'error');
    }
  }, [loadResources, loadReservations, showFeedback]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reloadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSuccess = async (text) => {
    showFeedback(text);
    await reloadAll();
  };
  const onError = (text) => showFeedback(text, 'error');
  const loading = loadingResources || loadingReservations;

  return (
    <div>
      <header>
        <div className="header-content">
          <div className="header-title">
            <Building2 size={28} color="#3b82f6" />
            <span>SREC - Sistema de Reservas &amp; Coworking</span>
          </div>
          <span className="badge">v1.0.0</span>
        </div>
      </header>
      <div className="container">
        <Alert text={message.text} type={message.type} />
        <Tabs items={TABS} activeId={activeTab} onChange={setActiveTab} />
        {activeTab === 'resources' && (
          <ResourcesPanel
            resources={resources}
            loading={loading}
            onCreate={resourceActions.createResource}
            onDelete={resourceActions.removeResource}
            onSuccess={onSuccess}
            onError={onError}
          />
        )}
        {activeTab === 'reservations' && (
          <ReservationsPanel
            reservations={reservations}
            resources={resources}
            loading={loading}
            actions={reservationActions}
            onSuccess={onSuccess}
            onError={onError}
          />
        )}
      </div>
    </div>
  );
}

export default App;
```

### `client/src/index.css` (alterado)

Substitui os 4 estilos inline por classes. Nenhum valor visual muda.

```css
.icon-inline {
  display: inline;
}

.item-actions {
  display: flex;
  gap: 0.5rem;
}

.btn-outline-success {
  border-color: #16a34a;
  color: #16a34a;
}
```

### `client/src/App.css` (removido)

182 linhas de template do Vite (`.counter`, `.hero`, `.vite`, `#next-steps`,
`#spacer`, `.ticks`). Nenhum `import './App.css'` existe em todo o `src/` —
confirmar antes de remover:

```bash
cd client && grep -rn "App.css" src/
# saída esperada após a remoção: nada
```

## Testes

Hoje são **0 testes de frontend**. Esta spec entrega o teste de
**caracterização**: ele descreve o comportamento do `App.jsx` recebido, é
escrito e executado **antes** do corte (passando contra as 351 linhas
originais) e tem que continuar passando **depois** do corte. Se quebrar, a
refatoração mudou comportamento.

### `client/src/App.test.jsx` (novo)

```js
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { api } from './services/api';

vi.mock('./services/api', () => ({
  api: {
    getResources: vi.fn(),
    getReservations: vi.fn(),
    createResource: vi.fn(),
    deleteResource: vi.fn(),
    createReservation: vi.fn(),
    updateReservationStatus: vi.fn(),
    deleteReservation: vi.fn(),
  },
}));

const RESOURCES = [{ id: 1, name: 'Sala Alpha', type: 'meeting_room', capacity: 8 }];
const RESERVATIONS = [
  {
    id: 10,
    resource_id: 1,
    user_name: 'Carlos Silva',
    start_time: '2026-10-21T13:00:00.000Z',
    end_time: '2026-10-21T14:00:00.000Z',
    status: 'scheduled',
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  api.getResources.mockResolvedValue(RESOURCES);
  api.getReservations.mockResolvedValue(RESERVATIONS);
});

describe('App (caracterização do comportamento recebido)', () => {
  it('carrega as duas listas em uma única passada no mount', async () => {
    render(<App />);
    await waitFor(() => expect(api.getResources).toHaveBeenCalledTimes(1));
    expect(api.getReservations).toHaveBeenCalledTimes(1);
  });

  it('abre na aba de espaços e lista o recurso com tipo traduzido', async () => {
    render(<App />);
    expect(await screen.findByText('Sala Alpha')).toBeInTheDocument();
    expect(screen.getByText(/Sala de Reunião/)).toBeInTheDocument();
    expect(screen.getByText(/Capacidade: 8/)).toBeInTheDocument();
  });

  it('troca para a aba de agendamentos e mostra a reserva', async () => {
    render(<App />);
    await screen.findByText('Sala Alpha');
    await userEvent.click(screen.getByRole('button', { name: 'Agendamentos' }));
    expect(screen.getByText('Reservas Realizadas')).toBeInTheDocument();
    expect(screen.getByText('Carlos Silva')).toBeInTheDocument();
    expect(screen.getByText('scheduled')).toBeInTheDocument();
  });

  it('cria espaço, mostra feedback e recarrega as duas listas', async () => {
    api.createResource.mockResolvedValue({ id: 2 });
    render(<App />);
    await screen.findByText('Sala Alpha');
    await userEvent.type(screen.getByPlaceholderText('Ex: Sala de Reunião Alpha'), 'Mesa 7');
    await userEvent.click(screen.getByRole('button', { name: /Cadastrar Espaço/ }));
    await waitFor(() =>
      expect(api.createResource).toHaveBeenCalledWith({
        name: 'Mesa 7',
        type: 'workstation',
        capacity: 1,
      })
    );
    expect(await screen.findByText('Espaço cadastrado com sucesso!')).toBeInTheDocument();
    await waitFor(() => expect(api.getResources).toHaveBeenCalledTimes(2));
  });
});
```

### Comandos

```bash
cd client
npm run test                 # 4 testes verdes antes e depois do corte
npm run lint                 # 0 erros
npm run build                # bundle dentro de +2 % do baseline
find src -name '*.jsx' | xargs wc -l | sort -rn | head -5
```

### Regressão manual (QA-03)

Igor Seberino (QA) roda o roteiro da **QA-03** duas vezes: uma em `main`
(baseline), uma na branch, com os mesmos dados de seed. As duas execuções
precisam produzir as mesmas telas e os mesmos textos. Anexar as duas no PR.

## Critérios de aceite

* [ ] `client/src/App.jsx` tem **menos de 60 linhas** (baseline: 351).
* [ ] Nenhum arquivo `.jsx` em `client/src/` passa de **120 linhas**
      (baseline: maior = 351).
* [ ] `find src -name '*.jsx' | xargs wc -l | sort -rn | head -1` mostra
      `ReservationForm.jsx` ou menor, sempre ≤ 120.
* [ ] Existem as pastas `src/components/`, `src/hooks/`, `src/features/resources/`
      e `src/features/reservations/` (baseline: nenhuma das quatro).
* [ ] Componentes React declarados: **≥ 13** (baseline: 1).
* [ ] Hooks customizados: **3** (baseline: 0).
* [ ] `useState` no `App.jsx`: **1** (baseline: 9).
* [ ] Blocos `try/catch` no `App.jsx`: **1** (baseline: 6).
* [ ] `src/App.css` removido e `grep -rn "App.css" src/` não retorna nada.
* [ ] Estilos inline (`style={{`) em `src/`: **0** (baseline: 4).
* [ ] Magic strings de domínio fora de `constants/domain.js`: **0**
      (baseline: `'workstation'`, `'meeting_room'`, `'scheduled'`,
      `'completed'`, `'cancelled'` espalhadas em 6 pontos do `App.jsx`).
* [ ] Testes de frontend: **4 passando** (baseline: 0).
* [ ] `npm run lint`: **0 erros** (baseline: 0 — não regredir).
* [ ] `npm run build` verde e bundle ≤ **206 kB** (baseline 201,86 kB, tolerância
      de +2 %); nenhuma `dependency` de produção adicionada.
* [ ] Roteiro QA-03 executado antes e depois, com resultado idêntico, anexado ao PR.
* [ ] BUG-13, BUG-14, BUG-15, CS-12 e CS-13 **continuam presentes** — esta spec
      não os corrige, e isso está declarado na descrição do PR.
* [ ] PR aprovado por Igor Seberino (`@igorSeberino`, QA) com CI verde.

## Passo a passo TBD

```bash
# 1. Branch curta a partir de main
git checkout main
git pull origin main
git checkout -b refactor/split-god-component

# 2. Baseline — registrar os números ANTES de mexer em nada
cd client
npm ci --legacy-peer-deps
npm run lint | tee ../docs/auditoria/evidencias/fe-01-lint-antes.txt
npm run build | tee ../docs/auditoria/evidencias/fe-01-build-antes.txt
find src -name '*.js' -o -name '*.jsx' | xargs wc -l | sort -n \
  | tee ../docs/auditoria/evidencias/fe-01-wc-antes.txt

# 3. Rede de proteção primeiro: infraestrutura de teste + caracterização
npm i -D vitest jsdom @testing-library/react @testing-library/jest-dom \
         @testing-library/user-event --legacy-peer-deps
# criar vite.config.js (bloco test), src/setupTests.js, src/App.test.jsx
# e adicionar os scripts test/test:watch ao package.json
npm run test   # tem de passar CONTRA O App.jsx DE 351 LINHAS
cd ..
git add client/package.json client/package-lock.json client/vite.config.js \
        client/src/setupTests.js client/src/App.test.jsx
git commit -m "test(client): adicionar Vitest e teste de caracterizacao do App"

# 4. Extrair o genérico e as constantes de domínio
# criar src/constants/domain.js, src/components/{Alert,Tabs,Card,EmptyState}.jsx
git add client/src/constants client/src/components
git commit -m "refactor(client): extrair componentes genericos e constantes de dominio"

# 5. Extrair os hooks de dados
# criar src/hooks/{useFeedback,useResources,useReservations}.js
git add client/src/hooks
git commit -m "refactor(client): extrair hooks useResources, useReservations e useFeedback"

# 6. Extrair a feature de recursos
git add client/src/features/resources
git commit -m "refactor(resources): extrair formulario e lista de espacos para src/features/resources"

# 7. Extrair a feature de reservas
git add client/src/features/reservations
git commit -m "refactor(reservations): extrair formulario e lista de reservas para src/features/reservations"

# 8. Reduzir o App.jsx a composição
git add client/src/App.jsx
git commit -m "refactor(client): reduzir App.jsx a composicao de 351 para 48 linhas"

# 9. Trocar estilo inline por classe e remover o CSS morto do template
git add client/src/index.css
git commit -m "refactor(client): substituir estilos inline por classes em index.css"
git rm client/src/App.css
git commit -m "chore(client): remover App.css do template do Vite, nunca importado"

# 10. Verificação final — os mesmos números, DEPOIS
cd client
npm run test && npm run lint && npm run build
find src -name '*.js' -o -name '*.jsx' | xargs wc -l | sort -n \
  | tee ../docs/auditoria/evidencias/fe-01-wc-depois.txt
cd ..
git add docs/auditoria/evidencias
git commit -m "docs(auditoria): registrar metricas de LOC antes e depois da FE-01"

# 11. PR
git push -u origin refactor/split-god-component
# Abrir PR para main, título:
#   refactor(client): quebrar o God Component App.jsx em features e hooks
# Corpo: link para docs/specs/fe-01-split-god-component/implementacao.md,
#   tabela antes/depois, as duas execuções do roteiro QA-03,
#   e a lista explícita do que NÃO foi corrigido (BUG-13/14/15, CS-12, CS-13).
# Revisor obrigatório: @igorSeberino (QA). Merge só com 1 aprovação + CI verde.
```

## Prompt para o Claude Code

```text
Você está na raiz do repositório igorSeberino/srec, na branch
refactor/split-god-component. Carregue a skill de arquitetura de frontend do
repositório antes de começar.

Leia, por inteiro e nesta ordem:
  1. docs/specs/fe-01-split-god-component/implementacao.md  (esta é a ordem de serviço)
  2. client/src/App.jsx
  3. client/src/services/api.js
  4. client/src/main.jsx
  5. client/src/index.css
  6. client/eslint.config.js e client/vite.config.js

Tarefa: quebrar o God Component client/src/App.jsx (351 linhas) na árvore de
features e hooks descrita na seção "Alterações" da spec, aplicando o código
proposto lá. Siga a spec literalmente; ela já tem o conteúdo de cada arquivo.

Regras não negociáveis:
- É refatoração de COMPORTAMENTO PRESERVADO. Nenhum texto de interface, classe
  CSS, chamada de API, ordem de requisição ou mensagem de feedback pode mudar.
- NÃO corrija BUG-13 (botão de submit sem trava), BUG-14 (setTimeout sem
  clearTimeout), BUG-15 (updateResource órfão), CS-12 (as duas supressões
  eslint-disable no useEffect) nem CS-13 (label sem htmlFor). Cada um tem spec
  própria: FE-03, FE-04 e FE-05. Mantenha os comentários TODO que apontam para elas.
- NÃO toque em client/src/services/api.js — é escopo da FE-02.
- NÃO adicione nenhuma dependency de produção. Só as devDependencies de teste
  listadas na spec.
- Nenhum arquivo .jsx acima de 120 linhas; App.jsx abaixo de 60 linhas.
- Comece pelo commit de teste (passo 3 do "Passo a passo TBD"): o teste de
  caracterização tem de passar contra o App.jsx original ANTES de você começar
  a cortar. Se ele não passar, pare e me diga o que divergiu.
- Um commit por passo do "Passo a passo TBD", com as mensagens prontas que
  estão lá (Conventional Commits em português, no imperativo).
- Não rode comandos git push nem abra PR.

Ao terminar, rode `cd client && npm run test && npm run lint && npm run build`
e me devolva: a saída de `find src -name '*.jsx' | xargs wc -l | sort -rn`, o
número de linhas final do App.jsx, o tamanho do bundle comparado com
201,86 kB (63,26 kB gzip), e a confirmação de que os 4 testes passam.
```
