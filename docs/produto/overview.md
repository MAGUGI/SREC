# SREC — visão do produto e regras de negócio

O SREC (Sistema de Reserva de Espaços e Coworking) resolve um problema de
alocação exclusiva: em um coworking, dois ocupantes não podem usar a mesma
estação de trabalho nem a mesma sala de reunião no mesmo intervalo de tempo.
O sistema substitui a planilha compartilhada por um cadastro de espaços e um
registro de reservas que recusa sobreposições.

Este documento descreve o produto **como ele existe hoje**. Onde a
documentação do grupo anterior (`Documentação Oficial SREC.md`) divergir, o
código vence. As divergências estão catalogadas em
[`docs/auditoria/divergencias-doc-codigo.md`](../auditoria/divergencias-doc-codigo.md),
e as três que tratam do banco estão detalhadas em
[`docs/arquitetura/der.md`](../arquitetura/der.md).

As evidências apontam para a `main` depois do backend da N2 (PR #41), do
frontend (FE-01 a FE-05, PRs #35, #36, #42, #43 e #44) e da subida em Docker
Compose (OPS-01, PR #40). Quando uma regra mudou de situação por um PR da N2,
isso aparece no campo **Corrigido na N2**, com a situação recebida preservada.

## O que o sistema entrega

| Capacidade | Onde | Estado |
|---|---|---|
| Cadastro de espaços com nome, tipo e capacidade | `client/src/features/resources/ResourceForm.jsx:58-102`, `POST /api/resources` | funciona; a API ainda aceita tipo e capacidade inválidos (RN01, RN02) |
| Edição de espaço | `client/src/features/resources/ResourceListItem.jsx:15-27`, `PUT /api/resources/:id` | funciona, com o mesmo defeito de tipo e capacidade |
| Listagem de espaços | `client/src/features/resources/ResourceList.jsx:15-37`, `GET /api/resources` | funciona |
| Exclusão de espaço | `client/src/features/resources/CascadeDeleteDialog.jsx:7-78`, `DELETE /api/resources/:id` | funciona; avisa quantas reservas serão apagadas, e apaga (RN09) |
| Criação de reserva com recusa de sobreposição | `client/src/features/reservations/ReservationForm.jsx:58-109`, `POST /api/reservations` | funciona; sob concorrência, só é segura em banco migrado (RN03) |
| Listagem de reservas em ordem cronológica | `client/src/features/reservations/ReservationList.jsx:17-21`, `GET /api/reservations` | funciona |
| Concluir ou cancelar reserva | `client/src/features/reservations/ReservationListItem.jsx:21-37`, `PATCH /api/reservations/:id/status` | funciona; a API valida valor e transição (RN07) |
| Exclusão definitiva de reserva | `client/src/features/reservations/ReservationsPanel.jsx:50-67`, `DELETE /api/reservations/:id` | funciona |

## O que o sistema não entrega

Quatro capacidades que a documentação recebida afirma existir e que **não têm
uma linha de código**: controle de acesso de administrador (RF14), usuário
identificado dono da reserva (RF13), ativação e inativação de espaço via
`is_active` (RF15) e a rota `PUT /api/reservations/{id}/cancel` (RF11).
Detalhamento e decisão em [`docs/produto/requisitos.md`](requisitos.md).

Consequência de produto a ter clara: **o SREC é hoje um sistema de uso
confiado.** Qualquer pessoa com acesso à URL cadastra, altera e exclui
qualquer coisa, e o campo "Nome do Responsável"
(`client/src/features/reservations/ReservationForm.jsx:73-81`) é texto livre
sem verificação. Isso é aceitável em um coworking pequeno com acesso restrito à
rede interna, e inaceitável em qualquer exposição pública. Não é bug; é o
perímetro de uso do produto, e precisa estar escrito.

## Atores

Um só: o **Operador**, qualquer pessoa com acesso à aplicação, com poder
total. `Administrador` e `Usuário identificado` existem apenas na
documentação recebida. Ver a seção "Atores" de
[`docs/produto/requisitos.md`](requisitos.md).

## Regras de negócio

Mesma convenção de `Situação` dos requisitos: `implementado`,
`implementado com defeito (BUG-nn)` ou `(CS-nn)`, `documentado mas inexistente`,
`não implementado`.

---

### RN01 — Um espaço é estação de trabalho ou sala de reunião

Todo espaço pertence a exatamente um de dois tipos: `workstation` (foco
individual, capacidade unitária) ou `meeting_room` (foco colaborativo,
capacidade em grupo). A distinção vem da própria definição do produto
(`Documentação Oficial SREC.md:9-11`).

**Situação.** `implementado`

**Evidência.** A interface só oferece os dois valores, a partir de
`client/src/constants/domain.js:1-4`, e recusa outro antes do envio
(`client/src/features/resources/validation.js:23-25`). A API recusa com `400`
`INVALID_RESOURCE_TYPE` no cadastro e na edição
(`server/src/services/resourceService.js:15` e `:28`, enum em
`server/src/domain/resourceType.js`), e o banco tem
`resources_type_check` (`server/migrations/004_resource_type_capacity_check.sql`).

Desde FE-01, um tipo desconhecido aparece na lista com o próprio nome
(`client/src/constants/domain.js:17-21`), e não mais disfarçado de "Estação de
Trabalho".

**Corrigido na N2.** BE-09 (issue #47, PR #61). Situação antes:
`implementado com defeito (BUG-10)`: `POST /api/resources` com
`{"type":"banana"}` respondia `201`.

---

### RN02 — A capacidade de um espaço é pelo menos uma pessoa

Espaço com capacidade zero ou negativa não representa nada no mundo físico.

**Situação.** `implementado`

**Evidência.** A API aceita só inteiro de 1 a 100 e responde `400`
`INVALID_CAPACITY` no cadastro e na edição
(`server/src/services/resourceService.js:16` e `:29`, faixa em
`server/src/domain/resourceType.js`). O banco tem
`resources_capacity_check`, `CHECK (capacity BETWEEN 1 AND 100)`
(`server/migrations/004_resource_type_capacity_check.sql`). O teto de 100 vem
da spec da QA-02.

O cliente recusa capacidade não inteira ou menor que 1
(`client/src/features/resources/validation.js:27-31`), o que protege só quem
usa a tela.

**Corrigido na N2.** BE-09 (issue #47, PR #61). Situação antes:
`implementado com defeito (BUG-09)`: `capacity: 0` e `capacity: -5` eram
gravados, no cadastro e na edição.

---

### RN03 — Duas reservas não podem se sobrepor no mesmo espaço

É a regra central do produto. Duas reservas do mesmo espaço se sobrepõem
quando o início de uma é anterior ao fim da outra e o fim da primeira é
posterior ao início da segunda:

```text
Início_banco < Fim_novo AND Fim_banco > Início_novo
```

Reservas encostadas (o fim de uma coincide com o início da outra) **não**
se sobrepõem, porque a comparação é estrita.

**Situação.** `implementado com defeito (BUG-01)`

**Evidência.** A fórmula continua em
`server/src/models/reservationModel.js:55`, `start_time < $3 AND end_time > $2`,
e confere literalmente com `Documentação Oficial SREC.md:72`. O serviço a
consulta antes de gravar (`server/src/services/reservationService.js:18`).

Desde o PR #41 a regra também existe no banco, como a constraint
`reservations_no_overlap` (`server/migrations/001_reservation_no_overlap.sql`),
e o serviço traduz a violação em `409` (`reservationService.js:19-24`). O
teste `server/tests/integration/reservations.concurrency.test.js` prova, contra
PostgreSQL real, que requisições simultâneas resultam em uma só reserva.

O defeito que sobra é de ambiente: a constraint só existe depois de
`npm run db:migrate`, que nem o boot do servidor (`server/src/index.js:12`) nem
o `docker compose up` executam. Sem ela, a consulta do serviço é lida e
escrita sem transação, e a janela de concorrência do código recebido continua
aberta.

**Corrigido na N2.** BE-01 (PR #41), no código. Situação no código recebido:
`implementado com defeito (BUG-01)`.

**Trabalho na N2.** Aplicar as migrations na subida (OPS-02, #17) fecha o
BUG-01 em todo ambiente.

---

### RN04 — Reserva cancelada libera o horário

Cancelar uma reserva devolve o intervalo ao pool de disponibilidade.

**Situação.** `implementado`

**Evidência.** `server/src/models/reservationModel.js:54` filtra
`status <> 'cancelled'` na verificação de disponibilidade, e o `EXCLUDE` de
BE-01 tem a mesma condição (`WHERE (status <> 'cancelled')`). Reserva
`cancelled` não bloqueia novas reservas no mesmo intervalo.

A ressalva do código recebido, status `NULL` escapando do filtro, está
fechada: a API recusa status ausente ou inválido
(`server/src/services/reservationService.js:33`), e, com as migrations, o
banco também (`NOT NULL` e `reservations_status_check`).

---

### RN05 — O fim de uma reserva é posterior ao seu início

Uma reserva ocupa um intervalo de tempo com duração positiva.

**Situação.** `implementado`

**Evidência.** `server/src/validators/reservationValidator.js:13` recusa
`end_time` menor ou igual a `start_time` com `400` e
`code: "END_BEFORE_START"`, e a migration
`server/migrations/002_reservation_time_window_check.sql` cria o
`CHECK (end_time > start_time)`. O cliente limita o campo de término ao início
escolhido (`client/src/features/reservations/ReservationForm.jsx:97`). Coberto
por `server/tests/integration/reservations.window.test.js`.

**Corrigido na N2.** BE-02 (PR #41). Situação no código recebido:
`não implementado` (BUG-02): a reserva invertida era aceita e, por ser um
intervalo vazio, nunca colidia com nada.

---

### RN06 — Uma reserva não pode começar no passado

Reservar um horário que já passou não tem significado operacional: o espaço
já foi ou não foi usado.

**Situação.** `implementado`

**Evidência.** `server/src/validators/reservationValidator.js:14` recusa
início anterior ao momento da criação, com 60 s de tolerância de relógio
(`MAX_CLOCK_SKEW_MS`, `:1`), respondendo `400` com
`code: "START_IN_THE_PAST"`. O cliente aplica a mesma regra e põe `min` no
campo de início (`client/src/features/reservations/ReservationForm.jsx:87`).
A regra fica só na aplicação, porque depende de `now()`, que não pode entrar
em `CHECK`.

**Corrigido na N2.** BE-02 (PR #41) e FE-03 (PR #43). Situação no código
recebido: `não implementado` (BUG-08).

---

### RN07 — Uma reserva nasce agendada e pode ser concluída ou cancelada

Ciclo de vida: `scheduled → completed` ou `scheduled → cancelled`. Estado
final não transiciona. A documentação recebida descreve o mesmo ciclo
(`Documentação Oficial SREC.md:32`: `Agendado -> Concluído ou Cancelado`).

**Situação.** `implementado`

**Evidência.** O ciclo de vida está escrito uma vez, em
`server/src/domain/reservationStatus.js:7-11`. A API recusa status fora do
vocabulário com `400` (`server/src/services/reservationService.js:33`) e
transição a partir de estado final com `409` (`:38`); o `UPDATE` só altera a
linha se o status atual for uma origem válida
(`server/src/models/reservationModel.js:37`). Com as migrations, o banco
recusa status inválido (`reservations_status_check`) e `NULL`. A interface só
mostra os botões para reserva `scheduled`
(`client/src/features/reservations/ReservationListItem.jsx:21`). Coberto por
`server/tests/integration/reservations.status.test.js`.

**Corrigido na N2.** BE-03 (PR #41). Situação no código recebido:
`implementado com defeito (BUG-03)`: a API gravava qualquer string, aceitava
`NULL`, e um `PATCH` com corpo vazio tirava a reserva da regra RN03.

---

### RN08 — Cancelar e excluir são ações diferentes

Cancelar muda o status e preserva o registro para histórico. Excluir remove
o registro. São intenções distintas e não devem ser confundidas.

**Situação.** `implementado`

**Evidência.** Os dois caminhos são distintos na API:
`PATCH /api/reservations/:id/status` com `cancelled`
(`server/src/routes/reservationRoutes.js:9`) preserva a linha;
`DELETE /api/reservations/:id` (`:10`) apaga
(`server/src/models/reservationModel.js:45`).

Desde FE-05 (PR #44), a interface também separa: o diálogo de exclusão se
chama "Excluir esta reserva?", avisa que a reserva "será apagada do histórico"
e orienta a usar o cancelamento para manter o histórico
(`client/src/features/reservations/ReservationsPanel.jsx:50-66`). No código
recebido, a confirmação da exclusão pedia para "cancelar" a reserva.

---

### RN09 — Excluir um espaço não deve destruir o histórico de reservas

O registro de que uma sala foi usada em determinado horário é informação de
negócio e sobrevive à sala.

**Situação.** `não implementado`

**Evidência.** `server/src/config/initDb.js:16` continua declarando
`ON DELETE CASCADE`, e nenhuma migration troca para `RESTRICT`. Excluir um
recurso apaga todas as suas reservas, passadas e futuras. A resposta da API,
`{"message":"Recurso excluído com sucesso."}`
(`server/src/controllers/resourceController.js:13`), não diz quantas foram
junto.

FE-05 (PR #44) mitigou na interface: antes de excluir, busca as reservas no
servidor, mostra quantas serão apagadas e exige marcar a ciência da perda
(`client/src/features/resources/ResourcesPanel.jsx:15-26`,
`client/src/features/resources/CascadeDeleteDialog.jsx:35-73`). A perda
continua acontecendo; agora é avisada.

É o BUG-06, o único bug do catálogo que **perde dado de forma irrecuperável**.

**Trabalho na N2.** A troca por `RESTRICT` tem prefixo reservado em OPS-02 e é
pendência declarada em [`docs/arquitetura/der.md`](../arquitetura/der.md). Se
não entrar na N2, é débito de prioridade máxima no handoff da N3.

---

### RN10 — Toda reserva pertence a um espaço existente

**Situação.** `implementado`

**Evidência.** A API confere o espaço antes de gravar: `resource_id` ausente
responde `400` com `code: "MISSING_FIELDS"`, e espaço inexistente responde
`404` com `code: "RESOURCE_NOT_FOUND"`
(`server/src/services/reservationService.js:10-13`). Se a FK for violada por
outro caminho, o middleware central traduz o `23503` em `409`
(`server/src/errors/pgErrorCodes.js:4`).

**Ressalva.** O banco ainda aceita `resource_id NULL` (`initDb.js:16` não
declara `NOT NULL`, e nenhuma migration acrescenta). A regra vale para quem
passa pela API; por `psql`, não. É pendência declarada em
[`docs/arquitetura/der.md`](../arquitetura/der.md), sem spec.

**Corrigido na N2.** BE-04 e BE-05 (PR #41). Situação no código recebido:
`implementado com defeito (CS-02)`: espaço inexistente respondia `500`.

---

### RN11 — Os horários são os horários locais do coworking

O Operador digita e lê horários no fuso em que o coworking opera
(`America/Sao_Paulo`, UTC-03).

**Situação.** `implementado`

**Evidência.** As colunas são `TIMESTAMPTZ` (`server/src/config/initDb.js:18-19`
em banco novo; `server/migrations/0001_timestamptz.sql` em banco existente). A
API só aceita horário com offset (`server/src/utils/datetime.js:2-7`), e o
cliente envia o valor do campo convertido para ISO 8601 com o offset do
navegador (`client/src/lib/datetime.js:18-26`, chamado em
`client/src/services/api.js:37-38`). O instante gravado não depende mais da
variável `TZ` da máquina.

**Corrigido na N2.** BE-07 (PR #41) e FE-02 (PR #42). Situação no código
recebido: `implementado com defeito (BUG-07)`.

---

### RN12 — Toda reserva tem um responsável identificável

**Situação.** `documentado mas inexistente`

**Evidência.** A documentação recebida declara `UUID user_id`
(`Documentação Oficial SREC.md:94`) e afirma que `GET /api/reservations`
lista "as reservas do usuário atual" (`:116`). O que existe é
`user_name VARCHAR(100) NOT NULL` (`server/src/config/initDb.js:17`),
preenchido por digitação livre
(`client/src/features/reservations/ReservationForm.jsx:73-81`), sem tabela de
usuários, sem FK e sem unicidade. `findAll` não tem `WHERE`
(`server/src/models/reservationModel.js:16`): lista tudo, de todos.

"Responsável" no SREC é uma etiqueta de texto, não uma identidade. Duas
pessoas chamadas Carlos são a mesma string, e o sistema não as distingue.

**Decisão da N2.** Não implementar; corrigir a documentação e registrar como
débito da N3. Ver RF13 em [`docs/produto/requisitos.md`](requisitos.md).

---

### RN13 — Só o administrador gerencia os espaços

**Situação.** `documentado mas inexistente`

**Evidência.** `Documentação Oficial SREC.md:109` marca `POST /api/resources`
como "Nível de acesso Admin", e `:45` e `:52` amarram o CRUD de espaços ao
ator `admin`. No código, a cadeia de middlewares de `server/src/app.js:14-19`
tem `helmet`, CORS restrito e limite de requisições, mas nenhuma
autenticação; `server/src/routes/resourceRoutes.js:6-10` só valida o `:id`; e
`server/package.json:21-28` não traz nenhuma dependência de autenticação.
Qualquer cliente de origem permitida apaga um espaço e, por RN09, todas as
reservas dele.

**Decisão da N2.** Não implementar; corrigir a documentação e registrar como
débito da N3. Ver RF14.

---

### RN14 — Espaço inativo não pode ser reservado

**Situação.** `documentado mas inexistente`

**Evidência.** `Documentação Oficial SREC.md:88` declara
`BOOLEAN is_active` em `RESOURCE`. A coluna não existe
(`server/src/config/initDb.js:5-12`), nenhuma migration a cria, os models não
a leem nem escrevem (`server/src/models/resourceModel.js:6`, `:29`) e nenhuma
consulta a filtra.

A ausência tem custo direto: a única forma de tirar um espaço de circulação
é `DELETE`, que por RN09 destrói o histórico. **A falta de `is_active`
transforma uma inativação temporária em perda permanente de dado.**

**Decisão da N2.** Não implementar. O PR #41 manteve a exclusão física, e
FE-05 a cercou de aviso. Ver RF15.

---

### RN15 — A duração de uma reserva tem limites

Uma reserva de 5 minutos ou de 3 anos não serve ao negócio de coworking.

**Situação.** `não implementado`

**Evidência.** Não há nenhum limite em código, nem mínimo nem máximo:
`server/src/validators/reservationValidator.js:8-16` confere formato, ordem
e passado, mas não duração, e `server/src/config/initDb.js:18-19` não tem
`CHECK`. A documentação recebida também não menciona limites.

**Decisão de produto pendente.** Os valores de mínimo e máximo são decisão do
PO, não do engenheiro de requisitos. Até que existam, o `CHECK` de janela de
BE-02 implementa apenas RN05 (`end_time > start_time`), que é a parte
inquestionável. Levantar com `@igorSeberino`.

## Rastreabilidade regra → requisito → spec

| Regra | Situação hoje | Requisito | Spec da N2 |
|---|---|---|---|
| RN01 | implementado | RF01, RF04 | BE-09 (**corrigido**, PR #61) |
| RN02 | implementado | RF01, RF04 | BE-09 (**corrigido**, PR #61); FE-03 no cliente |
| RN03 | implementado com defeito (BUG-01) | RF06 | BE-01 (**corrigido** no código, PR #41); migrations na subida em OPS-02 |
| RN04 | implementado | RF06, RF09 | BE-03 fechou a ressalva |
| RN05 | implementado | RF06 | BE-02 (**corrigido**, PR #41) |
| RN06 | implementado | RF06 | BE-02, FE-03 (**corrigido**) |
| RN07 | implementado | RF09, RF19 | BE-03 (**corrigido**, PR #41) |
| RN08 | implementado | RF09, RF10 | FE-05 (texto da interface, PR #44) |
| RN09 | não implementado | RF05 | FE-05 (aviso); `RESTRICT` pendente |
| RN10 | implementado | RF06 | BE-04, BE-05 (**corrigido**); `NOT NULL` pendente |
| RN11 | implementado | RF06, RNF04 | BE-07, FE-02 (**corrigido**) |
| RN12 | documentado mas inexistente | RF13 | nenhuma (débito da N3) |
| RN13 | documentado mas inexistente | RF14 | nenhuma (débito da N3) |
| RN14 | documentado mas inexistente | RF15 | nenhuma (débito da N3) |
| RN15 | não implementado | RF06 | nenhuma (decisão de produto pendente) |

## Contagem

| Situação | Antes do backend da N2 (até o #40) | Hoje (`main`) |
|---|---|---|
| `implementado` | 2 | **7** |
| `implementado com defeito` | 6 | **3** |
| `não implementado` | 4 | **2** |
| `documentado mas inexistente` | 3 | **3** |
| **Total** | **15** | **15** |

A documentação recebida registrava **1** regra de negócio: a fórmula
anti-sobreposição (`Documentação Oficial SREC.md:67-75`). Atualize a coluna
"Hoje" no mesmo PR que mudar a situação de qualquer regra.
