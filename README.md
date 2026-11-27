# SREC — Sistema de Reserva de Espaços e Coworking

[![CI](https://github.com/igorSeberino/srec/actions/workflows/ci.yml/badge.svg)](https://github.com/igorSeberino/srec/actions/workflows/ci.yml)

Sistema web para gerenciamento e reserva de estações de trabalho e salas de
reunião em espaços de coworking. Node.js + Express + PostgreSQL no backend,
React + Vite no frontend.

> **Este repositório está na entrega N2** da disciplina de Manutenção e Melhoria
> de Software (6º semestre de Engenharia de Software, Centro Universitário
> Católica de Santa Catarina).
>
> O código foi **recebido do grupo MAGUGI** ([`MAGUGI/SREC`](https://github.com/MAGUGI/SREC)),
> que o construiu na N1. Nosso trabalho na N2 é auditar, medir, corrigir e
> refatorar o que recebemos, e entregar um pacote melhor para um terceiro grupo
> na N3.
>
> **Comece pelo [relatório de auditoria](docs/auditoria/relatorio-n2.md).** Ele
> explica em que estado o sistema chegou às nossas mãos, com números medidos.

## Por onde começar

| Se você é... | Leia nesta ordem |
|---|---|
| **novo no time** | [auditoria](docs/auditoria/relatorio-n2.md) → [papéis e RACI](docs/time/overview.md) → [fluxo TBD](docs/time/fluxo-tbd.md) → sua issue no [board](https://github.com/users/igorSeberino/projects/1) |
| **o grupo da N3** | handoff (em elaboração na [#24](https://github.com/igorSeberino/srec/issues/24)) → [arquitetura alvo](docs/arquitetura/arquitetura-alvo.md) → [decisões](docs/arquitetura/decisoes.md) |
| **avaliando a entrega** | [auditoria](docs/auditoria/relatorio-n2.md) → [métricas de baseline](docs/auditoria/metricas-baseline.md) → [relatório antes/depois](docs/auditoria/relatorio-antes-depois.md) → [board](https://github.com/users/igorSeberino/projects/1) |
| **indo implementar algo** | a spec da sua issue em [`docs/specs/`](docs/specs/) → `/implementar <slug>` no Claude Code |

## O que o sistema faz

Dois cadastros e um ciclo de vida.

* **Espaços** (`resources`): estações de trabalho e salas de reunião, com nome, tipo e capacidade.
* **Reservas** (`reservations`): um espaço, um responsável, um intervalo de início e fim, e um status (`scheduled` → `completed` ou `cancelled`).

A regra de negócio central é **não permitir duas reservas sobrepostas no mesmo
espaço**. É a razão de existir do produto — e é exatamente onde o código
recebido falha sob concorrência
([BUG-01](docs/auditoria/bugs-do-cliente.md)).

## Documentação

### Auditoria (o diagnóstico da N2)

* [Relatório de auditoria](docs/auditoria/relatorio-n2.md) — o diagnóstico completo, com o achado principal
* [Métricas de baseline](docs/auditoria/metricas-baseline.md) — 29 métricas medidas, com os comandos que as reproduzem
* [Relatório antes/depois](docs/auditoria/relatorio-antes-depois.md) — as 29 métricas medidas de novo no fim da N2, placar de bugs e smells, e o roteiro do pitch
* [Bugs do Cliente](docs/auditoria/bugs-do-cliente.md) — 15 defeitos, com arquivo, linha e reprodução
* [Code smells](docs/auditoria/code-smells.md) — 14 achados estruturais, com evidência
* [Divergências entre documentação e código](docs/auditoria/divergencias-doc-codigo.md) — 12 inconsistências no que recebemos
* [Evidências de medição](docs/auditoria/evidencias/README.md) — saída bruta dos comandos que sustentam cada número
* [Diário de onboarding](docs/auditoria/diario-onboarding.md) — quem subiu o sistema, quanto tempo levou e onde travou

### Arquitetura

* [Estado atual](docs/arquitetura/estado-atual.md) — como o sistema é hoje, engenharia reversa
* [Arquitetura alvo](docs/arquitetura/arquitetura-alvo.md) — onde chegamos ao fim da N2
* [Decisões (ADRs)](docs/arquitetura/decisoes.md) — o que decidimos, as alternativas e o custo de cada escolha
* [DER recebido e atual](docs/arquitetura/der.md) — o schema que recebemos, o da `main` depois das migrations e as pendências de integridade

### Produto, requisitos e time

* [Visão do produto e regras de negócio](docs/produto/overview.md) e [requisitos](docs/produto/requisitos.md) — reconstruídos por engenharia reversa, cada um com situação explícita
* [Equipe, papéis e Matriz RACI](docs/time/overview.md) — inclui DoR, DoD e gestão de débito técnico
* [Fluxo Trunk-Based Development](docs/time/fluxo-tbd.md) — branches, commits, ciclo do PR

### QA

* [Plano de testes](docs/qa/plano-de-testes.md) — estratégia, fronteira automatizado/manual e critérios de aprovação do QA
* [Roteiro de regressão manual](docs/qa/roteiro-regressao.md) — 56 passos executáveis, executar antes e depois de cada ciclo de refatoração
* [Registros de execução](docs/qa/execucoes/) — resultados de cada rodada do roteiro, versionados

### Entrega

* [Especificações de implementação](docs/specs/) — uma pasta por issue, com o trabalho já desenhado
* Handoff para a N3 — em elaboração na [#24](https://github.com/igorSeberino/srec/issues/24), junto com o contrato OpenAPI da [#23](https://github.com/igorSeberino/srec/issues/23)

A documentação original do grupo anterior está preservada em
[`Documentação Oficial SREC.md`](Documentação%20Oficial%20SREC.md) como
**registro histórico**. Ela descreve um sistema diferente do que existe, e as
divergências estão catalogadas — não use como fonte da verdade.

## Equipe na N2

Os papéis rodam a cada entrega da disciplina. Nesta:

| Pessoa | Papel na N2 |
|---|---|
| [Igor Thiago Seberino](https://github.com/igorSeberino) | Product Owner + QA |
| [Gabriel Carvalho](https://github.com/gabrielcarvallho) | DevOps |
| [Adrian Cesar Gonçalves](https://github.com/adrian-cesar) | Desenvolvedor Backend |
| [Renato Colin Neto](https://github.com/RenatoColin) | Desenvolvedor Frontend |
| [Diego Nessler](https://github.com/Diegonessler) | Engenheiro de Requisitos |

A Matriz RACI completa está em [`docs/time/overview.md`](docs/time/overview.md).
O QA aprova todos os Pull Requests. A exceção são os PRs do próprio QA: o GitHub
não permite autoaprovação, e esses PRs são aprovados pelo revisor substituto,
Adrian (`@adrian-cesar`).

Na N1 este sistema foi construído por Maria Eduarda Huida, Lucas Giovani Fruck
e Gustavo José Paulo, do grupo MAGUGI.

## Como Executar o Projeto

### Opção A — Docker Compose (recomendado)

Pré-requisito único: **Docker Desktop** (ou Docker Engine + plugin Compose).

```bash
git clone https://github.com/igorSeberino/srec.git
cd srec
docker compose up
```

É isso. Um comando. Ao final:

| Serviço | URL | Observação |
|---|---|---|
| Frontend | <http://localhost:5173> | Vite com hot reload |
| API | <http://localhost:5000> | responde JSON `{"name":"SREC Coworking API","status":"running",...}`; saúde em `/health` |
| PostgreSQL | `localhost:5432` | usuário `srec`, senha `srec`, banco `srec` |

O `docker compose up` sobe o PostgreSQL, **espera o healthcheck**
(`pg_isready`) passar, aplica as migrations de `server/migrations/`
(`npm run db:migrate`) e só então inicia o backend. Nenhum `.env` precisa ser
criado: as variáveis estão em `docker-compose.yml`.

Comandos do dia a dia:

```bash
docker compose up -d                 # sobe em background
docker compose logs -f server        # acompanha o log do backend
docker compose exec server npm test  # roda os testes dentro do container
docker compose exec postgres psql -U srec -d srec   # abre um psql no banco
docker compose down                  # para tudo, preservando os dados
docker compose down -v               # para tudo e APAGA o volume do banco
docker compose up --build            # reconstrói as imagens após mudar dependências
```

O hot reload funciona nos dois lados: `./server/src` e `./client/src` são
montados no container (`docker-compose.override.yml`), então salvar um
arquivo reinicia o `nodemon` ou dispara o HMR do Vite sem rebuild.

Para validar o modo de produção (nginx servindo o bundle, sem bind mount):

```bash
docker compose -f docker-compose.yml up --build
```

### Opção B — Execução local sem Docker

Mantida para quem já tem Node.js 20 e PostgreSQL 16 na máquina.

```bash
# 1. banco
createdb srec

# 2. backend
cd server
cp .env.example .env     # ajuste DATABASE_URL
npm install
npm run db:migrate       # cria e atualiza o schema; o boot não cria tabelas
npm run dev              # porta 5000

# 3. frontend, em outro terminal
cd client
cp .env.example .env     # opcional: o padrão já aponta para http://localhost:5000/api
npm install --legacy-peer-deps
npm run dev              # porta 5173
```

O backend valida as variáveis de ambiente no boot e recusa subir se alguma
estiver errada, dizendo qual. A lista completa está em `server/.env.example`.

### Testes e qualidade

```bash
# backend
cd server
npm run lint
npm test                    # só os testes unitários, sem banco
npm run db:test:up          # Postgres descartável na porta 5433 (Docker)
npm run test:integration    # testes de integração contra esse banco
npm run test:coverage       # tudo, com o gate de cobertura do jest.config.js
npm run db:test:down

# frontend
cd client
npm run format:check
npm run lint
npm test
npm run build
```

A CI (`.github/workflows/ci.yml`) roda esses mesmos passos em todo PR, mais um
smoke test do `docker compose`.

**Atenção ao medir cobertura.** O número muda conforme o denominador. O
comparável com o baseline (**6,14 %** no código recebido) é o de todo o fonte
de `src/`, sem os arquivos de teste, rodado em série:

```bash
cd server
npx jest --runInBand --coverage --coverageReporters=text \
  --collectCoverageFrom='src/**/*.js' --collectCoverageFrom='!src/**/*.test.js'
```

No `main` essa medição dá **89,95 %** de statements. As outras formas de medir
e por que cada uma erra estão na seção 1 do
[relatório antes/depois](docs/auditoria/relatorio-antes-depois.md).

## Time de agentes de IA

O repositório traz um time de agentes de Claude Code **já configurado em
`.claude/`**, sem necessidade de instalação: clone o repositório, abra o Claude
Code na raiz e os skills, subagents e comandos carregam sozinhos.

```
/onboard                  roteiro de primeiro acesso
/implementar <slug>       executa uma spec de docs/specs/ pelo fluxo TBD
/auditar <caminho>        audita um trecho de código e registra o achado
/revisar-pr <número>      parecer de QA sobre um PR
/metricas                 mede e compara com o baseline da auditoria
```

Na N1 o time usava um plugin externo, que exigia `claude plugin install` em
cada máquina e só propagava mudança com bump de versão. Vendorizar resolve os
dois problemas e sobrevive ao handoff da N3 — a justificativa está no
[ADR-08](docs/arquitetura/decisoes.md).

## Convenções

* **Trunk-Based Development.** `main` é o único branch longevo. Branch curta `fix/<slug>`, `feature/<slug>`, `refactor/<slug>`, `test/<slug>` ou `docs/<slug>`, PR pequeno, merge frequente. Merge exige **1 aprovação do QA + CI verde**.
* **Conventional Commits** em português, no imperativo: `fix(reservations): impedir dupla reserva concorrente`.
* **Idioma.** Issues, histórias, commits e documentação em português. Nomes de branch, identificadores de código e nomes de pasta de spec em inglês.
* **Uma casa canônica por assunto.** Para relacionar documentos, use link, não copie o texto. Se o documento divergir do código, **o código vence**: corrija o documento.
* **Toda melhoria carrega número antes e depois.**

## Backlog

Vive no **[GitHub Project](https://github.com/users/igorSeberino/projects/1)**,
não nos documentos. Cada issue aponta para a spec em
[`docs/specs/`](docs/specs/) que descreve o trabalho em detalhe: problema,
evidência, decisão, código proposto, testes, critérios de aceite e passo a
passo.
