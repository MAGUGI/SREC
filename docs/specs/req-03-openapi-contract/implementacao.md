# REQ-03 — Contrato da API em OpenAPI e Swagger UI

* **Responsável:** Diego Nessler (`@Diegonessler`, Engenheiro de Requisitos)
* **Issue:** #23
* **Branch:** `docs/openapi-contract`
* **Rubrica:** 3,0 — Processo, Git & Documentação (item de 1,5 — atualização dos diagramas/README e clareza das alterações para a N3); alimenta 4,0 — Onboarding e diagnóstico, por fechar RNF08 e entregar a coleção de API que a rubrica da **N1** já pedia e que o grupo anterior não entregou
* **Depende de:** REQ-01 (inventário dos 10 endpoints e vocabulário do campo `Situação`) e REQ-02 (vocabulário real de `type` e `status`, e o DER). **Bloqueado por BE-04 e BE-05**: são elas que definem o envelope de erro e os códigos HTTP. Consome também BE-01, BE-02, BE-03 e BE-07, que introduzem respostas 400/409 que não existem hoje.

## Problema

O repositório recebido não tem contrato de API. Tem uma **tabela de cinco
linhas** em `Documentação Oficial SREC.md:102-117`:

```markdown
| `GET`  | `/api/resources`                | Lista todos os espaços disponíveis.           |
| `POST` | `/api/resources`                | Cadastra um novo espaço - Nível de acesso Admin. |
| `POST` | `/api/reservations`             | Cria uma nova reserva validando a sobreposição. |
| `GET`  | `/api/reservations`             | Lista as reservas do usuário atual.           |
| `PUT`  | `/api/reservations/{id}/cancel` | Cancela uma reserva existente.                |
```

A seção se chama, literalmente, "**Esboço** da Documentação da API REST"
(`Documentação Oficial SREC.md:102`) — o próprio grupo anterior sabia que
aquilo não era contrato. O problema é que é a única coisa que existe, e ela
erra de três formas diferentes ao mesmo tempo.

### 1. Omite metade da API

São **10** endpoints implementados e **5** documentados. Os cinco ausentes não
são detalhes: `DELETE /api/resources/:id` apaga um espaço **e todas as reservas
dele** (`server/src/config/initDb.js:16`, `ON DELETE CASCADE`), e
`DELETE /api/reservations/:id` apaga a reserva definitivamente. Duas operações
destrutivas e irreversíveis, nenhuma documentada.

### 2. Descreve errado três dos cinco que documenta

| # | A doc afirma | O código faz | Evidência |
|---|---|---|---|
| D-04 | `PUT /api/reservations/{id}/cancel` — "Cancela uma reserva existente" | a rota **não existe**; o que existe é `PATCH /api/reservations/:id/status` | `Documentação Oficial SREC.md:117` vs `server/src/routes/reservationRoutes.js:8` |
| D-05 | `GET /api/reservations` — "Lista as reservas do usuário atual" | `SELECT * FROM reservations ORDER BY start_time ASC`: todas, de todos, sem `WHERE` — **não existe usuário** | `Documentação Oficial SREC.md:116` vs `server/src/models/reservationModel.js:14-18` |
| D-06 | `POST /api/resources` — "Nível de acesso Admin" | **não há autenticação alguma**: `server/src/index.js:12-14` registra `cors()` e `express.json()`, e nenhuma das 10 rotas tem middleware | `Documentação Oficial SREC.md:109` vs `server/src/index.js:12-18`, `server/src/routes/resourceRoutes.js:5-9`, `server/src/routes/reservationRoutes.js:5-9` |

D-04 é a pior das três para quem vai integrar: `PUT /api/reservations/1/cancel`
não devolve "endpoint inexistente", devolve o **404 genérico do Express 5**, que
é indistinguível de "reserva 1 não encontrada". Quem programa contra o documento
recebido escreve um cliente que falha com a mensagem errada.

D-06 é a pior das três para quem vai operar: um documento que promete controle
de acesso faz o sistema **parecer** protegido. Não está. Qualquer pessoa na rede
roda `curl -X DELETE http://localhost:5000/api/resources/1` e apaga um espaço
junto com o histórico dele.

Uma quarta imprecisão, menor mas na mesma linha: a doc descreve
`GET /api/resources` como "Lista todos os espaços **disponíveis**"
(`:108`). Não há filtro algum — nem `WHERE`, nem cruzamento com reservas, nem
coluna `is_active` (ela não existe, ver REQ-01/RF15). A consulta é
`SELECT * FROM resources ORDER BY id ASC` (`server/src/models/resourceModel.js:15`).
A palavra "disponíveis" é falsa.

### 3. Não documenta nada do que um contrato precisa ter

Mesmo nos cinco endpoints listados, a tabela tem **método, caminho e uma frase**.
Não tem:

* schema de corpo de requisição — nenhum dos 3 endpoints com corpo (`POST
  /api/resources`, `POST /api/reservations`, `PATCH /:id/status`) diz quais
  campos aceita, quais são obrigatórios, ou qual o tipo de cada um;
* schema de resposta — nenhum diz que `POST /api/resources` devolve
  `created_at`/`updated_at` por causa do `RETURNING *`
  (`server/src/models/resourceModel.js:8`);
* **nenhum código de status** — nem os 201/200 do caminho felizarro, nem os
  400/404/409 que o código **já** devolve hoje
  (`server/src/controllers/reservationController.js:8`, `:19`, `:51`);
* formato de erro — a API responde `{"error":"..."}` em 10 lugares diferentes
  e isso não está escrito em nenhum;
* formato dos campos de data — **0 de 6**, medido em BE-07. É a omissão que
  produz BUG-07 na próxima integração, porque a próxima pessoa vai mandar
  `"2026-11-03T09:00"` como o frontend manda hoje
  (`client/src/App.jsx:90-94`);
* exemplo executável — nenhum.

### 4. A lacuna já era cobrada na entrega anterior

A rubrica da **N1** pedia coleção da API (Postman ou Swagger). O repositório tem
**zero**: nenhum `openapi.yaml`, nenhum `swagger.json`, nenhuma
`*.postman_collection.json`. Isso é RNF08, registrado como `não implementado` em
`docs/produto/requisitos.md` (REQ-01). Não é débito que a N2 criou; é débito que
a N2 herdou e tem como pagar barato, porque a API é pequena e já foi inventariada
endpoint por endpoint em REQ-01.

### 5. Duas casas canônicas concorrentes para o mesmo assunto

Achado de leitura das specs irmãs, que precisa ser resolvido **nesta** spec para
não nascer o mesmo problema que estamos consertando:

* `docs/specs/be-05-proper-http-status-codes/implementacao.md:394-398` e
  `docs/specs/be-07-timezone-aware-timestamps/implementacao.md:538-552`
  mandam alterar **`docs/arquitetura/contrato-api.md`**;
* `docs/produto/requisitos.md` (REQ-01),
  `docs/arquitetura/der.md` (REQ-02) e
  `docs/auditoria/divergencias-doc-codigo.md:146` apontam para
  **`docs/arquitetura/openapi.yaml`**.

Nenhum dos dois arquivos existe ainda. Se os dois nascerem, o contrato da API
passa a ter duas versões, que é exatamente o defeito de
`Documentação Oficial SREC.md` em escala menor.

## Evidência

### Os 10 endpoints, contados no código

```bash
grep -hoE "router\.(get|post|put|patch|delete)\('[^']*'" server/src/routes/*.js | sort
```

Saída esperada — **10 linhas**:

```
server/src/routes/resourceRoutes.js
  :5  POST   /api/resources                      → ResourceController.createResource
  :6  GET    /api/resources                      → ResourceController.getAllResources
  :7  GET    /api/resources/:id                  → ResourceController.getResourceById
  :8  PUT    /api/resources/:id                  → ResourceController.updateResource
  :9  DELETE /api/resources/:id                  → ResourceController.deleteResource

server/src/routes/reservationRoutes.js
  :5  POST   /api/reservations                   → ReservationController.createReservation
  :6  GET    /api/reservations                   → ReservationController.getAllReservations
  :7  GET    /api/reservations/:id               → ReservationController.getReservationById
  :8  PATCH  /api/reservations/:id/status        → ReservationController.updateReservationStatus
  :9  DELETE /api/reservations/:id               → ReservationController.deleteReservation
```

Mais `GET /` (`server/src/index.js:21-23`), que responde o texto puro
`'SREC Coworking API is running...'` e não é parte do contrato de domínio.

### Ausência de coleção de API

```bash
find . -name 'openapi*' -o -name 'swagger*' -o -name '*postman_collection*' \
  | grep -v node_modules | wc -l
# => 0
```

### Códigos de status que o código devolve hoje, por rota

Levantado dos dois controllers, linha a linha:

| Rota | Hoje devolve | Deveria devolver | Spec que corrige |
|---|---|---|---|
| `POST /api/resources` | 201, 400, 500 | + 400 para `capacity <= 0` e `type` fora do vocabulário | **nenhuma** — BUG-09/BUG-10 ficam abertos |
| `GET /api/resources` | 200, 500 | igual | — |
| `GET /api/resources/:id` | 200, 404, **500 para `:id` não numérico** | 400 | BE-05 |
| `PUT /api/resources/:id` | 200, 404, **500 para corpo parcial** | 200 (parcial), 400 (vazio), 404 | BE-05 |
| `DELETE /api/resources/:id` | 200, 404, 500 | + 409 quando há reservas vinculadas | **nenhuma** — BUG-06 fica aberto |
| `POST /api/reservations` | 201, 400, 409, **500 para `resource_id` inexistente** | 201, 400, 409 | BE-01, BE-02, BE-04, BE-07 |
| `GET /api/reservations` | 200, 500 | igual | — |
| `GET /api/reservations/:id` | 200, 404, **500 para `:id` não numérico** | 400 | BE-05 |
| `PATCH /api/reservations/:id/status` | **200 para qualquer string**, 404, 500 | 200, 400, 404, 409 | BE-03 |
| `DELETE /api/reservations/:id` | 200, 404, 500 | igual | — |

Reprodução dos três 500 indevidos, com o servidor de pé:

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:5000/api/resources/abc
# 500  (esperado 400)

curl -s -o /dev/null -w '%{http_code}\n' -X PUT http://localhost:5000/api/resources/1 \
  -H 'Content-Type: application/json' -d '{"capacity":4}'
# 500  (esperado 400 ou 200)

curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:5000/api/reservations \
  -H 'Content-Type: application/json' \
  -d '{"resource_id":99999,"user_name":"Ana","start_time":"2030-01-01T09:00","end_time":"2030-01-01T10:00"}'
# 500  (esperado 409)
```

E o 200 indevido do `PATCH`:

```bash
curl -s -X PATCH http://localhost:5000/api/reservations/1/status \
  -H 'Content-Type: application/json' -d '{"status":"banana"}'
# {"id":1,...,"status":"banana"}   HTTP 200
```

### Quatro divergências entre as specs irmãs que o contrato precisa resolver

Esta é a razão técnica pela qual **o contrato só fecha depois de BE-04 e
BE-05**, e não é uma formalidade de processo. Hoje as specs de backend
discordam entre si em quatro pontos que são, todos, contrato:

1. **Forma do envelope de erro.** BE-04 fixa o corpo plano
   `{ "error": "<mensagem>", "code": "<CODE>" }`
   (`docs/specs/be-04-central-error-middleware/implementacao.md:355`,
   e o critério de aceite da linha 833 exige exatamente as chaves
   `['code','error']`). BE-02 e BE-03 asseveram o mesmo formato nos testes
   (`...toHaveProperty('code', 'END_BEFORE_START')`,
   `be-02-...:466`; `be-03-...:530`). Mas o teste de BE-05 lê
   **`res.body.error.code`** (`be-05-...:432`), que implica um envelope
   **aninhado**, `{ "error": { "code": ... } }`. Os dois formatos não podem
   coexistir, e o frontend lê a chave plana (`client/src/services/api.js:18-19`).
2. **Assinatura de `AppError`.** BE-04 define
   `new AppError(message, { statusCode, code, details })`
   (`be-04-...:172`); BE-05 chama
   `new AppError(400, 'INVALID_ID_PARAM', 'mensagem', details)`
   (`be-05-...:213-218`). BE-05 já registra que, em caso de conflito, "a de
   BE-04 vence" (`be-05-...:180-182`). Isso não altera o contrato HTTP, mas
   altera o `code` que chega ao cliente se alguém errar a ordem dos argumentos.
3. **Dois códigos para a mesma condição.** `:id` não numérico produz
   `INVALID_IDENTIFIER` pelo mapa de SQLSTATE `22P02` de BE-04
   (`be-04-...:207-211`) e `INVALID_ID_PARAM` pelo middleware `validateIdParam`
   de BE-05 (`be-05-...:215`). Depois de BE-05, o middleware barra **antes** do
   banco, então `22P02` deixa de ser alcançável por parâmetro de rota.
4. **Três códigos para "a data não serve".** BE-02 define
   `INVALID_START_TIME` e `INVALID_END_TIME` (`be-02-...:192`, `:201`); BE-07
   define `INVALID_DATETIME` (`be-07-...:461`). As três cobrem a mesma classe
   de erro de entrada.

Escrever o contrato antes de BE-04 e BE-05 integradas significaria publicar uma
das duas formas de envelope e descobrir depois que o código usa a outra — isto
é, produzir exatamente o artefato que esta spec existe para substituir.

### Números medidos, para a tabela de antes/depois

| Métrica | Antes (medido) | Depois (meta) |
|---|---|---|
| Endpoints documentados | **5** | **10** |
| Endpoints documentados **corretamente** | **2** de 5 | **10** de 10 |
| Coleções de API no repositório | **0** | **1** (OpenAPI 3.1) |
| Schemas de requisição documentados | **0** | **4** |
| Schemas de resposta documentados | **0** | **6** |
| Códigos de status documentados | **0** | **≥ 24** ocorrências, 6 distintos |
| Códigos de erro de máquina documentados | **0** | **20** |
| Campos de data com formato especificado | **0** de 6 | **6** de 6 |
| Exemplos executáveis | **0** | **≥ 14** |
| Interface de exploração da API | **nenhuma** | Swagger UI em `/docs` |
| Verificação automática contrato × código | **nenhuma** | 2 (lint + conferência de rotas) |

## Decisão

**Um único arquivo OpenAPI 3.1 em `docs/arquitetura/openapi.yaml`, servido como
Swagger UI em `/docs` pelo próprio Express, descrevendo o que o sistema faz — e
marcando com o ID do defeito tudo que ele faz errado e a N2 não corrige.**

### 1. OpenAPI 3.1, não 3.0

3.1 é alinhado com JSON Schema 2020-12. Na prática isso compra três coisas que
este contrato usa: `examples` como **array** dentro de um Schema Object (em 3.0
só existe `example` singular), `type: [string, 'null']` em vez do `nullable:
true` proprietário, e `license.identifier` com SPDX. A objeção legítima é
suporte de ferramenta: Swagger UI suporta 3.1 desde a versão 5, e
`@redocly/cli lint` valida 3.1 nativamente — as duas ferramentas que esta spec
usa. Rejeitada a alternativa 3.0 por não haver nenhum consumidor que a exija.

### 2. Arquivo único, sem `$ref` para arquivos externos

A alternativa é quebrar em `paths/`, `schemas/` e `responses/` com `$ref`
relativo. Rejeitada: são **2 entidades e 10 operações**, e `$ref` externo exige
um passo de *bundle* antes de servir no Swagger UI e antes de validar — um
passo de build para um arquivo que cabe numa leitura. `$ref` **interno**
(`#/components/...`) é usado à vontade, e é o que evita a duplicação de verdade.

### 3. `docs/arquitetura/openapi.yaml` é a única casa canônica do contrato

`docs/arquitetura/contrato-api.md` **não é criado**. As referências a ele em
`docs/specs/be-05-proper-http-status-codes/implementacao.md:394-398` e
`docs/specs/be-07-timezone-aware-timestamps/implementacao.md:538-552` são
**redirecionadas para o YAML** no mesmo PR desta spec (ver "Alterações").

Por que o YAML e não o markdown: o YAML é verificável por máquina. Um contrato
em prosa não tem como falhar na CI, e contrato que não pode falhar é exatamente
o que o grupo anterior entregou. O custo honesto: YAML é menos agradável de ler
cru — e é por isso que o Swagger UI em `/docs` faz parte da mesma entrega, não
é enfeite.

### 4. O contrato documenta o sistema, não o desejo

Toda operação carrega três extensões `x-`, que o OpenAPI 3.1 permite e as
ferramentas ignoram:

| Extensão | Para que serve |
|---|---|
| `x-srec-situacao` | o mesmo vocabulário fechado de REQ-01: `implementado`, `implementado com defeito (BUG-nn)`, `documentado mas inexistente`, `não implementado` |
| `x-srec-specs` | lista das specs da N2 que alteram aquela operação |
| `x-srec-debito` | ID do defeito que **continua aberto** depois da N2, com a linha de código |

Consequência prática, e é o ponto inteiro desta decisão: `POST /api/resources`
é documentado dizendo que `capacity: 0` responde **201** e grava **1**
(`server/src/controllers/resourceController.js:10`, `capacity || 1`), e que
`type: "banana"` responde **201** e é gravado
(`server/src/config/initDb.js:8`, valores válidos apenas em comentário SQL).
Isso é feio e é verdade. `capacity` e `type` não têm `CHECK` em nenhuma spec de
backend com escopo fixado — `docs/arquitetura/arquitetura-alvo.md:335-339`
registra BUG-09 e BUG-10 como "alvo sem dono". Documentar uma validação que não
existe transformaria este contrato na próxima `Documentação Oficial SREC.md`.

Pela mesma razão, o enum `workstation | meeting_room` aparece no contrato como
**vocabulário pretendido** em `description` e `examples`, e **não** como
`enum` do schema de entrada: `enum` em OpenAPI é afirmação de que valores fora
da lista são rejeitados, e o servidor não rejeita.

### 5. Entrada e saída de data têm formatos **diferentes**, e o contrato diz isso

Dois schemas distintos, `DateTimeIn` e `DateTimeOut`:

* **entrada** — ISO 8601 com offset **obrigatório**
  (`2026-11-03T09:00:00-03:00` ou `2026-11-03T12:00:00Z`). Valor sem offset
  responde 400. O `pattern` do schema é, caractere por caractere, a regex
  `ISO_8601_WITH_OFFSET` de `server/src/utils/datetime.js` (BE-07);
* **saída** — ISO 8601 em UTC com `Z` e milissegundos
  (`2026-11-03T12:00:00.000Z`), porque é o que `JSON.stringify` emite para um
  `Date` e o `pg` devolve `timestamptz` como `Date`.

A tentação é declarar um só `format: date-time` nas duas pontas e deixar por
isso. Rejeitada: o cliente que lê `2026-11-03T12:00:00.000Z` e devolve a mesma
string funciona, mas o cliente que compõe a data a partir de um
`<input type="datetime-local">` — que é literalmente o que
`client/src/App.jsx:263-269` faz hoje — monta `2026-11-03T09:00` e toma 400.
A assimetria é real e esconder a assimetria é o que gera BUG-07 de novo.

### 6. Swagger UI servido pelo Express, com as ferramentas em `devDependencies`

`swagger-ui-express` e `yaml` entram como **`devDependencies`** e são carregadas
por `require` tardio dentro de um `try`. Consequência deliberada: a imagem de
produção, construída com `npm ci --omit=dev`
(`docs/specs/ops-01-docker-compose-environment/implementacao.md:256`), **não
tem** as duas bibliotecas, e `/docs` nunca é montado — não por configuração que
alguém pode errar, mas porque o código não existe na imagem.

Três alternativas consideradas:

* **`swagger-jsdoc`**, gerando o contrato de comentários JSDoc nos controllers.
  Rejeitada por duas razões. A primeira é de princípio: espalharia o contrato
  por 10 lugares, contra a convenção de uma casa canônica por assunto. A
  segunda é prática: o arquivo deixaria de existir fora do processo Node, logo
  não daria para rodar `redocly lint` nele na CI sem subir a aplicação.
* **Página HTML de 20 linhas carregando Swagger UI de CDN.** Zero dependência,
  e é tentador. Rejeitada porque fixa uma URL de terceiro no caminho de leitura
  da documentação e não funciona sem rede — inclusive na CI.
* **Não servir nada e deixar o arquivo no repositório.** Mais barato e mais
  pobre: o valor de ter o contrato num lugar onde se clica "Try it out" é
  justamente o grupo da N3 descobrir a API em cinco minutos em vez de ler YAML.

### 7. `/docs` não sobe por acidente: `ENABLE_API_DOCS`

O montador só age quando `ENABLE_API_DOCS === 'true'`. Default por ambiente,
declarado no compose e validado por OPS-04: **`true`** em desenvolvimento,
**`false`** em produção.

A ressalva precisa estar escrita, porque é uma decisão de segurança e não de
estilo: o SREC **não tem autenticação** (ADR-007), e o contrato publica os nomes
dos códigos de erro, a estrutura das duas tabelas e o fato de que `DELETE
/api/resources/{id}` apaga o histórico em cascata. Em um sistema sem controle de
acesso, `/docs` aberto é um mapa de ataque com botão de executar. Expor em
produção é uma escolha legítima **se feita de propósito**, com o perímetro de
rede decidido junto — não por default herdado de um exemplo da internet.

### 8. Duas verificações automáticas, porque contrato sem portão apodrece

1. **`redocly lint`** — valida o documento contra a especificação 3.1.
2. **`server/scripts/check-openapi-routes.mjs`** — extrai os `router.<verbo>`
   dos dois arquivos de rota, extrai as operações do YAML, e falha se os dois
   conjuntos divergirem. É o portão que torna impossível repetir o "5
   documentados, 10 implementados" que recebemos.

Mais um teste de Jest (`server/src/docs/contract.test.js`) que compara o
`pattern` de `DateTimeIn` com a regex de `datetime.js` e o `enum` de
`ReservationStatus` com o enum de `server/src/domain/reservationStatus.js`. São
os dois pontos do contrato com maior chance de divergir do código em silêncio.

O validador fica em `server/scripts/` e não em `scripts/`, ao contrário do
`scripts/check-requirements.mjs` de REQ-01, por um motivo concreto: este precisa
de um parser de YAML, e `yaml` está instalada em `server/node_modules`. O de
REQ-01 não tem dependência e por isso vive na raiz.

### 9. As quatro divergências entre specs irmãs, resolvidas

O contrato **tem** de escolher, e escolhe assim:

| # | Divergência | Decisão do contrato | Por que |
|---|---|---|---|
| 1 | envelope plano × aninhado | **plano**: `{ "error": "<mensagem>", "code": "<CODE>" }` | é o de BE-04, que é a spec dona do assunto; é o que BE-02 e BE-03 asseveram nos testes; e é o que `client/src/services/api.js:18-19` já lê. O teste de `be-05-...:432` (`res.body.error.code`) é o outlier e precisa ser ajustado — registrado no corpo do PR |
| 2 | assinatura de `AppError` | a de **BE-04** | BE-05 já concede isso em `be-05-...:180-182`; não altera o contrato HTTP |
| 3 | `INVALID_ID_PARAM` × `INVALID_IDENTIFIER` | **`INVALID_ID_PARAM`** nas 6 rotas com `:id`; `INVALID_IDENTIFIER` fica documentado apenas para parâmetro numérico inválido vindo do **corpo** | depois de BE-05, `validateIdParam` barra antes do banco e `22P02` deixa de ser alcançável por parâmetro de rota |
| 4 | `INVALID_DATETIME` × `INVALID_START_TIME`/`INVALID_END_TIME` | **`INVALID_DATETIME`** para formato; os outros dois permanecem documentados e marcados como *a aposentar* | BE-07 normaliza na borda, antes da validação de janela de BE-02; quando `parseInstant` roda primeiro, os dois códigos de BE-02 ficam inalcançáveis para erro de formato |

Os 20 códigos de erro ficam num `enum` fechado no schema `ErrorCode`. Código que
o backend emite e o contrato não lista é falha de CI, não questão de gosto.

### 10. `GET /` não entra em `paths`

É sinal de vida em texto puro, não contrato de domínio, e BE-08 o substitui por
`GET /health`. Fica registrado na `info.description`, para que ninguém conte 10
operações no contrato e 11 no código e ache que falta uma.

## Alterações

### Arquivos a criar

| Arquivo | Conteúdo |
|---|---|
| `docs/arquitetura/openapi.yaml` | o contrato dos 10 endpoints (conteúdo abaixo) |
| `server/src/docs/apiDocs.js` | montador do Swagger UI em `/docs`, inerte por default |
| `server/src/docs/contract.test.js` | testes de deriva contrato × código |
| `server/scripts/check-openapi-routes.mjs` | conferência das 10 operações contra as 10 rotas |

### Arquivos a alterar

| Arquivo | O que muda |
|---|---|
| `server/package.json` | `devDependencies`: `swagger-ui-express`, `yaml`, `@redocly/cli`; `scripts`: `docs:lint` e `docs:check` |
| `server/src/index.js` | chamar `mountApiDocs(app)` **depois** das rotas e **antes** de `app.use(errorHandler)` |
| `server/.env.example` | `ENABLE_API_DOCS=true` com o comentário da ressalva de produção |
| `docker-compose.override.yml` | montar `./docs/arquitetura` no container do server e declarar `ENABLE_API_DOCS: 'true'` |
| `README.md` | seção "Contrato da API" com o link para `/docs` e para o YAML, e o contrato de horário |
| `.github/workflows/ci.yml` | passos `docs:lint` e `docs:check` no job de backend (contribuição desta spec ao arquivo que OPS-03 reescreve) |
| `docs/specs/be-05-proper-http-status-codes/implementacao.md` | item 9 das "Alterações": trocar `docs/arquitetura/contrato-api.md` por `docs/arquitetura/openapi.yaml` |
| `docs/specs/be-07-timezone-aware-timestamps/implementacao.md` | itens 11 e 12 das "Alterações": idem |

### Arquivos preservados sem alteração

* `Documentação Oficial SREC.md` — **não editar**, por decisão registrada em
  REQ-01. A tabela de 5 endpoints permanece como prova material da divergência
  D-04, D-05, D-06 e D-07 e como insumo do pitch.

---

### `docs/arquitetura/openapi.yaml` — o contrato

> As operações `POST /api/resources`, `GET /api/resources`,
> `GET /api/resources/{id}`, `DELETE /api/resources/{id}`,
> `POST /api/reservations` e `PATCH /api/reservations/{id}/status` estão
> escritas **por extenso** e **definem o padrão**. As quatro restantes estão no
> índice da subseção seguinte, com situação, códigos de status, `code` de erro e
> schemas já fixados — devem ser expandidas no mesmo formato, sem inventar nada
> além do que o código mostra.

```yaml
openapi: 3.1.0

info:
  title: SREC — API de reserva de espaços de coworking
  version: 0.2.0
  summary: Contrato dos 10 endpoints realmente implementados pelo SREC.
  description: |
    Contrato da API do SREC (Sistema de Reserva de Espaços e Coworking),
    derivado linha a linha de `server/src/routes/`, `server/src/controllers/`
    e `server/src/models/`.

    Este arquivo **não** descreve a API que gostaríamos de ter. Onde o
    comportamento atual é defeituoso e a entrega N2 não o corrige, a operação
    traz a extensão `x-srec-debito` com o ID do defeito catalogado em
    `docs/auditoria/bugs-do-cliente.md`. Comportamento que o sistema não tem é
    débito declarado, nunca contrato documentado.

    Substitui a tabela de 5 linhas em `Documentação Oficial SREC.md:102-117`,
    que omitia 5 dos 10 endpoints e descrevia 3 dos 5 restantes errado. Aquele
    documento é preservado no repositório como registro histórico e não é fonte
    de verdade.

    # Autenticação

    Não existe. Nenhuma das 10 operações exige credencial: a cadeia de
    middlewares em `server/src/index.js:12-14` é `cors()` e `express.json()`, e
    nenhuma das duas rotas tem middleware de autorização
    (`server/src/routes/resourceRoutes.js:5-9`,
    `server/src/routes/reservationRoutes.js:5-9`). Qualquer pessoa com acesso à
    URL executa o CRUD completo de espaços e de reservas, inclusive as duas
    operações destrutivas.

    A menção a "Nível de acesso Admin" em `Documentação Oficial SREC.md:109`
    nunca correspondeu a código. Decisão de não implementar autenticação na N2:
    ADR-007, em `docs/arquitetura/decisoes.md`. É o débito de prioridade máxima
    entregue à N3.

    # Identidade do responsável

    `reservations.user_name` é um `VARCHAR(100)` de texto livre, digitado em um
    `<input type="text">` (`client/src/App.jsx:252-259`), e não uma referência a
    usuário. Não existe tabela de usuários, não existe coluna `user_id` e não
    existe "minhas reservas": `GET /api/reservations` devolve todas as reservas
    de todos, sem `WHERE` (`server/src/models/reservationModel.js:14-18`). A
    descrição "lista as reservas do usuário atual"
    (`Documentação Oficial SREC.md:116`) é falsa.

    # Horários

    Entrada em ISO 8601 com offset **obrigatório**; saída em ISO 8601 UTC. Os
    dois formatos são diferentes de propósito e estão nos schemas `DateTimeIn`
    e `DateTimeOut`. Contrato estabelecido por BE-07; antes dela, nenhum dos 6
    campos de data tinha formato especificado.

    # Formato de erro

    Toda resposta de erro das 10 operações usa o envelope `Error`:
    `{"error": "<mensagem em pt-BR>", "code": "<CODIGO>"}`, com `details`
    opcional. A chave `error` carrega texto para pessoa; `code` carrega
    identificador estável para máquina, do conjunto fechado `ErrorCode`.
    Estabelecido por BE-04; nenhuma resposta de erro expõe stack, nome de
    tabela ou caminho de arquivo.

    # Endpoint fora deste contrato

    `GET /` (`server/src/index.js:21-23`) responde o texto puro
    `SREC Coworking API is running...`. É sinal de vida, não parte do contrato
    de domínio, e é substituído por `GET /health` em BE-08. São 10 operações
    aqui e 11 rotas no código; a diferença é essa.
  contact:
    name: Time SREC — entrega N2
    url: https://github.com/igorSeberino/srec
  license:
    name: ISC
    identifier: ISC

servers:
  - url: http://localhost:5000
    description: |
      Desenvolvimento local. Sobe com `docker compose up` (OPS-01). A porta vem
      de `PORT`, com default 5000 em `server/src/index.js:10`.

tags:
  - name: resources
    description: |
      Espaços reserváveis: estações de trabalho e salas de reunião. Tabela
      `resources` (`server/src/config/initDb.js:5-12`).
  - name: reservations
    description: |
      Reservas de um espaço em um intervalo de tempo. Tabela `reservations`
      (`server/src/config/initDb.js:14-23`).

paths:
  /api/resources:
    post:
      tags: [resources]
      operationId: createResource
      summary: Cadastra um espaço
      description: |
        Requisito RF01 (`docs/produto/requisitos.md`). Implementação:
        `server/src/routes/resourceRoutes.js:5` →
        `ResourceController.createResource`
        (`server/src/controllers/resourceController.js:4-16`) →
        `ResourceModel.create` (`server/src/models/resourceModel.js:4-12`).

        A resposta traz todas as colunas da tabela, inclusive `created_at` e
        `updated_at`, porque o `INSERT` usa `RETURNING *`
        (`resourceModel.js:8`).

        Não exige credencial. A documentação recebida marcava esta operação
        como "Nível de acesso Admin" (`Documentação Oficial SREC.md:109`) e
        isso nunca existiu.
      x-srec-requisito: RF01
      x-srec-situacao: implementado com defeito (BUG-09)
      x-srec-specs: [BE-04]
      x-srec-debito:
        - id: BUG-09
          descricao: |
            `capacity: 0` responde 201 e grava 1, porque
            `server/src/controllers/resourceController.js:10` usa
            `capacity || 1` e `0 || 1 === 1`. `capacity: -5` responde 201 e
            grava -5, porque -5 é truthy e `initDb.js:9` não tem CHECK. Duas
            falhas opostas no mesmo campo, nenhuma devolve erro.
          aberto_apos_n2: true
        - id: BUG-10
          descricao: |
            `type` aceita qualquer string. Os dois valores válidos estão em
            comentário SQL (`initDb.js:8`), que o banco ignora, e
            `resourceController.js:7` só verifica presença. Um espaço com
            `type: "banana"` é renderizado como "Estação de Trabalho" pelo
            frontend (`client/src/App.jsx:212`): o dado inválido fica
            disfarçado, não visível.
          aberto_apos_n2: true
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/ResourceCreate'
            examples:
              salaDeReuniao:
                summary: Sala de reunião com capacidade 8
                value:
                  name: Sala Alpha
                  type: meeting_room
                  capacity: 8
              estacaoSemCapacidade:
                summary: Estação sem capacidade — assume 1
                value:
                  name: Estação 12
                  type: workstation
              semNome:
                summary: Sem `name` — recusado com 400
                value:
                  type: workstation
                  capacity: 1
              capacidadeZero:
                summary: |
                  BUG-09: responde 201 e grava `capacity: 1`, silenciosamente.
                value:
                  name: Sala Fantasma
                  type: meeting_room
                  capacity: 0
      responses:
        '201':
          description: Espaço criado.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Resource'
              examples:
                criado:
                  value:
                    id: 1
                    name: Sala Alpha
                    type: meeting_room
                    capacity: 8
                    created_at: '2026-10-20T13:05:42.118Z'
                    updated_at: '2026-10-20T13:05:42.118Z'
        '400':
          description: |
            Falta `name` ou falta `type`. Verificado em
            `server/src/controllers/resourceController.js:7-9`.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
              examples:
                camposObrigatorios:
                  value:
                    error: Nome e tipo são obrigatórios.
                    code: RESOURCE_FIELDS_REQUIRED
        '500':
          $ref: '#/components/responses/InternalError'

    get:
      tags: [resources]
      operationId: listResources
      summary: Lista todos os espaços cadastrados
      description: |
        Requisito RF02. Implementação: `server/src/routes/resourceRoutes.js:6` →
        `getAllResources` (`resourceController.js:18-26`) →
        `SELECT * FROM resources ORDER BY id ASC`
        (`server/src/models/resourceModel.js:14-18`).

        Lista **todos** os espaços, sem filtro algum: não há `WHERE`, não há
        coluna `is_active` (ela não existe — ver RF15) e não há cruzamento com
        reservas. A descrição "Lista todos os espaços **disponíveis**" em
        `Documentação Oficial SREC.md:108` é falsa; a palavra "disponíveis" não
        corresponde a nenhuma linha de código.

        Tabela vazia responde `200` com `[]`, não `404`. O frontend conta com
        isso (`client/src/App.jsx:204`).

        Sem paginação, sem ordenação configurável e sem filtro por tipo. Não é
        defeito: é escopo não implementado, registrado como tal.
      x-srec-requisito: RF02
      x-srec-situacao: implementado
      x-srec-specs: []
      responses:
        '200':
          description: Lista de espaços, ordenada por `id` crescente.
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/Resource'
              examples:
                doisEspacos:
                  summary: Dois espaços cadastrados
                  value:
                    - id: 1
                      name: Sala Alpha
                      type: meeting_room
                      capacity: 8
                      created_at: '2026-10-20T13:05:42.118Z'
                      updated_at: '2026-10-20T13:05:42.118Z'
                    - id: 2
                      name: Estação 12
                      type: workstation
                      capacity: 1
                      created_at: '2026-10-20T13:07:10.004Z'
                      updated_at: '2026-10-20T13:07:10.004Z'
                vazio:
                  summary: Nenhum espaço cadastrado — 200 com array vazio
                  value: []
        '500':
          $ref: '#/components/responses/InternalError'

  /api/resources/{id}:
    get:
      tags: [resources]
      operationId: getResourceById
      summary: Consulta um espaço por identificador
      description: |
        Requisito RF03. Implementação: `server/src/routes/resourceRoutes.js:7` →
        `getResourceById` (`resourceController.js:28-40`) →
        `SELECT * FROM resources WHERE id = $1` (`resourceModel.js:20-24`).

        Nenhuma tela chama esta operação: não existe função correspondente em
        `client/src/services/api.js`, cujas 8 funções estão nas linhas 5, 11,
        24, 37, 46, 52, 65 e 75. É alcançável apenas por cliente HTTP direto.
        Isso não é defeito do endpoint; é escopo de produto não entregue.
      x-srec-requisito: RF03
      x-srec-situacao: implementado com defeito (BUG-04)
      x-srec-specs: [BE-04, BE-05]
      parameters:
        - $ref: '#/components/parameters/ResourceId'
      responses:
        '200':
          description: O espaço pedido.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Resource'
        '400':
          $ref: '#/components/responses/InvalidIdParam'
        '404':
          $ref: '#/components/responses/ResourceNotFound'
        '500':
          $ref: '#/components/responses/InternalError'

    delete:
      tags: [resources]
      operationId: deleteResource
      summary: Exclui um espaço — e, em cascata, todas as reservas dele
      description: |
        Requisito RF05, regra de negócio RN09. Implementação:
        `server/src/routes/resourceRoutes.js:9` → `deleteResource`
        (`resourceController.js:57-69`) →
        `DELETE FROM resources WHERE id = $1 RETURNING *`
        (`resourceModel.js:37-41`).

        **Operação destrutiva e irreversível, e nem a doc recebida a listava.**
        `server/src/config/initDb.js:16` declara
        `resource_id INTEGER REFERENCES resources(id) ON DELETE CASCADE`:
        excluir um espaço apaga, no mesmo comando e em silêncio, **todas** as
        reservas dele — passadas, futuras e já concluídas. A resposta não traz
        contagem do que foi destruído, e o `window.confirm` do frontend
        (`client/src/App.jsx:77`) diz apenas "Deseja realmente remover este
        espaço?", sem mencionar a perda.

        É o único defeito do catálogo que perde dado de forma irrecuperável com
        um clique, e **continua aberto depois da N2**.
      x-srec-requisito: RF05
      x-srec-regra: RN09
      x-srec-situacao: implementado com defeito (BUG-06)
      x-srec-specs: [BE-04, BE-05, FE-05]
      x-srec-debito:
        - id: BUG-06
          descricao: |
            Alvo técnico, não entregue na N2: trocar `ON DELETE CASCADE` por
            `ON DELETE RESTRICT` e responder 409 com a contagem de reservas
            vinculadas. Nenhuma spec de backend com escopo fixado se
            comprometeu com isso — ver
            `docs/arquitetura/arquitetura-alvo.md:327-331` e a pendência
            declarada em `docs/arquitetura/der.md`, seção 2.1. FE-05 acrescenta
            o aviso na interface, o que reduz o acidente e não remove a perda.
          aberto_apos_n2: true
      parameters:
        - $ref: '#/components/parameters/ResourceId'
      responses:
        '200':
          description: |
            Espaço excluído. O corpo é uma confirmação textual, não o objeto
            excluído — `resourceController.js:64`.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Acknowledgement'
              examples:
                excluido:
                  value:
                    message: Recurso excluído com sucesso.
        '400':
          $ref: '#/components/responses/InvalidIdParam'
        '404':
          $ref: '#/components/responses/ResourceNotFound'
        '500':
          $ref: '#/components/responses/InternalError'

  /api/reservations:
    post:
      tags: [reservations]
      operationId: createReservation
      summary: Cria uma reserva, recusando sobreposição de horário
      description: |
        Requisito RF06, regra de negócio RN03 — a razão de existir do produto.
        Implementação: `server/src/routes/reservationRoutes.js:5` →
        `createReservation`
        (`server/src/controllers/reservationController.js:4-34`), que consulta
        `ReservationModel.checkAvailability`
        (`server/src/models/reservationModel.js:49-61`) e grava com
        `ReservationModel.create` (`reservationModel.js:4-12`).

        # Quem garante a não sobreposição

        A partir de BE-01, a garantia é a constraint `reservations_no_overlap`
        (`EXCLUDE USING gist (resource_id WITH =, tstzrange(start_time,
        end_time) WITH &&) WHERE (status <> 'cancelled')`), **não** a consulta
        da aplicação. A consulta permanece como caminho rápido para a mensagem
        amigável; quem recusa de fato é o banco, com SQLSTATE `23P01`,
        traduzido em 409 pelo middleware central de erro (BE-04). Consequência
        para o cliente: o 409 é derivado de fato, e vale também para
        requisições simultâneas.

        Antes de BE-01, duas requisições concorrentes para o mesmo intervalo
        podiam receber **201 as duas** — é BUG-01, severidade CRÍTICO, a janela
        TOCTOU entre `reservationController.js:12-16` e `:23-28`.

        # Bordas que são aceitas de propósito

        Reservas encostadas não conflitam: a comparação é estrita
        (`start_time < $3 AND end_time > $2`, `reservationModel.js:55`), então
        uma reserva que termina às 10:00 e outra que começa às 10:00 são as
        duas aceitas. É o resultado correto neste domínio e o erro clássico de
        quem implementa a regra pela primeira vez — o grupo anterior acertou.

        Reserva com status `cancelled` não bloqueia o horário: o predicado da
        constraint é `WHERE (status <> 'cancelled')` e a consulta filtra
        `status != 'cancelled'` (`reservationModel.js:53`). Regra RN04.

        # Horário

        `start_time` e `end_time` exigem ISO 8601 com offset. Valor sem offset
        responde 400 `INVALID_DATETIME` (BE-07). O servidor não adivinha fuso:
        adivinhar fuso é literalmente o defeito BUG-07.
      x-srec-requisito: RF06
      x-srec-regra: RN03
      x-srec-situacao: implementado com defeito (BUG-01)
      x-srec-specs: [BE-01, BE-02, BE-04, BE-07]
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/ReservationCreate'
            examples:
              recursoLivre:
                summary: Recurso livre no intervalo pedido — 201
                value:
                  resource_id: 1
                  user_name: Carlos Silva
                  start_time: '2026-11-03T09:00:00-03:00'
                  end_time: '2026-11-03T10:00:00-03:00'
              encostada:
                summary: Encostada na reserva anterior — 201, de propósito
                value:
                  resource_id: 1
                  user_name: Ana Prado
                  start_time: '2026-11-03T10:00:00-03:00'
                  end_time: '2026-11-03T11:00:00-03:00'
              sobreposta:
                summary: Sobreposição parcial com a reserva das 09:00 — 409
                value:
                  resource_id: 1
                  user_name: Ana Prado
                  start_time: '2026-11-03T09:30:00-03:00'
                  end_time: '2026-11-03T10:30:00-03:00'
              janelaInvertida:
                summary: Fim antes do início — 400 END_BEFORE_START
                value:
                  resource_id: 1
                  user_name: Ana Prado
                  start_time: '2026-11-03T12:00:00-03:00'
                  end_time: '2026-11-03T11:00:00-03:00'
              semOffset:
                summary: |
                  Horário sem offset, exatamente como o frontend recebido
                  enviava — 400 INVALID_DATETIME
                value:
                  resource_id: 1
                  user_name: Ana Prado
                  start_time: '2026-11-03T09:00'
                  end_time: '2026-11-03T10:00'
              recursoInexistente:
                summary: '`resource_id` que não existe — 409'
                value:
                  resource_id: 99999
                  user_name: Ana Prado
                  start_time: '2026-11-03T14:00:00-03:00'
                  end_time: '2026-11-03T15:00:00-03:00'
      responses:
        '201':
          description: |
            Reserva criada. O `status` vem `scheduled` por default do schema
            (`server/src/config/initDb.js:20`); o `INSERT` não informa a coluna
            (`reservationModel.js:6`).
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Reservation'
              examples:
                criada:
                  summary: 'Reserva das 09:00 às 10:00 em America/Sao_Paulo'
                  value:
                    id: 1
                    resource_id: 1
                    user_name: Carlos Silva
                    start_time: '2026-11-03T12:00:00.000Z'
                    end_time: '2026-11-03T13:00:00.000Z'
                    status: scheduled
                    created_at: '2026-10-20T13:11:02.771Z'
                    updated_at: '2026-10-20T13:11:02.771Z'
        '400':
          description: |
            Requisição malformada. Quatro causas distintas, cada uma com seu
            `code`:

            * `RESERVATION_FIELDS_REQUIRED` — falta um dos quatro campos.
              Verificado em
              `server/src/controllers/reservationController.js:7-9`.
            * `INVALID_DATETIME` — `start_time` ou `end_time` sem offset, ou
              em formato não reconhecido. BE-07.
            * `END_BEFORE_START` — `end_time` menor ou igual a `start_time`.
              BE-02. Antes dela a reserva invertida era aceita com 201 e, por
              ser um intervalo vazio, **nunca colidia com nada** — dado
              inválido e invisível à regra central ao mesmo tempo (BUG-02,
              CRÍTICO).
            * `START_IN_THE_PAST` — reserva inteiramente no passado. BE-02.
              Antes dela era aceita com 201 (BUG-08).
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
              examples:
                camposObrigatorios:
                  value:
                    error: Todos os campos são obrigatórios.
                    code: RESERVATION_FIELDS_REQUIRED
                semOffset:
                  value:
                    error: >-
                      O campo "start_time" deve estar em ISO 8601 com offset,
                      por exemplo 2026-11-03T09:00:00-03:00.
                    code: INVALID_DATETIME
                    details:
                      field: start_time
                      received: '2026-11-03T09:00'
                fimAntesDoInicio:
                  value:
                    error: O término da reserva deve ser posterior ao início.
                    code: END_BEFORE_START
                noPassado:
                  value:
                    error: Não é possível reservar um horário que já passou.
                    code: START_IN_THE_PAST
        '409':
          description: |
            Conflito com o estado atual do banco. Duas causas:

            * `RESERVATION_OVERLAP` — existe reserva não cancelada do mesmo
              espaço cujo intervalo se sobrepõe. Caminho comum:
              `reservationController.js:17-21`. Caminho de corrida: SQLSTATE
              `23P01` da constraint `reservations_no_overlap`, traduzido pelo
              middleware de erro (BE-01, BE-04).
            * `RELATED_RESOURCE_NOT_FOUND` — `resource_id` não existe. É
              violação de chave estrangeira, SQLSTATE `23503`
              (`server/src/config/initDb.js:16`). Hoje isso responde **500**;
              BE-04 mapeia para 409.

            Observação de contrato: `23503` neste caminho poderia ser 404 em
            vez de 409 — ADR-006 registra a ambiguidade
            (`docs/arquitetura/decisoes.md`). O contrato fixa **409**, que é o
            mapeamento de BE-04, para que cliente e servidor não discordem.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
              examples:
                sobreposicao:
                  value:
                    error: >-
                      Já existe uma reserva para este espaço no período
                      selecionado.
                    code: RESERVATION_OVERLAP
                recursoInexistente:
                  value:
                    error: O espaço informado não existe.
                    code: RELATED_RESOURCE_NOT_FOUND
        '500':
          $ref: '#/components/responses/InternalError'

  /api/reservations/{id}/status:
    patch:
      tags: [reservations]
      operationId: updateReservationStatus
      summary: Altera o status de uma reserva — concluir ou cancelar
      description: |
        Requisitos RF09 e RF19, regra de negócio RN07. Implementação:
        `server/src/routes/reservationRoutes.js:8` →
        `updateReservationStatus`
        (`server/src/controllers/reservationController.js:60-73`) →
        `ReservationModel.updateStatus` (`reservationModel.js:32-41`).

        **Esta é a rota de cancelamento.** A documentação recebida promete
        `PUT /api/reservations/{id}/cancel`
        (`Documentação Oficial SREC.md:117`); essa rota **não existe**.
        `server/src/routes/reservationRoutes.js` tem exatamente cinco registros,
        linhas 5 a 9, e nenhum é `PUT` nem contém o segmento `cancel`. Uma
        chamada a `/cancel` cai no handler padrão do Express 5 e responde 404,
        indistinguível de "reserva não encontrada". Decisão da N2: **não criar**
        a rota `/cancel`, porque duplicaria o efeito de `PATCH /:id/status` sem
        ganho para o usuário, e corrigir a documentação — ver RF11 em
        `docs/produto/requisitos.md`.

        # Transições permitidas

        O ciclo de vida é `scheduled → completed` ou `scheduled → cancelled`.
        Estado final não transiciona, nem para si mesmo. Das 9 combinações
        possíveis, **2** respondem 200 e **7** respondem 409
        `INVALID_STATUS_TRANSITION` (BE-03).

        A verificação acontece dentro do próprio `UPDATE`, com
        `WHERE status = ANY($n)`, para não reintroduzir a janela TOCTOU que
        BUG-01 expôs. O `SELECT` posterior existe apenas para distinguir 404 de
        409 na resposta.

        # O que estava errado antes de BE-03

        O controller repassava `req.body.status` direto para o `UPDATE`, sem
        verificar valor nem transição, e o schema não tem `CHECK`
        (`initDb.js:20`). Consequências medidas:

        * `{"status":"banana"}` gravava `banana` e respondia **200**;
        * `{"status":"scheduled"}` em reserva `completed` desfazia o estado
          final;
        * corpo `{}` fazia `req.body.status` ser `undefined`, o driver `pg`
          convertia em `NULL`, e `status VARCHAR(20) DEFAULT 'scheduled'` não é
          `NOT NULL` — a coluna ficava nula. A partir daí a reserva
          **desaparecia da regra anti-sobreposição**, porque em
          `reservationModel.js:53` a expressão `NULL != 'cancelled'` avalia
          para `NULL` e a linha não entra no resultado. Um `PATCH` com corpo
          vazio desarmava a regra central do produto para aquela reserva.

        A proteção do ciclo de vida existia apenas na interface, que só mostra
        os botões quando `rev.status === 'scheduled'`
        (`client/src/App.jsx:309`) e envia exatamente `'completed'` (`:317`) e
        `'cancelled'` (`:324`).
      x-srec-requisito: RF09
      x-srec-regra: RN07
      x-srec-situacao: implementado com defeito (BUG-03)
      x-srec-specs: [BE-03, BE-04, BE-05]
      parameters:
        - $ref: '#/components/parameters/ReservationId'
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/ReservationStatusUpdate'
            examples:
              concluir:
                summary: Concluir uma reserva agendada — 200
                value:
                  status: completed
              cancelar:
                summary: Cancelar uma reserva agendada — 200
                value:
                  status: cancelled
              statusInvalido:
                summary: Valor fora do enum — 400
                value:
                  status: banana
              retrocesso:
                summary: |
                  Voltar um estado final para `scheduled` — 409
                value:
                  status: scheduled
              corpoVazio:
                summary: |
                  Corpo vazio — 400. Antes de BE-03 isto gravava `status NULL`
                  e tirava a reserva da regra anti-sobreposição.
                value: {}
      responses:
        '200':
          description: |
            Status alterado. A resposta é a reserva inteira, com `updated_at`
            renovado — `reservationModel.js:35` faz
            `updated_at = CURRENT_TIMESTAMP`.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Reservation'
              examples:
                cancelada:
                  value:
                    id: 1
                    resource_id: 1
                    user_name: Carlos Silva
                    start_time: '2026-11-03T12:00:00.000Z'
                    end_time: '2026-11-03T13:00:00.000Z'
                    status: cancelled
                    created_at: '2026-10-20T13:11:02.771Z'
                    updated_at: '2026-10-20T14:40:19.502Z'
        '400':
          description: |
            `status` ausente ou fora do conjunto
            `scheduled | cancelled | completed`. É 400 e não 409 porque nenhum
            estado do servidor faria essa requisição funcionar.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
              examples:
                statusInvalido:
                  value:
                    error: >-
                      Status inválido. Valores aceitos: scheduled, cancelled,
                      completed.
                    code: INVALID_RESERVATION_STATUS
                idInvalido:
                  value:
                    error: >-
                      O parâmetro de rota "id" deve ser um número inteiro
                      positivo.
                    code: INVALID_ID_PARAM
                    details:
                      param: id
                      received: abc
        '404':
          $ref: '#/components/responses/ReservationNotFound'
        '409':
          description: |
            Transição proibida pelo ciclo de vida. É 409 e não 400 porque a
            requisição é bem-formada e depende do estado atual: ela
            funcionaria se a reserva estivesse `scheduled`.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
              examples:
                transicaoInvalida:
                  value:
                    error: >-
                      Não é possível mudar o status de "cancelled" para
                      "completed".
                    code: INVALID_STATUS_TRANSITION
        '500':
          $ref: '#/components/responses/InternalError'

components:
  parameters:
    ResourceId:
      name: id
      in: path
      required: true
      description: |
        Identificador do espaço. É `SERIAL` no banco
        (`server/src/config/initDb.js:6`), ou seja, **inteiro sequencial** — o
        MER recebido documenta `UUID` (`Documentação Oficial SREC.md:84`) e
        está errado; ver a divergência D-01 em `docs/arquitetura/der.md`.

        Validado por `validateIdParam` antes de qualquer consulta (BE-05).
        Valor que não seja inteiro positivo responde 400 `INVALID_ID_PARAM`;
        antes de BE-05 respondia 500, porque `abc` chegava ao Postgres e
        levantava SQLSTATE `22P02` dentro do `catch` genérico (BUG-04).
      schema:
        type: integer
        format: int32
        minimum: 1
        maximum: 2147483647
        examples: [1]

    ReservationId:
      name: id
      in: path
      required: true
      description: |
        Identificador da reserva, `SERIAL`
        (`server/src/config/initDb.js:15`). Mesmas regras de validação de
        `ResourceId`.
      schema:
        type: integer
        format: int32
        minimum: 1
        maximum: 2147483647
        examples: [1]

  schemas:
    DateTimeIn:
      type: string
      format: date-time
      pattern: '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$'
      description: |
        Instante de **entrada**, em ISO 8601 com offset **obrigatório**.

        O servidor não adivinha fuso: valor sem offset responde 400
        `INVALID_DATETIME`. Essa recusa é deliberada — assumir
        `America/Sao_Paulo` no backend transformaria o defeito BUG-07 em
        contrato implícito, herdado por todo cliente futuro sem aviso.

        O `pattern` acima é, caractere por caractere, a constante
        `ISO_8601_WITH_OFFSET` de `server/src/utils/datetime.js` (BE-07). A
        igualdade é verificada por teste em
        `server/src/docs/contract.test.js`.

        O fuso de negócio da aplicação é `America/Sao_Paulo`, configurável por
        `APP_TIMEZONE`. Ele afeta `now()` e os defaults do banco, **não** a
        interpretação da entrada — a entrada é explícita por definição.
      examples:
        - '2026-11-03T09:00:00-03:00'
        - '2026-11-03T12:00:00Z'
        - '2026-11-03T09:00-03:00'

    DateTimeOut:
      type: string
      format: date-time
      pattern: '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$'
      description: |
        Instante de **saída**, em ISO 8601 UTC com milissegundos e sufixo `Z`.

        O formato é diferente do de entrada e isso é contrato, não descuido: o
        driver `pg` devolve `timestamptz` como `Date` do JavaScript e
        `JSON.stringify` serializa `Date` chamando `toISOString()`, que sempre
        emite UTC. É o mesmo instante que entrou; cabe ao cliente formatar no
        fuso que quiser exibir.
      examples:
        - '2026-11-03T12:00:00.000Z'

    ResourceType:
      type: string
      description: |
        Vocabulário **pretendido** para o tipo de espaço: `workstation` (foco
        individual) ou `meeting_room` (foco colaborativo). A grafia é minúscula
        com sublinhado, conforme `client/src/App.jsx:180-181` e o comentário em
        `server/src/config/initDb.js:8` — **não** `Workstation`/`MeetingRoom`,
        como o MER recebido escreve (`Documentação Oficial SREC.md:86`).

        Deliberadamente **não** declarado como `enum`: o servidor aceita
        qualquer string. `type VARCHAR(50) NOT NULL` não tem `CHECK`, os
        valores válidos vivem em comentário SQL, e
        `server/src/controllers/resourceController.js:7` só verifica presença.
        Declarar `enum` aqui seria afirmar uma validação que não existe. É
        BUG-10, e continua aberto depois da N2.
      examples:
        - workstation
        - meeting_room

    ReservationStatus:
      type: string
      enum: [scheduled, cancelled, completed]
      description: |
        Estado da reserva. Ciclo de vida: nasce `scheduled` por default do
        schema (`server/src/config/initDb.js:20`) e vai para `completed` ou
        `cancelled`; estado final não transiciona.

        Atenção à grafia: `cancelled` com **dois `l`**. O MER recebido escreve
        `Canceled` com um (`Documentação Oficial SREC.md:97`) — quem programar
        contra aquele diagrama envia um status que o `CHECK` de BE-03 rejeita.

        Aqui o `enum` **é** declarado, porque depois de BE-03 a restrição
        existe de fato nas duas camadas: validação no controller e
        `CHECK (status IN ('scheduled','cancelled','completed'))` no banco. A
        ordem desta lista é a mesma de `RESERVATION_STATUSES` em
        `server/src/domain/reservationStatus.js`, e a igualdade é verificada
        por teste.

    Resource:
      type: object
      description: |
        Espaço, como o banco devolve. Todas as colunas de `resources` aparecem
        porque as consultas usam `SELECT *` e o `INSERT` usa `RETURNING *`.
      required: [id, name, type, capacity, created_at, updated_at]
      additionalProperties: false
      properties:
        id:
          type: integer
          format: int32
          readOnly: true
          description: '`SERIAL PRIMARY KEY` (`initDb.js:6`).'
          examples: [1]
        name:
          type: string
          maxLength: 100
          description: '`VARCHAR(100) NOT NULL` (`initDb.js:7`).'
          examples: [Sala Alpha]
        type:
          $ref: '#/components/schemas/ResourceType'
        capacity:
          type: integer
          description: |
            `INTEGER NOT NULL DEFAULT 1` (`initDb.js:9`). Sem `CHECK`: valores
            `0` e negativos são possíveis no banco. Ver BUG-09.
          examples: [8]
        created_at:
          allOf:
            - $ref: '#/components/schemas/DateTimeOut'
          readOnly: true
        updated_at:
          allOf:
            - $ref: '#/components/schemas/DateTimeOut'
          readOnly: true

    ResourceCreate:
      type: object
      description: Corpo de `POST /api/resources`.
      required: [name, type]
      additionalProperties: false
      properties:
        name:
          type: string
          minLength: 1
          maxLength: 100
          examples: [Sala Alpha]
        type:
          $ref: '#/components/schemas/ResourceType'
        capacity:
          type: integer
          default: 1
          description: |
            Opcional. Ausente ou `0` resulta em `1`, porque
            `server/src/controllers/resourceController.js:10` usa
            `capacity || 1`. Para `0` isso é troca silenciosa do dado do
            usuário, não default — BUG-09. Valor negativo é gravado como veio.
          examples: [8]

    ResourceUpdate:
      type: object
      description: |
        Corpo de `PUT /api/resources/{id}`. A partir de BE-05 aceita corpo
        **parcial**: cada coluna ausente conserva o valor atual, via
        `COALESCE($n, coluna)`. Corpo vazio responde 400 `EMPTY_UPDATE`, porque
        um `UPDATE` que só mexe em `updated_at` não é sucesso.

        Antes de BE-05, corpo parcial respondia **500**: o controller
        desestruturava `name` e `type` como `undefined`
        (`resourceController.js:45`), o driver `pg` convertia em `NULL`, e o
        `UPDATE` de `resourceModel.js:29` violava `name VARCHAR(100) NOT NULL`
        (BUG-05).
      minProperties: 1
      additionalProperties: false
      properties:
        name:
          type: string
          minLength: 1
          maxLength: 100
        type:
          $ref: '#/components/schemas/ResourceType'
        capacity:
          type: integer

    Reservation:
      type: object
      description: Reserva, como o banco devolve.
      required:
        - id
        - resource_id
        - user_name
        - start_time
        - end_time
        - status
        - created_at
        - updated_at
      additionalProperties: false
      properties:
        id:
          type: integer
          format: int32
          readOnly: true
          examples: [1]
        resource_id:
          type: integer
          format: int32
          description: |
            Chave estrangeira para `resources.id`
            (`server/src/config/initDb.js:16`). No schema recebido a coluna
            **aceita `NULL`** — não há `NOT NULL`; BE-02 acrescenta. Hoje a API
            barra por acidente, porque `!resource_id` é verdadeiro para `null`
            em `reservationController.js:7`.
          examples: [1]
        user_name:
          type: string
          maxLength: 100
          description: |
            Nome do responsável, **texto livre**. Não é identidade: não há
            tabela de usuários, não há chave estrangeira e não há unicidade
            (`initDb.js:17`, `client/src/App.jsx:252-259`). Dois responsáveis
            homônimos são a mesma string e pessoas diferentes, e o sistema não
            distingue. O MER recebido documenta `user_id UUID`
            (`Documentação Oficial SREC.md:94`) — ver RF13 e a divergência
            D-03.
          examples: [Carlos Silva]
        start_time:
          $ref: '#/components/schemas/DateTimeOut'
        end_time:
          $ref: '#/components/schemas/DateTimeOut'
        status:
          $ref: '#/components/schemas/ReservationStatus'
        created_at:
          allOf:
            - $ref: '#/components/schemas/DateTimeOut'
          readOnly: true
        updated_at:
          allOf:
            - $ref: '#/components/schemas/DateTimeOut'
          readOnly: true

    ReservationCreate:
      type: object
      description: |
        Corpo de `POST /api/reservations`. Os quatro campos são obrigatórios:
        `reservationController.js:7-9` recusa com 400 se qualquer um faltar.
        `status` **não** é aceito na criação — a reserva nasce `scheduled` por
        default do schema, e o `INSERT` nem informa a coluna
        (`reservationModel.js:6`).
      required: [resource_id, user_name, start_time, end_time]
      additionalProperties: false
      properties:
        resource_id:
          type: integer
          format: int32
          minimum: 1
          examples: [1]
        user_name:
          type: string
          minLength: 1
          maxLength: 100
          examples: [Carlos Silva]
        start_time:
          $ref: '#/components/schemas/DateTimeIn'
        end_time:
          $ref: '#/components/schemas/DateTimeIn'

    ReservationStatusUpdate:
      type: object
      description: |
        Corpo de `PATCH /api/reservations/{id}/status`. É o único caminho de
        transição de status da API — a rota `/cancel` da documentação recebida
        não existe.
      required: [status]
      additionalProperties: false
      properties:
        status:
          $ref: '#/components/schemas/ReservationStatus'

    Acknowledgement:
      type: object
      description: |
        Confirmação textual das duas operações de exclusão. Elas devolvem
        mensagem, não o objeto excluído — `resourceController.js:64` e
        `reservationController.js:82`.
      required: [message]
      additionalProperties: false
      properties:
        message:
          type: string
          examples: [Recurso excluído com sucesso.]

    ErrorCode:
      type: string
      description: |
        Conjunto **fechado** de identificadores de erro de máquina. Código que
        o backend emita e que não esteja nesta lista é falha de contrato e
        reprova na CI.

        Dois itens estão marcados para aposentadoria: `INVALID_START_TIME` e
        `INVALID_END_TIME`, definidos em BE-02
        (`docs/specs/be-02-validate-reservation-window/implementacao.md:192`,
        `:201`), cobrem a mesma classe de erro que `INVALID_DATETIME` de BE-07.
        Com a normalização de BE-07 rodando antes da validação de janela de
        BE-02, os dois ficam inalcançáveis para erro de formato. Permanecem
        documentados até que uma das duas specs os remova.
      enum:
        - CONSTRAINT_VIOLATION
        - EMPTY_UPDATE
        - END_BEFORE_START
        - INTERNAL_ERROR
        - INVALID_DATETIME
        - INVALID_END_TIME
        - INVALID_ID_PARAM
        - INVALID_IDENTIFIER
        - INVALID_NAME
        - INVALID_RESERVATION_STATUS
        - INVALID_START_TIME
        - INVALID_STATUS_TRANSITION
        - MISSING_REQUIRED_FIELD
        - RELATED_RESOURCE_NOT_FOUND
        - RESERVATION_FIELDS_REQUIRED
        - RESERVATION_NOT_FOUND
        - RESERVATION_OVERLAP
        - RESOURCE_FIELDS_REQUIRED
        - RESOURCE_NOT_FOUND
        - START_IN_THE_PAST

    Error:
      type: object
      description: |
        Envelope único de erro da API, estabelecido por BE-04. Vale para as 10
        operações e para qualquer código de status 4xx ou 5xx.

        `error` é a mensagem em português para pessoa; `code` é o identificador
        estável para máquina. A chave `error` é preservada com esse nome porque
        `client/src/services/api.js:18-19` já a lê; `code` é a adição que
        permite ao cliente reagir programaticamente.

        O corpo é montado **exclusivamente** a partir da tabela de tradução do
        middleware, nunca a partir de `err.message`. Um erro desconhecido
        produz literalmente `{"error":"Erro interno do servidor.","code":"INTERNAL_ERROR"}`
        e nada mais: sem stack, sem nome de tabela, sem nome de constraint, sem
        caminho de arquivo. Mensagem de erro do PostgreSQL revela estrutura
        interna, e em um sistema sem autenticação isso é informação de ataque.
      required: [error, code]
      additionalProperties: false
      properties:
        error:
          type: string
          examples: [Reserva não encontrada.]
        code:
          $ref: '#/components/schemas/ErrorCode'
        details:
          type: object
          additionalProperties: true
          description: |
            Opcional. Presente quando a validação sabe qual campo falhou e com
            qual valor. Nunca carrega dado interno do banco.
          examples:
            - field: start_time
              received: '2026-11-03T09:00'

  responses:
    InvalidIdParam:
      description: |
        O parâmetro de rota `id` não é um inteiro positivo dentro do limite de
        `integer` do PostgreSQL. Vale para as 6 rotas com `:id`. Antes de
        BE-05 estas rotas respondiam **500** (BUG-04).
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/Error'
          examples:
            naoNumerico:
              value:
                error: O parâmetro de rota "id" deve ser um número inteiro positivo.
                code: INVALID_ID_PARAM
                details:
                  param: id
                  received: abc
            acimaDoLimite:
              value:
                error: >-
                  O parâmetro de rota "id" excede o maior identificador
                  possível (2147483647).
                code: INVALID_ID_PARAM
                details:
                  param: id
                  received: '2147483648'

    ResourceNotFound:
      description: Não existe espaço com o `id` informado.
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/Error'
          examples:
            naoEncontrado:
              value:
                error: Recurso não encontrado.
                code: RESOURCE_NOT_FOUND

    ReservationNotFound:
      description: Não existe reserva com o `id` informado.
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/Error'
          examples:
            naoEncontrada:
              value:
                error: Reserva não encontrada.
                code: RESERVATION_NOT_FOUND

    InternalError:
      description: |
        Falha inesperada do servidor. O corpo é sempre exatamente este, sem
        variação e sem detalhe — ver a descrição do schema `Error`.
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/Error'
          examples:
            generico:
              value:
                error: Erro interno do servidor.
                code: INTERNAL_ERROR
```

#### As quatro operações restantes — índice a expandir

Cada linha já tem situação, respostas e schemas fixados. Expandir no formato das
seis acima, sem alterar nada sem nova evidência de código.

| Operação | `x-srec-situacao` | Respostas | Schemas | Notas obrigatórias |
|---|---|---|---|---|
| `PUT /api/resources/{id}` | `implementado com defeito (BUG-05)` | 200, 400 (`INVALID_ID_PARAM`, `EMPTY_UPDATE`, `INVALID_NAME`), 404, 500 | req `ResourceUpdate`, resp `Resource` | É endpoint **órfão** (BUG-15): `api.updateResource` existe em `client/src/services/api.js:24-35` e nenhuma tela o chama. FE-05 entrega a tela. Registrar que corpo parcial era 500 antes de BE-05. |
| `GET /api/reservations` | `implementado` | 200, 500 | resp `array` de `Reservation` | Registrar por extenso que lista **todas** as reservas, de todos os responsáveis e em todos os status, inclusive `cancelled` — não há `WHERE` (`reservationModel.js:15`). A descrição "do usuário atual" (`Documentação Oficial SREC.md:116`) é falsa; não existe usuário. Tabela vazia é 200 com `[]`. |
| `GET /api/reservations/{id}` | `implementado com defeito (BUG-04)` | 200, 400 (`INVALID_ID_PARAM`), 404, 500 | resp `Reservation` | Sem função em `client/src/services/api.js`: alcançável só por cliente HTTP direto. Não é defeito do endpoint, é escopo não entregue. |
| `DELETE /api/reservations/{id}` | `implementado` | 200, 400 (`INVALID_ID_PARAM`), 404, 500 | resp `Acknowledgement` | Exclusão **física e irreversível**, distinta do cancelamento por status. Registrar a ambiguidade de vocabulário da interface (RN08): o `window.confirm` diz "cancelar ... permanentemente" (`client/src/App.jsx:117`), o `title` diz "Excluir Definitivamente" (`:334`) e o feedback diz "Reserva removida!" (`:120`) — três vocabulários para uma ação, e um deles é a palavra reservada da outra. FE-01 unifica. |

Capacidade existente e **não exposta**, que não entra no contrato porque não é
rota: `ReservationModel.findByResourceId`
(`server/src/models/reservationModel.js:26-30`) executa
`SELECT * FROM reservations WHERE resource_id = $1 ORDER BY start_time ASC` e
nenhum controller a chama. É RF12, `não implementado`, e é a evolução mais
barata disponível para a N3 — registrada como tal em `docs/handoff/n3.md`
(REQ-04). Documentar `GET /api/resources/{id}/reservations` aqui seria inventar
endpoint.

---

### `server/src/docs/apiDocs.js`

```js
const fs = require('node:fs');
const path = require('node:path');

const logger = require('../utils/logger');

// The contract lives in docs/, outside the server package, because it is a
// project artifact and not a server implementation detail.
const DEFAULT_CONTRACT_PATH = path.join(
  __dirname,
  '..',
  '..',
  '..',
  'docs',
  'arquitetura',
  'openapi.yaml',
);

/**
 * Mounts Swagger UI at /docs and the raw contract at /docs/openapi.yaml.
 *
 * Deliberately a no-op unless three independent conditions hold:
 *
 *  1. ENABLE_API_DOCS === 'true'. Default is 'true' in development and 'false'
 *     in production (OPS-04 validates it). The SREC has no authentication, so
 *     an open /docs is an attack map with a run button.
 *  2. swagger-ui-express and yaml are resolvable. They are devDependencies on
 *     purpose: a production image built with `npm ci --omit=dev` simply does
 *     not carry them, so the docs cannot leak by misconfiguration.
 *  3. The contract file exists. The production image copies only src/ and
 *     migrations/, so docs/ is absent there by design.
 *
 * Every failure path logs and returns false. Serving documentation is never
 * allowed to take the API down.
 *
 * @param {import('express').Express} app
 * @param {{ contractPath?: string }} [options]
 * @returns {boolean} whether /docs was mounted
 */
function mountApiDocs(app, { contractPath = DEFAULT_CONTRACT_PATH } = {}) {
  if (process.env.ENABLE_API_DOCS !== 'true') {
    return false;
  }

  let swaggerUi;
  let YAML;
  try {
    // Lazy require: see condition 2 above.
    swaggerUi = require('swagger-ui-express');
    YAML = require('yaml');
  } catch {
    logger.warn({
      message: 'ENABLE_API_DOCS=true, mas swagger-ui-express/yaml nao estao instalados; /docs nao montado',
    });
    return false;
  }

  if (!fs.existsSync(contractPath)) {
    logger.warn({ message: '/docs nao montado: contrato OpenAPI ausente', contractPath });
    return false;
  }

  let contract;
  try {
    contract = YAML.parse(fs.readFileSync(contractPath, 'utf8'));
  } catch (err) {
    logger.error({
      message: '/docs nao montado: contrato OpenAPI invalido',
      contractPath,
      reason: err.message,
    });
    return false;
  }

  app.get('/docs/openapi.yaml', (req, res) => {
    res.type('application/yaml').sendFile(contractPath);
  });

  app.use(
    '/docs',
    swaggerUi.serve,
    swaggerUi.setup(contract, {
      customSiteTitle: 'SREC — contrato da API',
      swaggerOptions: { displayRequestDuration: true, tryItOutEnabled: true },
    }),
  );

  logger.info({ message: 'Swagger UI disponivel em /docs', contractPath });
  return true;
}

module.exports = { mountApiDocs, DEFAULT_CONTRACT_PATH };
```

O `yaml` (pacote `yaml`, de Eemeli Aro) é escolhido em vez de `js-yaml` por um
motivo concreto: implementa **YAML 1.2**, que é a versão que a especificação
OpenAPI 3.1 exige. `js-yaml` é YAML 1.1 com extensões, e difere em casos de
borda de tipagem implícita.

### `server/src/index.js` — onde registrar

Uma linha, e a posição importa. Estado final do trecho, já incorporando BE-04:

```js
const { mountApiDocs } = require('./docs/apiDocs');

// ...

// Routes
app.use('/api/resources', resourceRoutes);
app.use('/api/reservations', reservationRoutes);

// Root Endpoint
app.get('/', (req, res) => {
  res.send('SREC Coworking API is running...');
});

// API contract (REQ-03). No-op unless ENABLE_API_DOCS=true and the dev
// dependencies are present. Must come BEFORE the error middleware.
mountApiDocs(app);

// Must stay LAST: Express only routes to a 4-arity middleware after an error,
// and only if it is registered after every route it should cover.
app.use(errorHandler);
```

A regra é a de BE-04 e não muda: `app.use(errorHandler)` é o **último**
`app.use` do arquivo. `/docs` entra antes porque é rota, e rota registrada
depois do middleware de erro nunca é alcançada.

### `server/package.json`

```json
  "scripts": {
    "docs:lint": "redocly lint ../docs/arquitetura/openapi.yaml",
    "docs:check": "node scripts/check-openapi-routes.mjs"
  },
  "devDependencies": {
    "@redocly/cli": "^1.34.0",
    "swagger-ui-express": "^5.0.1",
    "yaml": "^2.7.0"
  }
```

As três entram como **`devDependencies`**, e isso é parte da decisão 6: a
imagem de produção não as tem, logo `/docs` não existe lá por construção.

### `docker-compose.override.yml` — duas linhas

O estágio `development` do `server/Dockerfile` faz `COPY . .` com o contexto
`./server`, então `docs/` **não** entra na imagem. Para que `/docs` funcione em
desenvolvimento, o contrato é montado como volume:

```yaml
services:
  server:
    environment:
      NODE_ENV: development
      ENABLE_API_DOCS: 'true'
    volumes:
      - ./server/src:/app/src:ro
      - ./server/migrations:/app/migrations:ro
      - ./docs/arquitetura:/app/../docs/arquitetura:ro
```

O caminho de destino precisa casar com `DEFAULT_CONTRACT_PATH`, que resolve
para `/docs/arquitetura/openapi.yaml` a partir de `/app/src/docs/apiDocs.js`.
Montar em `/docs/arquitetura:ro` é o equivalente limpo e é o que deve ser usado:

```yaml
      - ./docs/arquitetura:/docs/arquitetura:ro
```

Se o montador não achar o arquivo, ele loga e segue — `/docs` fica indisponível
e a API continua de pé. Esse é o comportamento desejado; o teste T5 verifica.

### `server/.env.example`

```env
PORT=5000
DATABASE_URL=postgres://postgres:***@localhost:5432/srec
# Fuso de negócio da aplicação (IANA). Usado no Node e na sessão do Postgres.
APP_TIMEZONE=America/Sao_Paulo
# Serve o contrato da API como Swagger UI em /docs.
# true em desenvolvimento. NÃO ligar em produção sem decidir o perímetro de
# rede: o SREC não tem autenticação (ADR-007), e /docs publica a estrutura das
# tabelas, os códigos de erro e um botão de executar as duas operações
# destrutivas.
ENABLE_API_DOCS=true
```

### `README.md` — seção a acrescentar

````markdown
## Contrato da API

O contrato dos **10 endpoints** do SREC está em
[`docs/arquitetura/openapi.yaml`](docs/arquitetura/openapi.yaml), em OpenAPI
3.1. Com o sistema de pé, a versão navegável fica em
<http://localhost:5000/docs>, com "Try it out" habilitado, e o arquivo cru em
<http://localhost:5000/docs/openapi.yaml>.

`/docs` só sobe quando `ENABLE_API_DOCS=true` — ligado por default em
desenvolvimento, desligado em produção. O SREC **não tem autenticação**, então
expor o contrato publicamente é uma decisão de perímetro de rede, não um
default.

A tabela de 5 endpoints em `Documentação Oficial SREC.md` é documentação
**recebida do grupo da N1**: omite 5 endpoints e descreve 3 errado. Está
preservada como registro histórico e não é fonte de verdade.

### Contrato de horário

* **Entrada** — ISO 8601 com offset **obrigatório**:
  `2026-11-03T09:00:00-03:00` ou `2026-11-03T12:00:00Z`. Valor sem offset
  responde `400 INVALID_DATETIME`. O servidor não adivinha fuso.
* **Saída** — ISO 8601 UTC: `2026-11-03T12:00:00.000Z`. É o mesmo instante;
  formate no fuso que quiser exibir.
* **Fuso de negócio** — `America/Sao_Paulo`, configurável por `APP_TIMEZONE`.

### Formato de erro

Toda resposta de erro usa o mesmo envelope:

```json
{ "error": "Já existe uma reserva para este espaço no período selecionado.", "code": "RESERVATION_OVERLAP" }
```

`error` é texto para pessoa; `code` é identificador estável para máquina, do
conjunto fechado documentado no contrato.

### Verificação

```bash
cd server
npm run docs:lint    # valida o documento contra a especificação OpenAPI 3.1
npm run docs:check   # confere as 10 operações contra as 10 rotas do código
```
````

### `server/scripts/check-openapi-routes.mjs`

Impede o retorno de "5 documentados, 10 implementados".

```js
#!/usr/bin/env node
// Fails when docs/arquitetura/openapi.yaml and server/src/routes/*.js disagree
// about which endpoints exist. The received documentation listed 5 of the 10
// real endpoints; this script makes that class of drift impossible to merge.
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.join(here, '..');
const repoRoot = path.join(serverRoot, '..');

const CONTRACT = path.join(repoRoot, 'docs', 'arquitetura', 'openapi.yaml');
const ROUTES_DIR = path.join(serverRoot, 'src', 'routes');
const VERBS = ['get', 'post', 'put', 'patch', 'delete'];

// Mount points declared in src/index.js. Kept explicit: inferring them from
// the source would be a second parser to keep correct.
const MOUNTS = {
  'resourceRoutes.js': '/api/resources',
  'reservationRoutes.js': '/api/reservations',
};

const ROUTE_RE = /router\.(get|post|put|patch|delete)\(\s*'([^']*)'/g;

const errors = [];
const fromCode = new Set();

for (const file of readdirSync(ROUTES_DIR).filter((f) => f.endsWith('Routes.js'))) {
  const mount = MOUNTS[file];
  if (!mount) {
    errors.push(`${file} nao tem ponto de montagem conhecido; atualize MOUNTS neste script`);
    continue;
  }
  const source = readFileSync(path.join(ROUTES_DIR, file), 'utf8');
  for (const [, verb, routePath] of source.matchAll(ROUTE_RE)) {
    const suffix = routePath === '/' ? '' : routePath;
    // Express ':id' becomes OpenAPI '{id}'.
    const openApiPath = (mount + suffix).replace(/:([A-Za-z_]\w*)/g, '{$1}');
    fromCode.add(`${verb.toUpperCase()} ${openApiPath}`);
  }
}

const contract = YAML.parse(readFileSync(CONTRACT, 'utf8'));
const fromContract = new Set();

for (const [p, item] of Object.entries(contract.paths ?? {})) {
  for (const verb of Object.keys(item)) {
    if (VERBS.includes(verb)) fromContract.add(`${verb.toUpperCase()} ${p}`);
  }
}

for (const op of [...fromCode].sort()) {
  if (!fromContract.has(op)) errors.push(`implementado e NAO documentado: ${op}`);
}
for (const op of [...fromContract].sort()) {
  if (!fromCode.has(op)) errors.push(`documentado e NAO implementado: ${op}`);
}

if (fromCode.size === 0) errors.push('nenhuma rota encontrada; verifique ROUTE_RE e ROUTES_DIR');

if (errors.length > 0) {
  console.error(`check-openapi-routes: ${errors.length} problema(s)`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(`check-openapi-routes: ${fromCode.size} endpoints conferem entre codigo e contrato`);
```

### `.github/workflows/ci.yml` — contribuição desta spec

OPS-03 reescreve o arquivo; os dois passos abaixo são o pedaço que **esta** spec
contribui, no job de backend, depois do `npm ci`:

```yaml
      - name: Validar o contrato OpenAPI
        working-directory: ./server
        run: npm run docs:lint

      - name: Conferir contrato contra as rotas implementadas
        working-directory: ./server
        run: npm run docs:check
```

### Correção das referências nas specs irmãs

Duas edições de uma linha cada, para que não nasça uma segunda casa canônica:

* `docs/specs/be-05-proper-http-status-codes/implementacao.md:394` — trocar
  `### 9. Alterar docs/arquitetura/contrato-api.md` por
  `### 9. Alterar docs/arquitetura/openapi.yaml`.
* `docs/specs/be-07-timezone-aware-timestamps/implementacao.md:538` e `:554` —
  trocar as duas menções a `docs/arquitetura/contrato-api.md` por
  `docs/arquitetura/openapi.yaml`.

Essas edições entram no PR desta spec e são mencionadas na descrição, para que
`@adrian-cesar` saiba que o endereço do contrato mudou antes de abrir as branches
dele.

## Testes

Contrato não tem teste unitário de comportamento; tem validação, conferência
contra o código e execução dos exemplos. Todas são executáveis.

### T1 — O documento é OpenAPI 3.1 válido

```bash
cd server
npm run docs:lint
```

Esperado: `Woohoo! Your API description is valid.` e saída `0`.

**Teste que falha antes:** o arquivo não existe. Depois de criado, remover uma
`description` obrigatória de `responses` ou escrever `examples:` como objeto
onde o Schema Object exige array reprova.

### T2 — As 10 operações do contrato são exatamente as 10 rotas do código

```bash
cd server
npm run docs:check
```

Esperado: `check-openapi-routes: 10 endpoints conferem entre codigo e contrato`.

**Teste que falha antes:** rodando o mesmo script contra a tabela de
`Documentação Oficial SREC.md` convertida em contrato, o resultado seria
**5 implementados e não documentados** mais **1 documentado e não
implementado** (`PUT /api/reservations/{id}/cancel`) — 6 divergências. Esse é o
número do pitch.

Conferência manual de apoio:

```bash
grep -hoE "router\.(get|post|put|patch|delete)\('[^']*'" server/src/routes/*.js | wc -l
# 10
grep -cE "^      operationId: " docs/arquitetura/openapi.yaml
# 10
```

### T3 — Nenhum ponto do contrato divergiu do código

`server/src/docs/contract.test.js`, projeto `unit`, sem banco:

```js
const fs = require('node:fs');
const YAML = require('yaml');

const { DEFAULT_CONTRACT_PATH } = require('./apiDocs');
const { ISO_8601_WITH_OFFSET } = require('../utils/datetime');
const { RESERVATION_STATUSES } = require('../domain/reservationStatus');

const contract = YAML.parse(fs.readFileSync(DEFAULT_CONTRACT_PATH, 'utf8'));
const VERBS = ['get', 'post', 'put', 'patch', 'delete'];

const operations = Object.entries(contract.paths).flatMap(([p, item]) =>
  Object.entries(item)
    .filter(([verb]) => VERBS.includes(verb))
    .map(([verb, op]) => [`${verb.toUpperCase()} ${p}`, op]),
);

describe('contrato OpenAPI x codigo', () => {
  it('declara exatamente 10 operacoes', () => {
    expect(operations).toHaveLength(10);
  });

  it('o pattern de DateTimeIn e a mesma regex que o backend aplica', () => {
    expect(contract.components.schemas.DateTimeIn.pattern).toBe(ISO_8601_WITH_OFFSET.source);
  });

  it('o enum de ReservationStatus e o enum de dominio, na mesma ordem', () => {
    expect(contract.components.schemas.ReservationStatus.enum).toEqual([...RESERVATION_STATUSES]);
  });

  it('toda operacao declara situacao no vocabulario fechado de REQ-01', () => {
    const permitido = /^(implementado|implementado com defeito \((BUG|CS)-\d{2}\)|documentado mas inexistente|não implementado)$/;
    for (const [nome, op] of operations) {
      expect(op['x-srec-situacao']).toMatch(permitido);
      expect(typeof op.operationId).toBe('string');
      expect(op.responses['500']).toBeDefined();
      expect(nome).toBeTruthy();
    }
  });

  it('todo code citado em exemplo de erro pertence ao enum ErrorCode', () => {
    const permitidos = new Set(contract.components.schemas.ErrorCode.enum);
    const vistos = new Set();
    JSON.stringify(contract, (key, value) => {
      if (key === 'code' && typeof value === 'string' && /^[A-Z][A-Z0-9_]*$/.test(value)) {
        vistos.add(value);
      }
      return value;
    });
    for (const code of vistos) expect(permitidos.has(code)).toBe(true);
    expect(vistos.size).toBeGreaterThanOrEqual(10);
  });

  it('nenhum exemplo de corpo de erro vaza stack ou caminho de arquivo', () => {
    const texto = JSON.stringify(contract.components.responses);
    expect(texto).not.toMatch(/at \//);
    expect(texto).not.toContain('node_modules');
  });
});
```

**Teste que falha antes:** nenhum destes casos existe hoje, porque não há
contrato. O caso do `pattern` é o que importa a médio prazo: é o único ponto em
que o contrato e o código podem divergir em silêncio e produzir BUG-07 de novo.

### T4 — Todo exemplo do contrato executa de verdade

Com a stack de pé (`docker compose up`) e banco limpo. Cada passo é um exemplo
nomeado do contrato, na ordem em que o contrato os apresenta:

```bash
BASE=http://localhost:5000

# salaDeReuniao -> 201
curl -s -o /dev/null -w 'POST /api/resources            %{http_code} (201)\n' \
  -X POST $BASE/api/resources -H 'Content-Type: application/json' \
  -d '{"name":"Sala Alpha","type":"meeting_room","capacity":8}'

# semNome -> 400 RESOURCE_FIELDS_REQUIRED
curl -s -o /dev/null -w 'POST /api/resources sem name   %{http_code} (400)\n' \
  -X POST $BASE/api/resources -H 'Content-Type: application/json' \
  -d '{"type":"workstation"}'

# capacidadeZero -> 201, e grava 1 (BUG-09, continua aberto)
curl -s -X POST $BASE/api/resources -H 'Content-Type: application/json' \
  -d '{"name":"Sala Fantasma","type":"meeting_room","capacity":0}' \
  | grep -o '"capacity":[0-9]*'
# esperado: "capacity":1   <- o contrato documenta este defeito de propósito

# recursoLivre -> 201
curl -s -o /dev/null -w 'POST /api/reservations livre   %{http_code} (201)\n' \
  -X POST $BASE/api/reservations -H 'Content-Type: application/json' \
  -d '{"resource_id":1,"user_name":"Carlos Silva","start_time":"2030-11-03T09:00:00-03:00","end_time":"2030-11-03T10:00:00-03:00"}'

# encostada -> 201 (comparação estrita, de propósito)
curl -s -o /dev/null -w 'POST /api/reservations encost. %{http_code} (201)\n' \
  -X POST $BASE/api/reservations -H 'Content-Type: application/json' \
  -d '{"resource_id":1,"user_name":"Ana Prado","start_time":"2030-11-03T10:00:00-03:00","end_time":"2030-11-03T11:00:00-03:00"}'

# sobreposta -> 409 RESERVATION_OVERLAP
curl -s -X POST $BASE/api/reservations -H 'Content-Type: application/json' \
  -d '{"resource_id":1,"user_name":"Ana Prado","start_time":"2030-11-03T09:30:00-03:00","end_time":"2030-11-03T10:30:00-03:00"}' \
  | grep -o '"code":"[A-Z_]*"'
# esperado: "code":"RESERVATION_OVERLAP"

# janelaInvertida -> 400 END_BEFORE_START
# semOffset       -> 400 INVALID_DATETIME
# recursoInexist. -> 409 RELATED_RESOURCE_NOT_FOUND
# statusInvalido  -> 400 INVALID_RESERVATION_STATUS
# retrocesso      -> 409 INVALID_STATUS_TRANSITION
# idInvalido      -> 400 INVALID_ID_PARAM  (nas 6 rotas com :id)
```

Regra de aceite: **cada exemplo nomeado do contrato tem uma linha neste
roteiro, e o código de status obtido é o documentado.** Exemplo que não executa
sai do contrato ou o contrato está errado.

Prova de concorrência, que é o 409 mais importante e o único que a doc recebida
chegava perto de prometer:

```bash
for i in $(seq 1 10); do
  curl -s -o /dev/null -w '%{http_code}\n' -X POST $BASE/api/reservations \
    -H 'Content-Type: application/json' \
    -d '{"resource_id":2,"user_name":"Corrida","start_time":"2030-12-01T14:00:00-03:00","end_time":"2030-12-01T15:00:00-03:00"}' &
done; wait
# esperado depois de BE-01: exatamente um 201 e nove 409
# no codigo recebido: mais de um 201 (BUG-01)
```

### T5 — `/docs` sobe e não sobe nos lugares certos

```bash
# com ENABLE_API_DOCS=true (default do override de desenvolvimento)
curl -s -o /dev/null -w 'GET /docs                 %{http_code} (200)\n' $BASE/docs/
curl -s $BASE/docs/openapi.yaml | head -1
# esperado: openapi: 3.1.0

# sem a variavel
docker compose exec -e ENABLE_API_DOCS=false server node -e "
  const express = require('express');
  const { mountApiDocs } = require('./src/docs/apiDocs');
  console.log('montado:', mountApiDocs(express()));
"
# esperado: montado: false

# na imagem de producao (npm ci --omit=dev, sem docs/)
docker compose -f docker-compose.yml up -d --build
curl -s -o /dev/null -w 'GET /docs em producao     %{http_code} (404)\n' $BASE/docs/
curl -s -o /dev/null -w 'GET /api/resources        %{http_code} (200)\n' $BASE/api/resources
# a API continua de pe; /docs simplesmente nao existe
```

O último par é o critério que importa: a ausência do contrato **não** pode
derrubar a API.

### T6 — Swagger UI é utilizável, não só carrega

Verificação manual, obrigatória antes de pedir review:

1. Abrir <http://localhost:5000/docs> e confirmar que as 10 operações aparecem
   sob as duas tags.
2. Em `POST /api/reservations`, abrir o seletor de exemplos e confirmar que os
   **6** exemplos nomeados estão lá.
3. Clicar "Try it out" no exemplo `recursoLivre` e confirmar 201 com o corpo
   documentado.
4. Repetir no exemplo `sobreposta` e confirmar 409 com
   `code: RESERVATION_OVERLAP`.
5. Confirmar que as extensões `x-srec-*` **não** quebram a renderização.

### T7 — As três descrições erradas foram corrigidas

Conferência linha a linha, para o corpo do PR:

| Divergência | `Documentação Oficial SREC.md` | `docs/arquitetura/openapi.yaml` |
|---|---|---|
| D-04 | `PUT /api/reservations/{id}/cancel`, `:117` | operação ausente; `PATCH /api/reservations/{id}/status` documentada como o único caminho de transição, com a nota de que `/cancel` nunca existiu |
| D-05 | "Lista as reservas do usuário atual", `:116` | "Lista todas as reservas, de todos os responsáveis e em todos os status"; nota de que não existe usuário |
| D-06 | "Nível de acesso Admin", `:109` | seção "Autenticação" da `info.description`: não existe; nenhuma operação declara `security` |

Verificação mecânica de que não sobrou menção a autenticação inexistente:

```bash
grep -niE "security|bearer|authoriz|admin" docs/arquitetura/openapi.yaml
# esperado: somente as linhas que NEGAM a existência de autenticação
```

### T8 — Cobertura do código novo

```bash
cd server
npm run lint
npx jest --coverage --coverageReporters=text --collectCoverageFrom='src/**/*.js'
```

`src/docs/apiDocs.js` é exercitado pelos casos de T5 e por um teste unitário com
`contractPath` apontando para arquivo inexistente e para arquivo inválido.

## Critérios de aceite

* [ ] `docs/arquitetura/openapi.yaml` existe, declara `openapi: 3.1.0` e
      contém **exatamente 10** operações, com `operationId` único em cada.
* [ ] `npm run docs:lint` passa sem erro (T1).
* [ ] `npm run docs:check` reporta `10 endpoints conferem` (T2).
* [ ] Toda operação tem `summary`, `description` citando **arquivo e linha** do
      código que a implementa, `x-srec-situacao` no vocabulário fechado de
      REQ-01 e `x-srec-specs`.
* [ ] Toda operação documenta **todos** os seus códigos de status, incluindo os
      400/404/409 introduzidos por BE-02, BE-03 e BE-05, e um 500.
* [ ] As respostas de erro das 10 operações referenciam o schema `Error` com o
      envelope plano `{ "error", "code" }` de BE-04.
* [ ] O `enum` de `ErrorCode` é fechado e tem os **20** códigos; T3 confere que
      nenhum exemplo usa código fora dele.
* [ ] `POST /api/reservations` está escrito por extenso com os três desfechos
      exigidos — **201**, **400** (quatro causas, cada uma com seu `code`) e
      **409** (duas causas) — e com os **6** exemplos nomeados.
* [ ] `PATCH /api/reservations/{id}/status` está escrito por extenso, com as
      transições permitidas, o 400 de status fora do enum, o 409 de transição
      proibida e o registro de que a rota `/cancel` da doc recebida nunca
      existiu.
* [ ] Pelo menos **três** operações estão escritas por extenso e servem de
      padrão; as demais estão no índice com situação, respostas e `code` já
      fixados.
* [ ] `DateTimeIn` exige offset e seu `pattern` é **idêntico** a
      `ISO_8601_WITH_OFFSET` de `server/src/utils/datetime.js`; `DateTimeOut`
      documenta a forma UTC de saída. T3 confere a igualdade.
* [ ] Os **6** campos de data do sistema têm formato especificado
      (antes: **0 de 6**).
* [ ] `ResourceType` **não** é declarado como `enum`, e a `description`
      registra BUG-10 com a evidência; `capacity` registra BUG-09.
* [ ] `DELETE /api/resources/{id}` registra a perda em cascata (BUG-06) como
      débito aberto depois da N2, com a linha `initDb.js:16`.
* [ ] A seção "Autenticação" da `info.description` declara a ausência com
      evidência; **nenhuma** operação declara `security`. T7 confere.
* [ ] As três descrições erradas da doc recebida (D-04, D-05, D-06) estão
      corrigidas, com a tabela de T7 colada no PR.
* [ ] Swagger UI responde em `/docs` com `ENABLE_API_DOCS=true` e o YAML cru em
      `/docs/openapi.yaml` (T5, T6).
* [ ] Com `ENABLE_API_DOCS` ausente ou diferente de `true`, `mountApiDocs`
      devolve `false` e `/docs` responde 404.
* [ ] Na imagem de produção, `/docs` responde 404 e `GET /api/resources`
      responde 200 — a ausência do contrato não derruba a API.
* [ ] `app.use(errorHandler)` continua sendo o **último** `app.use` de
      `server/src/index.js`.
* [ ] As três dependências novas são **`devDependencies`**;
      `grep -n '"dependencies"' -A6 server/package.json` segue com `cors`,
      `dotenv`, `express` e `pg`.
* [ ] `README.md` tem a seção "Contrato da API", com o contrato de horário, o
      formato de erro e a ressalva de produção.
* [ ] As referências a `docs/arquitetura/contrato-api.md` em BE-05 e BE-07
      foram redirecionadas para o YAML, e **o arquivo markdown não foi criado**.
* [ ] As quatro divergências entre specs irmãs estão resolvidas no contrato e
      registradas no corpo do PR, com a observação de que o teste de
      `be-05-...:432` precisa passar a ler `res.body.code`.
* [ ] Todo exemplo nomeado do contrato tem linha no roteiro de T4 e o status
      obtido é o documentado.
* [ ] `npm run lint` no `server/` com **0** erros; `npx jest` verde.
* [ ] `Documentação Oficial SREC.md` **não** foi alterado:
      `git status --porcelain "Documentação Oficial SREC.md"` sai vazio.
* [ ] PR aprovado por Igor Seberino (`@igorSeberino`) no papel de QA.

## Passo a passo TBD

```bash
# 1. Partir de main já com BE-04 e BE-05 integradas.
#    Sem elas o envelope de erro e os códigos HTTP ainda não existem, e o
#    contrato documentaria o comportamento errado. Conferir antes:
git checkout main
git pull --ff-only origin main
ls server/src/errors/AppError.js \
   server/src/middlewares/errorHandler.js \
   server/src/middlewares/validateIdParam.js
#    Se qualquer um faltar, PARE e avise @adrian-cesar. Esta spec não começa.

git checkout -b docs/openapi-contract

# 2. Registrar o ANTES (os números do pitch)
grep -hoE "router\.(get|post|put|patch|delete)\('[^']*'" server/src/routes/*.js | sort | wc -l
# 10 implementados
grep -cE '^\| `(GET|POST|PUT|PATCH|DELETE)`' "Documentação Oficial SREC.md"
# 5 documentados
find . -name 'openapi*' -o -name 'swagger*' -o -name '*postman_collection*' \
  | grep -v node_modules | wc -l
# 0 coleções de API

# 3. Escrever o contrato
mkdir -p docs/arquitetura server/src/docs server/scripts
# criar docs/arquitetura/openapi.yaml com o conteúdo da seção "Alterações"

# 4. Instalar as ferramentas (devDependencies, de propósito)
cd server
npm install --save-dev @redocly/cli swagger-ui-express yaml

# 5. Validar o contrato antes de escrever uma linha de servidor
npm run docs:lint

# 6. Implementar o servidor de documentação
#    - criar  server/src/docs/apiDocs.js
#    - alterar server/src/index.js   (mountApiDocs antes do errorHandler)
#    - alterar server/.env.example   (ENABLE_API_DOCS)
#    - criar  server/scripts/check-openapi-routes.mjs
#    - criar  server/src/docs/contract.test.js
npm run docs:check
npx jest src/docs
npm run lint
cd ..

# 7. Ambiente e documentação
#    - alterar docker-compose.override.yml (ENABLE_API_DOCS + volume do contrato)
#    - alterar README.md                   (seção "Contrato da API")
#    - alterar .github/workflows/ci.yml    (os dois passos desta spec)
docker compose config    # valida a sintaxe do merge dos dois arquivos compose

# 8. Rodar os roteiros T4, T5 e T6 com a stack de pé e guardar a saída
docker compose down -v
docker compose up -d --build --wait --wait-timeout 180
# ... roteiro T4 ...
# ... roteiro T5 ...
# ... roteiro T6, manual, com captura de tela do /docs ...

# 9. Redirecionar as referências das specs irmãs
#    - docs/specs/be-05-proper-http-status-codes/implementacao.md:394
#    - docs/specs/be-07-timezone-aware-timestamps/implementacao.md:538,:554

# 10. Confirmar que a doc recebida não foi tocada
git status --porcelain "Documentação Oficial SREC.md"   # deve sair vazio

# 11. Commits
git add docs/arquitetura/openapi.yaml
git commit -m "docs(api): publicar o contrato dos 10 endpoints em OpenAPI 3.1

Substitui a tabela de 5 linhas de 'Documentacao Oficial SREC.md', que omitia
5 dos 10 endpoints implementados e descrevia 3 dos 5 restantes errado: a rota
PUT /api/reservations/{id}/cancel nao existe, GET /api/reservations lista
todas as reservas e nao as 'do usuario atual', e POST /api/resources nao tem
nivel de acesso Admin porque o sistema nao tem autenticacao.

Documenta schemas de requisicao e resposta, todos os codigos de status
incluindo os 400/404/409 de BE-02, BE-03 e BE-05, o envelope de erro de BE-04
com o enum fechado de 20 codigos, o contrato de horario ISO 8601 com offset de
BE-07 e exemplos executaveis.

Registra com x-srec-debito o que a N2 nao corrige: capacidade zero ou negativa
aceita (BUG-09), tipo de espaco sem dominio (BUG-10) e exclusao em cascata do
historico de reservas (BUG-06).

Refs #23"

git add server/src/docs/apiDocs.js server/src/index.js server/.env.example \
        server/package.json server/package-lock.json
git commit -m "feat(docs): servir o contrato da API como Swagger UI em /docs

Monta Swagger UI e o YAML cru em /docs, apenas quando ENABLE_API_DOCS=true.
As ferramentas entram como devDependencies e sao carregadas por require
tardio: a imagem de producao, construida com npm ci --omit=dev, nao as carrega
e /docs nao existe la por construcao.

O SREC nao tem autenticacao (ADR-007), entao expor o contrato publicamente e
decisao de perimetro de rede, nao default.

Refs #23"

git add server/scripts/check-openapi-routes.mjs server/src/docs/contract.test.js
git commit -m "test(api): impedir que contrato e rotas voltem a divergir

Falha o build quando as operacoes do openapi.yaml e os router.<verbo> dos dois
arquivos de rota discordam, e quando o pattern de DateTimeIn deixa de ser a
regex que o backend aplica ou o enum de status deixa de ser o enum de dominio.

Refs #23"

git add docker-compose.override.yml README.md .github/workflows/ci.yml
git commit -m "docs(readme): documentar o contrato da API, o formato de erro e o contrato de horario

Refs #23"

git add docs/specs/be-05-proper-http-status-codes/implementacao.md \
        docs/specs/be-07-timezone-aware-timestamps/implementacao.md \
        docs/specs/req-03-openapi-contract
git commit -m "docs(specs): apontar o contrato da API para openapi.yaml

BE-05 e BE-07 mandavam alterar docs/arquitetura/contrato-api.md, que nao
existe, enquanto REQ-01, REQ-02 e a auditoria apontavam para
docs/arquitetura/openapi.yaml. Uma casa canonica por assunto: o YAML, que a CI
consegue validar.

Refs #23"

# 12. Push e PR
git push -u origin docs/openapi-contract
# Abrir PR para main, título:
#   docs(api): publicar o contrato dos 10 endpoints em OpenAPI 3.1 e servir Swagger UI
# Revisor: @igorSeberino (QA). Fecha a issue #23.
```

Corpo sugerido do PR:

```markdown
## O que muda

Cria `docs/arquitetura/openapi.yaml`: contrato OpenAPI 3.1 dos **10** endpoints
reais do SREC, servido como Swagger UI em `/docs`.

## Por que

O repositório chegou com uma tabela de 5 linhas em
`Documentação Oficial SREC.md:102-117`, batizada pelo próprio grupo anterior de
"**Esboço** da Documentação da API REST". Ela omite 5 endpoints — inclusive as
duas operações destrutivas — e descreve 3 dos 5 restantes errado. A rubrica da
N1 já pedia coleção da API e o repositório tem zero.

## Números

| | antes | depois |
|---|---|---|
| Endpoints documentados | 5 | 10 |
| Endpoints documentados corretamente | 2 de 5 | 10 de 10 |
| Coleções de API | 0 | 1 |
| Códigos de status documentados | 0 | ≥ 24 (6 distintos) |
| Códigos de erro de máquina documentados | 0 | 20 |
| Campos de data com formato especificado | 0 de 6 | 6 de 6 |
| Exemplos executáveis | 0 | ≥ 14 |
| Verificações automáticas contrato × código | 0 | 2 |

## As três descrições corrigidas

* D-04 — `PUT /api/reservations/{id}/cancel` não existe; é
  `PATCH /api/reservations/:id/status` (`reservationRoutes.js:8`).
* D-05 — `GET /api/reservations` lista **todas** as reservas, de todos; não
  existe usuário (`reservationModel.js:14-18`).
* D-06 — `POST /api/resources` **não** tem "Nível de acesso Admin"; não há
  autenticação alguma (`index.js:12-14`, `resourceRoutes.js:5-9`).

## O que NÃO foi documentado como resolvido

Por decisão explícita: `capacity: 0` continua respondendo 201 e gravando 1
(BUG-09), `type` continua aceitando qualquer string (BUG-10) e
`DELETE /api/resources/{id}` continua apagando o histórico de reservas em
cascata (BUG-06). Os três estão no contrato com `x-srec-debito` e
`aberto_apos_n2: true`. Documentar validação que não existe seria repetir o
defeito que este PR conserta.

## Divergências entre specs irmãs, resolvidas aqui

1. Envelope de erro **plano** (BE-04). O teste de
   `be-05-...:432` lê `res.body.error.code` e precisa passar a ler
   `res.body.code` — @adrian-cesar.
2. Assinatura de `AppError`: a de BE-04 vence.
3. `:id` inválido responde `INVALID_ID_PARAM`; `INVALID_IDENTIFIER` fica só
   para parâmetro numérico vindo do corpo.
4. `INVALID_DATETIME` é o código de formato de data;
   `INVALID_START_TIME`/`INVALID_END_TIME` ficam marcados para aposentadoria.

## Como revisar

1. `cd server && npm run docs:lint` → documento válido.
2. `cd server && npm run docs:check` → `10 endpoints conferem`.
3. `npx jest src/docs` → 6 casos verdes.
4. `docker compose up -d --build` e abrir <http://localhost:5000/docs>; rodar
   "Try it out" nos exemplos `recursoLivre` e `sobreposta`.
5. `docker compose -f docker-compose.yml up -d --build` e confirmar que `/docs`
   responde 404 e `/api/resources` responde 200.
6. Conferir a tabela de T7 contra `Documentação Oficial SREC.md:108-117`.
```

## Prompt para o Claude Code

```text
Você está na raiz do fork igorSeberino/srec, projeto SREC, entrega N2 da
disciplina de Manutenção e Melhoria de Software. Esta entrega é MANUTENÇÃO DE
SOFTWARE ALHEIO: o código e a documentação vieram de outro grupo. O seu
trabalho aqui é registrar a verdade do que existe, não desenhar a API ideal.

Implemente integralmente a spec docs/specs/req-03-openapi-contract/implementacao.md.

PRÉ-REQUISITO, confira ANTES de escrever qualquer coisa:
  ls server/src/errors/AppError.js server/src/middlewares/errorHandler.js \
     server/src/middlewares/validateIdParam.js server/src/utils/datetime.js \
     server/src/domain/reservationStatus.js
Se algum faltar, PARE e diga o que falta. O contrato só fecha depois de BE-04
(envelope de erro) e BE-05 (códigos HTTP); escrever antes significa documentar
o comportamento errado.

Leia antes, por inteiro, e trate como única fonte de verdade:
- server/src/routes/resourceRoutes.js e server/src/routes/reservationRoutes.js
- server/src/controllers/resourceController.js e reservationController.js
- server/src/models/resourceModel.js e reservationModel.js
- server/src/config/initDb.js e server/src/index.js
- server/src/errors/pgErrorCodes.js e server/src/middlewares/errorHandler.js
- server/src/middlewares/validateIdParam.js e server/src/utils/datetime.js
- server/src/domain/reservationStatus.js
- client/src/services/api.js e client/src/App.jsx
E leia, como documento a CONFRONTAR e nunca copiar:
- "Documentação Oficial SREC.md" (a tabela da API está nas linhas 102-117)

Leia também, porque são o contexto do contrato:
- docs/produto/requisitos.md (REQ-01) e docs/arquitetura/der.md (REQ-02)
- docs/specs/be-04-central-error-middleware/implementacao.md
- docs/specs/be-05-proper-http-status-codes/implementacao.md
- docs/specs/be-02-validate-reservation-window/implementacao.md
- docs/specs/be-03-restrict-reservation-status/implementacao.md
- docs/specs/be-07-timezone-aware-timestamps/implementacao.md
- a skill de arquitetura de backend em .claude/skills/ e CLAUDE.md

Entregue:
1. docs/arquitetura/openapi.yaml — OpenAPI 3.1, arquivo único, os 10
   endpoints, exatamente no formato da seção "Alterações" da spec.
2. server/src/docs/apiDocs.js — montador do Swagger UI, inerte por default.
3. server/scripts/check-openapi-routes.mjs — conferência rotas × contrato.
4. server/src/docs/contract.test.js — os 6 casos de deriva.
5. As alterações em server/src/index.js, server/package.json,
   server/.env.example, docker-compose.override.yml, README.md e
   .github/workflows/ci.yml.
6. As duas correções de referência em docs/specs/be-05-.../implementacao.md e
   docs/specs/be-07-.../implementacao.md.

REGRAS DURAS:
- NÃO crie docs/arquitetura/contrato-api.md. O YAML é a única casa canônica.
- O YAML precisa ser VÁLIDO. Rode `npm run docs:lint` e cole a saída real. Se
  falhar, corrija e rode de novo. Nunca invente saída de comando.
- Documente o que o código FAZ. Em particular, e isto não é negociável:
  * `capacity: 0` responde 201 e grava 1 (resourceController.js:10,
    `capacity || 1`). Documente assim, com x-srec-debito BUG-09.
  * `type` aceita qualquer string. NÃO declare `enum` em ResourceType; o
    vocabulário vai em description e examples, com x-srec-debito BUG-10.
  * `DELETE /api/resources/{id}` apaga as reservas em cascata
    (initDb.js:16). Documente, com x-srec-debito BUG-06.
  * `reservations.status` e `reservations.resource_id` aceitam NULL no schema
    recebido. Registre onde for relevante.
- ReservationStatus SIM tem enum, porque BE-03 criou a restrição de fato. Use
  a mesma ordem de RESERVATION_STATUSES: scheduled, cancelled, completed.
  Atenção: `cancelled` com DOIS L.
- O `pattern` de DateTimeIn tem de ser IDÊNTICO a ISO_8601_WITH_OFFSET.source
  de server/src/utils/datetime.js. Abra o arquivo e copie. O teste compara.
- Envelope de erro PLANO: { "error": "<mensagem>", "code": "<CODE>" }, nunca
  aninhado. Se encontrar o teste de be-05 lendo res.body.error.code, NÃO mude
  o contrato: anote na descrição do PR que o teste precisa de ajuste.
- Nenhuma operação declara `security`. O sistema não tem autenticação.
- As três dependências novas são devDependencies. NÃO mexa no bloco
  "dependencies" de server/package.json (cors, dotenv, express, pg).
- mountApiDocs(app) entra DEPOIS das rotas e ANTES de app.use(errorHandler).
  O errorHandler continua sendo o último app.use.
- Toda description de operação cita arquivo e linha que você verificou abrindo
  o arquivo. Se não conseguir confirmar uma linha, ajuste o número; nunca
  mantenha citação que você não checou.
- NÃO altere "Documentação Oficial SREC.md". NÃO altere nada em client/.
- Português do Brasil nos textos; inglês em nomes de arquivo, identificadores,
  chaves de YAML, operationId, código de erro e nome de branch.

Ao final, rode nesta ordem e cole a saída real de cada um:
  cd server && npm run docs:lint
  cd server && npm run docs:check
  cd server && npx jest src/docs
  cd server && npm run lint
  grep -hoE "router\.(get|post|put|patch|delete)\('[^']*'" src/routes/*.js | wc -l
  grep -cE "^      operationId: " ../docs/arquitetura/openapi.yaml
Os dois últimos têm de dar 10 e 10.

Se tiver Docker, suba a stack e rode os roteiros T4 e T5 da spec, colando a
saída real. Se não tiver, diga explicitamente que não executou — não invente.

Depois execute o "Passo a passo TBD" da spec: branch docs/openapi-contract, os
cinco commits com as mensagens prontas (Conventional Commits em português, no
imperativo), e o PR para main com @igorSeberino como revisor de QA.
```
