# Relatório da Etapa 3 (N3) — Retorno à Equipe de Origem (MAGUGI)

**Projeto:** SREC — Sistema de Reserva de Espaços e Coworking  
**Equipe de Origem (N1 / N3):** MAGUGI (Maria Eduarda Huida, Lucas Giovani Fruck, Gustavo José Paulo)  
**Equipe Anterior (N2):** Igor Thiago Seberino, Gabriel Carvalho, Adrian Cesar Gonçalves, Renato Colin Neto, Diego Nessler  
**Commit auditado na integração (N3):** `43d89b9` (`Merge pull request #4 from igorSeberino/main`, incorporando entregas até o PR #64 da N2)  
**Baseline de origem (N1):** `8431181` (`MAGUGI/SREC`)

---

## 1. Redefinição do Perfil de cada Integrante (Rodízio N1 → N3)

Seguindo a premissa da disciplina de **rodízio completo de papéis** a cada ciclo — para garantir que o sistema seja sustentável independentemente de quem escreveu cada camada originalmente —, nenhum integrante da equipe MAGUGI repete na N3 o papel exercido na N1.

### 1.1 Matriz de Rodízio de Papéis

| Integrante | Papel na N1 (Construção) | Novo Papel na N3 (Integração & Produção) | Responsabilidades Principais na N3 |
|---|---|---|---|
| **Maria Eduarda Huida** | Product Owner & Requisitos | **Backend & Quality Assurance (QA)** | Auditar a refatoração do backend (services, middlewares, migrations e domínio), verificar bugs de regressão, atualizar e expandir a suíte de testes automatizados (Jest) e validar critérios de aceite/cobertura. |
| **Lucas Giovani Fruck** | Backend & QA | **Frontend & DevOps / Infraestrutura** | Auditar a modularização do frontend (React/Vite), acessibilidade, validação em tela, sincronia de contrato com a API, Docker Compose, pipeline de CI/CD, portões de lint/auditoria (`npm audit`) e prontidão de deploy. |
| **Gustavo José Paulo** | Frontend & DevOps | **Product Owner, Requisitos & Arquitetura** | Auditar a documentação produzida pela N2 (requisitos, ADRs, DER, relatórios), confrontar pendências de handoff/OpenAPI, consolidar o catálogo de débitos técnicos acumulados e priorizar o plano rápido de refatoração para produção. |

### 1.2 Matriz RACI — Etapa 3 (N3)

Legenda: **R** = Responsável (executa) · **A** = Aprovador · **C** = Consultado · **I** = Informado.

| Atividade da Etapa 3 | Gustavo (PO / Req / Arq) | Maria Eduarda (BE / QA) | Lucas (FE / DevOps) |
|---|---|---|---|
| Análise da documentação da equipe anterior (N2) | **R/A** | C | C |
| Auditoria de manutenções propostas vs. aplicadas | **A** | **R** (Backend/Testes) | **R** (Frontend/Ops) |
| Verificação de padrões, código duplicado e regressões | C | **R/A** (Backend) | **R** (Frontend/CI) |
| Atualização da suíte de testes para novos cenários | I | **R/A** | C |
| Levantamento de débitos técnicos acumulados | **R/A** | C | C |
| Plano rápido de refatoração para produção | **R/A** | C | C |
| Aprovação de Pull Requests de integração | C | **A** (PRs de FE/Ops/Docs) | **A** (PRs de BE/QA) |

> **Regra de revisão cruzada:** nenhum integrante aprova o próprio PR. PRs de código de Backend/QA (Maria Eduarda) são revisados por Lucas; PRs de Frontend/DevOps (Lucas) e Documentação/Arquitetura (Gustavo) são revisados por Maria Eduarda (QA).

---

## 2. Análise da Documentação Realizada pela Equipe Anterior (N2)

A equipe da N2 produziu um volume expressivo e bem estruturado de documentação em `docs/`, adotando a política de **"código como fonte da verdade"** e **"nenhuma afirmação sem medição reproduzível"**.

### 2.1 Pontos Fortes Identificados

1. **Rastreabilidade ponta a ponta:** cada achado da auditoria (`BUG-01..15`, `CS-01..14`, `D-01..12`) foi convertido em issue e especificação individual em `docs/specs/` (26 specs de implementação + 2 diagnósticos).
2. **Evidências brutas versionadas:** `docs/auditoria/evidencias/` guarda saídas reais de comandos (`qa-01-antes.txt`, `qa-01-depois.txt`, `qa-04-cobertura-main.txt`, etc.), permitindo auditar os números sem depender de estimativas.
3. **Registros de Decisão Arquitetural (`docs/arquitetura/decisoes.md`):** ADRs claros documentando contexto, alternativas descartadas e o custo assumido de cada escolha (ex.: `EXCLUDE` no PostgreSQL, manutenção de SQL cru, `TIMESTAMPTZ`, ausência de autenticação).
4. **Engenharia reversa rigorosa:** `docs/produto/requisitos.md` (19 RF + 15 RNF) e `docs/arquitetura/der.md` (DER recebido vs. DER atual) reconstruíram o comportamento real do sistema.
5. **QA estruturado:** `docs/qa/plano-de-testes.md`, `docs/qa/roteiro-regressao.md` (56 passos) e registro de execução em `docs/qa/execucoes/2026-10-23-main-igor.md`.

### 2.2 Lacunas, Divergências e Problemas Encontrados na Documentação da N2

A auditoria na N3 identificou **6 problemas concretos** na documentação entregue pela equipe anterior:

| # | Problema Encontrado | Evidência / Localização | Impacto na N3 |
|---|---|---|---|
| **DOC-01** | **Contrato OpenAPI (`REQ-03`) não entregue** | `docs/arquitetura/contrato-api.yaml` e `docs/arquitetura/openapi.yaml` **não existem** no repositório, embora referenciados em `README.md:77`, `divergencias-doc-codigo.md:146` e `relatorio-antes-depois.md:207`. | Mantém 4 divergências abertas (`D-04`, `D-05`, `D-06`, `D-07`) e deixa a API sem contrato formal executável. |
| **DOC-02** | **Documento de Handoff para a N3 (`REQ-04`) não entregue** | Pasta `docs/handoff/` **não existe** (`README.md:26,77` e `divergencias-doc-codigo.md:147` apontam para `docs/handoff/n3.md` / issue #24 "em elaboração"). | Aumenta o tempo de absorção na N3; a equipe precisou cruzar `README.md`, `relatorio-antes-depois.md` e `git log` manualmente. |
| **DOC-03** | **Validador automático de requisitos falha** | Executar `node scripts/check-requirements.mjs` retorna **exit 1**: `RNF03: Situação fora do vocabulário: "implementado com defeito (resource_id sem NOT NULL)"`. O script não está integrado na CI. | Quebra a garantia automatizada de integridade da documentação de requisitos. |
| **DOC-04** | **Divergência entre ADR-003 e o código entregue** | `docs/arquitetura/decisoes.md:114` decide por adotar `node-pg-migrate` e rejeita explicitamente "script próprio com `.sql` numerado". Porém, `server/package.json` não instala `node-pg-migrate` e o código usa o script próprio `server/scripts/migrate.js` (sem lock de concorrência). | A equipe N2 repetiu o padrão de divergência doc × código que criticou na N1. |
| **DOC-05** | **Documentos desatualizados após o PR #61** | `docs/auditoria/relatorio-antes-depois.md` (medido no commit `9662616`) ainda registra `BUG-09` e `BUG-10` como abertos, 5 migrations e 3 constraints, mas o PR #61 já foi mesclado (agora há **6 migrations + 1 rollback** e **5 constraints**). Além disso, `docs/produto/overview.md:25-26` ainda diz que a API aceita tipo e capacidade inválidos, contradizendo as linhas 72 e 96 do próprio arquivo. | Relatório final não reflete exatamente o estado do código mesclado em `43d89b9`. |
| **DOC-06** | **Sem execução "antes" do roteiro manual de regressão** | Registrado em `docs/qa/execucoes/2026-10-23-main-igor.md:5-6`: `FE-01` foi mesclado antes de `QA-03`, impedindo a comparação manual antes/depois da interface original da N1. | Reduz a rastreabilidade visual de regressões no frontend. |

---

## 3. Análise das Identificações de Manutenções e Melhorias Propostas pela N2

A equipe N2 classificou o diagnóstico recebido da N1 em **41 achados catalogados**:
- **15 Bugs do Cliente** (`BUG-01` a `BUG-15`): 2 Críticos, 5 Altos, 5 Médios e 3 Baixos.
- **14 Code Smells** (`CS-01` a `CS-14`): 4 Altos, 6 Médios e 4 Baixos.
- **12 Divergências Documentação × Código** (`D-01` a `D-12`).

E desdobrou o trabalho em **28 issues/specs** divididas em 5 frentes (`BE-01..08`, `FE-01..05`, `OPS-01..05`, `REQ-01..04`, `QA-01..04`, além de `ONB-01`, `AUD-01` e os posteriores `BE-09`/`BE-10` via PRs #60 e #61).

### Avaliação Crítica do Diagnóstico da N2

- **Diagnóstico tecnicamente preciso nos pontos vitais:** a identificação de **BUG-01** (condição de corrida TOCTOU na criação de reservas sem constraint `EXCLUDE`), **BUG-02** (janela invertida `end_time <= start_time` gerando reservas fantasmas), **BUG-07** (`TIMESTAMP` sem timezone), **CS-01** (`App.jsx` com 351 linhas), **CS-02** (10 blocos `try/catch` duplicados) e **CS-03** (ausência de camada de serviço impedindo testes unitários — causa raiz dos 6,14% de cobertura na N1) foi certeira e bem priorizada.
- **Cortes de escopo coerentes com o prazo:** não introduzir autenticação/RBAC, não migrar SQL cru para ORM, não adotar DDD completo nem reescrever o frontend em TypeScript foram decisões bem justificadas nos ADRs.
- **Ponto de melhoria no diagnóstico:** a equipe N2 criou uma pasta `shared/` (herdada da N1) mas não propôs unificar as constantes e regras de validação compartilhadas entre `server` e `client`, o que gerou duplicação e posterior dessincronia após o PR #61.

---

## 4. Verificação de Aplicação das Manutenções e Melhorias

Abaixo está o balanço real verificado diretamente no código do commit `43d89b9` (não apenas nos relatórios da N2).

### 4.1 Bugs Catalogados (15 originais + 1 descoberto na N2)

| ID | Sev. | Descrição | Status Real em `43d89b9` | Evidência no Código |
|---|---|---|---|---|
| **BUG-01** | CRÍTICO | Dupla reserva sob concorrência | **Aplicado** | Migration `001_reservation_no_overlap.sql` (`EXCLUDE USING gist`) + tradução `23P01 → 409`. |
| **BUG-02** | CRÍTICO | Reserva com fim antes do início | **Aplicado** | `validators/reservationValidator.js:13` + migration `002_reservation_time_window_check.sql`. |
| **BUG-03** | ALTO | Status arbitrário aceito | **Aplicado** | `domain/reservationStatus.js` + `services/reservationService.js:33-38` + migration `003`. |
| **BUG-04** | ALTO | ID não numérico retorna 500 | **Aplicado** | `middlewares/validateIdParam.js` + `errors/pgErrorCodes.js` (`22P02 → 400`). |
| **BUG-05** | ALTO | Atualização parcial retorna 500 | **Aplicado** | `models/resourceModel.js:29-34` (`COALESCE`) + `services/resourceService.js:26`. |
| **BUG-06** | ALTO | Exclusão de espaço apaga reservas em silêncio | **Parcial (Mitigado)** | `CascadeDeleteDialog.jsx` exige ciência e exibe contagem, mas o banco mantém `ON DELETE CASCADE` (exclusão física). |
| **BUG-07** | ALTO | Deslocamento de horário por falta de fuso | **Aplicado** | Migration `0001_timestamptz.sql` + `utils/datetime.js` (exige offset ISO 8601) + `client/src/lib/datetime.js`. |
| **BUG-08** | MÉDIO | Reserva no passado aceita | **Aplicado** | `validators/reservationValidator.js:14` + `client/src/features/reservations/validation.js:46`. |
| **BUG-09** | MÉDIO | Capacidade 0/negativa aceita | **Aplicado no BE / Parcial no FE** | Corrigido no backend pelo PR #61 (`domain/resourceType.js`, migration `004`, faixa 1–100). **No frontend**, `validation.js` não valida o teto `> 100`. |
| **BUG-10** | MÉDIO | `type` aceita qualquer string | **Aplicado** | Corrigido pelo PR #61 (`domain/resourceType.js`, `resourceService.js`, migration `004`). |
| **BUG-11** | MÉDIO | Servidor sobe com banco quebrado | **Aplicado** | `config/env.js` valida ambiente no boot; `db:migrate` falha se o banco estiver fora; `/health` responde `503`. |
| **BUG-12** | MÉDIO | Queda do Postgres derruba o processo | **Aplicado** | `config/database.js` trata erro do pool; `/health` retorna `503 degraded` e recupera ao religar. |
| **BUG-13** | BAIXO | Duplo clique cria duas reservas | **Aplicado** | `client/src/hooks/useSubmit.js` trava reentrada durante submissão. |
| **BUG-14** | BAIXO | `setTimeout` de feedback sem cleanup | **Aplicado** | `client/src/hooks/useFeedback.js` limpa o timer anterior e no unmount. |
| **BUG-15** | BAIXO | Endpoint `PUT /api/resources/:id` órfão | **Aplicado** | Botão de edição e modo `edit` em `ResourceForm.jsx` / `ResourcesPanel.jsx`. |
| **N2-QA-01** | MÉDIO | `POST`/`PATCH` sem `Content-Type: application/json` retorna **500** | **NÃO APLICADO (Aberto)** | `reservationController.js:7,16` e `resourceController.js:6` acessam `req.body` sem fallback quando `req.body` é `undefined`. |

**Resumo de Bugs:** 14 de 15 bugs originais corrigidos (1 mitigado apenas em UI: `BUG-06`), porém **1 bug de API (`N2-QA-01`) permanece aberto** no `main`.

### 4.2 Code Smells Catalogados (14)

- **Resolvidos (12):** `CS-01` (`App.jsx` 351 → 56 linhas), `CS-02` (`0` blocos `try/catch` nos controllers), `CS-03` (camada `services/` + `domain/`), `CS-04` (validação estruturada), `CS-05` (constantes de domínio), `CS-06` (`initDb.js` removido, migrations em `server/migrations/`), `CS-07` (`VITE_API_BASE_URL` em `config/env.js`), `CS-09` (índice GiST do `EXCLUDE`), `CS-10` (8 famílias de regras no ESLint), `CS-12` (`0` `eslint-disable`), `CS-13` (`0` `<label>` sem `htmlFor`), `CS-14` (`helmet`, `rateLimit`, CORS com allowlist).
- **NÃO Resolvidos (2):**
  - **`CS-08` (Refetch total a cada mutação):** `client/src/hooks/useAppData.js:19-26` mantém `reloadAll()` recarregando recursos e reservas juntos após qualquer mutação.
  - **`CS-11` (Arquivos placeholder de 0 byte):** `client/client.txt`, `server/server.txt` e `shared/shared.txt` continuam versionados.

### 4.3 Specs / Entregas de Processo (28)

- **Aplicadas completamente (22):** `ONB-01`, `AUD-01`, `BE-01..08` (+ `BE-09`/`BE-10`), `FE-01..05`, `OPS-01`, `OPS-02`, `OPS-04`, `REQ-01`, `REQ-02`, `QA-01..04`.
- **Aplicadas parcialmente (2):**
  - **`OPS-03`:** regras estruturais do ESLint e `npm audit` ficaram apenas em modo observação (`warn` / `continue-on-error: true`), não bloqueando PRs.
  - **`OPS-05`:** proteção de `main` configurada com `0` status checks obrigatórios e `enforce_admins: false` (conforme `relatorio-antes-depois.md:486-487`).
- **NÃO aplicadas (2):** **`REQ-03`** (contrato OpenAPI) e **`REQ-04`** (documento de handoff para a N3).

---

## 5. Conformidade com Padrões Iniciais, Código Duplicado e Bugs de Regressão

### 5.1 Conformidade com os Padrões Iniciais (N1)

| Padrão N1 | Situação na Entrega N2 | Avaliação |
|---|---|---|
| Stack (Node/Express/PostgreSQL + React/Vite) | Preservada integralmente | **Conforme** |
| Arquitetura MVC no Backend | Evoluída para Routes → Middlewares → Controllers → Services → Domain → Models | **Conforme (evolução positiva)** |
| ESLint + Prettier com 0 erros | `npm run lint` passa com 0 erros, **porém `npm run lint:strict` falha** com **19 avisos** (13 no `server`, 6 no `client`). | **Parcialmente conforme** |
| Formatação automatizada | `client` possui `format:check` na CI (passando); `server` **não possui** script `format:check` nem etapa de Prettier na CI. | **Parcialmente conforme** |
| Fluxo Git | N1 documentava Git Flow (`develop` + Jira, nunca efetivado); N2 adotou Trunk-Based Development (`main` + GitHub Issues + Conventional Commits em PT-BR). | **Alterado com justificativa (ADR/D-10)** |
| Padronização de ferramentas e idioma | `server` usa ESLint 10; `client` usa ESLint 9 + `oxlint` não utilizado (`.oxlintrc.json`) + exige `--legacy-peer-deps`. Migrations misturam prefixos de 4 e 3 dígitos (`0000_`, `0001_` vs `001_`..`004_`). Código mistura identificadores em português (`lerInteiro` em `env.js`) com inglês. | **Não conforme (inconsistência)** |

**Detalhamento dos 19 avisos medidos no `npm run lint:strict`:**
- **Server (13 avisos):** `security/detect-object-injection` (7), `security/detect-non-literal-fs-filename` (1 em `migrate.js:20`), `security/detect-unsafe-regex` (1 em `utils/datetime.js:2`), `max-params` (1 em `config/env.js:22` — `lerInteiro` com 5 parâmetros), `complexity` (1 em `middlewares/errorHandler.js:12` — complexidade 11 > 10).
- **Client (6 avisos):** `max-lines-per-function` (2: `ReservationForm.jsx` e `ResourceForm.jsx`, ambos com 87 linhas > 80), `complexity` (4: `ResourceForm.jsx` = 15, `CascadeDeleteDialog.jsx` = 14, `lib/validation.js:serverFieldErrors` = 12, `reservations/validation.js:validateReservation` = 11).

### 5.2 Análise de Código Duplicado e Código Morto

1. **Duplicação de domínio e validação entre `server/` e `client/` (pasta `shared/` ociosa):**
   - `RESOURCE_TYPE` (`workstation`, `meeting_room`) e `RESERVATION_STATUS` (`scheduled`, `cancelled`, `completed`) estão duplicados em `server/src/domain/resourceType.js` / `reservationStatus.js` e `client/src/constants/domain.js`.
   - `MAX_CLOCK_SKEW_MS = 60 * 1000` está duplicado em `server/src/validators/reservationValidator.js:1` e `client/src/features/reservations/validation.js:4`.
   - **Consequência prática já ocorrida:** após o PR #61 adicionar `MAX_CAPACITY = 100` no backend, `client/src/features/resources/validation.js` ficou dessincronizado (não valida `> 100` nem mapeia `INVALID_CAPACITY` / `INVALID_RESOURCE_TYPE` em `RESOURCE_ERROR_FIELDS`).
2. **Duplicação interna no backend:**
   - **Tratamento triplo de sobreposição (`RESERVATION_OVERLAP`):** a mensagem `'Já existe uma reserva para este espaço no período selecionado.'` e o código `RESERVATION_OVERLAP` estão duplicados em `services/reservationService.js:18`, `services/reservationService.js:22` (bloco `catch` específico para `23P01`) e `errors/pgErrorCodes.js:6` (que já trata `23P01` no `errorHandler` global).
   - **Lógica de sobreposição em 3 locais:** `domain/timeWindow.js` (usada apenas em testes unitários, não chamada em runtime), `models/reservationModel.js:55` (SQL) e constraint `EXCLUDE` (PostgreSQL).
   - **Parsing de datas espalhado:** `parseTimestamp` (`validators/reservationValidator.js`), `toInstant` (`domain/timeWindow.js`) e `parseInstant` (`utils/datetime.js`).
3. **Código morto identificado:**
   - `ReservationModel.findByResourceId` (`server/src/models/reservationModel.js:27-31`) não é invocado em nenhum arquivo de produção nem de teste.

### 5.3 Análise de Bugs de Regressão (Funcionalidades N1 → N2)

Todas as funcionalidades principais da Etapa 1 (CRUD de espaços, criação/listagem/conclusão/cancelamento/exclusão de reservas e bloqueio de sobreposição) **continuam funcionando**. Contudo, a auditoria identificou **3 mudanças quebrantes intencionais** e **5 defeitos/regressões operacionais**:

#### Mudanças Quebrantes de Contrato (Intencionais — Documentadas em ADRs)
1. **Datas sem timezone rejeitadas (`BE-07` / ADR-005):** `POST /api/reservations` passou a rejeitar strings sem offset (`2026-10-23T14:00`) com `400 INVALID_DATETIME`. Clientes externos que seguiam o formato da N1 quebram até enviar ISO 8601 com offset.
2. **Resposta de `GET /` alterada (`OPS-01`):** mudou de texto plano (`"SREC Coworking API is running..."`) para JSON (`{"name":"SREC Coworking API","status":"running","health":"/health"}`).
3. **Boot sem criação automática de tabelas (`OPS-02` / ADR-003):** `initDb.js` foi removido; rodar `npm run dev` localmente sem executar `npm run db:migrate` antes agora falha nas consultas.

#### Defeitos e Regressões Encontrados na Integração N3
1. **`N2-QA-01` (MÉDIO — Regressão de robustez de API):** `POST /api/reservations`, `PATCH /api/reservations/:id/status` e `POST /api/resources` sem o cabeçalho `Content-Type: application/json` lançam `TypeError` nos controllers e retornam **HTTP 500** (`INTERNAL_ERROR`) com stack trace no log, violando o ADR-06.
2. **Dessincronia de validação Frontend × Backend pós-PR #61 (MÉDIO):** `client/src/features/resources/validation.js` permite enviar `capacity > 100` (rejeitado pelo backend com `400 INVALID_CAPACITY`) e não exibe erro inline no campo porque `RESOURCE_ERROR_FIELDS` não mapeia `INVALID_CAPACITY` nem `INVALID_RESOURCE_TYPE`.
3. **Strings contendo apenas espaços aceitas no `create` (BAIXO):** `ResourceService.create` e `ReservationService.create` aceitam `name: "   "` / `user_name: "   "`, enquanto `ResourceService.update` já bloqueia nome em branco com `.trim()`.
4. **Enum cru exposto no dropdown de reservas (BAIXO):** `client/src/features/reservations/ReservationForm.jsx:68` renderiza `{resource.name} ({resource.type})` (exibindo `workstation` / `meeting_room`), diferindo de `ResourceListItem.jsx`, que usa `resourceTypeLabel`.
5. **Falha de execução do Vitest no Windows em diretórios com espaço no caminho (AMBIENTE):** ao rodar `npm test` em `client/` sob caminho com espaço (`Nova pasta`), o Vitest `4.1.12` falha em todas as 14 suítes (`Vitest failed to find the runner` / `Cannot read properties of undefined (reading 'config')`), impactando a portabilidade local da equipe.

---

## 6. Atualização dos Testes para Verificar os Novos Cenários Criados

Para validar os novos fluxos introduzidos na N2 (camada de serviço, middlewares de erro, constraints de banco, hardening HTTP, PR #60 e PR #61) e cobrir lacunas de testes unitários identificadas na integração, a suíte unitária do backend (`server/`) foi expandida na N3.

### 6.1 Alterações Realizadas na Suíte de Testes

| Arquivo de Teste | Ação | Novos Cenários Cobertos |
|---|---|---|
| `server/src/controllers/reservationController.test.js` | **Criado (novo)** | Cobertura unitária dos 5 handlers (`createReservation`, `getAllReservations`, `getReservationById`, `updateReservationStatus`, `deleteReservation`) + caracterização do bug `N2-QA-01` (`req.body === undefined` encaminhando `TypeError` ao `next`). |
| `server/src/services/reservationService.test.js` | **Atualizado (+8 casos)** | Campos obrigatórios (`MISSING_FIELDS` com `details.fields`), janela invertida (`END_BEFORE_START` / BE-02), tradução concorrente de `23P01 → 409 RESERVATION_OVERLAP` (BE-01), propagação de erro inesperado do banco, `list`, `getById` (200/404), `changeStatus` (status inválido, 404, transição válida e bloqueio de transição a partir de estado terminal `409 INVALID_STATUS_TRANSITION` / BE-03) e `remove` (200/404). |
| `server/src/services/resourceService.test.js` | **Atualizado (+3 casos)** | `create` sem `name` ou `type` (`RESOURCE_FIELDS_REQUIRED`), `update` com nome em branco (`INVALID_NAME`), `capacity > 100` (`INVALID_CAPACITY`), recurso inexistente (`404`), além de `list` e `remove`. |
| `server/src/middlewares/errorHandler.test.js` | **Atualizado (+6 casos)** | Mapeamento de todas as 5 `CONSTRAINT_OVERRIDES` (`reservations_no_overlap`, `reservations_time_window_check`, `reservations_status_check`, `resources_type_check`, `resources_capacity_check`) e rejeição de CORS (`ORIGIN_NOT_ALLOWED → 403`). |
| `server/src/app.test.js` | **Atualizado (+2 casos)** | Novo contrato JSON de `GET /` (`{ name, status, health }`) e tratamento de JSON malformado (`400 INVALID_JSON` — PR #60). |

### 6.2 Resultado Medido Antes vs. Depois da Atualização N3

| Métrica (Testes Unitários — `server/`) | Recebido da N2 (`43d89b9`) | Após Atualização N3 | Variação |
|---|---|---|---|
| Arquivos de teste unitário | 16 | **17** | **+1** |
| Casos de teste unitário (`npm test`) | 190 passando | **215 passando** | **+25 (+13,2%)** |
| Cobertura unitária — `reservationController.js` | 0% (sem teste unitário) | **100% stmts / 100% funcs** | **+100 pp** |
| Cobertura unitária — `reservationService.js` | parcial (4 casos) | **100% stmts / 100% branches / 100% funcs** | **100%** |
| Cobertura unitária — `resourceService.js` | parcial | **97,29% stmts / 96,29% branches / 100% funcs** | **+cobertura** |
| Erros / novos avisos de ESLint (`npm run lint`) | 0 erros / 13 avisos | **0 erros / 13 avisos** | **0 regressões** |

> **Observação sobre ambiente de execução:** na estação de auditoria N3 não havia Docker Engine instalado para subir o Postgres descartável (`npm run test:integration`), e o Vitest no `client/` apresentou incompatibilidade de caminho com espaços (`Nova pasta`). O build de produção do frontend (`npm run build` → `214,45 kB`, `67,80 kB` gzip) e `npm run format:check` passaram com sucesso.

---

## 7. Débitos Técnicos Acumulados e Plano Rápido de Refatoração para Produção

### 7.1 Catálogo Consolidado de Débitos Técnicos

| ID | Débito Técnico | Origem | Severidade | Impacto em Produção |
|---|---|---|---|---|
| **DT-01** | **Ausência de autenticação e controle de acesso (RBAC)** (`D-06`, `D-03`) | Herdado N1 (adiado N2) | **CRÍTICA** | Qualquer usuário com acesso à URL cria, edita e apaga recursos e reservas de terceiros. |
| **DT-02** | **Vulnerabilidades em dependências (`npm audit`)** | Acumulado N1/N2 | **CRÍTICA** | `server/` apresenta **25 vulnerabilidades** reportadas no `npm ci` (**1 crítica, 2 altas**, 22 moderadas); `npm audit` na CI está com `continue-on-error: true`. |
| **DT-03** | **Exclusão física em cascata de espaços (`BUG-06` / `D-02`)** | Herdado N1 (mitigado N2) | **ALTA** | Excluir um recurso apaga permanentemente todo o histórico de reservas associadas (sem `is_active` / soft delete). |
| **DT-04** | **HTTP 500 em requisições sem `Content-Type: application/json` (`N2-QA-01`)** | Herdado N1 / Aberto N2 | **ALTA** | Clientes de API mal configurados recebem `500` e poluem logs de erro com stack traces falsos. |
| **DT-05** | **Ausência de contrato OpenAPI (`REQ-03`) e Handoff (`REQ-04`)** | Não entregue na N2 | **ALTA** | 5 divergências documentais seguem abertas; integradores não têm especificação formal dos 11 endpoints. |
| **DT-06** | **Integridade e performance de banco (`resource_id` nullable, sem índice, sem paginação)** | Herdado N1 / Parcial N2 | **ALTA** | `reservations.resource_id` aceita `NULL`; `GET /api/reservations` faz `SELECT *` sem paginação; `reloadAll()` (`CS-08`) amplifica a carga. |
| **DT-07** | **Runner de migrations sem lock de concorrência e numeração mista** | Criado na N2 | **MÉDIA** | `server/scripts/migrate.js` não usa advisory lock nem `node-pg-migrate` (divergindo do ADR-003); risco de race condition com múltiplas réplicas no deploy. |
| **DT-08** | **19 avisos de `lint:strict`, ausência de `format:check` no server e `0` checks obrigatórios na `main`** | Parcial na N2 (`OPS-03`/`OPS-05`) | **MÉDIA** | Qualidade estrutural e CI podem ser contornadas no merge; complexidade ciclomática acima do teto em 5 funções. |
| **DT-09** | **Dessincronia e duplicação de regras entre `server/` e `client/`** | Criado na N2 | **MÉDIA** | Frontend não valida `capacity > 100` nem mapeia `INVALID_CAPACITY`/`INVALID_RESOURCE_TYPE`; `shared/` continua vazio com 3 arquivos 0-byte (`CS-11`). |
| **DT-10** | **Ausência de testes E2E (Playwright) e `check-requirements.mjs` fora da CI** | Adiado N2 | **MÉDIA** | Regressão de UI depende de 56 passos manuais; documentação pode degradar sem bloqueio automático. |

### 7.2 Plano Rápido de Refatoração para Produção (2 Semanas / 4 Ondas)

O objetivo deste plano é eliminar os bloqueadores de produção com o menor risco possível, aproveitando a base de testes já existente:

| Onda | Prazo | Foco | Ações Concretas | Responsável (N3) | Critério de Pronto (Go-Live) |
|---|---|---|---|---|---|
| **Onda 1 — Segurança & Estabilidade Imediata** | Dias 1–3 | Fechar riscos críticos e bugs abertos | 1. Corrigir `N2-QA-01` (middleware garantindo `req.body = req.body ?? {}` ou `415 Unsupported Media Type`).<br>2. Executar `npm audit fix` / atualizar dependências vulneráveis no `server/` e tornar `npm audit --audit-level=high` bloqueante na CI.<br>3. Validar `.trim()` em `ResourceService.create` e `ReservationService.create`.<br>4. Corrigir `client/src/features/resources/validation.js` (`capacity <= 100` + `RESOURCE_ERROR_FIELDS`) e `ReservationForm.jsx` (`resourceTypeLabel`). | Maria Eduarda (BE/QA) + Lucas (FE/Ops) | 0 vulnerabilidades críticas/altas; `N2-QA-01` retornando `400/415` com teste; frontend sincronizado com PR #61. |
| **Onda 2 — Controle de Acesso & Integridade de Dados** | Dias 4–7 | Viabilizar uso fora de rede fechada | 1. Implementar autenticação JWT + papéis (`admin` / `user`) com tabela `users` e `reservations.user_id` (`DT-01`).<br>2. Implementar soft delete (`resources.is_active BOOLEAN DEFAULT true`) encerrando `BUG-06` sem perda de histórico.<br>3. Migration adicionando `NOT NULL` e índice B-Tree em `reservations.resource_id`, além de advisory lock em `migrate.js` (ou migração para `node-pg-migrate`).<br>4. Paginação (`limit`/`offset`) em `GET /api/reservations` e refetch seletivo no frontend (`CS-08`). | Maria Eduarda (BE/QA) + Lucas (FE/Ops) | Endpoints de escrita protegidos por JWT/RBAC; exclusão de espaço preserva histórico; `GET /api/reservations` paginado. |
| **Onda 3 — Portões de Qualidade & Limpeza Técnica** | Dias 8–10 | Zerar dívida estrutural de build/CI | 1. Zerar os 19 avisos de `lint:strict` (refatorar `errorHandler.js`, `ResourceForm.jsx`, `CascadeDeleteDialog.jsx`, `serverFieldErrors`, `validateReservation`) e promover regras para `error` na CI.<br>2. Adicionar `format:check` no `server` e `check-requirements.mjs` na CI (corrigindo `RNF03`).<br>3. Remover `ReservationModel.findByResourceId` (código morto), os 3 arquivos placeholder 0-byte (`CS-11`) e o `oxlint` órfão.<br>4. Ativar status checks obrigatórios na proteção da `main`. | Lucas (FE/Ops) + Maria Eduarda (BE/QA) | `lint:strict`, `format:check` e `check-requirements` verdes e bloqueantes na CI; 0 código morto/placeholder. |
| **Onda 4 — Contrato, E2E & Go-Live** | Dias 11–14 | Fechar documentação e validação ponta a ponta | 1. Publicar `docs/arquitetura/openapi.yaml` (`REQ-03`) cobrindo os 11+ endpoints reais e atualizar `overview.md` / `relatorio-antes-depois.md`.<br>2. Automatizar os fluxos críticos do roteiro de regressão (Blocos A, B e C) em Playwright na CI.<br>3. Validar stack completa com `docker compose -f docker-compose.yml up --build` (modo produção com Nginx, HTTPS via proxy reverso e variáveis seguras). | Gustavo (PO/Req/Arq) + Maria Eduarda (QA) + Lucas (Ops) | OpenAPI validado; suíte E2E verde na CI; smoke test de produção aprovado. |

---

## 8. Conclusão da Integração (Etapa 3)

O retorno do SREC à equipe de origem confirma uma **evolução técnica substancial** promovida pela equipe N2: o sistema saiu de um MVP de 1.280 linhas com 6,14% de cobertura e falha crítica de concorrência para uma arquitetura modular em camadas, conteinerizada com Docker Compose, com migrations versionadas, 5 constraints de integridade no PostgreSQL e mais de 200 testes automatizados.

Ao mesmo tempo, a auditoria rigorosa da Etapa 3 demonstrou que o sistema **ainda não está pronto para produção imediata**: permanecem em aberto a ausência de autenticação (`DT-01`), 25 vulnerabilidades de dependências no backend (`DT-02`), a exclusão em cascata de reservas (`BUG-06`), o erro `500` em requisições sem `Content-Type` (`N2-QA-01`), 19 avisos de lint estrutural, pequenas dessincronias entre frontend e backend após o PR #61, e a não entrega dos artefatos de OpenAPI (`REQ-03`) e Handoff (`REQ-04`). Com a suíte de testes unitários atualizada (+25 novos cenários, 215/215 passando) e a execução do plano rápido de refatoração em 4 ondas, o SREC alcança maturidade segura para entrada em produção.
