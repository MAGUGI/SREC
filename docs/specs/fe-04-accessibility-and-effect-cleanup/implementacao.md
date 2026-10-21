# FE-04 — Acessibilidade dos formulários e limpeza do efeito de feedback

* **Responsável:** Renato Colin Neto (Desenvolvedor Frontend)
* **Issue:** #<a definir>
* **Branch:** `fix/accessibility-and-effect-cleanup`
* **Rubrica:** 2,5 — Melhoria comprovada do código recebido (CS-13 e CS-12, BAIXO; BUG-14, BAIXO); 1,5 — Clareza nas alterações feitas, para a N3
* **Depende de:** FE-01 (componentes e `useFeedback` extraídos), FE-03 (`FieldError` já existe e recebe o `id` que será referenciado por `aria-describedby`)

## Problema

### 1. Os 7 `<label>` não estão associados a nenhum campo (CS-13)

Nenhum `<label>` do `App.jsx` tem `htmlFor`, e nenhum input/select tem `id`.
A lista completa, com linha:

| # | Linha do `<label>` | Texto | Campo (linha) |
|---|---|---|---|
| 1 | `App.jsx:163` | Nome do Espaço / Estação | `input[type=text]` (164-171) |
| 2 | `App.jsx:174` | Tipo | `select` (175-182) |
| 3 | `App.jsx:185` | Capacidade (pessoas) | `input[type=number]` (186-193) |
| 4 | `App.jsx:236` | Selecione o Espaço | `select` (237-248) |
| 5 | `App.jsx:251` | Nome do Responsável | `input[type=text]` (252-259) |
| 6 | `App.jsx:262` | Horário de Início | `input[type=datetime-local]` (263-269) |
| 7 | `App.jsx:272` | Horário de Término | `input[type=datetime-local]` (273-279) |

Nem o padrão alternativo de aninhar o input dentro do `<label>` é usado — em
`index.css:111-117` o `.form-group label` é `display: block`, irmão do input.
Resultado concreto:

* **Clicar no rótulo não foca o campo.** Em formulário de reserva com 4 campos,
  isso é perda de área clicável em todos eles.
* **Leitor de tela não anuncia o rótulo.** NVDA/VoiceOver anunciam "edição,
  em branco" para os 7 campos. O usuário de leitor de tela não tem como saber
  qual campo é "Horário de Início" e qual é "Horário de Término" — os dois são
  `datetime-local` sem placeholder e sem rótulo associado.
* **Testes não conseguem usar query acessível.** `getByLabelText` do Testing
  Library falha nos 7 campos, o que força os testes da FE-03 a usarem
  `getByPlaceholderText` ou `querySelector` — query frágil, acoplada a
  apresentação.

### 2. Botões que são só ícone não têm nome acessível

Quatro botões renderizam apenas um ícone SVG da `lucide-react`, com `title` e
nada mais:

| Linha | Ícone | `title` | Nome acessível |
|---|---|---|---|
| `App.jsx:216-222` | `Trash2` | "Excluir Espaço" | **nenhum confiável** |
| `App.jsx:311-321` | `CheckCircle2` | "Concluir" | **nenhum confiável** |
| `App.jsx:322-328` | `XCircle` | "Cancelar Reserva" | **nenhum confiável** |
| `App.jsx:331-337` | `Trash2` | "Excluir Definitivamente" | **nenhum confiável** |

`title` em `<button>` é tooltip, não nome acessível. Alguns leitores de tela o
usam como último recurso, outros ignoram; e em nenhum deles ele aparece na
navegação por lista de botões. O `lucide-react` renderiza `<svg>` sem
`aria-hidden`, então o SVG também entra na árvore de acessibilidade como ruído.
Os quatro botões são justamente as **ações destrutivas e de mudança de estado**
do sistema — excluir espaço, excluir reserva, concluir, cancelar.

### 3. O foco não é visível em lugar nenhum — e há CSS inválido

`client/src/index.css:127-131`:

```css
.form-control:focus {
  outline: none;
  border-color: #3b82f6;
  ring: 2px solid #93c5fd;
}
```

`ring` **não é uma propriedade CSS**. É um utilitário do Tailwind que foi
copiado para CSS puro e o navegador descarta a declaração inteira. Como a linha
acima faz `outline: none`, o efeito líquido é: **o anel de foco nativo foi
removido e nada o substituiu**. Só resta a mudança de cor da borda — 1 px de
`#3b82f6` contra `#d1d5db`, muito abaixo dos 3:1 de contraste que o WCAG 2.2
pede para indicador de foco (critério 1.4.11).

Pior nos outros interativos: `.tab-btn` (`index.css:62-77`) e
`.btn-outline-danger` (`index.css:166-176`) **não têm nenhuma regra `:focus` ou
`:focus-visible`**. Navegar a aplicação só pelo teclado é possível (a ordem do
DOM é razoável), mas o usuário não enxerga onde está.

### 4. O `setTimeout` do feedback nunca é limpo (BUG-14)

`client/src/App.jsx:32-35`:

```js
const showFeedback = (text, type = 'success') => {
  setMessage({ text, type });
  setTimeout(() => setMessage({ text: '', type: '' }), 4000);
};
```

Nenhum `clearTimeout`, nenhuma referência guardada. Três consequências:

* **Mensagens em sequência se atropelam.** Criar um espaço no segundo 0 e outro
  no segundo 3 agenda dois timers. O primeiro dispara no segundo 4 e apaga a
  mensagem que tinha acabado de aparecer — a segunda confirmação fica visível
  por 1 segundo em vez de 4.
* **`setState` após desmontagem.** O `App` é o componente raiz
  (`main.jsx:6-9`), então em produção ele raramente desmonta; mas sob
  `StrictMode` (`main.jsx:7`) e em qualquer teste com `unmount()` ou
  `cleanup()` automático do Testing Library, o timer de 4 s sobrevive ao
  desmonte e chama `setMessage` em componente morto. É exatamente o que vai
  poluir a suíte de testes que a FE-01 criou, com `act()` warnings
  intermitentes e flakiness.
* **Timers vazam.** Vinte operações em um minuto = 20 timers pendentes.

### 5. Duas supressões de lint escondendo o problema (CS-12)

`client/src/App.jsx:53-57`:

```js
useEffect(() => {
  // eslint-disable-next-line react-hooks/set-state-in-effect
  loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);
```

São as **únicas 2** supressões do projeto (`grep -rn "eslint-disable" client/src/`
→ 2 linhas, as duas aqui). Elas não são cosméticas: silenciam o aviso de que
`loadData` é recriada em todo render e não está no array de dependências. A
FE-01 já envolveu a função em `useCallback`, o que torna a dependência estável
— então aqui as supressões podem simplesmente sair, com a dependência correta
declarada.

### 6. O lint não tem nenhuma regra de acessibilidade (CS-10)

`client/eslint.config.js` tem 35 linhas, carrega `@eslint/js`,
`eslint-plugin-react-hooks`, `eslint-plugin-react-refresh` e
`eslint-config-prettier`. **Não há `eslint-plugin-jsx-a11y`.** É por isso que a
métrica da auditoria registra "0 erros de ESLint" convivendo com 7 rótulos
desassociados: a ferramenta não procura. `eslint-plugin-react` está no
`package.json:27` mas nem é carregado na config.

## Evidência

```bash
cd client

# 1. Os 7 labels e os 0 ids
grep -c "<label>" src/App.jsx                        # => 7   (pré-FE-01)
grep -c "htmlFor" src/                               # => 0
grep -cE '(input|select)[^>]*\bid=' -r src/          # => 0

# 2. Os 4 botões só com title
grep -c 'title="' src/App.jsx                        # => 4
grep -c "aria-label" src/                            # => 0

# 3. O CSS inválido e a ausência de foco visível
grep -n "ring:" src/index.css                        # => 130: ring: 2px solid #93c5fd;
grep -c "focus-visible" src/index.css                # => 0
grep -c ":focus" src/index.css                       # => 1  (o quebrado)

# 4. O timeout sem limpeza
grep -n "setTimeout\|clearTimeout" src/App.jsx       # => 34: setTimeout(...) e nada mais

# 5. As supressões
grep -rn "eslint-disable" src/                       # => 2 linhas (App.jsx:54 e :56)

# 6. O lint sem regra de a11y
grep -c "jsx-a11y" eslint.config.js package.json     # => 0 e 0
```

### Medição de violações de a11y

O baseline só pode ser medido **depois** de instalar o plugin — é a primeira
coisa que esta spec faz, antes de qualquer correção, justamente para produzir o
"antes":

```bash
cd client
npm i -D eslint-plugin-jsx-a11y --legacy-peer-deps
# ativar o plugin em eslint.config.js (passo 1 do TBD)
npx eslint src --format json | node -e "
  let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{
    const m={};for(const f of JSON.parse(d))for(const x of f.messages)
      m[x.ruleId]=(m[x.ruleId]||0)+1;
    console.table(m);
  })"
```

Contagem **prevista** por leitura do código, a ser confirmada pelo comando
acima e anexada ao PR:

| Regra | Violações previstas | Onde |
|---|---|---|
| `jsx-a11y/label-has-associated-control` | **7** | os 7 `<label>` da tabela acima |
| `jsx-a11y/control-has-associated-label` | **4** | os 4 botões só com ícone |
| **Total** | **11** | — |

`label-has-associated-control` é `error` no preset `recommended`;
`control-has-associated-label` é `off` por padrão e precisa ser ativada
explicitamente — esta spec a ativa, porque é a regra que pega os 4 botões
destrutivos sem nome.

| Métrica | Baseline medido |
|---|---|
| `<label>` com `htmlFor` | **0 de 7** |
| Inputs/selects com `id` | **0 de 7** |
| Botões só-ícone com `aria-label` | **0 de 4** |
| `role`/`aria-live` na área de feedback | **0** |
| Regras `:focus-visible` no CSS | **0** |
| Declarações CSS inválidas | **1** (`ring:`, `index.css:130`) |
| `clearTimeout` no projeto | **0** (1 `setTimeout` pendurado) |
| Supressões `eslint-disable` | **2** |
| Regras de a11y no ESLint | **0** |
| Violações de a11y detectadas pelo lint | **0 — porque ninguém mede** |
| Violações reais, com o plugin ativado | **11 (previsto)** |

## Decisão

**`htmlFor`/`id` gerados por constante por campo, `eslint-plugin-jsx-a11y` no
lint como porteiro, e o timeout guardado em `useRef` com `clearTimeout` no
cleanup do efeito.**

Sobre o rótulo: a alternativa óbvia era `aria-label` em cada input e manter o
`<label>` decorativo. Recusada porque `aria-label` **substitui** o texto
visível na árvore de acessibilidade em vez de associá-lo, deixando duas fontes
de verdade que divergem na primeira mudança de texto; e porque não resolve o
problema de usabilidade de clicar no rótulo. `htmlFor` + `id` resolve os dois
com zero ARIA — a primeira regra do uso de ARIA é não usar ARIA quando o HTML
nativo já faz.

Sobre os `id`: eles precisam ser **estáveis e únicos**. Os dois formulários têm
campos de nome parecido (`name` do recurso, `user_name` da reserva) e, com a
FE-05, o formulário de recurso vai ser renderizado em modo criação e em modo
edição. Usar `useId()` do React resolveria a unicidade automaticamente, mas
gera `id` opaco (`:r1:`) que não dá para escrever no teste nem conferir no
DevTools. Decisão: prefixo literal por formulário (`resource-form-name`,
`reservation-form-start-time`), declarado numa constante por componente. A
FE-05 recebe um prefixo próprio (`resource-edit-`) via prop `idPrefix` para não
colidir quando os dois formulários coexistirem.

Sobre o feedback: `role="alert"` + `aria-live="assertive"` na barra. Esta é a
exceção em que ARIA é necessária, porque a mensagem aparece **fora do foco do
usuário** e o navegador não tem mecanismo nativo para anunciá-la. Detalhe que
decide a implementação: o container com `role="alert"` tem de estar **sempre no
DOM**, vazio quando não há mensagem. Hoje `App.jsx:140` monta e desmonta o
`<div>` junto com a mensagem (`{message.text && <div ...>}`), e leitor de tela
frequentemente não anuncia conteúdo de uma região live que acabou de ser
inserida. O `Alert.jsx` da FE-01 passa a renderizar sempre o container e
condicionar só o texto.

Sobre o timer: `useRef` guardando o handle, `clearTimeout(ref.current)` antes
de agendar o próximo, e um `useEffect` de cleanup que limpa no desmonte. A
alternativa óbvia era `AbortController`/`setTimeout` com flag `isMounted`.
Recusada: a flag não resolve o atropelo de mensagens (o problema mais visível
dos dois) e é o antipadrão que o próprio React documenta contra. `useRef` + um
cleanup cobre atropelo e desmonte com 8 linhas.

Sobre o lint: `eslint-plugin-jsx-a11y` é **devDependency**, não entra no
bundle, e é o que torna o ganho desta spec **não regredível** — depois deste
PR, qualquer `<label>` sem `htmlFor` em qualquer PR futuro falha a CI. Isso é
o que a rubrica cobra em "clareza nas alterações feitas, para a N3": o grupo da
N3 herda a regra, não só o código corrigido. Recusado `axe-core`/`jest-axe`:
dariam verificação em tempo de execução, mais completa, mas somam 2
devDependencies e um teste lento por componente; com 2 formulários e 11
violações conhecidas, o lint estático cobre o caso com custo menor. Registrado
em `docs/time/divida-tecnica.md` como candidato à N3.

Sobre o foco: `:focus-visible` (não `:focus`), para que o anel apareça na
navegação por teclado e não em clique de mouse — é o comportamento que o
usuário de mouse espera e o que o `index.css` tentou alcançar removendo o
`outline`. A regra `ring:` inválida é deletada.

## Alterações

```
client/
  package.json                                 (alterado: +1 devDependency)
  eslint.config.js                             (alterado: 35 → ~52 linhas)
  src/
    App.jsx                                    (alterado: remover as 2 supressões)
    index.css                                  (alterado: foco visível, remover `ring:`)
    hooks/
      useFeedback.js                           (alterado: ~18 → ~32 linhas)
      useFeedback.test.js                      (NOVO ~48 linhas)
    components/
      Alert.jsx                                (alterado: ~16 → ~20 linhas)
      IconButton.jsx                           (NOVO ~24 linhas)
    features/
      resources/
        ResourceForm.jsx                       (alterado: htmlFor/id/aria em 3 campos)
        ResourceListItem.jsx                   (alterado: IconButton)
      reservations/
        ReservationForm.jsx                    (alterado: htmlFor/id/aria em 4 campos)
        ReservationListItem.jsx                (alterado: IconButton ×3)
    a11y.test.jsx                              (NOVO ~56 linhas)
```

### `client/package.json` (alterado)

```json
    "eslint-plugin-jsx-a11y": "^6.10.2",
```

Nenhuma `dependency` de produção. O bundle não muda.

### `client/eslint.config.js` (alterado)

```js
import js from '@eslint/js';
import globals from 'globals';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import prettierConfig from 'eslint-config-prettier';

export default [
  { ignores: ['dist'] },
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'jsx-a11y': jsxA11y,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.flatConfigs.recommended.rules,
      // Pega os 4 botões que só têm ícone: `title` não é nome acessível.
      'jsx-a11y/control-has-associated-label': [
        'error',
        { labelAttributes: ['aria-label'], controlComponents: ['IconButton'] },
      ],
      'no-unused-vars': ['warn', { varsIgnorePattern: '^[A-Z_]' }],
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  prettierConfig,
];
```

### `client/src/hooks/useFeedback.js` (alterado) — corrige o BUG-14

```js
import { useCallback, useEffect, useRef, useState } from 'react';

export const FEEDBACK_TIMEOUT_MS = 4000;

export function useFeedback() {
  const [message, setMessage] = useState({ text: '', type: '' });
  const timeoutRef = useRef(null);

  const clear = useCallback(() => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const showFeedback = useCallback(
    (text, type = 'success') => {
      // Cancela o timer da mensagem anterior: sem isto, duas mensagens em
      // sequência se atropelam e a segunda some antes dos 4 s (BUG-14).
      clear();
      setMessage({ text, type });
      timeoutRef.current = setTimeout(() => {
        timeoutRef.current = null;
        setMessage({ text: '', type: '' });
      }, FEEDBACK_TIMEOUT_MS);
    },
    [clear]
  );

  // Limpa o timer pendente no desmonte: sem isto, o setState roda em
  // componente desmontado (BUG-14).
  useEffect(() => clear, [clear]);

  return { message, showFeedback, dismissFeedback: () => { clear(); setMessage({ text: '', type: '' }); } };
}
```

### `client/src/components/Alert.jsx` (alterado)

O container passa a estar **sempre** no DOM, com `role="alert"` e
`aria-live="assertive"`. É a diferença entre "o leitor de tela anuncia" e "o
leitor de tela às vezes anuncia".

```js
export function Alert({ text, type }) {
  return (
    <div
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
      className={text ? `alert alert-${type}` : 'alert-placeholder'}
    >
      {text}
    </div>
  );
}
```

E em `index.css`:

```css
/* Container da região live fica no DOM mesmo vazio, sem ocupar espaço. */
.alert-placeholder {
  display: none;
}
```

### `client/src/components/IconButton.jsx` (novo)

Um componente só para a a11y dos botões de ícone: `aria-label` obrigatório,
`title` preservado (tooltip de mouse continua útil), e o SVG marcado com
`aria-hidden` para não duplicar o anúncio.

```js
export function IconButton({ label, onClick, className = 'btn-outline-danger', children }) {
  return (
    <button
      type="button"
      className={className}
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      <span aria-hidden="true">{children}</span>
    </button>
  );
}
```

Aplicação, substituindo os 4 botões:

```jsx
{/* ResourceListItem — era App.jsx:216-222 */}
<IconButton label={`Excluir o espaço ${resource.name}`} onClick={() => onDelete(resource.id)}>
  <Trash2 size={16} />
</IconButton>

{/* ReservationListItem — era App.jsx:311-321, :322-328, :331-337 */}
<IconButton
  label={`Concluir a reserva de ${reservation.user_name}`}
  className="btn-outline-danger btn-outline-success"
  onClick={() => onChangeStatus(reservation.id, RESERVATION_STATUS.COMPLETED)}
>
  <CheckCircle2 size={16} />
</IconButton>
```

O rótulo inclui o nome do item porque, numa lista de 10 reservas, "Excluir" ×10
é inútil na navegação por lista de botões do leitor de tela.

### `client/src/features/reservations/ReservationForm.jsx` (alterado)

Padrão aplicado aos 4 campos. `aria-invalid` e `aria-describedby` amarram o
`FieldError` da FE-03 ao campo.

```js
const ID = {
  resource: 'reservation-form-resource',
  userName: 'reservation-form-user-name',
  startTime: 'reservation-form-start-time',
  endTime: 'reservation-form-end-time',
};

// ...
<div className="form-group">
  <label htmlFor={ID.startTime}>Horário de Início</label>
  <input
    id={ID.startTime}
    type="datetime-local"
    className={`form-control ${errors.start_time ? 'is-invalid' : ''}`}
    min={minStart}
    value={startTime}
    onChange={(e) => setStartTime(e.target.value)}
    aria-invalid={errors.start_time ? 'true' : undefined}
    aria-describedby={errors.start_time ? `${ID.startTime}-error` : undefined}
    required
  />
  <FieldError id={`${ID.startTime}-error`} message={errors.start_time} />
</div>
```

### `client/src/features/resources/ResourceForm.jsx` (alterado)

Mesmo padrão nos 3 campos, com `idPrefix` recebido por prop para que a FE-05
possa renderizar o formulário em modo edição sem duplicar `id` no documento:

```js
export function ResourceForm({ idPrefix = 'resource-form', ... }) {
  const ID = {
    name: `${idPrefix}-name`,
    type: `${idPrefix}-type`,
    capacity: `${idPrefix}-capacity`,
  };
```

### `client/src/App.jsx` (alterado) — remove CS-12

```js
  useEffect(() => {
    reloadAll();
  }, [reloadAll]);
```

As duas supressões saem. `reloadAll` já é um `useCallback` com dependências
estáveis (`loadResources`, `loadReservations` e `showFeedback` são todos
`useCallback` com array vazio ou estável), então o efeito roda uma vez, como
antes. Verificar com o teste de caracterização da FE-01, que afirma
`getResources` chamado **1 vez** no mount — se a dependência estiver instável,
esse teste vira loop infinito e falha. Ou seja: o teste da FE-01 é o que
autoriza remover a supressão.

### `client/src/index.css` (alterado)

```css
/* ANTES (linhas 127-131) — `ring` não é propriedade CSS; a declaração era
   descartada e o `outline: none` deixava o foco invisível.
.form-control:focus {
  outline: none;
  border-color: #3b82f6;
  ring: 2px solid #93c5fd;
}
*/

.form-control:focus-visible,
.btn:focus-visible,
.tab-btn:focus-visible,
.btn-outline-danger:focus-visible,
.alert a:focus-visible {
  outline: 3px solid #1d4ed8;
  outline-offset: 2px;
}

.form-control:focus {
  border-color: #3b82f6;
}
```

`#1d4ed8` sobre `#ffffff` dá contraste 6,3:1 e sobre `#f3f4f6` (o `body`) dá
5,8:1 — os dois acima do mínimo de 3:1 do WCAG 2.2 para indicador de foco
(critério 1.4.11).

## Testes

### `client/src/hooks/useFeedback.test.js` (novo) — o que falha antes

Os dois primeiros casos **falham contra o `showFeedback` recebido**.

```js
import { act, render, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FEEDBACK_TIMEOUT_MS, useFeedback } from './useFeedback';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('useFeedback', () => {
  // FALHA ANTES (BUG-14): o timer da 1ª mensagem apaga a 2ª.
  it('mensagens em sequência não se atropelam', () => {
    const { result } = renderHook(() => useFeedback());

    act(() => result.current.showFeedback('primeira'));
    act(() => vi.advanceTimersByTime(3000));
    act(() => result.current.showFeedback('segunda'));

    // No segundo 4 o timer ANTIGO dispararia e limparia 'segunda'.
    act(() => vi.advanceTimersByTime(1500));
    expect(result.current.message.text).toBe('segunda');

    // 'segunda' só some 4 s depois de ter sido exibida.
    act(() => vi.advanceTimersByTime(FEEDBACK_TIMEOUT_MS));
    expect(result.current.message.text).toBe('');
  });

  // FALHA ANTES (BUG-14): o timer sobrevive ao desmonte e chama setState.
  it('limpa o timer pendente no desmonte', () => {
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout');
    const { result, unmount } = renderHook(() => useFeedback());

    act(() => result.current.showFeedback('vai desmontar'));
    expect(vi.getTimerCount()).toBe(1);

    unmount();
    expect(clearSpy).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('esconde a mensagem depois de 4 s', () => {
    const { result } = renderHook(() => useFeedback());
    act(() => result.current.showFeedback('ok'));
    expect(result.current.message).toEqual({ text: 'ok', type: 'success' });
    act(() => vi.advanceTimersByTime(FEEDBACK_TIMEOUT_MS));
    expect(result.current.message.text).toBe('');
  });

  it('vinte mensagens seguidas deixam no máximo um timer pendente', () => {
    const { result } = renderHook(() => useFeedback());
    for (let i = 0; i < 20; i += 1) {
      act(() => result.current.showFeedback(`msg ${i}`));
    }
    expect(vi.getTimerCount()).toBe(1); // ANTES: 20
  });
});
```

### `client/src/a11y.test.jsx` (novo)

Os testes que só passam com `htmlFor`/`id` corretos — e que, de brinde,
convertem as queries frágeis da FE-03 em queries acessíveis.

```js
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ResourceForm } from './features/resources/ResourceForm';
import { ReservationForm } from './features/reservations/ReservationForm';
import { ReservationListItem } from './features/reservations/ReservationListItem';

const noop = vi.fn();
const RESOURCES = [{ id: 1, name: 'Sala Alpha', type: 'meeting_room', capacity: 8 }];

describe('acessibilidade dos formulários', () => {
  // FALHA ANTES (CS-13): getByLabelText não encontra nada.
  it('os 3 campos do formulário de espaço têm rótulo associado', () => {
    render(<ResourceForm onCreate={noop} onSuccess={noop} onError={noop} />);
    expect(screen.getByLabelText('Nome do Espaço / Estação')).toBeInTheDocument();
    expect(screen.getByLabelText('Tipo')).toBeInTheDocument();
    expect(screen.getByLabelText('Capacidade (pessoas)')).toBeInTheDocument();
  });

  it('os 4 campos do formulário de agendamento têm rótulo associado', () => {
    render(
      <ReservationForm resources={RESOURCES} onCreate={noop} onSuccess={noop} onError={noop} />
    );
    expect(screen.getByLabelText('Selecione o Espaço')).toBeInTheDocument();
    expect(screen.getByLabelText('Nome do Responsável')).toBeInTheDocument();
    expect(screen.getByLabelText('Horário de Início')).toBeInTheDocument();
    expect(screen.getByLabelText('Horário de Término')).toBeInTheDocument();
  });

  it('nenhum id de campo é duplicado no documento', () => {
    const { container } = render(
      <>
        <ResourceForm idPrefix="a" onCreate={noop} onSuccess={noop} onError={noop} />
        <ResourceForm idPrefix="b" onCreate={noop} onSuccess={noop} onError={noop} />
      </>
    );
    const ids = [...container.querySelectorAll('[id]')].map((el) => el.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // FALHA ANTES: os botões só têm `title`, que não é nome acessível.
  it('os botões de ícone têm nome acessível que identifica o item', () => {
    const reservation = {
      id: 7,
      user_name: 'Carlos Silva',
      status: 'scheduled',
      start_time: '2026-10-21T13:00:00-03:00',
      end_time: '2026-10-21T14:00:00-03:00',
    };
    render(
      <ReservationListItem
        reservation={reservation}
        resourceName="Sala Alpha"
        onChangeStatus={noop}
        onDelete={noop}
      />
    );
    expect(screen.getByRole('button', { name: /Concluir a reserva de Carlos Silva/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Cancelar a reserva de Carlos Silva/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Excluir .*reserva de Carlos Silva/ })).toBeInTheDocument();
  });

  it('a barra de feedback é uma região live sempre presente', () => {
    render(<App />);
    const alert = screen.getByRole('alert', { hidden: true });
    expect(alert).toHaveAttribute('aria-live', 'assertive');
  });
});
```

### Comandos

```bash
cd client

# contagem de violações de a11y — o número "antes" e o "depois"
npx eslint src --format json | node -e "..."   # (script da seção Evidência)

TZ=America/Sao_Paulo npm run test
npm run lint                                    # 0 erros, agora COM regras de a11y
npm run build
```

### Verificação manual obrigatória (QA, Igor Seberino)

1. **Clique no rótulo.** Clicar no texto "Horário de Início" tem de focar o
   input. Repetir nos 7 rótulos.
2. **Navegação só por teclado.** `Tab` desde o topo até o último botão da
   lista, sem tocar no mouse: o anel de foco azul tem de estar visível em
   **todos** os passos — abas, inputs, select, botão de submit e os botões de
   ícone das listas.
3. **Leitor de tela.** Com o Narrador do Windows (`Win+Ctrl+Enter`) ou NVDA,
   tabular pelo formulário de agendamento: os 4 campos têm de ser anunciados
   com o rótulo correto. Depois cadastrar um espaço: a mensagem "Espaço
   cadastrado com sucesso!" tem de ser **falada** sem o usuário mover o foco.
4. **Atropelo de mensagem.** Cadastrar um espaço, contar 3 segundos, cadastrar
   outro: a segunda mensagem tem de ficar visível os 4 segundos inteiros.
   Antes, ela sumia em ~1 segundo. Gravar em vídeo curto e anexar ao PR.

## Critérios de aceite

* [ ] `<label>` com `htmlFor`: **7 de 7** (baseline: 0 de 7).
* [ ] Inputs/selects com `id`: **7 de 7** (baseline: 0 de 7).
* [ ] `getByLabelText` funciona nos 7 campos — teste automatizado
      (baseline: falha nos 7).
* [ ] Botões só-ícone com `aria-label`: **4 de 4** (baseline: 0 de 4), e o
      rótulo identifica o item (nome do espaço / do responsável).
* [ ] SVG dos botões de ícone marcado com `aria-hidden="true"`: **4 de 4**
      (baseline: 0).
* [ ] Barra de feedback com `role="alert"` + `aria-live="assertive"` e
      container sempre presente no DOM (baseline: sem `role`, sem `aria-live`,
      montado/desmontado junto com a mensagem).
* [ ] Regras `:focus-visible` cobrindo input, botão, aba e botão de ícone:
      **5 seletores** (baseline: 0).
* [ ] Declaração CSS inválida `ring:` removida — `grep -c "ring:" src/index.css`
      = **0** (baseline: 1, `index.css:130`).
* [ ] `clearTimeout` presente e timers pendentes depois de 20 mensagens: **1**
      (baseline: 0 `clearTimeout`, 20 timers).
* [ ] Nenhum `setState` após desmontagem — teste com `unmount()` e
      `vi.getTimerCount() === 0` (baseline: 1 timer sobrevive).
* [ ] Supressões `eslint-disable` em `client/src/`: **0** (baseline: 2, em
      `App.jsx:54` e `:56`).
* [ ] `eslint-plugin-jsx-a11y` instalado e ativado com o preset `recommended`
      **mais** `control-has-associated-label` (baseline: plugin ausente).
* [ ] Violações de a11y reportadas pelo lint: **0** depois, contra as
      **11 medidas antes** (7 `label-has-associated-control` +
      4 `control-has-associated-label`). As duas contagens, geradas pelo mesmo
      comando, anexadas ao PR.
* [ ] `npm run lint` continua com **0 erros** — agora com 40+ regras de a11y
      ativas em vez de 0.
* [ ] Testes de frontend: **37 (FE-01..FE-03) + 9 novos = 46 passando**.
* [ ] `npm run build` verde, bundle ≤ **206 kB** (baseline 201,86 kB);
      **nenhuma `dependency` de produção adicionada**.
* [ ] Roteiro manual dos 4 itens executado pelo QA, com o vídeo do atropelo de
      mensagem anexado.
* [ ] `docs/time/divida-tecnica.md` registra `jest-axe`/`axe-core` como
      verificação candidata à N3.
* [ ] PR aprovado por Igor Seberino (`@igorSeberino`, QA) com CI verde.

## Passo a passo TBD

```bash
git checkout main
git pull origin main
git checkout -b fix/accessibility-and-effect-cleanup

cd client
npm ci --legacy-peer-deps

# 1. Instalar e ATIVAR o plugin primeiro, para MEDIR o baseline
npm i -D eslint-plugin-jsx-a11y --legacy-peer-deps
# editar eslint.config.js conforme a spec
npx eslint src --format json > ../docs/auditoria/evidencias/fe-04-a11y-antes.json
npx eslint src | tee ../docs/auditoria/evidencias/fe-04-a11y-antes.txt
# => tem de acusar 11 violações. Se acusar outro número, registre o real.
cd ..
git add client/package.json client/package-lock.json client/eslint.config.js \
        docs/auditoria/evidencias/fe-04-a11y-antes.json \
        docs/auditoria/evidencias/fe-04-a11y-antes.txt
git commit -m "build(client): adicionar eslint-plugin-jsx-a11y e medir violacoes de acessibilidade"

# 2. RED do BUG-14
# criar src/hooks/useFeedback.test.js
cd client && TZ=America/Sao_Paulo npm run test   # os 2 primeiros casos DEVEM falhar
cd ..
git add client/src/hooks/useFeedback.test.js
git commit -m "test(client): cobrir atropelo de mensagem e timer pendente no desmonte"

# 3. Corrigir o BUG-14
git add client/src/hooks/useFeedback.js
git commit -m "fix(client): limpar o timeout do feedback com useRef e cleanup do efeito"

# 4. Região live da barra de feedback
git add client/src/components/Alert.jsx client/src/index.css
git commit -m "fix(client): anunciar o feedback com role=alert e aria-live"

# 5. Rótulos associados nos 7 campos
git add client/src/features/resources/ResourceForm.jsx \
        client/src/features/reservations/ReservationForm.jsx
git commit -m "fix(client): associar os 7 rotulos aos campos com htmlFor e id"

# 6. Nome acessível nos botões de ícone
git add client/src/components/IconButton.jsx \
        client/src/features/resources/ResourceListItem.jsx \
        client/src/features/reservations/ReservationListItem.jsx
git commit -m "fix(client): dar nome acessivel aos botoes que so tem icone"

# 7. Foco visível e remoção do CSS inválido
git add client/src/index.css
git commit -m "fix(client): restaurar indicador de foco visivel e remover declaracao ring invalida"

# 8. Remover as supressões de lint (CS-12)
git add client/src/App.jsx
git commit -m "refactor(client): remover as supressoes de lint do useEffect declarando a dependencia"

# 9. Testes de a11y
git add client/src/a11y.test.jsx
git commit -m "test(client): cobrir rotulos associados, nome dos botoes de icone e regiao live"

# 10. GREEN + medição final
cd client
npx eslint src --format json > ../docs/auditoria/evidencias/fe-04-a11y-depois.json
TZ=America/Sao_Paulo npm run test && npm run lint && npm run build
cd ..
git add docs/auditoria/evidencias docs/time/divida-tecnica.md
git commit -m "docs(auditoria): registrar violacoes de acessibilidade antes e depois da FE-04"

git push -u origin fix/accessibility-and-effect-cleanup
# PR para main, título:
#   fix(client): associar rotulos, dar nome aos botoes de icone e limpar o timeout do feedback
# Corpo: link para docs/specs/fe-04-accessibility-and-effect-cleanup/implementacao.md,
#   tabela antes/depois (11 -> 0 violações de a11y; 0/7 -> 7/7 rótulos;
#   0/4 -> 4/4 botões nomeados; 0 -> 1 clearTimeout; 2 -> 0 supressões),
#   as duas saídas do eslint, e o vídeo do atropelo de mensagem.
# Revisor obrigatório: @igorSeberino (QA).
```

## Prompt para o Claude Code

```text
Você está na raiz do repositório igorSeberino/srec, na branch
fix/accessibility-and-effect-cleanup. Carregue a skill de arquitetura de
frontend do repositório antes de começar.

Leia, por inteiro:
  1. docs/specs/fe-04-accessibility-and-effect-cleanup/implementacao.md  (ordem de serviço)
  2. client/eslint.config.js
  3. client/src/index.css  (atenção às linhas 111-131)
  4. client/src/hooks/useFeedback.js
  5. client/src/components/Alert.jsx
  6. client/src/features/resources/ResourceForm.jsx e ResourceListItem.jsx
  7. client/src/features/reservations/ReservationForm.jsx e ReservationListItem.jsx
  8. client/src/App.jsx  (as duas supressões eslint-disable no useEffect)

Tarefa: aplicar a seção "Alterações" da spec — acessibilidade dos 7 campos e
dos 4 botões de ícone, foco visível, região live do feedback, limpeza do
setTimeout e remoção das 2 supressões de lint.

Regras não negociáveis:
- ORDEM OBRIGATÓRIA: o PRIMEIRO passo é instalar e ATIVAR eslint-plugin-jsx-a11y
  e salvar a contagem de violações em docs/auditoria/evidencias/fe-04-a11y-antes.txt.
  O número "antes" só existe se for medido antes de qualquer correção. A spec
  prevê 11 violações; se o número real for diferente, registre o real e me avise.
- Depois, TDD: src/hooks/useFeedback.test.js antes da correção, e me mostre a
  saída vermelha dos 2 primeiros casos.
- Use htmlFor + id, NÃO aria-label, para os rótulos de campo. aria-label só
  nos botões que não têm texto visível.
- Os ids vêm de constantes literais por formulário (nada de useId()), e o
  ResourceForm tem de aceitar a prop idPrefix com default 'resource-form' —
  a FE-05 depende disso para não duplicar id no documento.
- O container do Alert fica SEMPRE no DOM, mesmo vazio. Não volte a condicionar
  a renderização do <div> à existência da mensagem.
- Use :focus-visible, não :focus. Delete a declaração `ring:` de index.css:130,
  que não é propriedade CSS válida.
- A limpeza do timer usa useRef + clearTimeout, antes de agendar o próximo E no
  cleanup do efeito. Não use flag isMounted.
- Ao remover as supressões de App.jsx, declare [reloadAll] como dependência e
  confirme que o teste de caracterização da FE-01 continua afirmando
  getResources chamado exatamente 1 vez. Se virar loop, pare e me diga qual
  dependência está instável.
- NÃO adicione dependency de produção. jsx-a11y é devDependency.
- NÃO corrija BUG-15 nem BUG-06: é escopo da FE-05.
- Um commit por passo do "Passo a passo TBD", com as mensagens prontas de lá.
- Não rode comandos git push nem abra PR.

Ao terminar, me devolva: a contagem de violações de a11y antes e depois (por
regra), `grep -rc "htmlFor" client/src/features/`, `grep -rc "eslint-disable"
client/src/`, `grep -c "ring:" client/src/index.css`, o total de testes
passando, e o tamanho do bundle comparado com 201,86 kB (63,26 kB gzip).
```
