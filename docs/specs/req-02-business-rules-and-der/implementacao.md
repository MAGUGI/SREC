# REQ-02 — Regras de negócio e DER corrigido

* **Responsável:** Diego Nessler (`@Diegonessler`, Engenheiro de Requisitos)
* **Issue:** #<a definir>
* **Branch:** `docs/business-rules-and-der`
* **Rubrica:** 3,0 — Processo, Git & Documentação (item de 1,5 — **atualização dos diagramas**/README e clareza das alterações para a N3); 3,0 — Pitch da solução (os dois DERs lado a lado são o material visual que sustenta a defesa técnica)
* **Depende de:** REQ-01 (vocabulário do campo `Situação` e inventário de requisitos). Consome o schema alvo definido por BE-01, BE-02, BE-03 e BE-07 — sem bloquear: se alguma dessas specs mudar de escopo, o DER alvo é atualizado no mesmo PR que a mudar.

## Problema

São dois problemas distintos no mesmo arquivo recebido.

### Problema 1 — o MER documentado descreve um banco que não existe

`Documentação Oficial SREC.md:79-100` traz este `erDiagram`:

```mermaid
erDiagram
    RESOURCE ||--o{ RESERVATION : "possui"

    RESOURCE {
        UUID id PK
        VARCHAR name
        VARCHAR type "Workstation, MeetingRoom"
        INT capacity
        BOOLEAN is_active
    }

    RESERVATION {
        UUID id PK
        UUID resource_id FK
        UUID user_id
        TIMESTAMP start_time
        TIMESTAMP end_time
        VARCHAR status "Scheduled, Completed, Canceled"
    }
```

Confrontado com `server/src/config/initDb.js:4-24`, o diagrama erra em **cinco**
pontos de cada entidade:

| Elemento | MER documentado | Schema real | Evidência |
|---|---|---|---|
| `resources.id` | `UUID` | `SERIAL` (inteiro sequencial) | `initDb.js:6` |
| `resources.is_active` | `BOOLEAN` | **a coluna não existe** | `initDb.js:5-12` |
| `resources.created_at`/`updated_at` | ausentes do diagrama | existem, `TIMESTAMP DEFAULT CURRENT_TIMESTAMP` | `initDb.js:10-11` |
| `reservations.id` | `UUID` | `SERIAL` | `initDb.js:15` |
| `reservations.resource_id` | `UUID FK` | `INTEGER REFERENCES resources(id) ON DELETE CASCADE`, **sem `NOT NULL`** | `initDb.js:16` |
| `reservations.user_id` | `UUID` | **não existe**; existe `user_name VARCHAR(100) NOT NULL` | `initDb.js:17` |
| `reservations.created_at`/`updated_at` | ausentes do diagrama | existem | `initDb.js:21-22` |
| Constraints | sugeridas por anotação de texto | **zero** `CHECK`, **zero** `UNIQUE`, **zero** `EXCLUDE`, **zero** índice além das PKs | `initDb.js:4-24` |
| `ON DELETE` | não mencionado | `CASCADE` — apagar recurso apaga as reservas | `initDb.js:16` |

Nenhuma das anotações entre aspas do diagrama (`"Workstation, MeetingRoom"`,
`"Scheduled, Completed, Canceled"`) corresponde a constraint: no código elas são
**comentários SQL** (`initDb.js:8` e `:20`), que o banco ignora. O valor real
gravado é `'workstation'`/`'meeting_room'` em minúsculo com sublinhado
(`client/src/App.jsx:180-181`) e `'scheduled'`/`'cancelled'`/`'completed'`
(`App.jsx:317`, `:324`, `initDb.js:20`) — note `cancelled` com dois `l`, contra
`Canceled` com um no diagrama. Quem programar contra o diagrama escreve o status
errado.

### Problema 2 — as regras de negócio não estão escritas em lugar nenhum

A única regra de negócio registrada é a fórmula anti-sobreposição
(`Documentação Oficial SREC.md:67-75`) e o ciclo de vida em uma linha
(`:31-32`: `Agendado -> Concluído ou Cancelado`). Tudo o mais que o código
decide — capacidade mínima, tipos permitidos, o que acontece com o histórico ao
excluir um recurso, se reserva no passado vale, se reserva cancelada libera o
horário — está implícito no código, ou implícito na ausência dele.

Isso bloqueia a rubrica: "melhoria comprovada do código recebido" exige dizer
qual regra estava quebrada. Hoje não há lista de regras.

## Evidência

### A fórmula anti-sobreposição confere — e é o único acerto

A doc declara (`Documentação Oficial SREC.md:72`):

```text
Início_banco < Fim_novo AND Fim_banco > Início_novo
```

O código implementa (`server/src/models/reservationModel.js:50-58`):

```sql
SELECT id FROM reservations
WHERE resource_id = $1
AND status != 'cancelled'
AND (
  (start_time < $3 AND end_time > $2)
)
LIMIT 1;
```

Com `$2 = start_time` novo e `$3 = end_time` novo
(`reservationModel.js:59`), `start_time < $3` é `Início_banco < Fim_novo` e
`end_time > $2` é `Fim_banco > Início_novo`. **Idêntico.** Este é o único ponto
em que documentação e código concordam, e vale dizer isso em voz alta no pitch:
o defeito não está na regra, está em executá-la como `SELECT` isolado, fora de
transação e sem constraint de respaldo (BUG-01).

### Dois buracos que só o schema real revela

1. **`resource_id` aceita `NULL`.** `initDb.js:16` declara
   `resource_id INTEGER REFERENCES resources(id) ON DELETE CASCADE` — sem
   `NOT NULL`. Um `INSERT` direto por `psql` com `resource_id NULL` é aceito.
   Hoje a API barra por acidente, porque `!resource_id` é verdadeiro para
   `null` em `server/src/controllers/reservationController.js:7`. A integridade
   referencial da entidade central depende de uma checagem de *truthiness* em
   JavaScript.

2. **`status` aceita `NULL`, e `NULL` esconde a reserva da regra central.**
   `initDb.js:20` declara `status VARCHAR(20) DEFAULT 'scheduled'` — `DEFAULT`
   não é `NOT NULL`. `PATCH /api/reservations/1/status` com corpo `{}` faz
   `req.body.status` ser `undefined` (`reservationController.js:63`), o driver
   `pg` converte em `NULL`, e `UPDATE ... SET status = NULL`
   (`reservationModel.js:35`) passa. Daí em diante, em
   `reservationModel.js:53`, `NULL != 'cancelled'` avalia para `NULL`, que não
   satisfaz o `WHERE`: **a reserva deixa de bloquear qualquer horário**. Um
   `PATCH` com corpo vazio desarma a regra de negócio central para aquela
   reserva. BUG-03 é mais grave do que "aceita qualquer string".

### Contagem de integridade, para a tabela de antes/depois

```bash
# constraints de verificação e exclusão no schema recebido
grep -cE "CHECK|UNIQUE|EXCLUDE" server/src/config/initDb.js   # → 0
# índices declarados
grep -ci "CREATE INDEX" server/src/config/initDb.js           # → 0
# NOT NULL declarados
grep -co "NOT NULL" server/src/config/initDb.js               # → 5
```

Resultado: **0** constraints de domínio, **0** índices além das 2 PKs, **5**
`NOT NULL` (`resources.name`, `resources.type`, `resources.capacity`,
`reservations.user_name`, `reservations.start_time`, `reservations.end_time` —
seis declarações em cinco linhas do `grep`, conferir na leitura).

### Por que editar `initDb.js` não resolve

`server/src/config/initDb.js:5` e `:14` usam
`CREATE TABLE IF NOT EXISTS`. Em qualquer banco que já tenha as tabelas — isto
é, em todo ambiente que já rodou o sistema uma vez — **acrescentar constraint
editando esse arquivo não tem efeito algum**. O schema alvo desta spec só
existe se BE-01/BE-02/BE-03/BE-07 vierem como migrations `ALTER TABLE`. O DER
alvo registra isso explicitamente, para que ninguém leia o diagrama e assuma
que basta mexer no `initDb.js`.

## Decisão

1. **Dois documentos, não um.** `docs/produto/overview.md` guarda visão de
   produto e regras de negócio (linguagem de negócio, lida pelo PO);
   `docs/arquitetura/der.md` guarda os diagramas e o mapeamento físico (lido
   por quem mexe em SQL). A alternativa — um "documento de modelagem" único —
   foi rejeitada porque é exatamente o pecado do arquivo recebido, que mistura
   requisito, API, DevOps e guia de contribuição em 159 linhas.

2. **Dois `erDiagram`, não um "DER corrigido".** A tentação é entregar só o
   diagrama certo. Rejeitada por dois motivos. Primeiro, honestidade de
   manutenção: o grupo da N3 vai abrir um banco que pode estar em qualquer dos
   dois estados, e precisa saber distinguir. Segundo, valor de pitch: a rubrica
   pede defesa **com dados** das melhorias. Dois diagramas lado a lado, um com
   zero constraints e outro com as constraints nomeadas, é a prova visual mais
   direta disponível — não precisa de narração.

3. **`ON DELETE CASCADE` permanece no DER alvo, marcado como pendência.**
   BUG-06 (excluir recurso apaga as reservas) não está em nenhuma das specs de
   backend cujo escopo foi fixado (BE-01 `EXCLUDE`, BE-02 `CHECK` de janela,
   BE-03 `CHECK` de status, BE-07 `TIMESTAMPTZ`). Não vamos desenhar
   `ON DELETE RESTRICT` em um diagrama de "estado alvo" se nenhuma spec se
   comprometeu a entregá-lo — diagrama que promete o que ninguém vai fazer é
   como a documentação que estamos consertando. A pendência fica em subseção
   própria, com a regra de que quem implementar atualiza o diagrama no mesmo
   PR.

4. **Não migrar `SERIAL` para `UUID`.** A divergência D01 é resolvida
   **corrigindo a documentação**. Migrar as PKs quebraria as URLs dos 6
   endpoints com `:id`, o `resource_id` que o cliente guarda em
   `client/src/App.jsx:27` e `:44`, e exigiria reescrever os dois models — tudo
   isso por zero benefício para o usuário e zero ponto de rubrica. `SERIAL`
   expõe cardinalidade e é previsível; isso é débito real, registrado no
   handoff, e só faz sentido pagar junto com a entrada de autenticação (RF13),
   na N3.

5. **Vocabulário de status e tipo fixado em minúsculo com sublinhado.** O
   código grava `'workstation'`, `'meeting_room'`, `'scheduled'`,
   `'cancelled'`, `'completed'` (`initDb.js:8`, `:20`,
   `client/src/App.jsx:180-181`, `:317`, `:324`). O diagrama documentado usa
   `Workstation`, `MeetingRoom`, `Scheduled`, `Completed`, **`Canceled`**. Vence
   o código, inclusive o `cancelled` com dois `l`. O `CHECK` de BE-03 tem de
   usar a grafia do código, ou invalida todas as linhas já gravadas.

6. **Cada regra de negócio carrega `Situação`**, com o mesmo vocabulário
   fechado de REQ-01. Motivo idêntico: regra que o sistema não aplica é débito
   declarado, não regra.

7. **A tabela das 12 divergências vive em `docs/arquitetura/der.md`**, e não em
   `docs/auditoria/`. É lá que o leitor chega procurando "o diagrama está
   errado?", e a convenção da N2 é uma casa canônica por assunto, com link e
   não cópia. O relatório de auditoria linka para cá.

## Alterações

### Arquivos a criar

| Arquivo | Conteúdo |
|---|---|
| `docs/produto/overview.md` | visão do produto e 15 regras de negócio RN01..RN15, cada uma com `Situação` |
| `docs/arquitetura/der.md` | DER real, DER alvo, mapeamento físico e tabela das 12 divergências |

### Arquivos a alterar

| Arquivo | O que muda |
|---|---|
| `README.md` | linkar os dois documentos novos (o trecho da seção "Documentação" já previsto em REQ-01 contempla ambos) |

### Arquivos preservados

* `Documentação Oficial SREC.md` — **não editar**, por decisão registrada em
  REQ-01.

---

### `docs/produto/overview.md` — documento completo

````markdown
# SREC — visão do produto e regras de negócio

O SREC (Sistema de Reserva de Espaços e Coworking) resolve um problema de
alocação exclusiva: em um coworking, dois ocupantes não podem usar a mesma
estação de trabalho nem a mesma sala de reunião no mesmo intervalo de tempo.
O sistema substitui a planilha compartilhada por um cadastro de espaços e um
registro de reservas que recusa sobreposições.

Este documento descreve o produto **como ele existe hoje**, após o recebimento
do código na N2. Onde a documentação do grupo anterior
(`Documentação Oficial SREC.md`) divergir, o código vence; as divergências
estão catalogadas em `docs/arquitetura/der.md`.

## O que o sistema entrega

| Capacidade | Onde | Estado |
|---|---|---|
| Cadastro de espaços com nome, tipo e capacidade | `client/src/App.jsx:161-198`, `POST /api/resources` | funciona, com defeito em capacidade (RF01) |
| Listagem de espaços | `client/src/App.jsx:201-226`, `GET /api/resources` | funciona (RF02) |
| Exclusão de espaço | `client/src/App.jsx:216-222`, `DELETE /api/resources/:id` | funciona, mas apaga o histórico de reservas (RF05) |
| Criação de reserva com recusa de sobreposição | `client/src/App.jsx:234-284`, `POST /api/reservations` | funciona em uso sequencial; falha sob concorrência (RF06) |
| Listagem de reservas em ordem cronológica | `client/src/App.jsx:287-343`, `GET /api/reservations` | funciona (RF07) |
| Concluir ou cancelar reserva | `client/src/App.jsx:311-328`, `PATCH /api/reservations/:id/status` | funciona pela interface; a API aceita qualquer valor (RF09, RF19) |
| Exclusão definitiva de reserva | `client/src/App.jsx:331-337`, `DELETE /api/reservations/:id` | funciona (RF10) |

## O que o sistema não entrega

Quatro capacidades que a documentação recebida afirma existir e que **não têm
uma linha de código**: controle de acesso de administrador (RF14), usuário
identificado dono da reserva (RF13), ativação/inativação de espaço via
`is_active` (RF15) e a rota `PUT /api/reservations/{id}/cancel` (RF11).
Detalhamento e decisão em `docs/produto/requisitos.md`.

Consequência de produto a ter clara: **o SREC é hoje um sistema de uso
confiado.** Qualquer pessoa com acesso à URL cadastra, altera e exclui
qualquer coisa, e o campo "Nome do Responsável"
(`client/src/App.jsx:251-259`) é texto livre sem verificação. Isso é
aceitável em um coworking pequeno com acesso restrito à rede interna, e
inaceitável em qualquer exposição pública. Não é bug; é o perímetro de uso do
produto, e precisa estar escrito.

## Atores

Um só: o **Operador** — qualquer pessoa com acesso à aplicação, com poder
total. `Administrador` e `Usuário identificado` existem apenas na
documentação recebida. Ver a seção "Atores" de `docs/produto/requisitos.md`.

## Regras de negócio

Mesma convenção de `Situação` dos requisitos: `implementado`,
`implementado com defeito (BUG-nn)`, `documentado mas inexistente`,
`não implementado`.

---

### RN01 — Um espaço é estação de trabalho ou sala de reunião

Todo espaço pertence a exatamente um de dois tipos: `workstation` (foco
individual, capacidade unitária) ou `meeting_room` (foco colaborativo,
capacidade em grupo). A distinção vem da própria definição do produto
(`Documentação Oficial SREC.md:9-11`).

**Situação.** `implementado com defeito (BUG-10)`

**Evidência.** A interface oferece só os dois valores corretos, em um
`<select>` (`client/src/App.jsx:175-182`). Mas a API aceita qualquer string:
`server/src/controllers/resourceController.js:7` só verifica presença
(`if (!name || !type)`) e `server/src/config/initDb.js:8` declara
`type VARCHAR(50) NOT NULL` com os valores válidos apenas em **comentário
SQL**, que o banco ignora. `POST /api/resources` com `{"type":"banana"}`
responde `201`.

O efeito vaza para a interface: `client/src/App.jsx:212` renderiza
`res.type === 'meeting_room' ? 'Sala de Reunião' : 'Estação de Trabalho'`.
Um espaço com `type: 'banana'` aparece ao Operador como "Estação de
Trabalho". O dado inválido não fica visível; fica disfarçado.

**Trabalho na N2.** BE-02 — `CHECK (type IN ('workstation','meeting_room'))`
e validação no controller.

---

### RN02 — A capacidade de um espaço é pelo menos uma pessoa

Espaço com capacidade zero ou negativa não representa nada no mundo físico.

**Situação.** `implementado com defeito (BUG-09)`

**Evidência.** `server/src/controllers/resourceController.js:10` passa
`capacity || 1`. Em JavaScript, `0 || 1 === 1`: enviar `capacity: 0` grava
**1**, responde `201` e o Operador nunca sabe que o valor foi trocado.
Enviar `capacity: -5` grava `-5`, porque `-5` é *truthy* e
`server/src/config/initDb.js:9` não tem `CHECK`. O cliente mitiga com
`min="1"` no `<input type="number">` (`client/src/App.jsx:186-193`), que é
validação de navegador e não protege a API.

Duas falhas opostas no mesmo parâmetro: um valor inválido é silenciosamente
corrigido, outro é silenciosamente aceito. Nenhum dos dois devolve erro.

**Trabalho na N2.** BE-02 — `CHECK (capacity >= 1)` e validação explícita,
substituindo o `||`.

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

**Evidência.** A fórmula está correta e implementada em
`server/src/models/reservationModel.js:55` —
`(start_time < $3 AND end_time > $2)`, com `$2` = início novo e `$3` = fim
novo (`reservationModel.js:59`). Confere literalmente com
`Documentação Oficial SREC.md:72`. Tem teste unitário
(`server/src/models/reservationModel.test.js:11-37`).

O defeito é de execução, não de lógica:
`server/src/controllers/reservationController.js:12-16` **lê** a
disponibilidade e `:23-28` **escreve** a reserva, sem transação, sem
`SELECT ... FOR UPDATE` e sem constraint de respaldo no banco
(`initDb.js:14-23` não tem `EXCLUDE`). Entre a leitura e a escrita há uma
janela em que outra requisição lê o mesmo "disponível". Duas requisições
simultâneas para o mesmo intervalo recebem `201` as duas.

Dois caminhos adicionais furam esta regra:
* reserva com `end_time < start_time` (RN05) define intervalo vazio, que
  nunca satisfaz a fórmula — logo nunca colide com nada;
* reserva com `status NULL` (RN07) é invisível ao `WHERE status != 'cancelled'`
  de `reservationModel.js:53`, porque `NULL != 'cancelled'` avalia para
  `NULL`.

**Trabalho na N2.** BE-01 — constraint `EXCLUDE` no banco mais escrita em
transação. A constraint é o que torna a regra inviolável por qualquer
caminho, inclusive `psql`.

---

### RN04 — Reserva cancelada libera o horário

Cancelar uma reserva devolve o intervalo ao pool de disponibilidade.

**Situação.** `implementado`

**Evidência.** `server/src/models/reservationModel.js:53` filtra
`status != 'cancelled'` na verificação de disponibilidade. Reserva
`cancelled` não bloqueia novas reservas no mesmo intervalo. Esta regra está
correta no código.

**Ressalva.** Depende de `status` ser sempre um dos três valores válidos. Com
`status NULL` (ver RN07), o comportamento inverte de forma perigosa: a
reserva não é `cancelled`, mas também não bloqueia. A regra só é sólida
depois de BE-03.

---

### RN05 — O fim de uma reserva é posterior ao seu início

Uma reserva ocupa um intervalo de tempo com duração positiva.

**Situação.** `não implementado`

**Evidência.** Nem no código nem na documentação recebida esta regra aparece.
`server/src/controllers/reservationController.js:7` verifica apenas presença
dos quatro campos; não há comparação entre `start_time` e `end_time` em
nenhum ponto dos 90 linhas do controller.
`server/src/config/initDb.js:18-19` declara as duas colunas `NOT NULL` e
nada mais.

É BUG-02, e o agravante é o encadeamento com RN03: o intervalo invertido é
vazio, logo `start_time < fim_novo AND end_time > início_novo` nunca é
satisfeito por ele. A reserva corrompida **não aparece** nas verificações de
disponibilidade de ninguém. Dado inválido que também é dado invisível.

**Trabalho na N2.** BE-02 — `CHECK (end_time > start_time)` e validação no
controller devolvendo `400`.

---

### RN06 — Uma reserva não pode ser criada para o passado

Reservar um horário que já passou não tem significado operacional: o espaço
já foi ou não foi usado.

**Situação.** `não implementado`

**Evidência.** Não há nenhuma comparação com `NOW()`, `CURRENT_TIMESTAMP` ou
`Date.now()` em `server/src/controllers/reservationController.js`. O
`<input type="datetime-local">` do cliente
(`client/src/App.jsx:263-269`) não tem atributo `min`. É BUG-08.

**Decisão de produto pendente.** Antes de implementar, decidir se a regra
veta a criação (não se reserva o passado) ou veta apenas o início no passado
com fim no futuro (reserva começando "agora" com alguns minutos de atraso de
digitação). Hoje nada é vetado, e qualquer dos dois comportamentos é uma
melhoria. Priorizar junto com `@igorSeberino` no papel de PO.

---

### RN07 — Uma reserva nasce agendada e pode ser concluída ou cancelada

Ciclo de vida: `scheduled → completed` ou `scheduled → cancelled`. Estado
final não transiciona. A documentação recebida descreve o mesmo ciclo
(`Documentação Oficial SREC.md:32`: `Agendado -> Concluído ou Cancelado`).

**Situação.** `implementado com defeito (BUG-03)`

**Evidência.** O nascimento está correto:
`server/src/models/reservationModel.js:6` insere sem `status`, e
`server/src/config/initDb.js:20` aplica `DEFAULT 'scheduled'`.

A interface respeita o ciclo: os botões de concluir e cancelar só são
renderizados quando `rev.status === 'scheduled'`
(`client/src/App.jsx:309`), e enviam exatamente `'completed'` (`:317`) e
`'cancelled'` (`:324`).

A API não respeita nada. `server/src/controllers/reservationController.js:60-73`
repassa `req.body.status` direto para o `UPDATE`
(`reservationModel.js:32-41`) sem verificar valor nem transição:

* `{"status":"banana"}` → grava `banana`, responde `200`. Não há `CHECK` em
  `initDb.js:20`.
* `{"status":"scheduled"}` em reserva já `completed` → aceita a volta a um
  estado anterior.
* corpo `{}` → `req.body.status` é `undefined`, o driver `pg` converte em
  `NULL`, `status VARCHAR(20) DEFAULT 'scheduled'` não é `NOT NULL`, e a
  coluna fica nula. A partir daí a reserva **desaparece de RN03**: em
  `reservationModel.js:53`, `NULL != 'cancelled'` avalia para `NULL` e a
  linha não entra no resultado. Um `PATCH` com corpo vazio desarma a regra
  central do produto para aquela reserva.

A proteção do ciclo de vida existe apenas na camada que o usuário vê.

**Trabalho na N2.** BE-03 — `CHECK (status IN ('scheduled','completed','cancelled'))`,
`NOT NULL`, validação no controller com `400`, e verificação de transição
válida com `409`.

---

### RN08 — Cancelar e excluir são ações diferentes

Cancelar muda o status e preserva o registro para histórico. Excluir remove
o registro. São intenções distintas e não devem ser confundidas.

**Situação.** `implementado com defeito (BUG-03)`

**Evidência.** Os dois caminhos existem e funcionam:
`PATCH /api/reservations/:id/status` com `cancelled`
(`server/src/routes/reservationRoutes.js:8`) preserva a linha;
`DELETE /api/reservations/:id` (`:9`) executa
`DELETE FROM reservations WHERE id = $1` (`reservationModel.js:44`).

O problema é de linguagem, e ele confunde o Operador. No mesmo botão de
exclusão, em `client/src/App.jsx`:

* linha `117` — o `window.confirm` diz "Deseja **cancelar** esta reserva
  permanentemente?";
* linha `334` — o `title` do botão diz "Excluir Definitivamente";
* linha `120` — o feedback de sucesso diz "Reserva removida!".

Três vocabulários para uma ação, e um deles é a palavra reservada para a
**outra** ação. Um Operador que queira cancelar tende a clicar no botão de
lixeira, porque o texto de confirmação fala de cancelamento, e perde o
histórico.

**Trabalho na N2.** FE-01 — unificar o vocabulário da interface. A regra de
negócio não muda.

---

### RN09 — Excluir um espaço não deve destruir o histórico de reservas

O registro de que uma sala foi usada em determinado horário é informação de
negócio e sobrevive à sala.

**Situação.** `não implementado`

**Evidência.** `server/src/config/initDb.js:16` declara
`resource_id INTEGER REFERENCES resources(id) ON DELETE CASCADE`. Excluir um
recurso apaga, no mesmo comando e em silêncio, **todas** as suas reservas,
passadas e futuras. O `window.confirm` em `client/src/App.jsx:77` — "Deseja
realmente remover este espaço?" — não menciona a perda, e a resposta da API
é `{"message":"Resource deleted successfully"}`
(`server/src/controllers/resourceController.js:64`), sem contagem do que foi
destruído.

É BUG-06. É o único bug do catálogo que **perde dado de forma
irrecuperável** por uma operação de um clique.

**Trabalho na N2.** correção catalogada como BUG-06 no escopo de backend;
confirmar com `@adrian-cesar` qual spec entre BE-05, BE-06 e BE-08 a absorve.
Alvo técnico: `ON DELETE RESTRICT` e resposta `409` com a contagem de
reservas vinculadas. Se não entrar na N2, consta como débito de prioridade
máxima em `docs/handoff/n3.md`.

---

### RN10 — Toda reserva pertence a um espaço existente

**Situação.** `implementado com defeito (BUG-04)`

**Evidência.** A chave estrangeira existe (`initDb.js:16`,
`REFERENCES resources(id)`) e garante que `resource_id` não aponte para
recurso inexistente. Dois furos:

1. **A coluna aceita `NULL`.** `initDb.js:16` não declara `NOT NULL`. Um
   `INSERT` por `psql` com `resource_id NULL` é aceito pelo banco. A API
   barra por acidente: `!resource_id` é verdadeiro para `null`
   (`reservationController.js:7`). A integridade referencial depende de uma
   checagem de *truthiness* no JavaScript.
2. **`resource_id` inexistente devolve `500`.**
   `POST /api/reservations` com `resource_id: 99999` viola a FK; o Postgres
   levanta `23503 foreign key violation`; o `catch` de
   `reservationController.js:30-33` transforma em
   `{"error":"Internal server error"}`. O Operador recebe "erro do servidor"
   quando o erro é dele. Mesmo padrão de BUG-04.

**Trabalho na N2.** BE-02 (`NOT NULL`) e BE-04 (mapear violação de FK para
`400`/`404` com mensagem útil).

---

### RN11 — Os horários são os horários locais do coworking

O Operador digita e lê horários no fuso em que o coworking opera
(`America/Sao_Paulo`, UTC-03).

**Situação.** `implementado com defeito (BUG-07)`

**Evidência.** `server/src/config/initDb.js:18-19` usa `TIMESTAMP` sem
`WITH TIME ZONE`: o Postgres guarda os dígitos e **descarta** qualquer
offset recebido. O cliente envia string sem offset, produzida por
`<input type="datetime-local">` (`client/src/App.jsx:263-269`, enviada em
`:93-94`), e na leitura aplica
`new Date(rev.start_time).toLocaleString('pt-BR')` (`:303-304`), que
reinterpreta o valor. O horário exibido difere do digitado.

O critério decisivo do teste: hoje o resultado **muda** se o processo Node
subir com `TZ=UTC`. Comportamento de negócio que depende da variável de
ambiente da máquina não é comportamento; é acidente.

**Trabalho na N2.** BE-07 (`TIMESTAMPTZ`) e FE-02 (enviar com offset
explícito).

---

### RN12 — Toda reserva tem um responsável identificável

**Situação.** `documentado mas inexistente`

**Evidência.** A documentação recebida declara `UUID user_id`
(`Documentação Oficial SREC.md:94`) e afirma que `GET /api/reservations`
lista "as reservas do usuário atual" (`:116`). O que existe é
`user_name VARCHAR(100) NOT NULL` (`initDb.js:17`), preenchido por digitação
livre (`client/src/App.jsx:252-259`), sem tabela de usuários, sem FK e sem
unicidade. `findAll` não tem `WHERE` (`reservationModel.js:15`): lista tudo,
de todos.

"Responsável" no SREC é uma etiqueta de texto, não uma identidade. Duas
pessoas chamadas Carlos são a mesma string e pessoas distintas, e o sistema
não distingue.

**Decisão da N2.** não implementar; corrigir a documentação e registrar como
débito da N3. Ver RF13 em `docs/produto/requisitos.md`.

---

### RN13 — Só o administrador gerencia os espaços

**Situação.** `documentado mas inexistente`

**Evidência.** `Documentação Oficial SREC.md:109` marca `POST /api/resources`
como "Nível de acesso Admin" e `:45`/`:52` amarram o CRUD de espaços ao ator
`admin`. No código: `server/src/index.js:12-18` registra apenas `cors()` e
`express.json()`; `server/src/routes/resourceRoutes.js:5-9` não tem
middleware; `server/package.json:18-23` não traz nenhuma dependência de
autenticação. `curl -X DELETE http://localhost:5000/api/resources/1` apaga um
espaço — e, por RN09, todas as reservas dele.

**Decisão da N2.** não implementar; corrigir a documentação e registrar como
débito da N3. Ver RF14.

---

### RN14 — Espaço inativo não pode ser reservado

**Situação.** `documentado mas inexistente`

**Evidência.** `Documentação Oficial SREC.md:88` declara
`BOOLEAN is_active` em `RESOURCE`. A coluna não existe
(`server/src/config/initDb.js:5-12`), os models não a leem nem escrevem
(`resourceModel.js:6`, `:29`) e nenhuma consulta a filtra.

A ausência tem custo direto: a única forma de tirar um espaço de circulação
é `DELETE`, que por RN09 destrói o histórico. **A falta de `is_active`
transforma uma inativação temporária em perda permanente de dado.**

**Decisão da N2.** não implementar; corrigir a documentação e registrar como
a evolução de melhor relação custo-benefício para a N3. Ver RF15.

---

### RN15 — A duração de uma reserva tem limites

Uma reserva de 5 minutos ou de 3 anos não serve ao negócio de coworking.

**Situação.** `não implementado`

**Evidência.** Não há nenhum limite em código, nem mínimo nem máximo:
`server/src/controllers/reservationController.js:4-34` não compara duração, e
`server/src/config/initDb.js:18-19` não tem `CHECK`. A documentação recebida
também não menciona limites.

**Decisão de produto pendente.** Os valores de mínimo e máximo são decisão do
PO, não do engenheiro de requisitos. Até que existam, o `CHECK` de janela de
BE-02 implementa apenas RN05 (`end_time > start_time`), que é a parte
inquestionável. Levantar com `@igorSeberino`.

## Rastreabilidade regra → requisito → spec

| Regra | Situação | Requisito | Spec da N2 |
|---|---|---|---|
| RN01 | implementado com defeito (BUG-10) | RF01 | BE-02 |
| RN02 | implementado com defeito (BUG-09) | RF01 | BE-02 |
| RN03 | implementado com defeito (BUG-01) | RF06 | BE-01 |
| RN04 | implementado | RF06, RF09 | — (sólida após BE-03) |
| RN05 | não implementado | RF06 | BE-02 |
| RN06 | não implementado | RF06 | nenhum (decisão de produto pendente) |
| RN07 | implementado com defeito (BUG-03) | RF09, RF19 | BE-03 |
| RN08 | implementado com defeito (BUG-03) | RF09, RF10 | FE-01 |
| RN09 | não implementado | RF05 | backend (BUG-06) |
| RN10 | implementado com defeito (BUG-04) | RF06 | BE-02, BE-04 |
| RN11 | implementado com defeito (BUG-07) | RF06, RNF04 | BE-07, FE-02 |
| RN12 | documentado mas inexistente | RF13 | nenhum (débito da N3) |
| RN13 | documentado mas inexistente | RF14 | nenhum (débito da N3) |
| RN14 | documentado mas inexistente | RF15 | nenhum (débito da N3) |
| RN15 | não implementado | RF06 | nenhum (decisão de produto pendente) |

**Leitura.** De 15 regras de negócio, **1** está integralmente implementada
(RN04, e mesmo ela depende de BE-03 para ser sólida), **6** estão
implementadas com defeito catalogado, **5** não existem e **3** existem
apenas na documentação recebida.
````

---

### `docs/arquitetura/der.md` — documento completo

````markdown
# DER do SREC — real e alvo

Dois diagramas. O primeiro é o banco que recebemos; o segundo é o banco ao
final da N2. A diferença entre eles é a entrega de integridade desta entrega.

Fonte de verdade do diagrama real: `server/src/config/initDb.js:4-24`. Fonte
de verdade do diagrama alvo: as migrations de BE-01, BE-02, BE-03 e BE-07.

## 1. DER real — o schema como ele é hoje

```mermaid
erDiagram
    resources ||--o{ reservations : "possui (ON DELETE CASCADE)"

    resources {
        SERIAL id PK "sequencial, nao UUID"
        VARCHAR_100 name "NOT NULL"
        VARCHAR_50 type "NOT NULL, sem CHECK: aceita qualquer string"
        INTEGER capacity "NOT NULL DEFAULT 1, sem CHECK: aceita 0 e negativo"
        TIMESTAMP created_at "DEFAULT CURRENT_TIMESTAMP, sem fuso"
        TIMESTAMP updated_at "DEFAULT CURRENT_TIMESTAMP, sem fuso"
    }

    reservations {
        SERIAL id PK "sequencial, nao UUID"
        INTEGER resource_id FK "NULLABLE, ON DELETE CASCADE"
        VARCHAR_100 user_name "NOT NULL, texto livre, nao e user_id"
        TIMESTAMP start_time "NOT NULL, sem fuso"
        TIMESTAMP end_time "NOT NULL, sem fuso, pode ser menor que start_time"
        VARCHAR_20 status "DEFAULT scheduled, NULLABLE, sem CHECK"
        TIMESTAMP created_at "DEFAULT CURRENT_TIMESTAMP"
        TIMESTAMP updated_at "DEFAULT CURRENT_TIMESTAMP"
    }
```

O que **não** aparece no diagrama porque não existe no banco:

* nenhum `CHECK` — os valores válidos de `type` e `status` estão em
  **comentário SQL** (`initDb.js:8`, `:20`), que o banco ignora;
* nenhum `UNIQUE`;
* nenhum `EXCLUDE` — a regra anti-sobreposição (RN03) vive só como `SELECT`
  em `server/src/models/reservationModel.js:49-61`;
* nenhum índice além das duas chaves primárias, embora **toda** consulta de
  reserva filtre ou ordene por `resource_id` e `start_time`
  (`reservationModel.js:15`, `:27`, `:52-56`);
* nenhuma coluna `is_active`;
* nenhuma coluna `user_id` e nenhuma tabela de usuários.

Verificação, qualquer momento:

```bash
grep -cE "CHECK|UNIQUE|EXCLUDE" server/src/config/initDb.js   # 0
grep -ci "CREATE INDEX" server/src/config/initDb.js           # 0
```

## 2. DER alvo — o schema ao final da N2

```mermaid
erDiagram
    resources ||--o{ reservations : "possui (ON DELETE CASCADE, ver pendencia)"

    resources {
        SERIAL id PK ""
        VARCHAR_100 name "NOT NULL"
        VARCHAR_50 type "NOT NULL + CHECK IN (workstation, meeting_room) [BE-02]"
        INTEGER capacity "NOT NULL DEFAULT 1 + CHECK capacity >= 1 [BE-02]"
        TIMESTAMPTZ created_at "NOT NULL DEFAULT now() [BE-07]"
        TIMESTAMPTZ updated_at "NOT NULL DEFAULT now() [BE-07]"
    }

    reservations {
        SERIAL id PK ""
        INTEGER resource_id FK "NOT NULL [BE-02], indexado [BE-01]"
        VARCHAR_100 user_name "NOT NULL"
        TIMESTAMPTZ start_time "NOT NULL [BE-07]"
        TIMESTAMPTZ end_time "NOT NULL + CHECK end_time > start_time [BE-02]"
        VARCHAR_20 status "NOT NULL DEFAULT scheduled + CHECK IN (scheduled, completed, cancelled) [BE-03]"
        TIMESTAMPTZ created_at "NOT NULL DEFAULT now() [BE-07]"
        TIMESTAMPTZ updated_at "NOT NULL DEFAULT now() [BE-07]"
    }
```

Constraints e índices que o diagrama não consegue desenhar, por serem de
tabela e não de coluna:

```sql
-- BE-01 — a regra RN03 passa a ser inviolável, por qualquer caminho
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE reservations
  ADD CONSTRAINT reservations_no_overlap
  EXCLUDE USING gist (
    resource_id WITH =,
    tstzrange(start_time, end_time) WITH &&
  ) WHERE (status <> 'cancelled');

-- BE-02 — janela valida e dominio de tipo e capacidade
ALTER TABLE reservations
  ADD CONSTRAINT reservations_valid_window CHECK (end_time > start_time);
ALTER TABLE reservations ALTER COLUMN resource_id SET NOT NULL;
ALTER TABLE resources
  ADD CONSTRAINT resources_valid_type CHECK (type IN ('workstation', 'meeting_room'));
ALTER TABLE resources
  ADD CONSTRAINT resources_positive_capacity CHECK (capacity >= 1);

-- BE-03 — ciclo de vida RN07 com dominio fechado
UPDATE reservations SET status = 'scheduled' WHERE status IS NULL;
ALTER TABLE reservations ALTER COLUMN status SET NOT NULL;
ALTER TABLE reservations
  ADD CONSTRAINT reservations_valid_status
  CHECK (status IN ('scheduled', 'completed', 'cancelled'));

-- BE-07 — instantes com fuso, nao digitos sem fuso
ALTER TABLE reservations
  ALTER COLUMN start_time TYPE TIMESTAMPTZ USING start_time AT TIME ZONE 'America/Sao_Paulo',
  ALTER COLUMN end_time   TYPE TIMESTAMPTZ USING end_time   AT TIME ZONE 'America/Sao_Paulo';

-- indices: toda consulta de reserva filtra resource_id e ordena start_time
CREATE INDEX IF NOT EXISTS idx_reservations_resource_start
  ON reservations (resource_id, start_time);
CREATE INDEX IF NOT EXISTS idx_reservations_status
  ON reservations (status) WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_resources_type
  ON resources (type);
```

Quatro observações técnicas que não podem se perder:

1. **`btree_gist` é obrigatório.** A constraint `EXCLUDE` combina igualdade em
   `integer` (`resource_id WITH =`) com sobreposição de intervalo
   (`tstzrange ... WITH &&`). O índice GiST nativo não cobre `=` em
   `integer`; a extensão `btree_gist` é que fornece a classe de operadores.
   Sem ela, o `ALTER TABLE` falha. A extensão é contrib padrão do PostgreSQL
   e requer permissão de superusuário ou de dono do banco — isso afeta o
   ambiente que OPS-04 montar.
2. **A ordem das migrations importa.** `BE-07` tem de rodar **antes** de
   `BE-01`: `tstzrange` exige `timestamptz`. Com colunas `timestamp`, a
   expressão da constraint não compila.
3. **`BE-03` precisa do `UPDATE` antes do `SET NOT NULL`.** Se algum banco já
   tiver linha com `status NULL` — o que é alcançável hoje por um `PATCH` com
   corpo vazio, ver RN07 — o `ALTER` falha. O mesmo raciocínio vale para
   `resource_id SET NOT NULL` em BE-02 e para qualquer `CHECK`: dado legado
   inválido bloqueia a constraint. Toda migration verifica e trata antes.
4. **Nada disso funciona editando `initDb.js`.**
   `server/src/config/initDb.js:5` e `:14` usam
   `CREATE TABLE IF NOT EXISTS`: em banco que já tem as tabelas, o arquivo é
   um no-op. As mudanças acima **têm** de vir como migrations `ALTER TABLE`
   versionadas (RNF02, OPS-02). Editar o `initDb.js` produz um schema correto
   só em banco criado do zero — e um falso senso de pronto em todos os
   outros.

### 2.1. Pendência declarada do DER alvo

O `ON DELETE CASCADE` de `reservations.resource_id` **continua** no diagrama
alvo, porque nenhuma spec de backend com escopo fixado se comprometeu a
trocá-lo. BUG-06 (RN09 — excluir espaço destrói o histórico de reservas)
segue aberto.

Alvo técnico, quando for pago:

```sql
ALTER TABLE reservations DROP CONSTRAINT reservations_resource_id_fkey;
ALTER TABLE reservations
  ADD CONSTRAINT reservations_resource_id_fkey
  FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE RESTRICT;
```

Regra de processo: **quem implementar BUG-06 atualiza este diagrama no mesmo
PR.** Diagrama de estado alvo que promete o que ninguém vai entregar repete
exatamente o defeito que esta spec conserta.

## 3. Mapeamento físico

| Entidade do negócio | Tabela | Chave | Observação |
|---|---|---|---|
| Espaço (estação ou sala) | `resources` | `id SERIAL` | `type` distingue `workstation` de `meeting_room` |
| Reserva | `reservations` | `id SERIAL` | `resource_id` → `resources.id` |
| Responsável | — | — | **não é entidade**: é a coluna de texto `reservations.user_name` (RN12) |
| Usuário do sistema | — | — | **não existe** (RF13) |
| Papel / permissão | — | — | **não existe** (RF14) |

Vocabulário gravado no banco — usar exatamente esta grafia:

| Coluna | Valores reais | Evidência |
|---|---|---|
| `resources.type` | `workstation`, `meeting_room` | `client/src/App.jsx:180-181`, comentário em `initDb.js:8` |
| `reservations.status` | `scheduled`, `completed`, `cancelled` | `initDb.js:20`, `client/src/App.jsx:317`, `:324` |

Atenção ao `cancelled` com **dois `l`**. O diagrama da documentação recebida
escreve `Canceled` com um (`Documentação Oficial SREC.md:97`), além de usar
inicial maiúscula. Quem programar contra o diagrama escreve um status que o
código nunca grava — e, depois de BE-03, um status que o `CHECK` rejeita.

## 4. As 12 divergências entre a documentação recebida e o código

Confronto de `Documentação Oficial SREC.md` com o código recebido. A coluna
**Resolução** registra o que a N2 fez com cada uma, em três categorias:
`corrigir a doc` (o código está certo e a documentação mentia),
`corrigir o código` (a documentação descrevia a intenção correta e o código
não a cumpria) e `débito da N3` (nem um nem outro é viável nesta entrega).

| # | O que a doc dizia | O que o código faz | Resolução |
|---|---|---|---|
| D01 | MER com `UUID id PK` nas duas entidades (`:84`, `:92`) | `id SERIAL PRIMARY KEY`, inteiro sequencial (`initDb.js:6`, `:15`) | **corrigir a doc.** O DER real desta página mostra `SERIAL`. Migrar para `UUID` quebraria as URLs dos 6 endpoints com `:id` e o estado do cliente (`client/src/App.jsx:27`, `:44`) sem benefício para o usuário. A exposição de cardinalidade por ID sequencial fica como **débito da N3**, a pagar junto com autenticação (RF13). |
| D02 | `resources.is_active BOOLEAN` (`:88`) | a coluna não existe (`initDb.js:5-12`); nenhum model a referencia (`resourceModel.js:6`, `:29`) | **corrigir a doc** + **débito da N3**. O DER real e o alvo não têm a coluna. Registrada como RF15/RN14 `documentado mas inexistente`, e apontada no handoff como a evolução de melhor custo-benefício — hoje a única forma de tirar um espaço de circulação é `DELETE`, que destrói o histórico (D-01 no handoff). |
| D03 | `reservations.user_id UUID` (`:94`) | `user_name VARCHAR(100) NOT NULL`, texto livre (`initDb.js:17`, `client/src/App.jsx:252-259`) | **corrigir a doc** + **débito da N3**. O DER real mostra `user_name`. Identidade de usuário é funcionalidade nova com tabela, autenticação e migração de dado — escopo de N3, não de manutenção. RF13/RN12. |
| D04 | `PUT /api/reservations/{id}/cancel` (`:117`) | a rota não existe; existe `PATCH /api/reservations/:id/status` (`reservationRoutes.js:8`) | **corrigir a doc.** `docs/arquitetura/openapi.yaml` (REQ-03) documenta `PATCH /:id/status` como único caminho de transição de status. Não criamos a rota `/cancel`: duplicaria o efeito e aumentaria a superfície da API sem ganho. RF11. |
| D05 | `GET /api/reservations` lista "as reservas do usuário atual" (`:116`) | `SELECT * FROM reservations ORDER BY start_time ASC` — todas, de todos, sem `WHERE` (`reservationModel.js:15`) | **corrigir a doc.** Não existe usuário atual (D03). O contrato em REQ-03 descreve o endpoint como "lista todas as reservas". RF07. |
| D06 | `POST /api/resources` com "Nível de acesso Admin" (`:109`) | nenhuma autenticação: `index.js:12-18` registra só `cors()` e `express.json()`; `resourceRoutes.js:5-9` sem middleware; `server/package.json:18-23` sem dependência de auth | **corrigir a doc** + **débito da N3** de severidade alta. Removemos a menção a nível de acesso do contrato e registramos o perímetro real ("sistema de uso confiado") em `docs/produto/overview.md`. Autorização depende de D03 e é funcionalidade nova. RF14/RN13. |
| D07 | 5 endpoints na tabela da API (`:106-117`) | 10 endpoints nos dois arquivos de rota (`resourceRoutes.js:5-9`, `reservationRoutes.js:5-9`) | **corrigir a doc.** REQ-03 entrega `docs/arquitetura/openapi.yaml` em OpenAPI 3.1 com os 10 endpoints, todos os códigos de status e exemplos, servido como Swagger UI em `/docs`. A rubrica da N1 pedia coleção da API e o grupo anterior não entregou nenhuma. |
| D08 | Casos de uso com dois atores, `Usuário` e `Administrador` (`:38-53`) | o sistema não tem papéis nem sessão; um único ator sem credencial faz tudo | **corrigir a doc.** `docs/produto/requisitos.md` traz o diagrama real: um ator (`Operador`) e oito casos de uso, todos sem credencial. `Administrador` consta como ator `documentado mas inexistente`. |
| D09 | "Todas as tarefas de desenvolvimento são mapeadas com critérios de aceite no Jira" (`:145`) | o repositório recebido tem **0** issues e não há Jira em nenhum lugar | **corrigir a doc** + **corrigir o processo.** A N2 não adota Jira: rastreabilidade vive no repositório, em GitHub Issues e nas specs de `docs/specs/`, com os IDs citados dentro dos documentos. Rastreabilidade em ferramenta externa não sobrevive ao handoff; em arquivo versionado, sim. |
| D10 | "Crie uma branch a partir da `develop`" (`:153`, `README.md:30`) | **`develop` não existe** (só `main`, `backend`, `frontend`) e `.github/workflows/ci.yml:3-7` dispara em `main` e `develop` | **corrigir o código** + **corrigir a doc.** Metade dos gatilhos da CI aponta para uma branch inalcançável. OPS-01 ajusta o workflow para `main` e para `pull_request`; a N2 documenta Trunk-Based Development com `main` como único branch longevo. RNF10. |
| D11 | "Clean Code: separação estrita de responsabilidades no backend e frontend" (`:139`) | `App.jsx` com 351 linhas e 41 % de todo o JS/JSX, componente único sem pasta de componentes (CS-01); regra de negócio no controller e model como SQL cru, sem camada de serviço (CS-03); 10 blocos `try/catch` idênticos (CS-02) | **corrigir o código** + **corrigir a doc.** As refatorações estão em BE-04 a BE-08 e FE-01 a FE-05, cada uma com número antes e depois. A afirmação sai da documentação; o que entra é a métrica medida. |
| D12 | "Testes unitários automatizados de domínio via Jest" (`:65`) | 1 arquivo de teste, 2 casos, ambos sobre `checkAvailability` (`reservationModel.test.js:11-37`); 6,14 % de statements, 0 % de branches, 0 % nos controllers e nas rotas; 0 teste de frontend | **corrigir o código** + **corrigir a doc.** QA-01 a QA-04 elevam a cobertura e o relatório de auditoria publica o par antes/depois. A frase genérica é substituída pelo número medido. |

### 4.1. O que confere

Uma única coisa, e é a mais importante: a fórmula anti-sobreposição
documentada em `Documentação Oficial SREC.md:72` —
`Início_banco < Fim_novo AND Fim_banco > Início_novo` — é **exatamente** a
implementada em `server/src/models/reservationModel.js:55`
(`start_time < $3 AND end_time > $2`, com `$2` = início novo e `$3` = fim
novo, conforme `reservationModel.js:59`).

O grupo anterior acertou a regra central do produto. O defeito (BUG-01) está
em executá-la como `SELECT` isolado, fora de transação e sem constraint de
respaldo — e é isso que BE-01 conserta, promovendo a fórmula de consulta de
aplicação a constraint `EXCLUDE` de banco.

### 4.2. Resumo das resoluções

| Resolução | Divergências | Total |
|---|---|---|
| corrigir a doc (o código estava certo) | D01, D02, D03, D04, D05, D06, D07, D08, D09 | **9** |
| corrigir o código (a doc descrevia a intenção certa) | D10, D11, D12 | **3** |
| também vira débito declarado da N3 | D01, D02, D03, D06 | **4** |

Nove das doze divergências são documentação que descrevia um sistema que
nunca existiu. Três são o código não cumprindo o que a documentação
prometia — e são justamente as três que a N2 tem como corrigir dentro do
escopo de manutenção.
````

## Testes

### T1 — Os dois `erDiagram` renderizam

Abrir `docs/arquitetura/der.md` no GitHub, na branch do PR, e confirmar que
os dois diagramas renderizam. Mermaid `erDiagram` **não aceita parênteses nem
vírgula sem aspas** no atributo de tipo: por isso os tipos estão como
`VARCHAR_100` e `TIMESTAMPTZ`, e todo texto descritivo está entre aspas, na
posição de comentário. Se o diagrama não renderizar, o erro está quase sempre
num comentário sem aspas ou num tipo com parêntese.

### T2 — O DER real corresponde ao `initDb.js`, coluna por coluna

```bash
sed -n '4,24p' server/src/config/initDb.js
```

Conferir manualmente: 6 colunas em `resources`, 8 em `reservations`, tipos e
`NOT NULL` idênticos ao diagrama. Em especial, confirmar que
`resource_id` e `status` **não** têm `NOT NULL` — é o que sustenta RN07 e
RN10.

### T3 — O schema recebido realmente não tem constraint nem índice

```bash
grep -cE "CHECK|UNIQUE|EXCLUDE" server/src/config/initDb.js   # esperado: 0
grep -ci "CREATE INDEX" server/src/config/initDb.js           # esperado: 0
```

Se algum valor deixar de ser 0, uma spec de backend já entrou e o DER real
desta página virou histórico — atualizar.

### T4 — O SQL do DER alvo executa de fato

Em um Postgres descartável, com o schema recebido já criado e dados de teste:

```bash
docker run -d --name srec-der-test -e POSTGRES_PASSWORD=postgres -p 55432:5432 postgres:16
export DER_URL="postgresql://postgres:postgres@localhost:55432/postgres"

# 1. criar o schema recebido
psql "$DER_URL" -f /dev/stdin <<'SQL'
CREATE TABLE resources (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  type VARCHAR(50) NOT NULL,
  capacity INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE reservations (
  id SERIAL PRIMARY KEY,
  resource_id INTEGER REFERENCES resources(id) ON DELETE CASCADE,
  user_name VARCHAR(100) NOT NULL,
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP NOT NULL,
  status VARCHAR(20) DEFAULT 'scheduled',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO resources (name, type, capacity) VALUES ('Alpha', 'meeting_room', 8);
INSERT INTO reservations (resource_id, user_name, start_time, end_time)
VALUES (1, 'Carlos', '2026-11-03 09:00', '2026-11-03 10:00');
SQL

# 2. aplicar o bloco SQL da secao 2 do der.md, na ordem BE-07 -> BE-01 -> BE-02 -> BE-03
# 3. provar que as constraints pegam
psql "$DER_URL" -c "INSERT INTO reservations (resource_id, user_name, start_time, end_time) VALUES (1,'Ana','2026-11-03 09:30-03','2026-11-03 10:30-03');"
#    esperado: ERROR  conflicting key value violates exclusion constraint "reservations_no_overlap"
psql "$DER_URL" -c "INSERT INTO reservations (resource_id, user_name, start_time, end_time) VALUES (1,'Ana','2026-11-03 12:00-03','2026-11-03 11:00-03');"
#    esperado: ERROR  violates check constraint "reservations_valid_window"
psql "$DER_URL" -c "UPDATE reservations SET status='banana' WHERE id=1;"
#    esperado: ERROR  violates check constraint "reservations_valid_status"
psql "$DER_URL" -c "INSERT INTO resources (name,type,capacity) VALUES ('X','banana',1);"
#    esperado: ERROR  violates check constraint "resources_valid_type"
psql "$DER_URL" -c "INSERT INTO resources (name,type,capacity) VALUES ('X','workstation',0);"
#    esperado: ERROR  violates check constraint "resources_positive_capacity"
psql "$DER_URL" -c "INSERT INTO reservations (resource_id,user_name,start_time,end_time) VALUES (NULL,'Ana','2026-11-04 09:00-03','2026-11-04 10:00-03');"
#    esperado: ERROR  null value in column "resource_id" violates not-null constraint

docker rm -f srec-der-test
```

**Teste que falha antes:** os seis `INSERT`/`UPDATE` acima, rodados contra o
schema recebido **sem** as constraints, são **todos aceitos**. Essa é a
demonstração do pitch: o mesmo roteiro de seis comandos passa inteiro antes e
é recusado inteiro depois.

O teste serve também para validar a ordem das migrations: rodar BE-01 antes de
BE-07 falha com erro de tipo em `tstzrange`, confirmando a observação 2 do
documento.

### T5 — Toda divergência cita linha verificável

Para cada uma das 12 linhas da tabela, abrir
`Documentação Oficial SREC.md` na linha citada e confirmar que o texto é o
que a tabela afirma. É verificação manual; são 12 conferências.

### T6 — As 12 divergências da auditoria estão todas na tabela

A tabela tem exatamente 12 linhas, `D01` a `D12`, sem lacuna e sem repetição:

```bash
grep -oE '^\| D[0-9]{2} ' docs/arquitetura/der.md | sort -u | wc -l   # esperado: 12
```

### T7 — Nenhuma regra de negócio ficou sem situação

```bash
grep -cE '^### RN[0-9]{2} — ' docs/produto/overview.md              # esperado: 15
grep -cE '^\*\*Situação\.\*\*' docs/produto/overview.md             # esperado: >= 15
```

E a tabela de rastreabilidade tem 15 linhas de regra.

## Critérios de aceite

* [ ] `docs/produto/overview.md` existe, com visão do produto e 15 regras de
      negócio RN01..RN15 sem lacuna.
* [ ] Toda regra tem `Situação` no vocabulário fechado de quatro valores, e
      `Evidência` com arquivo e linha.
* [ ] As três regras que só existem na documentação recebida (RN12 usuário,
      RN13 administrador, RN14 `is_active`) estão marcadas
      `documentado mas inexistente` com a decisão da N2 por escrito.
* [ ] `docs/arquitetura/der.md` existe com **dois** `erDiagram`: real e alvo.
* [ ] O DER real reproduz `initDb.js:4-24` coluna por coluna, incluindo
      `SERIAL`, `user_name VARCHAR(100)`, ausência de `is_active`,
      `ON DELETE CASCADE` e a ausência de qualquer constraint; T2 confere.
* [ ] O DER real declara explicitamente que `resource_id` e `status` aceitam
      `NULL`.
* [ ] O DER alvo incorpora `EXCLUDE` de BE-01, `CHECK` de janela de BE-02,
      `CHECK` de status de BE-03, `TIMESTAMPTZ` de BE-07 e os índices, cada
      item com o ID da spec de origem anotado.
* [ ] O DER alvo traz o SQL real das constraints, inclusive
      `CREATE EXTENSION IF NOT EXISTS btree_gist`, e a nota de ordem
      (BE-07 antes de BE-01).
* [ ] O DER alvo traz a nota de que editar `initDb.js` não altera banco
      existente, por causa do `IF NOT EXISTS`.
* [ ] A pendência de `ON DELETE CASCADE` (BUG-06/RN09) está declarada em
      subseção própria, com o SQL alvo e a regra de atualizar o diagrama no
      mesmo PR de quem a implementar.
* [ ] A tabela de divergências tem as 12 linhas, cada uma com: o que a doc
      dizia (com linha), o que o código faz (com arquivo e linha) e a
      resolução adotada em uma das três categorias; T5 e T6 conferem.
* [ ] A seção "O que confere" registra o acerto da fórmula anti-sobreposição,
      com as duas linhas de evidência.
* [ ] O vocabulário real de `type` e `status` está tabelado, com o alerta sobre
      `cancelled` versus `Canceled`.
* [ ] T4 executou e as seis violações foram recusadas no schema alvo e
      aceitas no schema recebido; a saída está colada no PR.
* [ ] `Documentação Oficial SREC.md` não foi alterado.
* [ ] PR aprovado por Igor Seberino (`@igorSeberino`) no papel de QA.

## Passo a passo TBD

```bash
# 1. Partir de main atualizada
git checkout main
git pull origin main
git checkout -b docs/business-rules-and-der

# 2. Criar os dois documentos
mkdir -p docs/produto docs/arquitetura
# criar docs/produto/overview.md
# criar docs/arquitetura/der.md

# 3. Conferir o DER real contra o codigo
sed -n '4,24p' server/src/config/initDb.js
grep -cE "CHECK|UNIQUE|EXCLUDE" server/src/config/initDb.js   # 0
grep -ci "CREATE INDEX" server/src/config/initDb.js           # 0

# 4. Provar o DER alvo em Postgres descartavel (roteiro T4) e guardar a saida
docker run -d --name srec-der-test -e POSTGRES_PASSWORD=postgres -p 55432:5432 postgres:16
# ... roteiro T4 ...
docker rm -f srec-der-test

# 5. Validar a tabela de divergencias
grep -oE '^\| D[0-9]{2} ' docs/arquitetura/der.md | sort -u | wc -l   # 12
grep -cE '^### RN[0-9]{2} — ' docs/produto/overview.md                # 15

# 6. Commits
git add docs/produto/overview.md
git commit -m "docs(produto): registrar visao do produto e 15 regras de negocio

Deriva as regras do codigo recebido, cada uma com Situacao de vocabulario
fechado e evidencia em arquivo e linha. Registra RN12 (usuario
identificavel), RN13 (acesso de administrador) e RN14 (espaco inativo) como
documentado mas inexistente, com a decisao de nao implementar na N2.

Documenta dois achados novos: status NULL torna a reserva invisivel a regra
anti-sobreposicao, e a falta de is_active transforma inativacao temporaria
em perda permanente de dado.

Refs #<a definir>"

git add docs/arquitetura/der.md
git commit -m "docs(arquitetura): corrigir o DER e publicar o schema real e o alvo

Substitui o MER recebido, que documentava UUID, is_active e user_id
inexistentes, por dois diagramas mermaid: o schema como esta hoje (SERIAL,
user_name VARCHAR(100), sem is_active, ON DELETE CASCADE, zero constraint) e
o schema alvo da N2, com a constraint EXCLUDE de BE-01, os CHECK de BE-02 e
BE-03, TIMESTAMPTZ de BE-07 e os indices.

Inclui o SQL real das migrations, a dependencia de btree_gist, a ordem
obrigatoria BE-07 antes de BE-01 e a nota de que editar initDb.js nao altera
banco existente por causa do IF NOT EXISTS.

Refs #<a definir>"

git add docs/arquitetura/der.md
git commit -m "docs(auditoria): rastrear as 12 divergencias entre doc recebida e codigo

Para cada divergencia: o que a documentacao afirmava com a linha, o que o
codigo faz com arquivo e linha, e a resolucao adotada entre corrigir a doc,
corrigir o codigo ou registrar como debito da N3. Nove sao documentacao que
descrevia um sistema inexistente; tres sao codigo que nao cumpria o
documentado.

Registra tambem o unico ponto em que doc e codigo conferem: a formula
anti-sobreposicao.

Refs #<a definir>"

# 7. Push e PR
git push -u origin docs/business-rules-and-der
# PR para main, titulo:
#   docs(arquitetura): corrigir o DER e registrar as regras de negocio reais
# Revisor: @igorSeberino (QA). Fecha a issue #<a definir>.
```

Corpo sugerido do PR:

```markdown
## O que muda

* `docs/produto/overview.md` — visão do produto e 15 regras de negócio, cada
  uma com situação real.
* `docs/arquitetura/der.md` — DER real, DER alvo da N2 e a tabela das 12
  divergências entre a documentação recebida e o código.

## Por que

O MER recebido (`Documentação Oficial SREC.md:79-100`) documenta `UUID`,
`is_active` e `user_id`. Nenhum dos três existe. Quem programar contra aquele
diagrama escreve código que não compila contra o banco real — inclusive o
status `Canceled`, que o código grava como `cancelled`.

## Números

| | antes | depois |
|---|---|---|
| Regras de negócio escritas | 1 (a fórmula) | 15 |
| Elementos errados no DER | 8 | 0 |
| Constraints de integridade no schema | 0 | 7 + 1 EXCLUDE (alvo) |
| Índices além das PKs | 0 | 3 (alvo) |
| Divergências doc × código rastreadas | 0 | 12 |

## Como revisar

1. `sed -n '4,24p' server/src/config/initDb.js` e comparar com o DER real.
2. Rodar o roteiro T4 da spec: as 6 violações são recusadas no schema alvo e
   aceitas no recebido. Saída colada abaixo.
3. Conferir por amostragem 4 linhas da tabela de divergências contra
   `Documentação Oficial SREC.md`.
4. Confirmar que os dois `erDiagram` renderizam nesta página do PR.
```

## Prompt para o Claude Code

```text
Você está na raiz do fork igorSeberino/srec, projeto SREC, entrega N2 da
disciplina de Manutenção e Melhoria de Software. Esta entrega é MANUTENÇÃO DE
SOFTWARE ALHEIO. A documentação recebida mente sobre o banco; o código é a
fonte de verdade.

Implemente integralmente a spec docs/specs/req-02-business-rules-and-der/implementacao.md.

Leia antes, e trate como única fonte de verdade:
- server/src/config/initDb.js  (o schema REAL, linha por linha)
- server/src/models/reservationModel.js  (a formula anti-sobreposicao, linhas 49-61)
- server/src/models/resourceModel.js
- server/src/controllers/reservationController.js e resourceController.js
- client/src/App.jsx  (valores reais de type e status)
- .github/workflows/ci.yml
E leia, como documento a CONFRONTAR e nunca copiar:
- "Documentação Oficial SREC.md"  (o MER esta nas linhas 79-100)

Entregue:
1. docs/produto/overview.md — visão do produto + 15 regras de negócio
   RN01..RN15, cada uma com História/descrição, Situação (vocabulário fechado:
   implementado | implementado com defeito (BUG-nn) | documentado mas
   inexistente | não implementado) e Evidência com arquivo e linha.
2. docs/arquitetura/der.md — contendo, nesta ordem:
   a) erDiagram mermaid do schema REAL: SERIAL, user_name VARCHAR(100), SEM
      is_active, SEM user_id, ON DELETE CASCADE, ZERO constraint, e a nota de
      que resource_id e status aceitam NULL;
   b) erDiagram mermaid do schema ALVO ao fim da N2, com a constraint EXCLUDE
      de BE-01, os CHECK de janela de BE-02, o CHECK de status de BE-03,
      TIMESTAMPTZ de BE-07 e os índices — cada item anotado com o ID da spec;
   c) o SQL real das migrations, incluindo CREATE EXTENSION btree_gist, a
      ordem obrigatória BE-07 antes de BE-01, e o aviso de que editar
      initDb.js não altera banco existente por causa do IF NOT EXISTS;
   d) a pendência declarada do ON DELETE CASCADE (BUG-06);
   e) o mapeamento físico e o vocabulário real de type e status, com o alerta
      cancelled (2 L) versus o Canceled do diagrama recebido;
   f) a tabela das 12 divergências D01..D12: o que a doc dizia com a linha, o
      que o código faz com arquivo e linha, e a resolução adotada (corrigir a
      doc / corrigir o código / débito da N3);
   g) a seção "O que confere", sobre a fórmula anti-sobreposição.

Regras duras:
- Os dois erDiagram precisam renderizar no GitHub. Em mermaid erDiagram NÃO
  use parênteses nem vírgula fora de aspas no tipo da coluna: escreva
  VARCHAR_100, não VARCHAR(100). Todo texto descritivo vai entre aspas, na
  posição de comentário.
- Todo SQL precisa ser executável em PostgreSQL 16. Se você tiver docker
  disponível, execute o roteiro T4 da spec e cole a saída real; se não tiver,
  diga explicitamente que não executou — NÃO invente saída de comando.
- Toda evidência cita arquivo e linha que você verificou abrindo o arquivo.
- NÃO altere "Documentação Oficial SREC.md". NÃO altere nada em server/ nem em
  client/: esta spec é só documentação.
- Português do Brasil no texto; inglês em nomes de arquivo, identificadores,
  SQL e branch. Marcador de lista `*`. Sem linha de metadados de cabeçalho.

Ao final, rode e cole a saída de:
  grep -cE "CHECK|UNIQUE|EXCLUDE" server/src/config/initDb.js
  grep -oE '^\| D[0-9]{2} ' docs/arquitetura/der.md | sort -u | wc -l
  grep -cE '^### RN[0-9]{2} — ' docs/produto/overview.md
Depois execute o "Passo a passo TBD": branch docs/business-rules-and-der, os
três commits com as mensagens prontas, e o PR para main com @igorSeberino como
revisor de QA.
```
