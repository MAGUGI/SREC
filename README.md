# SREC — Sistema de Reserva de Espaços e Coworking

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
| **o grupo da N3** | [handoff](docs/handoff/n3.md) → [arquitetura alvo](docs/arquitetura/arquitetura-alvo.md) → [decisões](docs/arquitetura/decisoes.md) |
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
* [Bugs do Cliente](docs/auditoria/bugs-do-cliente.md) — 15 defeitos, com arquivo, linha e reprodução
* [Code smells](docs/auditoria/code-smells.md) — 14 achados estruturais, com evidência
* [Divergências entre documentação e código](docs/auditoria/divergencias-doc-codigo.md) — 12 inconsistências no que recebemos

### Arquitetura

* [Estado atual](docs/arquitetura/estado-atual.md) — como o sistema é hoje, engenharia reversa
* [Arquitetura alvo](docs/arquitetura/arquitetura-alvo.md) — onde chegamos ao fim da N2
* [Decisões (ADRs)](docs/arquitetura/decisoes.md) — o que decidimos, as alternativas e o custo de cada escolha

### Produto, requisitos e time

* [Visão do produto e regras de negócio](docs/produto/overview.md) e [requisitos](docs/produto/requisitos.md) — reconstruídos por engenharia reversa, cada um com situação explícita
* [Equipe, papéis e Matriz RACI](docs/time/overview.md) — inclui DoR, DoD e gestão de débito técnico
* [Fluxo Trunk-Based Development](docs/time/fluxo-tbd.md) — branches, commits, ciclo do PR

### Entrega

* [Especificações de implementação](docs/specs/) — uma pasta por issue, com o trabalho já desenhado
* [Handoff para a N3](docs/handoff/n3.md)

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
O QA aprova todos os Pull Requests.

Na N1 este sistema foi construído por Maria Eduarda Huida, Lucas Giovani Fruck
e Gustavo José Paulo, do grupo MAGUGI.

## Como rodar

> **Nota.** O caminho abaixo são os 7 passos manuais que herdamos. A issue
> [OPS-01](docs/specs/ops-01-docker-compose-environment/implementacao.md)
> substitui tudo isso por `docker compose up`. Enquanto ela não estiver
> mergeada, siga o manual.

Pré-requisitos: Node.js 20, PostgreSQL 16, Git.

```bash
# 1. banco
createdb srec

# 2. backend
cd server
cp .env.example .env     # ajuste DATABASE_URL
npm install
npm run dev              # porta 5000, cria as tabelas no boot

# 3. frontend, em outro terminal
cd client
npm install --legacy-peer-deps
npm run dev              # porta 5173
```

### Testes e qualidade

```bash
# backend
cd server
npm test
npx jest --coverage --coverageReporters=text --collectCoverageFrom='src/**/*.js'
npm run lint

# frontend
cd client
npm run lint
npm run build
```

**Atenção ao medir cobertura.** `npx jest --coverage` sem
`--collectCoverageFrom` reporta 35,48 %, porque só conta os arquivos que algum
teste importou. A medição correta sobre todo o fonte dá **6,14 %**. Comparar
números medidos de formas diferentes é o mesmo que não medir — use sempre a
forma completa.

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

* **Trunk-Based Development.** `main` é o único branch longevo. Branch curta `fix/<slug>`, `feature/<slug>` ou `refactor/<slug>`, PR pequeno, merge frequente. Merge exige **1 aprovação do QA + CI verde**.
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
