# SREC — orientação para agentes

Este repositório está na **entrega N2** da disciplina de Manutenção e Melhoria
de Software. O código foi recebido do grupo MAGUGI (`MAGUGI/SREC`) e o trabalho
desta entrega é **auditar, medir, corrigir bugs e refatorar código alheio** —
não construir um sistema novo.

Lê isto antes de tocar em qualquer coisa:
[relatório de auditoria](docs/auditoria/relatorio-n2.md).

## A regra que rege tudo

**Toda afirmação de melhoria carrega um número antes e um número depois.**

A rubrica da entrega exige defender as melhorias *com dados*. "Melhoramos a
qualidade do código" não vale nada. "A cobertura de statements saiu de 6,14 %
para 72 %, e estes 7 testes falhavam antes da correção" vale.

Se você não mediu, não afirme. Se mediu, cite o comando.

## Onde cada coisa mora

```
server/          backend Express recebido (routes -> controllers -> models)
client/          frontend React recebido
docs/auditoria/  o diagnóstico: relatório, métricas, bugs, code smells, divergências
docs/arquitetura/estado atual, arquitetura alvo, ADRs, DER, OpenAPI
docs/produto/    requisitos e regras de negócio reconstruídos
docs/time/       papéis, RACI, DoR/DoD, fluxo TBD
docs/specs/      uma pasta por issue, com a especificação de implementação
docs/handoff/    o que entregamos ao grupo da N3
.claude/         este time de agentes (skills, subagents, commands)
```

**Uma casa canônica por assunto.** Para relacionar documentos, use link, nunca
copie o texto. Se dois documentos divergirem, o **código real e o comportamento
observado têm prioridade**: corrija o documento, não repita a informação
desatualizada.

## Antes de implementar qualquer issue

1. Leia `docs/specs/<slug>/implementacao.md` **inteira**. A spec traz problema,
   evidência, decisão de arquitetura, código proposto, testes, critérios de
   aceite e as mensagens de commit prontas. Não improvise o que já está escrito.
2. Carregue a skill de arquitetura da área: `srec-backend-architecture`,
   `srec-frontend-architecture` ou `srec-testing`.
3. Se a spec pede um teste que falha antes da correção, **escreva o teste
   primeiro e veja falhar**. É o que prova o bug para a banca.

Ou simplesmente rode `/implementar <slug>`, que faz os três passos.

## Não amplie o escopo

Este é código de outra pessoa, e a tentação de "já que estou aqui, arrumo isso
também" destrói a rastreabilidade entre o achado da auditoria e a correção —
que é justamente o que a entrega precisa demonstrar.

Se você encontrar um problema novo, **registre como issue** com a label
`debito tecnico` ou `bug do cliente` e siga com o escopo original. Não corrija
de passagem. A Definition of Done tem um item explícito para isso: nenhum
arquivo fora do escopo da issue foi alterado.

## Convenções de código

* **Backend.** Express 5, PostgreSQL com `pg` e SQL cru, CommonJS. **Não
  introduza ORM** (ADR-02) e **não vá para DDD** (ADR-04). A arquitetura alvo
  é `routes -> controllers -> services -> models`, com `domain/` para regras
  puras e `middleware/` para erro e validação.
* **Frontend.** React 19, Vite, JavaScript sem TypeScript (ADR deliberado).
  Estrutura por feature em `src/features/`, genéricos em `src/components/`,
  hooks em `src/hooks/`. **Nenhum arquivo `.jsx` acima de 120 linhas.**
* **Schema.** Só muda por migration versionada (ADR-03). `initDb.js` está
  aposentado — não volte a usá-lo.
* **Erro.** Um middleware central mapeia `AppError` e SQLSTATE para HTTP
  (ADR-06). Não adicione `try/catch` por rota; era o code smell CS-02.

## Convenções de escrita

* Conteúdo em **português do Brasil**. Nomes de arquivo, pasta, branch,
  identificador de código e comentário em **inglês**.
* Nomes de arquivo em `kebab-case` minúsculo.
* Marcador de lista `*`, não `-`.
* Sem linha de metadados de cabeçalho (`Responsável · Última revisão ·
  Status`): é ruído. Responsável e aprovador vivem só na Matriz RACI.
* Tabela markdown só onde o conteúdo é realmente tabular.
* Requisitos e regras de negócio carregam **Situação** explícita
  (`implementado`, `implementado com defeito (BUG-nn)`,
  `documentado mas inexistente`, `não implementado`).
* Diagramas em **mermaid**, nunca imagem.

## Git

* **Trunk-Based Development.** `main` é o único branch longevo. Branch curta
  `fix/<slug>`, `feature/<slug>`, `refactor/<slug>`, `test/<slug>` ou
  `docs/<slug>`, sempre em inglês.
* **Conventional Commits** em português, no imperativo, com escopo:
  `fix(reservations): impedir dupla reserva concorrente`.
* PR pequeno. Merge exige **1 aprovação do QA (@igorSeberino) + CI verde**.
* O backlog vive no [GitHub Project](https://github.com/users/igorSeberino/projects/1).
  **Não crie item de backlog dentro de documento.**

## Antes de commitar

```bash
cd server && npm run lint && npm test
cd client && npm run lint && npm run build
```

E, se tocou em cobertura:

```bash
cd server && npx jest --coverage --coverageReporters=text --collectCoverageFrom='src/**/*.js'
```

Sempre com `--collectCoverageFrom`. Sem ele o Jest reporta 35,48 %, porque só
conta arquivos importados por algum teste — número que não responde à pergunta
que interessa e não é comparável com o baseline.

## A documentação recebida não é fonte da verdade

`Documentação Oficial SREC.md` está preservada como registro histórico e
**descreve um sistema diferente do que existe**: promete chave `UUID` onde há
`SERIAL`, coluna `is_active` que não existe, `user_id` onde há `user_name`,
controle de acesso de administrador que nunca foi implementado, e manda criar
branch a partir de `develop`, que nunca existiu.

São 12 divergências catalogadas em
[`docs/auditoria/divergencias-doc-codigo.md`](docs/auditoria/divergencias-doc-codigo.md).
Não cite aquele documento como verdade. A verdade vive em `docs/produto/` e
`docs/arquitetura/`.
