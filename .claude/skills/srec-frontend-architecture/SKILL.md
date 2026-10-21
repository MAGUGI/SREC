---
name: srec-frontend-architecture
description: Use when touching anything under client/ in the SREC project — regras canônicas do frontend recebido (React 19 + Vite 8, App.jsx de 351 linhas) e da arquitetura alvo da N2: estrutura por feature, hooks, componentes, limite de 120 linhas por arquivo, convenção de nomes e camada de API. Para o backend use srec-backend-architecture.
---

# Frontend do SREC — estado recebido e arquitetura alvo da N2

Esta é a skill mestra do frontend do SREC (`client/`), a tela onde se cadastra
espaço/estação e se agenda reserva. O código foi **recebido de outro grupo** e o
diagnóstico cabe em um número: **`client/src/App.jsx` tem 351 linhas, 41 % das
853 linhas de JS/JSX do projeto inteiro.** Tudo mora lá — estado, chamada de API,
formulário, lista, feedback, render.

**Ação obrigatória ao carregar esta skill:** ler os dois arquivos de
`references/` na íntegra, em ordem.

```
01-estado-atual.md      App.jsx linha a linha, api.js, e os defeitos medidos
02-arquitetura-alvo.md  a estrutura por feature, com o código do padrão
```

## Stack real — e o que não vamos introduzir

* **React 19 · Vite 8 · JavaScript (JSX)**, módulos ESM (`"type": "module"`).
* **`lucide-react`** para ícone. É a única dependência de UI.
* **CSS puro**, `client/src/index.css` + `App.css` (427 linhas somadas), por
  classe (`.card`, `.form-control`, `.btn-primary`).
* **ESLint 9 + Prettier 3 + oxlint**; `npm run lint` com 0 erros hoje.
* `fetch` nativo em `client/src/services/api.js`. Não há cliente HTTP.
* **Zero teste** e **nenhum runner de teste configurado** no `client/`.

Decisões fechadas para a N2:

* **Sem TypeScript**, **sem React Router**, **sem TanStack Query**, **sem Redux
  ou Zustand**, **sem biblioteca de formulário**, **sem Tailwind ou lib de
  componente**. Introduzir qualquer uma é reengenharia — escopo da N3. A N2
  reorganiza o que existe com o que já está instalado: `useState`, `useEffect`,
  hook customizado e componente.
* **Instalação exige `npm ci --legacy-peer-deps`.** React 19 + Vite 8 têm peer
  deps em conflito; sem a flag, a instalação quebra. É o que a CI faz.

Se o código divergir desta skill, **o código vence** — pare, sinalize e corrija a
skill no mesmo PR.

## As quatro mudanças estruturais da N2

| # | Mudança | Resolve | Evidência |
|---|---|---|---|
| 1 | **Quebrar `App.jsx` em features, componentes e hooks** | CS-01 | 351 linhas, 41 % do JS/JSX, sem pasta de componentes |
| 2 | **`httpClient` + serviço por recurso, com URL de ambiente** | CS-07 | `API_BASE_URL = 'http://localhost:5000/api'` cravado em `api.js:1` |
| 3 | **Hook de dados por feature, com atualização cirúrgica** | CS-08 | `loadData()` refaz as duas listas a cada mutação |
| 4 | **Rótulos de domínio e acessibilidade** | CS-13, BUG-10 | 7 `<label>` sem `htmlFor`; `res.type === 'meeting_room' ? ... : ...` trata tudo que não é sala como estação |

## Limite de tamanho — 120 linhas por arquivo

Nenhum arquivo em `client/src/` passa de **120 linhas**. Não é estilo, é o
contra-ataque direto ao CS-01: foi exatamente a ausência desse limite que
produziu um componente de 351 linhas.

* Componente passando de 120 linhas → extraia subcomponente ou mova lógica para
  hook.
* `App.jsx` alvo: **até 60 linhas**. Ele só compõe layout e abas; não tem
  `useState` de formulário, não chama `services/`, não tem `useEffect` de dado.
* Arquivo de `services/` passando de 120 linhas → quebre por recurso
  (`resources.js`, `reservations.js`), nunca um `api.js` que cresce para sempre.
* Medir é `wc -l client/src/**/*.jsx`. Ninguém "acha" que está grande.

## Onde cada coisa mora

```
client/src/
  main.jsx                      bootstrap do React
  App.jsx                       composição: header, abas, feedback. Até 60 linhas
  config/env.js                 VITE_API_BASE_URL, com fallback de dev
  services/
    httpClient.js               fetch + tratamento único de erro
    resources.js                chamadas de /api/resources
    reservations.js             chamadas de /api/reservations
  domain/
    resourceType.js             valores do enum + rótulo pt-BR
    reservationStatus.js        valores do enum + rótulo pt-BR
  hooks/
    useFeedback.js              mensagem de sucesso/erro, com cleanup do timer
  components/
    ui/                         sem estado de domínio: Alert, Card, Tabs, Button, FormField
  features/
    resources/
      hooks/useResources.js
      components/ResourceForm.jsx, ResourceList.jsx, ResourceCard.jsx
      ResourcesPanel.jsx
    reservations/
      hooks/useReservations.js
      components/ReservationForm.jsx, ReservationList.jsx, ReservationCard.jsx
      ReservationsPanel.jsx
```

Direção de dependência, sem exceção:

```
App.jsx → features/<feature>/*Panel.jsx → components + hooks da feature
                                              ↓
                       components/ui, hooks/, services/, domain/, config/
```

* `components/ui/` **nunca** importa de `services/` nem de `features/`. É burro
  de propósito: recebe prop, dispara callback.
* Uma feature **nunca** importa de outra feature. O que as duas precisam sobe
  para `components/ui/`, `hooks/` ou `domain/`.
* Componente **nunca** chama `fetch` nem importa `services/` direto — passa pelo
  hook da feature.
* `services/` **nunca** importa React.
* `domain/` não importa nada do projeto.

## Convenção de nomes

| Coisa | Convenção | Exemplo |
|---|---|---|
| Componente | `PascalCase.jsx`, um componente exportado por arquivo, `export default` | `ReservationForm.jsx` |
| Hook | `useAlgo.js`, `camelCase`, `export` nomeado | `useReservations.js` |
| Serviço | `camelCase.js`, nome do recurso no plural | `reservations.js` |
| Módulo de domínio | `camelCase.js`, nome do conceito no singular | `reservationStatus.js` |
| Pasta | `kebab-case` ou palavra única, minúscula | `features/reservations/` |
| Handler de evento | `handleAlgo` | `handleSubmit` |
| Prop de callback | `onAlgo` | `onCreated`, `onStatusChange` |
| Booleano | `isAlgo` / `hasAlgo` | `isSubmitting`, `hasResources` |
| Classe CSS | `kebab-case`, reaproveitando `index.css`/`App.css` | `item-card` |

Identificador em **inglês**; texto visível ao usuário em **português**. O campo
da API é `snake_case` (`resource_id`, `user_name`, `start_time`) porque o backend
é assim — a conversão, se houver, acontece em `services/`, nunca no componente.

## Resumo das regras mais críticas

| Área | Regra |
|---|---|
| Tamanho | Nenhum arquivo passa de 120 linhas; `App.jsx` até 60 |
| Estado | Estado de formulário mora no componente do formulário, não no topo da árvore |
| Dado | Toda leitura/mutação de servidor passa pelo hook da feature; componente não chama `services/` |
| API | URL vem de `config/env.js` lendo `VITE_API_BASE_URL` — nunca literal no código (CS-07) |
| Erro | `httpClient` extrai `error` e `code` do corpo do backend e lança `Error` com mensagem útil |
| Atualização | Mutação atualiza a lista afetada, não refaz as duas (CS-08) |
| Submit | Botão de submit desabilita enquanto `isSubmitting` — duplo clique não cria duas reservas (BUG-13) |
| Timer | `setTimeout` de feedback é limpo no cleanup do `useEffect` (BUG-14) |
| Enum | Rótulo de `type`/`status` vem de `domain/`, com tratamento explícito de valor desconhecido (BUG-10) |
| Acessibilidade | Todo `<label>` tem `htmlFor` casando com o `id` do campo (CS-13) |
| Lint | Zero `eslint-disable` novo. Os 2 existentes em `App.jsx` saem com a refatoração (CS-12) |
| Data | Horário é enviado em ISO 8601 com offset, não a string crua do `datetime-local` (BUG-07) |

## Antipadrões — o que não fazer neste repo

| Não faça | Faça |
|---|---|
| mais um `useState` em `App.jsx` | estado no componente que o usa, ou no hook da feature |
| `fetch` dentro de componente | método em `services/`, consumido pelo hook da feature |
| `loadData()` depois de cada mutação | atualize só a lista afetada |
| `res.type === 'meeting_room' ? 'Sala' : 'Estação'` | `resourceTypeLabel(res.type)`, com fallback explícito |
| `<label>Nome</label>` | `<label htmlFor="user-name">Nome</label>` + `id="user-name"` |
| `eslint-disable-next-line react-hooks/exhaustive-deps` | corrija a dependência; se é inevitável, justifique no PR |
| `alert()` / `window.confirm()` novo | componente de confirmação em `components/ui/` |
| `catch (err) { showFeedback(err.message) }` repetido em 5 handlers | o hook da feature trata e expõe `error` |
| criar `utils/index.js` | `domain/<conceito>.js` ou `hooks/use<Algo>.js` |
| arquivo `Component.jsx` com 2 componentes exportados | um componente por arquivo |

## Violação detectada → parar e corrigir

1. Pare a task. 2. Cite a regra violada, com arquivo e seção de `references/`.
3. Corrija. 4. Só então continue. O frontend vai para um terceiro grupo na N3:
um `App.jsx` de 351 linhas é exatamente o que nós recebemos, e é o que eles não
podem receber de novo.

## Fluxo de trabalho

Git, branch, commit e PR: skill `tbd-flow`. Diagnóstico e medição: skill
`srec-audit`. Contrato da API e status code: skill
`srec-backend-architecture`. Implementação de uma spec: subagent `maintainer`
via `/implementar <slug>`.
