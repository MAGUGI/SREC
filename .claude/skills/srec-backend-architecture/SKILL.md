---
name: srec-backend-architecture
description: Use when touching anything under server/ in the SREC project — regras canônicas do backend recebido (Node 20 + Express 5 + PostgreSQL com SQL cru via pg) e da arquitetura alvo da N2: camada de serviço, AppError + middleware central de erro, migrations versionadas e enum de domínio. Diz onde cada coisa mora e o que não fazer. Para o frontend use srec-frontend-architecture.
---

# Backend do SREC — estado recebido e arquitetura alvo da N2

Esta é a skill mestra do backend do SREC (`server/`), o sistema de reserva de
estações de trabalho e salas de reunião que o time **recebeu de outro grupo** na
N2.

**Ação obrigatória ao carregar esta skill:** ler os dois arquivos de
`references/` na íntegra, em ordem, antes de propor ou escrever qualquer linha.

```
01-estado-atual.md      o que existe hoje, arquivo por arquivo, com os defeitos
02-arquitetura-alvo.md  onde cada coisa passa a morar, com o código do padrão
```

Não resuma, não pule. `01` existe porque é fácil propor uma solução elegante que
não cabe no código real; `02` existe porque é fácil cada pessoa inventar uma
camada diferente.

## Stack real — e o que não vamos introduzir

* **Node.js 20 · Express 5 · CommonJS** (`"type": "commonjs"`). `require`, não
  `import`.
* **PostgreSQL via `pg`, SQL cru.** Sem ORM, sem query builder.
* **Jest 30** para teste; **Supertest 7** já está em `devDependencies` e ainda
  não é usado por nenhum teste.
* **ESLint 10 + Prettier 3**, `npm run lint` com 0 erros hoje.
* `dotenv` lendo `server/.env`, exemplo em `server/.env.example`.

Decisões fechadas para a N2, para evitar discussão a cada PR:

* **Sem ORM** (Sequelize, Prisma, Knex). Trocar a camada de acesso a dados é
  reengenharia — é escopo da N3, não da N2. Nós consertamos e estruturamos o que
  existe.
* **Sem TypeScript.** Mesma razão.
* **Sem autenticação.** O sistema não tem usuário (`user_name VARCHAR(100)` é
  texto livre). A doc recebida afirma "Nível de acesso Admin"; é divergência
  catalogada, não requisito da N2.
* **Sem troca de framework HTTP.** Express 5 fica.

Se o código divergir desta skill, **o código vence** — pare, sinalize e corrija a
skill no mesmo PR.

## As quatro mudanças estruturais da N2

A N2 não reescreve o backend. Ela introduz exatamente quatro coisas, cada uma
resolvendo um code smell medido:

| # | Mudança | Resolve | Evidência do problema |
|---|---|---|---|
| 1 | **Camada de serviço** em `server/src/services/` | CS-03 | regra de negócio dentro do controller; nada testável sem HTTP |
| 2 | **`AppError` + `errorHandler` central** | CS-02 | 10 blocos `try/catch` idênticos, 5 por controller |
| 3 | **Migrations versionadas** em `server/migrations/` | CS-06 e BUG-11 | schema criado como efeito colateral do boot, erro engolido |
| 4 | **Enum de domínio** em `server/src/domain/` | CS-05 e BUG-03/BUG-10 | `'scheduled'`, `'cancelled'`, `'completed'`, `'workstation'`, `'meeting_room'` como string solta |

Detalhe de cada uma, com código, em `references/02-arquitetura-alvo.md`.

## Onde cada coisa mora

```
server/
  migrations/          SQL versionado, numerado, imutável depois de mergeado
  scripts/migrate.js   runner das migrations
  src/
    index.js           bootstrap + listen. Nada de regra aqui
    app.js             monta o app Express sem listen — é o que o Supertest importa
    config/
      database.js      Pool do pg + handler de 'error'. Exporta query e getClient
      env.js           lê e valida process.env; falha no boot se faltar obrigatória
    domain/            enum e regra pura, sem banco e sem HTTP
    errors/AppError.js erro de aplicação com statusCode e code
    middlewares/       errorHandler, validateId, notFound
    services/          regra de negócio e orquestração de transação
    models/            SQL e só SQL
    controllers/       HTTP e só HTTP
    routes/            amarração verbo + caminho + middleware + controller
```

Regra de direção de dependência, sem exceção:

```
routes → controllers → services → models → config/database
                           ↓
                        domain, errors
```

* `models/` **nunca** importa `services/` nem conhece `req`/`res`.
* `controllers/` **nunca** importa `models/` direto — passa pelo service.
* `domain/` não importa nada do projeto. É o único lugar testável sem mock.
* `services/` não conhece `req`/`res`. Recebe dado já validado, devolve dado ou
  lança `AppError`.

## Resumo das regras mais críticas

| Área | Regra |
|---|---|
| Erro | Controller `async` não tem `try/catch` — Express 5 encaminha a rejeição ao `errorHandler`. Regra de negócio lança `AppError`, não `res.status()` |
| Transação | Reservar é ler disponibilidade **e** inserir na mesma transação, com `pg` client dedicado — nunca `db.query` solto em sequência (BUG-01) |
| Integridade | Regra que o banco pode garantir, o banco garante: `CHECK (end_time > start_time)`, `CHECK (capacity > 0)`, `CHECK` de enum, `EXCLUDE` de sobreposição |
| Schema | Mudança de schema é migration numerada em `server/migrations/` — nunca `CREATE TABLE` no boot |
| SQL | Sempre parametrizado (`$1`, `$2`). Concatenação de string em SQL é inaceitável |
| Update parcial | `UPDATE` com corpo parcial usa `COALESCE($n, coluna)` — não grava `NULL` em coluna `NOT NULL` (BUG-05) |
| Enum | `'scheduled'`/`'meeting_room'` vêm de `src/domain/`, nunca literais no controller, service ou model |
| Fuso | `TIMESTAMP` vira `TIMESTAMPTZ`; horário entra e sai em ISO 8601 com offset (BUG-07) |
| Pool | `pool.on('error', ...)` é obrigatório — sem ele o processo cai quando o Postgres reinicia (BUG-12) |
| Boot | Falha de configuração ou de migration **derruba o boot** com código ≠ 0. Nunca `catch` que só faz `console.error` (BUG-11) |
| Segredo | `DATABASE_URL` só em `server/.env` (não versionado). `server/.env.example` sem valor real |
| Teste | `app.js` separado de `index.js` é o que permite Supertest sem abrir porta. Ver skill `srec-testing` |

## Antipadrões — o que não fazer neste repo

| Não faça | Faça |
|---|---|
| `try { ... } catch (err) { res.status(500) }` em controller | deixe a rejeição subir; `errorHandler` responde |
| validar entrada com `if (!a || !b)` espalhado | valide num só lugar, lance `AppError` com 400 e campo |
| `res.status(500)` para ID não numérico | `validateId` devolve 400 antes de chegar ao controller (BUG-04) |
| `checkAvailability` e depois `create` em duas chamadas | uma transação com `FOR UPDATE` ou a constraint `EXCLUDE` decidindo |
| alterar a fórmula `start_time < $3 AND end_time > $2` | ela está **correta**; o defeito é o contexto de execução |
| `ALTER TABLE` manual no banco de alguém | migration numerada, aplicada por `npm run migrate` |
| `console.log` como tratamento de erro | `AppError` com `code`, log estruturado no `errorHandler` |
| criar `utils/helpers.js` genérico | nome que diz o domínio: `domain/reservationStatus.js` |

## Violação detectada → parar e corrigir

1. Pare a task. 2. Cite a regra violada, com arquivo e seção de `references/`.
3. Corrija. 4. Só então continue. Nunca avance com violação conhecida em aberto —
o código vai para um terceiro grupo na N3, e cada atalho nosso vira a dívida que
eles herdam, exatamente como herdamos esta.

## Fluxo de trabalho

Git, branch, commit e PR: skill `tbd-flow`. Teste: skill `srec-testing`.
Diagnóstico e medição: skill `srec-audit`. Implementação de uma spec: subagent
`maintainer` via `/implementar <slug>`.
