# Arquitetura alvo do frontend na N2 — `client/`

O alvo é o mesmo comportamento de hoje, com as 351 linhas de `App.jsx`
distribuídas em arquivos com responsabilidade única, nenhum passando de 120
linhas. Mesma stack: React 19, Vite 8, `useState`/`useEffect`, CSS existente.
Nada novo instalado.

## Árvore alvo, com o tamanho esperado

```
client/src/
  main.jsx                                     10   bootstrap (inalterado)
  App.jsx                                    ~55   header, abas, feedback
  config/env.js                              ~10   VITE_API_BASE_URL
  services/
    httpClient.js                            ~45   fetch + erro, um lugar só
    resources.js                             ~25
    reservations.js                          ~30
  domain/
    resourceType.js                          ~20
    reservationStatus.js                     ~20
    dateTime.js                              ~25   ISO 8601 com offset (BUG-07)
  hooks/
    useFeedback.js                           ~30   com cleanup (BUG-14)
  components/ui/
    Alert.jsx                                ~15
    Card.jsx                                 ~12
    Tabs.jsx                                 ~25
    FormField.jsx                            ~25   label + htmlFor (CS-13)
    SubmitButton.jsx                         ~20   desabilita no submit (BUG-13)
    ConfirmButton.jsx                        ~25   substitui window.confirm
  features/
    resources/
      hooks/useResources.js                  ~55
      components/ResourceForm.jsx            ~75
      components/ResourceCard.jsx            ~35
      components/ResourceList.jsx            ~30
      ResourcesPanel.jsx                     ~30
    reservations/
      hooks/useReservations.js               ~65
      components/ReservationForm.jsx         ~95
      components/ReservationCard.jsx         ~60
      components/ReservationList.jsx         ~30
      ReservationsPanel.jsx                  ~30
```

`client/src/services/api.js` é **removido** ao final da migração, depois que
ninguém mais o importa. Não deixe os dois conviverem além do PR de transição.

## 1. `config/env.js` — resolve CS-07

```js
// client/src/config/env.js
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
```

Acompanha um `client/.env.example` versionado:

```
VITE_API_BASE_URL=http://localhost:5000/api
```

O fallback existe para o clone funcionar sem configuração — mas o valor passa a
ser configurável sem editar código. Nenhum outro arquivo lê `import.meta.env`
direto; todos importam de `config/env.js`.

## 2. `services/httpClient.js` — um tratamento de erro, não dois

Resolve a divergência entre as variantes A e B de `api.js`.

```js
// client/src/services/httpClient.js
import { API_BASE_URL } from '../config/env';

const parseError = async (response) => {
  try {
    const body = await response.json();
    return new Error(body.error || `Falha na requisição (HTTP ${response.status})`);
  } catch {
    return new Error(`Falha na requisição (HTTP ${response.status})`);
  }
};

const request = async (path, { method = 'GET', body } = {}) => {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('Não foi possível falar com o servidor. Ele está no ar?');
  }

  if (!response.ok) throw await parseError(response);
  if (response.status === 204) return null;
  return response.json();
};

export const httpClient = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body }),
  put: (path, body) => request(path, { method: 'PUT', body }),
  patch: (path, body) => request(path, { method: 'PATCH', body }),
  delete: (path) => request(path, { method: 'DELETE' }),
};
```

Todo erro do backend passa a chegar ao usuário com a mensagem real, incluindo o
409 de conflito de horário e o 400 de status inválido. Falha de rede ganha
mensagem própria, distinta de erro HTTP — hoje as duas caem no mesmo toast
genérico.

```js
// client/src/services/reservations.js
import { httpClient } from './httpClient';

export const reservationsService = {
  list: () => httpClient.get('/reservations'),
  getById: (id) => httpClient.get(`/reservations/${id}`),
  create: (payload) => httpClient.post('/reservations', payload),
  updateStatus: (id, status) => httpClient.patch(`/reservations/${id}/status`, { status }),
  remove: (id) => httpClient.delete(`/reservations/${id}`),
};
```

`resources.js` segue o mesmo molde. `update` de recurso só entra aqui quando
alguma tela de fato chamar — hoje é órfão (BUG-15); a decisão (implementar a tela
de edição ou remover o método nas duas pontas) é de produto, registrada em spec.

## 3. `domain/` — rótulo e enum, com fallback explícito

Resolve BUG-10 e as linhas 212/245/306 que exibiam valor cru.

```js
// client/src/domain/resourceType.js
export const RESOURCE_TYPE = Object.freeze({
  WORKSTATION: 'workstation',
  MEETING_ROOM: 'meeting_room',
});

const LABELS = {
  [RESOURCE_TYPE.WORKSTATION]: 'Estação de Trabalho',
  [RESOURCE_TYPE.MEETING_ROOM]: 'Sala de Reunião',
};

export const RESOURCE_TYPE_OPTIONS = Object.entries(LABELS).map(([value, label]) => ({ value, label }));

// Fallback explícito: valor desconhecido aparece como desconhecido, não como estação.
export const resourceTypeLabel = (type) => LABELS[type] ?? `Tipo desconhecido (${type})`;
```

```js
// client/src/domain/reservationStatus.js
export const RESERVATION_STATUS = Object.freeze({
  SCHEDULED: 'scheduled',
  CANCELLED: 'cancelled',
  COMPLETED: 'completed',
});

const LABELS = {
  [RESERVATION_STATUS.SCHEDULED]: 'Agendada',
  [RESERVATION_STATUS.CANCELLED]: 'Cancelada',
  [RESERVATION_STATUS.COMPLETED]: 'Concluída',
};

export const reservationStatusLabel = (status) => LABELS[status] ?? `Status desconhecido (${status})`;
```

Os valores precisam ser **exatamente** os mesmos de
`server/src/domain/reservationStatus.js` e `resourceType.js`. Divergir aqui
quebra a tela sem erro de lint — por isso o fallback mostra o valor cru entre
parênteses em vez de esconder o problema.

```js
// client/src/domain/dateTime.js — BUG-07
// <input type="datetime-local"> devolve "2026-10-23T14:00", sem fuso.
// Enviar assim deixa o backend interpretar o fuso que quiser.
export const localInputToIso = (value) => (value ? new Date(value).toISOString() : null);

export const formatRange = (startIso, endIso) => {
  const fmt = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  return `${fmt.format(new Date(startIso))} até ${fmt.format(new Date(endIso))}`;
};

export const isAfter = (endValue, startValue) => new Date(endValue) > new Date(startValue);
```

Esta é a ponta frontend do BUG-07 e **só funciona junto** com a migração de
`TIMESTAMP` para `TIMESTAMPTZ` no backend. As duas pontas na mesma spec, ou o
horário continua deslocado.

## 4. `hooks/useFeedback.js` — resolve BUG-14

```js
// client/src/hooks/useFeedback.js
import { useCallback, useEffect, useRef, useState } from 'react';

export const useFeedback = (timeoutMs = 4000) => {
  const [message, setMessage] = useState(null);
  const timerRef = useRef(null);

  const clear = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setMessage(null);
  }, []);

  const show = useCallback(
    (text, type = 'success') => {
      if (timerRef.current) clearTimeout(timerRef.current);   // não deixa o timer antigo apagar a nova mensagem
      setMessage({ text, type });
      timerRef.current = setTimeout(() => setMessage(null), timeoutMs);
    },
    [timeoutMs],
  );

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);     // cleanup na desmontagem
  }, []);

  return { message, show, clear };
};
```

## 5. Hook de feature — dono do dado e da mutação

Resolve CS-08 (refetch total) e a duplicação dos 5 handlers.

```js
// client/src/features/reservations/hooks/useReservations.js
import { useCallback, useEffect, useState } from 'react';
import { reservationsService } from '../../../services/reservations';

export const useReservations = ({ onSuccess, onError }) => {
  const [reservations, setReservations] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setReservations(await reservationsService.list());
    } catch (err) {
      setError(err.message);
      onError?.(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    load();
  }, [load]);

  const create = useCallback(
    async (payload) => {
      const created = await reservationsService.create(payload);
      setReservations((prev) => [...prev, created]);        // cirúrgico, não refetch total
      onSuccess?.('Reserva confirmada com sucesso!');
      return created;
    },
    [onSuccess],
  );

  const updateStatus = useCallback(
    async (id, status) => {
      const updated = await reservationsService.updateStatus(id, status);
      setReservations((prev) => prev.map((item) => (item.id === id ? updated : item)));
      onSuccess?.('Status da reserva atualizado!');
    },
    [onSuccess],
  );

  const remove = useCallback(
    async (id) => {
      await reservationsService.remove(id);
      setReservations((prev) => prev.filter((item) => item.id !== id));
      onSuccess?.('Reserva removida!');
    },
    [onSuccess],
  );

  return { reservations, isLoading, error, reload: load, create, updateStatus, remove };
};
```

Regras do hook de feature:

* Expõe `{ dado, isLoading, error, reload, ...mutações }`. Sempre os três estados
  — `isLoading`, `error` e lista vazia são três telas diferentes, e hoje `error`
  não existe.
* Mutação atualiza o estado local com a resposta do backend (`setReservations` com
  o objeto retornado), não refaz a lista inteira e não recarrega a outra feature.
* `useEffect` com `[load]` e `load` em `useCallback` — isso elimina os dois
  `eslint-disable` de `App.jsx` (CS-12), não os move de lugar.
* O hook **não** mostra feedback; recebe `onSuccess`/`onError` de quem o usa.
* O hook **não** conhece JSX.

## 6. `components/ui/` — burro de propósito

```jsx
// client/src/components/ui/FormField.jsx — resolve CS-13
export default function FormField({ id, label, children }) {
  return (
    <div className="form-group">
      <label htmlFor={id}>{label}</label>
      {children}
    </div>
  );
}
```

```jsx
// client/src/components/ui/SubmitButton.jsx — resolve BUG-13
export default function SubmitButton({ isSubmitting, children, icon: Icon }) {
  return (
    <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
      {Icon ? <Icon size={18} /> : null} {isSubmitting ? 'Enviando...' : children}
    </button>
  );
}
```

`FormField` existe para que seja **impossível** escrever um campo sem `htmlFor`:
o `id` é obrigatório e o mesmo valor vai no `<label htmlFor>` e no `id` do input.
Os 7 rótulos sem associação de hoje passam todos por aqui.

Nada em `components/ui/` importa `services/`, `features/` ou hook de feature.

## 7. Componente de feature — estado do próprio formulário

```jsx
// client/src/features/reservations/components/ReservationForm.jsx (recorte)
import { useState } from 'react';
import { Calendar } from 'lucide-react';
import FormField from '../../../components/ui/FormField';
import SubmitButton from '../../../components/ui/SubmitButton';
import { localInputToIso, isAfter } from '../../../domain/dateTime';

export default function ReservationForm({ resources, onCreate, onError }) {
  const [resourceId, setResourceId] = useState('');
  const [userName, setUserName] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!isAfter(endTime, startTime)) {
      onError('O horário de término precisa ser depois do início');
      return;
    }
    setIsSubmitting(true);                       // BUG-13: trava o duplo clique
    try {
      await onCreate({
        resource_id: Number(resourceId),
        user_name: userName,
        start_time: localInputToIso(startTime),  // BUG-07
        end_time: localInputToIso(endTime),
      });
      setUserName('');
      setStartTime('');
      setEndTime('');
    } catch (err) {
      onError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <FormField id="reservation-resource" label="Selecione o Espaço">
        <select id="reservation-resource" className="form-control" value={resourceId}
                onChange={(e) => setResourceId(e.target.value)} required>
          {/* ... */}
        </select>
      </FormField>
      {/* ... */}
      <SubmitButton isSubmitting={isSubmitting} icon={Calendar}>Confirmar Reserva</SubmitButton>
    </form>
  );
}
```

Os quatro `useState` de formulário de reserva saíram de `App.jsx` e moram onde
são usados. Digitar aqui não re-renderiza a lista de recursos.

## 8. `App.jsx` alvo — até 60 linhas

```jsx
// client/src/App.jsx
import { useState } from 'react';
import { Building2 } from 'lucide-react';
import Alert from './components/ui/Alert';
import Tabs from './components/ui/Tabs';
import { useFeedback } from './hooks/useFeedback';
import ResourcesPanel from './features/resources/ResourcesPanel';
import ReservationsPanel from './features/reservations/ReservationsPanel';

const TABS = [
  { id: 'resources', label: 'Espaços e Salas' },
  { id: 'reservations', label: 'Agendamentos' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState('resources');
  const { message, show } = useFeedback();

  return (
    <div>
      <header>
        <div className="header-content">
          <div className="header-title">
            <Building2 size={28} color="#3b82f6" />
            <span>SREC - Sistema de Reservas &amp; Coworking</span>
          </div>
        </div>
      </header>

      <div className="container">
        {message && <Alert type={message.type}>{message.text}</Alert>}
        <Tabs tabs={TABS} activeId={activeTab} onChange={setActiveTab} />
        {activeTab === 'resources' && <ResourcesPanel onFeedback={show} />}
        {activeTab === 'reservations' && <ReservationsPanel onFeedback={show} />}
      </div>
    </div>
  );
}
```

De 351 para ~55 linhas. Zero `useState` de formulário, zero `fetch`, zero
`useEffect` de dado, zero `eslint-disable`.

O `ReservationsPanel` precisa da lista de recursos para o seletor; ele usa o
`useResources` em modo leitura. Uma feature **não** importa componente da outra —
só o hook, que é dado compartilhado, ou o seletor sobe para `components/ui/`.

## Ordem de execução recomendada das issues

Cada passo deixa a aplicação funcionando; nenhum é um "big bang".

1. `config/env.js` + `services/httpClient.js` + `services/resources.js` +
   `services/reservations.js`, com `App.jsx` apenas trocando o import → CS-07 e o
   erro unificado, sem mexer no render.
2. `domain/resourceType.js` + `domain/reservationStatus.js`, aplicados nas linhas
   212, 245 e 306 → CS-05 e BUG-10.
3. `hooks/useFeedback.js` → BUG-14.
4. `components/ui/` (`Alert`, `Card`, `Tabs`, `FormField`, `SubmitButton`) →
   CS-13 e BUG-13.
5. `features/resources/` (hook + form + list + panel), tirando de `App.jsx` →
   primeira metade do CS-01.
6. `features/reservations/` (hook + form + list + panel) → segunda metade do
   CS-01 e CS-08. Aqui `App.jsx` chega a ~55 linhas.
7. `domain/dateTime.js` → BUG-07, coordenado com o `TIMESTAMPTZ` do backend.
8. Remover `services/api.js` e os placeholders `client.txt` → CS-11.

Depois de cada passo, medir e registrar: `wc -l client/src/App.jsx`. O número
caindo de 351 é a evidência que o pitch da N2 apresenta.
