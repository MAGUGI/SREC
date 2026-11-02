# FE-03 — Validação de formulário no cliente e trava de envio

* **Responsável:** Renato Colin Neto (Desenvolvedor Frontend)
* **Issue:** #<a definir>
* **Branch:** `fix/form-validation-and-submit-lock`
* **Rubrica:** 2,5 — Melhoria comprovada do código recebido (BUG-13, BAIXO); 1,5 — Clareza nas alterações feitas, para a N3
* **Depende de:** FE-01 (os formulários já extraídos), FE-02 (`ApiError` com `status`). Espelha no cliente a validação definida na **BE-02**; **não substitui** a BE-02 nem a BE-01.

## Problema

### 1. O botão de submit não desabilita (BUG-13)

`client/src/App.jsx:281-283`, o botão de confirmar reserva:

```jsx
<button type="submit" className="btn btn-primary">
  <Calendar size={18} /> Confirmar Reserva
</button>
```

Sem `disabled`. E o handler, `App.jsx:87-104`, não tem nenhum controle de
reentrância:

```js
const handleCreateReservation = async (e) => {
  e.preventDefault();
  try {
    await api.createReservation({ ... });
    setUserName('');
    ...
```

O `setUserName('')` e os demais `setState` de limpeza só rodam **depois** do
`await`. Enquanto o POST está em voo, o formulário permanece preenchido e o
botão clicável. Dois cliques rápidos = **dois `POST /api/reservations`** com
corpo idêntico.

Mesma coisa no formulário de recurso: botão em `App.jsx:195-197`, handler em
`App.jsx:59-74`.

O impacto real não é cosmético. O `reservationController.js:12-28` verifica
disponibilidade com `checkAvailability` e só depois chama `create`, sem
transação e sem constraint no banco — é o **BUG-01 (CRÍTICO, TOCTOU)**. Duas
requisições simultâneas passam as duas pela verificação e gravam as duas. O
duplo clique no front é, literalmente, **o caminho mais fácil de disparar a
dupla reserva**: não precisa de script, não precisa de concorrência real entre
usuários, basta clicar duas vezes rápido. A métrica da auditoria registra
**0 constraints de integridade** no schema — nada no caminho segura.

### 2. Não existe validação de `fim > início` no cliente

Os dois `datetime-local` (`App.jsx:263-269` e `:273-279`) têm apenas `required`.
Nada impede `início = 18:00` e `fim = 09:00`. O que acontece quando isso é
enviado:

* `reservationController.js:7` valida só presença dos campos;
* `checkAvailability` (`reservationModel.js:49-61`) roda
  `start_time < $3 AND end_time > $2` — com um intervalo invertido, a condição
  **nunca** é satisfeita, então a reserva "está disponível" contra tudo;
* a reserva é gravada e aparece na lista como
  `21/10/2026, 18:00:00 até 21/10/2026, 09:00:00`.

Esse é o **BUG-02 (CRÍTICO)**: uma reserva invertida é aceita e nunca colide
com nada, o que a torna uma porta de entrada para sobreposição. Não há `CHECK
(end_time > start_time)` no `initDb.js`.

### 3. Não existe validação de data no passado

Nenhum `min` nos inputs. `reservationController.js` não compara com
`CURRENT_TIMESTAMP`. Reservar uma sala para ontem às 08:00 é aceito com `201`
— é o **BUG-08 (MÉDIO)**.

### 4. `capacity` não é validado no cliente

`App.jsx:186-193` tem `min="1"` no input, o que o navegador respeita, mas o
valor segue como string e é convertido na linha 65 com `Number(resCapacity)`.
Colar `0` e submeter via teclado passa pelo `min` em alguns navegadores; e o
`resourceController.js:10` faz `capacity || 1`, transformando `0` em `1`
silenciosamente — **BUG-09**. O cliente não avisa nada.

### 5. O usuário só descobre o erro pelo servidor, e em inglês

Quando o backend recusa, `App.jsx:102` joga `err.message` na barra de feedback
no topo da página — longe do campo errado, com texto do servidor (`'Name and
type are required'`, `resourceController.js:8`) e sumindo em 4 segundos
(`App.jsx:34`). Não há **nenhuma** mensagem de erro junto de campo em todo o
frontend: `grep -c "form-error\|aria-invalid" client/src/` retorna 0.

## Evidência

### Reproduzir o duplo clique (BUG-13)

Com backend e frontend rodando:

1. Abrir a aba **Agendamentos**, DevTools → Network, filtro `reservations`.
2. Preencher espaço, responsável, início `amanhã 14:00`, fim `amanhã 15:00`.
3. Dar **dois cliques rápidos** em "Confirmar Reserva".
4. Network mostra **2 `POST /api/reservations`**, os dois com `201 Created`.
5. A lista "Reservas Realizadas" mostra **duas reservas idênticas** para o
   mesmo espaço e o mesmo horário.

Reprodução por linha de comando, para o relatório de auditoria (mesma janela,
sem o front):

```bash
# duas requisições em paralelo, idênticas
for i in 1 2; do
  curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:5000/api/reservations \
    -H 'Content-Type: application/json' \
    -d '{"resource_id":1,"user_name":"Teste","start_time":"2026-10-21T14:00","end_time":"2026-10-21T15:00"}' &
done; wait
# => 201 e 201
```

### Reproduzir o intervalo invertido (BUG-02 pela tela)

Preencher início `amanhã 18:00` e fim `amanhã 09:00`, submeter. A tela aceita e
exibe "Reserva confirmada com sucesso!".

### Números

| Métrica | Baseline medido |
|---|---|
| Botões de submit com `disabled` | **0 de 2** (`App.jsx:195`, `:281`) |
| Estados de `submitting` | **0** |
| `POST` disparados por duplo clique | **2** |
| Regras validadas no cliente antes do `POST` | **0** (só `required` e `min` do HTML) |
| Inputs de data com `min` | **0 de 2** |
| Mensagens de erro junto do campo | **0** |
| Atributos `aria-invalid` no projeto | **0** |
| `CHECK (end_time > start_time)` no banco | **0** |
| Testes de frontend cobrindo submit | **0** |

## Decisão

**Estado `submitting` local por formulário, com `disabled` no botão; validação
no cliente em um módulo puro e testável; `min` dinâmico nos inputs de data.**

Sobre a trava: a alternativa óbvia era um debounce no `onClick`. Recusada
porque debounce é uma janela de tempo arbitrária — se a requisição levar mais
que a janela, o segundo clique passa. O estado `submitting` está acoplado ao
**ciclo de vida real da requisição** (`true` antes do `await`, `false` no
`finally`), então não existe janela. Custo: 3 linhas por formulário.

A segunda alternativa recusada foi `useFormStatus`/`useActionState` do React
19. É a API idiomática para isso na versão que o projeto usa, mas exigiria
converter os dois formulários para o modelo de `action`, mudando o fluxo de
limpeza de campos e de feedback que a FE-01 acabou de preservar. Numa entrega de
manutenção com prazo em 23/10, trocar o modelo de formulário para ganhar o
mesmo resultado que 3 linhas de `useState` entregam é risco sem retorno. Fica
registrado em `docs/time/divida-tecnica.md` como melhoria candidata à N3.

Sobre a validação: um módulo puro `features/reservations/validation.js` (e um
para recursos), que recebe os valores e devolve um objeto `{ campo: mensagem }`.
Puro porque é o que o torna testável sem renderizar nada — e porque a
**mesma tabela de regras** da BE-02 precisa ser lida por duas pessoas (Adrian no
backend, Renato no front) sem divergir. A alternativa óbvia era validar inline
dentro do `handleSubmit`; recusada por ser exatamente o CS-04 (validação
ad-hoc) que estamos corrigindo no backend — reproduzi-lo no front seria
importar o smell.

Recusado também: Zod, Yup, React Hook Form. São 2 formulários com 7 campos
somados. Zod são ~12 kB gzip no bundle para substituir ~40 linhas de função
pura. Zero dependência de produção nesta spec.

Sobre o `min`: os dois inputs recebem `min` dinâmico — o de início recebe o
instante atual arredondado para o minuto, e o de término recebe o valor atual
de `startTime`. Isso faz o próprio navegador barrar a maioria dos casos antes
de qualquer JavaScript rodar, e é acessível de graça. Não substitui a validação
em JS, porque `min` em `datetime-local` tem suporte irregular e é
contornável pelo DevTools.

### A linha que não pode ser cruzada

**A validação no cliente é conveniência de interface. O servidor continua
sendo a única autoridade.** Isso não é retórica — é a decisão arquitetural
desta spec, e tem três consequências concretas:

1. Esta spec **não fecha** BUG-02 nem BUG-08. Os dois só fecham com a
   **BE-02** (validação no controller) e com os `CHECK` do schema. Qualquer
   cliente — `curl`, Postman, o script do item "Evidência" — continua
   furando a validação do front. O PR desta spec declara isso explicitamente.
2. Esta spec **não fecha** o BUG-01. A trava de submit remove o caminho mais
   fácil de disparar o TOCTOU, não o TOCTOU. A correção é a **BE-01**
   (transação + constraint `EXCLUDE`/`UNIQUE`). Enquanto a BE-01 não entrar,
   dois navegadores diferentes ainda produzem dupla reserva.
3. Quando a BE-02 devolver `400` com mensagem por campo, o formulário **tem
   que exibir essa mensagem no campo**, e não substituí-la pela sua própria.
   O helper `applyServerErrors` existe para isso: a mensagem do servidor
   sempre vence a do cliente.

## Alterações

```
client/src/
  hooks/
    useSubmit.js                                (NOVO ~26 linhas)
  components/
    FieldError.jsx                              (NOVO ~10 linhas)
    SubmitButton.jsx                            (NOVO ~22 linhas)
  lib/
    validation.js                               (NOVO ~30 linhas)
    validation.test.js                          (NOVO ~26 linhas)
  features/
    resources/
      validation.js                             (NOVO ~22 linhas)
      validation.test.js                        (NOVO ~24 linhas)
      ResourceForm.jsx                          (alterado: ~86 → ~112 linhas)
    reservations/
      validation.js                             (NOVO ~44 linhas)
      validation.test.js                        (NOVO ~56 linhas)
      ReservationForm.jsx                       (alterado: ~104 → ~118 linhas)
      ReservationForm.test.jsx                  (NOVO ~84 linhas)
  index.css                                     (alterado: +3 regras)
```

### `client/src/lib/validation.js` (novo)

```js
/** Agora arredondado para o minuto, no formato do <input type="datetime-local">. */
export function nowForDateTimeInput(reference = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return (
    `${reference.getFullYear()}-${pad(reference.getMonth() + 1)}-${pad(reference.getDate())}` +
    `T${pad(reference.getHours())}:${pad(reference.getMinutes())}`
  );
}

export function isBlank(value) {
  return value === null || value === undefined || String(value).trim() === '';
}

/** Mescla os erros vindos do servidor por cima dos do cliente: servidor vence. */
export function applyServerErrors(clientErrors, apiError) {
  const fromServer = apiError?.body?.errors;
  if (!fromServer || typeof fromServer !== 'object') return clientErrors;
  return { ...clientErrors, ...fromServer };
}

export function hasErrors(errors) {
  return Object.keys(errors).length > 0;
}
```

### `client/src/features/reservations/validation.js` (novo)

A tabela de regras é a mesma da **BE-02**. Divergência entre os dois arquivos é
bug — o PR referencia a spec da BE-02 lado a lado.

```js
import { isBlank } from '../../lib/validation';

export const MIN_DURATION_MINUTES = 15;
export const MAX_DURATION_HOURS = 12;

/**
 * Espelha as regras da BE-02. O servidor é a autoridade; isto é conveniência
 * de interface para o usuário não descobrir o erro só depois do POST.
 */
export function validateReservation(values, { now = new Date() } = {}) {
  const errors = {};

  if (isBlank(values.resource_id)) {
    errors.resource_id = 'Selecione um espaço.';
  }
  if (isBlank(values.user_name)) {
    errors.user_name = 'Informe o nome do responsável.';
  } else if (values.user_name.trim().length > 100) {
    errors.user_name = 'O nome do responsável tem no máximo 100 caracteres.';
  }

  const start = values.start_time ? new Date(values.start_time) : null;
  const end = values.end_time ? new Date(values.end_time) : null;

  if (!start || Number.isNaN(start.getTime())) {
    errors.start_time = 'Informe o horário de início.';
  } else if (start.getTime() <= now.getTime()) {
    errors.start_time = 'O início precisa ser no futuro.';
  }

  if (!end || Number.isNaN(end.getTime())) {
    errors.end_time = 'Informe o horário de término.';
  } else if (start && !Number.isNaN(start.getTime())) {
    const minutes = (end.getTime() - start.getTime()) / 60000;
    if (minutes <= 0) {
      errors.end_time = 'O término precisa ser depois do início.';
    } else if (minutes < MIN_DURATION_MINUTES) {
      errors.end_time = `A reserva precisa ter ao menos ${MIN_DURATION_MINUTES} minutos.`;
    } else if (minutes > MAX_DURATION_HOURS * 60) {
      errors.end_time = `A reserva não pode passar de ${MAX_DURATION_HOURS} horas.`;
    }
  }

  return errors;
}
```

### `client/src/features/resources/validation.js` (novo)

```js
import { isBlank } from '../../lib/validation';
import { RESOURCE_TYPE } from '../../constants/domain';

const VALID_TYPES = Object.values(RESOURCE_TYPE);

export function validateResource(values) {
  const errors = {};

  if (isBlank(values.name)) {
    errors.name = 'Informe o nome do espaço.';
  } else if (values.name.trim().length > 100) {
    errors.name = 'O nome tem no máximo 100 caracteres.';
  }

  if (!VALID_TYPES.includes(values.type)) {
    errors.type = 'Selecione um tipo válido.';
  }

  const capacity = Number(values.capacity);
  if (!Number.isInteger(capacity) || capacity < 1) {
    errors.capacity = 'A capacidade precisa ser um número inteiro de 1 ou mais.';
  }

  return errors;
}
```

> `capacity >= 1` é o espelho do BUG-09. O cliente avisa; a correção definitiva
> é o `CHECK (capacity >= 1)` e a remoção do `capacity || 1` do
> `resourceController.js:10`, que é escopo do backend.

### `client/src/hooks/useSubmit.js` (novo)

Encapsula a trava. Um só lugar garante que `submitting` volte a `false` mesmo
com exceção — o `finally` é o que fecha o BUG-13 de verdade.

```js
import { useCallback, useState } from 'react';

export function useSubmit(handler) {
  const [submitting, setSubmitting] = useState(false);

  const submit = useCallback(
    async (event) => {
      event?.preventDefault();
      if (submitting) return; // segunda barreira: ignora reentrada
      setSubmitting(true);
      try {
        await handler();
      } finally {
        setSubmitting(false);
      }
    },
    [handler, submitting]
  );

  return { submitting, submit };
}
```

### `client/src/components/SubmitButton.jsx` (novo)

```js
export function SubmitButton({ submitting, idleLabel, busyLabel, icon }) {
  return (
    <button type="submit" className="btn btn-primary" disabled={submitting} aria-busy={submitting}>
      {icon}
      {submitting ? busyLabel : idleLabel}
    </button>
  );
}
```

### `client/src/components/FieldError.jsx` (novo)

```js
export function FieldError({ id, message }) {
  if (!message) return null;
  return (
    <p className="form-error" id={id} role="alert">
      {message}
    </p>
  );
}
```

> `id` e o `aria-describedby`/`aria-invalid` que o acompanham entram por
> inteiro na **FE-04**, que é a spec de acessibilidade. Aqui já nascem com o
> `id` previsto para não haver retrabalho.

### `client/src/features/reservations/ReservationForm.jsx` (alterado)

Diff conceitual sobre a versão da FE-01:

```js
import { useEffect, useMemo, useState } from 'react';
import { Calendar } from 'lucide-react';
import { Card } from '../../components/Card';
import { FieldError } from '../../components/FieldError';
import { SubmitButton } from '../../components/SubmitButton';
import { useSubmit } from '../../hooks/useSubmit';
import { applyServerErrors, hasErrors, nowForDateTimeInput } from '../../lib/validation';
import { validateReservation } from './validation';

export function ReservationForm({ resources, onCreate, onSuccess, onError }) {
  const [resourceId, setResourceId] = useState('');
  const [userName, setUserName] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [errors, setErrors] = useState({});

  const minStart = useMemo(() => nowForDateTimeInput(), []);

  useEffect(() => {
    if (resources.length > 0) {
      setResourceId((previous) => previous || resources[0].id);
    }
  }, [resources]);

  const { submitting, submit } = useSubmit(async () => {
    const values = {
      resource_id: resourceId,
      user_name: userName,
      start_time: startTime,
      end_time: endTime,
    };

    const clientErrors = validateReservation(values);
    if (hasErrors(clientErrors)) {
      setErrors(clientErrors);
      return; // nenhum POST é disparado
    }
    setErrors({});

    try {
      await onCreate(values);
      setUserName('');
      setStartTime('');
      setEndTime('');
      onSuccess('Reserva confirmada com sucesso!');
    } catch (err) {
      // A mensagem do servidor (BE-02) sempre vence a do cliente.
      setErrors(applyServerErrors({}, err));
      onError(err.message);
    }
  });

  return (
    <Card title="Novo Agendamento">
      <form onSubmit={submit} noValidate>
        {/* ...select de espaço, com <FieldError message={errors.resource_id} /> ... */}
        {/* ...input de responsável, com <FieldError message={errors.user_name} /> ... */}
        <div className="form-group">
          <label>Horário de Início</label>
          <input
            type="datetime-local"
            className={`form-control ${errors.start_time ? 'is-invalid' : ''}`}
            min={minStart}
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            required
          />
          <FieldError id="reservation-start-error" message={errors.start_time} />
        </div>
        <div className="form-group">
          <label>Horário de Término</label>
          <input
            type="datetime-local"
            className={`form-control ${errors.end_time ? 'is-invalid' : ''}`}
            min={startTime || minStart}
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            required
          />
          <FieldError id="reservation-end-error" message={errors.end_time} />
        </div>
        <SubmitButton
          submitting={submitting}
          idleLabel="Confirmar Reserva"
          busyLabel="Confirmando..."
          icon={<Calendar size={18} />}
        />
      </form>
    </Card>
  );
}
```

`noValidate` no `<form>` é intencional: sem ele o navegador bloqueia o submit
com a sua própria bolha nativa (em inglês, dependendo do idioma do SO) antes de
a nossa validação rodar, e as mensagens ficariam inconsistentes. Os `required`
e `min` continuam no markup porque são lidos por leitores de tela e por
ferramentas de a11y (FE-04) mesmo com `noValidate`.

### `client/src/features/resources/ResourceForm.jsx` (alterado)

Mesma estrutura: `useSubmit`, `validateResource`, `FieldError` em `name`,
`type` e `capacity`, e

```js
<SubmitButton
  submitting={submitting}
  idleLabel="Cadastrar Espaço"
  busyLabel="Cadastrando..."
  icon={<PlusCircle size={18} />}
/>
```

### `client/src/index.css` (alterado)

```css
.form-error {
  font-size: 0.8125rem;
  color: #991b1b;
  margin-top: 0.25rem;
}

.form-control.is-invalid {
  border-color: #ef4444;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
```

## Testes

### `client/src/features/reservations/ReservationForm.test.jsx` (novo) — o que falha antes

O primeiro caso é o teste do BUG-13 e **falha contra o código recebido**:
dois cliques produzem duas chamadas.

```js
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ReservationForm } from './ReservationForm';

const RESOURCES = [{ id: 1, name: 'Sala Alpha', type: 'meeting_room', capacity: 8 }];

function futureInput(hoursAhead) {
  const date = new Date(Date.now() + hoursAhead * 3600_000);
  const pad = (v) => String(v).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

async function fillValid(user) {
  await user.type(screen.getByPlaceholderText('Ex: Carlos Silva'), 'Carlos Silva');
  await user.type(screen.getByLabelText(/Horário de Início/), futureInput(24));
  await user.type(screen.getByLabelText(/Horário de Término/), futureInput(25));
}

describe('ReservationForm', () => {
  // FALHA ANTES (BUG-13): o botão não desabilita e o POST sai duas vezes.
  it('dispara apenas um POST com duplo clique', async () => {
    const user = userEvent.setup();
    let resolve;
    const onCreate = vi.fn(() => new Promise((r) => { resolve = r; }));
    render(
      <ReservationForm resources={RESOURCES} onCreate={onCreate} onSuccess={vi.fn()} onError={vi.fn()} />
    );
    await fillValid(user);

    const button = screen.getByRole('button', { name: /Confirmar Reserva/ });
    await user.click(button);
    await user.click(button);

    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent('Confirmando...');

    resolve({ id: 1 });
    await waitFor(() => expect(button).toBeEnabled());
    expect(button).toHaveTextContent('Confirmar Reserva');
  });

  // FALHA ANTES (espelha BUG-02): o front manda e o servidor aceita.
  it('não envia quando o término é antes do início', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    render(
      <ReservationForm resources={RESOURCES} onCreate={onCreate} onSuccess={vi.fn()} onError={vi.fn()} />
    );
    await user.type(screen.getByPlaceholderText('Ex: Carlos Silva'), 'Carlos Silva');
    await user.type(screen.getByLabelText(/Horário de Início/), futureInput(25));
    await user.type(screen.getByLabelText(/Horário de Término/), futureInput(24));
    await user.click(screen.getByRole('button', { name: /Confirmar Reserva/ }));

    expect(onCreate).not.toHaveBeenCalled();
    expect(screen.getByText('O término precisa ser depois do início.')).toBeInTheDocument();
  });

  // FALHA ANTES (espelha BUG-08).
  it('não envia quando o início está no passado', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    render(
      <ReservationForm resources={RESOURCES} onCreate={onCreate} onSuccess={vi.fn()} onError={vi.fn()} />
    );
    await user.type(screen.getByPlaceholderText('Ex: Carlos Silva'), 'Carlos Silva');
    await user.type(screen.getByLabelText(/Horário de Início/), futureInput(-24));
    await user.type(screen.getByLabelText(/Horário de Término/), futureInput(-23));
    await user.click(screen.getByRole('button', { name: /Confirmar Reserva/ }));

    expect(onCreate).not.toHaveBeenCalled();
    expect(screen.getByText('O início precisa ser no futuro.')).toBeInTheDocument();
  });

  it('exibe o min do navegador no input de início', () => {
    render(
      <ReservationForm resources={RESOURCES} onCreate={vi.fn()} onSuccess={vi.fn()} onError={vi.fn()} />
    );
    expect(screen.getByLabelText(/Horário de Início/)).toHaveAttribute('min');
  });

  it('a mensagem do servidor por campo vence a do cliente', async () => {
    const user = userEvent.setup();
    const apiError = Object.assign(new Error('Dados inválidos'), {
      status: 400,
      body: { errors: { end_time: 'Horário já ocupado neste espaço.' } },
    });
    render(
      <ReservationForm
        resources={RESOURCES}
        onCreate={vi.fn().mockRejectedValue(apiError)}
        onSuccess={vi.fn()}
        onError={vi.fn()}
      />
    );
    await fillValid(user);
    await user.click(screen.getByRole('button', { name: /Confirmar Reserva/ }));
    expect(await screen.findByText('Horário já ocupado neste espaço.')).toBeInTheDocument();
  });

  it('libera o botão mesmo quando a requisição falha', async () => {
    const user = userEvent.setup();
    render(
      <ReservationForm
        resources={RESOURCES}
        onCreate={vi.fn().mockRejectedValue(new Error('500'))}
        onSuccess={vi.fn()}
        onError={vi.fn()}
      />
    );
    await fillValid(user);
    const button = screen.getByRole('button', { name: /Confirmar Reserva/ });
    await user.click(button);
    await waitFor(() => expect(button).toBeEnabled());
  });
});
```

> Os `getByLabelText` deste arquivo **dependem** de os `<label>` terem
> `htmlFor` — que é a FE-04. Até a FE-04 entrar, usar
> `screen.getAllByDisplayValue('')` ou `container.querySelector` com comentário
> `TODO(FE-04)`; depois do merge da FE-04, trocar por `getByLabelText`, que é a
> query acessível correta. Está registrado no PR.

### Testes de unidade das regras (puros, sem render)

`validation.test.js` de reservas, 10 casos: espaço vazio, responsável vazio,
responsável com 101 caracteres, início ausente, início no passado, término
ausente, término igual ao início, término antes do início, duração de 5 minutos,
duração de 13 horas, e o caso válido devolvendo `{}`.

`validation.test.js` de recursos, 6 casos: nome vazio, nome com 101
caracteres, tipo fora do enum, `capacity = 0`, `capacity = -3`,
`capacity = 2.5`, e o caso válido.

### Comandos

```bash
cd client
TZ=America/Sao_Paulo npm run test     # 15 (FE-01+FE-02) + 22 novos = 37
npm run lint
npm run build
```

### Verificação manual obrigatória (QA, Igor Seberino)

1. Com DevTools → Network aberto, dar dois cliques rápidos em "Confirmar
   Reserva": a aba Network tem de registrar **1** `POST`, não 2. Print anexado
   ao PR ao lado do print do baseline com 2.
2. Simular latência: DevTools → Network → throttling "Slow 4G". O botão tem de
   ficar visivelmente desabilitado com o texto "Confirmando..." durante o voo.
3. Repetir o `curl` paralelo da seção "Evidência" e confirmar que ele
   **continua** criando duas reservas. Isso prova, com dado, que a validação do
   cliente não é a correção — e é o argumento que abre a BE-01/BE-02 no pitch.

## Critérios de aceite

* [ ] `POST` disparados por duplo clique no formulário de reserva: **1**
      (baseline: 2) — comprovado por teste automatizado **e** por print da aba
      Network antes/depois.
* [ ] Botões de submit com `disabled`: **2 de 2** (baseline: 0 de 2).
* [ ] Botões com rótulo de progresso ("Confirmando...", "Cadastrando..."):
      **2 de 2** (baseline: 0).
* [ ] O botão volta a habilitar **também** quando a requisição falha (teste
      cobrindo o `finally`).
* [ ] Regras validadas no cliente antes do `POST`: **13** (baseline: 0) —
      7 em reservas, 6 em recursos.
* [ ] Inputs de data com `min`: **2 de 2** (baseline: 0 de 2), com o `min` do
      término acompanhando o valor do início.
* [ ] Mensagens de erro renderizadas junto do campo: **7 campos cobertos**
      (baseline: 0; hoje tudo vai para a barra de feedback no topo).
* [ ] Reserva com término antes do início **não gera requisição** — teste
      automatizado.
* [ ] Reserva com início no passado **não gera requisição** — teste
      automatizado.
* [ ] `capacity = 0` **não gera requisição** — teste automatizado.
* [ ] Mensagem de erro por campo vinda do servidor (`body.errors`) sobrescreve
      a do cliente — teste automatizado.
* [ ] Testes de frontend: **37 passando** (baseline do projeto recebido: 0).
* [ ] `npm run lint`: 0 erros. `npm run build` verde, bundle ≤ **206 kB**
      (baseline 201,86 kB); **nenhuma `dependency` de produção adicionada**.
* [ ] A descrição do PR afirma, em texto, que **BUG-01, BUG-02, BUG-08 e BUG-09
      continuam abertos** no servidor, com link para BE-01 e BE-02, e anexa a
      saída do `curl` paralelo provando que o backend ainda aceita.
* [ ] `docs/time/divida-tecnica.md` registra `useActionState` do React 19 como
      melhoria candidata à N3.
* [ ] PR aprovado por Igor Seberino (`@igorSeberino`, QA) com CI verde.

## Passo a passo TBD

```bash
git checkout main
git pull origin main
git checkout -b fix/form-validation-and-submit-lock

cd client
npm ci --legacy-peer-deps

# Baseline: provar o bug antes de corrigir
grep -n "disabled" src/features/*/*.jsx || echo "0 botoes com disabled"
# e rodar o roteiro manual de duplo clique, guardando o print da aba Network
# em docs/auditoria/evidencias/fe-03-network-antes.png

# 1. RED — testes que falham contra o código atual
# criar src/features/reservations/ReservationForm.test.jsx
TZ=America/Sao_Paulo npm run test   # os 3 primeiros casos DEVEM falhar
cd ..
git add client/src/features/reservations/ReservationForm.test.jsx
git commit -m "test(reservations): cobrir duplo clique no submit e intervalo invalido"

# 2. Regras de validação puras
# criar src/lib/validation.js, src/features/reservations/validation.js,
#        src/features/resources/validation.js e os 3 arquivos .test.js
git add client/src/lib/validation.js client/src/lib/validation.test.js \
        client/src/features/reservations/validation.js \
        client/src/features/reservations/validation.test.js \
        client/src/features/resources/validation.js \
        client/src/features/resources/validation.test.js
git commit -m "feat(client): adicionar regras de validacao de formulario espelhando a BE-02"

# 3. Trava de envio
# criar src/hooks/useSubmit.js, src/components/SubmitButton.jsx
git add client/src/hooks/useSubmit.js client/src/components/SubmitButton.jsx
git commit -m "fix(client): impedir envio duplicado desabilitando o submit durante a requisicao"

# 4. Erro junto do campo
git add client/src/components/FieldError.jsx client/src/index.css
git commit -m "feat(client): exibir mensagem de erro junto do campo invalido"

# 5. Ligar tudo nos dois formulários
git add client/src/features/reservations/ReservationForm.jsx \
        client/src/features/resources/ResourceForm.jsx
git commit -m "fix(reservations): validar horario no cliente e travar o submit do agendamento"

# 6. GREEN + evidência
cd client
TZ=America/Sao_Paulo npm run test && npm run lint && npm run build
# roteiro manual de duplo clique novamente -> fe-03-network-depois.png
# curl paralelo da secao Evidencia -> fe-03-curl-servidor-ainda-aceita.txt
cd ..
git add docs/auditoria/evidencias docs/time/divida-tecnica.md
git commit -m "docs(auditoria): registrar evidencia antes e depois da trava de submit"

git push -u origin fix/form-validation-and-submit-lock
# PR para main, título:
#   fix(client): validar formularios no cliente e impedir envio duplicado
# Corpo: link para docs/specs/fe-03-form-validation-and-submit-lock/implementacao.md,
#   tabela antes/depois (2 POST -> 1; 0 -> 13 regras; 0/2 -> 2/2 botões travados),
#   os dois prints da aba Network, e o parágrafo declarando que BUG-01, BUG-02,
#   BUG-08 e BUG-09 seguem abertos no servidor (links para BE-01 e BE-02).
# Revisor obrigatório: @igorSeberino (QA).
```

## Prompt para o Claude Code

```text
Você está na raiz do repositório igorSeberino/srec, na branch
fix/form-validation-and-submit-lock. Carregue a skill de arquitetura de
frontend do repositório antes de começar.

Leia, por inteiro:
  1. docs/specs/fe-03-form-validation-and-submit-lock/implementacao.md  (ordem de serviço)
  2. docs/specs/be-02-*/implementacao.md  (a tabela de regras que esta spec espelha)
  3. client/src/features/reservations/ReservationForm.jsx
  4. client/src/features/resources/ResourceForm.jsx
  5. client/src/services/http.js  (a forma do ApiError, pós-FE-02)
  6. server/src/controllers/reservationController.js  (o que o servidor valida HOJE)

Tarefa: implementar a trava de envio e a validação no cliente descritas na
seção "Alterações" da spec, com o código proposto lá.

Regras não negociáveis:
- TDD obrigatório. Crie ReservationForm.test.jsx PRIMEIRO e me mostre a saída
  vermelha dos 3 primeiros casos antes de escrever qualquer correção.
- As regras de validação de reserva têm de ser IDÊNTICAS às da spec da BE-02.
  Se você encontrar divergência entre os dois documentos, PARE e me aponte a
  divergência; não escolha por conta própria.
- NÃO adicione Zod, Yup, React Hook Form nem qualquer dependency de produção.
  A validação é função pura em src/lib/ e src/features/*/validation.js.
- NÃO converta os formulários para useActionState/useFormStatus do React 19.
  A decisão está justificada na seção "Decisão"; mantenha useState + useSubmit.
- A trava tem de usar `finally` para que o botão reabilite também em caso de
  erro. Um teste cobre isso.
- A mensagem de erro do servidor (err.body.errors) SEMPRE sobrescreve a do
  cliente. Nunca o contrário.
- Esta spec NÃO corrige BUG-01, BUG-02, BUG-08 nem BUG-09. Não toque em
  server/. Se você sentir vontade de "também arrumar no backend", não arrume:
  é escopo da BE-01 e da BE-02.
- Use `noValidate` no <form> e mantenha required/min no markup.
- Os getByLabelText dos testes dependem da FE-04 (htmlFor). Se a FE-04 ainda
  não estiver em main, use query alternativa com comentário TODO(FE-04).
- Um commit por passo do "Passo a passo TBD", com as mensagens prontas de lá.
- Não rode comandos git push nem abra PR.

Ao terminar, rode `cd client && TZ=America/Sao_Paulo npm run test && npm run lint
&& npm run build` e me devolva: o total de testes passando, a contagem de
`grep -rn "disabled=" client/src/components/SubmitButton.jsx`, a lista das
regras de validação implementadas por formulário, e o tamanho do bundle
comparado com 201,86 kB (63,26 kB gzip).
```
