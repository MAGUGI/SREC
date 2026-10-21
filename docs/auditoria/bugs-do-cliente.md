# Bugs do "Cliente" — SREC recebido

Quinze defeitos confirmados por leitura do código recebido (`MAGUGI/SREC`,
commit `8431181`). Cada um traz arquivo, linha, como reproduzir e a spec que
o corrige.

**Escala de severidade**

* **CRÍTICO** — quebra a regra de negócio central do produto ou perde dado do usuário.
* **ALTO** — produz resposta errada, derruba o serviço ou corrompe estado.
* **MÉDIO** — permite dado inválido entrar no sistema ou degrada a operação.
* **BAIXO** — incomoda o usuário ou suja o código, sem perder dado.

| ID | Sev. | Título | Spec que corrige |
|---|---|---|---|
| BUG-01 | CRÍTICO | Dupla reserva sob concorrência | BE-01 |
| BUG-02 | CRÍTICO | Reserva com fim antes do início | BE-02 |
| BUG-03 | ALTO | Status arbitrário aceito | BE-03 |
| BUG-04 | ALTO | ID não numérico retorna 500 | BE-05 |
| BUG-05 | ALTO | Atualização parcial de recurso retorna 500 | BE-05 |
| BUG-06 | ALTO | Exclusão de espaço apaga reservas silenciosamente | BE-08 / FE-05 |
| BUG-07 | ALTO | Horário da reserva desloca por falta de fuso | BE-07 |
| BUG-08 | MÉDIO | Reserva no passado é aceita | BE-02 |
| BUG-09 | MÉDIO | Capacidade inválida é aceita | BE-02 |
| BUG-10 | MÉDIO | Tipo de espaço aceita qualquer string | BE-03 |
| BUG-11 | MÉDIO | Servidor sobe com o banco quebrado | BE-08 / OPS-04 |
| BUG-12 | MÉDIO | Queda do Postgres mata o processo | BE-08 |
| BUG-13 | BAIXO | Duplo clique cria duas reservas | FE-03 |
| BUG-14 | BAIXO | `setTimeout` do feedback nunca é limpo | FE-04 |
| BUG-15 | BAIXO | Endpoint de edição de espaço é órfão | FE-05 |

---

## BUG-01 — Dupla reserva sob concorrência

**Severidade:** CRÍTICO · **Onde:** `server/src/controllers/reservationController.js:12-28`

`checkAvailability` e `create` são duas queries separadas, sem transação. Entre
uma e outra existe uma janela em que uma segunda requisição faz a mesma
verificação, recebe a mesma resposta e insere também. O schema não tem nenhuma
constraint que impeça as duas linhas conflitantes de coexistirem (verificado:
zero ocorrências de `CHECK`, `UNIQUE` ou `EXCLUDE` em `initDb.js`).

**Reprodução**

```bash
# com um recurso de id 1 cadastrado e o horário livre
for i in 1 2 3 4 5; do
  curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:5000/api/reservations \
    -H 'Content-Type: application/json' \
    -d '{"resource_id":1,"user_name":"teste","start_time":"2026-11-10 10:00:00","end_time":"2026-11-10 11:00:00"}' &
done; wait
```

Esperado: um `201` e quatro `409`. Observado: mais de um `201`.

Pelo frontend é ainda mais fácil: o botão de confirmar não desabilita durante o
envio (BUG-13), então um duplo clique basta.

**Impacto:** duas pessoas chegam à mesma sala no mesmo horário. É exatamente o
problema que a `Documentação Oficial SREC.md` declara como razão de existir do
produto.

**Correção:** [BE-01](../specs/be-01-prevent-double-booking/implementacao.md) —
constraint `EXCLUDE` sobre intervalos no banco, SQLSTATE `23P01` traduzido em 409.

---

## BUG-02 — Reserva com fim antes do início

**Severidade:** CRÍTICO · **Onde:** `server/src/controllers/reservationController.js:7`, `server/src/config/initDb.js`

A única validação é de presença dos campos:

```js
if (!resource_id || !user_name || !start_time || !end_time) {
  return res.status(400).json({ error: 'All fields are required' });
}
```

Não há comparação entre `start_time` e `end_time` na borda, no model ou no
banco. Uma reserva das 10h às 9h é persistida com `201`.

O efeito colateral é pior que o dado inválido. A condição de sobreposição é
`start_time < novo_fim AND end_time > novo_início`. Um intervalo invertido
**nunca satisfaz essa condição**: vira uma reserva fantasma, que aparece na
listagem, não bloqueia ninguém, e não é detectável por nenhuma consulta de
conflito.

**Reprodução**

```bash
curl -i -X POST http://localhost:5000/api/reservations \
  -H 'Content-Type: application/json' \
  -d '{"resource_id":1,"user_name":"teste","start_time":"2026-11-10 10:00:00","end_time":"2026-11-10 09:00:00"}'
```

Esperado: `400`. Observado: `201`.

**Correção:** [BE-02](../specs/be-02-validate-reservation-window/implementacao.md) —
validação na borda mais `CHECK (end_time > start_time)` no banco.

---

## BUG-03 — Status arbitrário aceito

**Severidade:** ALTO · **Onde:** `server/src/controllers/reservationController.js:60-64`

O controller repassa `req.body.status` direto para o `UPDATE`, e a coluna é
`VARCHAR(20)` sem `CHECK`.

```js
const { status } = req.body;
const updatedReservation = await ReservationModel.updateStatus(id, status);
```

**Reprodução**

```bash
curl -i -X PATCH http://localhost:5000/api/reservations/1/status \
  -H 'Content-Type: application/json' -d '{"status":"banana"}'
```

Esperado: `400`. Observado: `200`, e `"banana"` persistido.

**Desdobramentos**

* `checkAvailability` filtra `status != 'cancelled'`, então qualquer lixo conta como ocupando o horário.
* O frontend monta a classe CSS com `status-${rev.status}` (`App.jsx:306`), produzindo `status-banana`, que não existe no CSS.
* O botão de concluir e o de cancelar só aparecem quando `status === 'scheduled'` (`App.jsx:309`), então a reserva fica presa num estado sem saída pela interface.

**Correção:** [BE-03](../specs/be-03-restrict-reservation-status/implementacao.md) —
enum de domínio, validação na borda, `CHECK` no banco, transições de estado explícitas.

---

## BUG-04 — ID não numérico retorna 500

**Severidade:** ALTO · **Onde:** os dois controllers, todas as 6 rotas com `:id`

O `id` vem da URL como string e é passado direto para o SQL. Para um valor não
numérico, o Postgres levanta `invalid input syntax for type integer`
(SQLSTATE `22P02`), o `catch (err)` genérico engole e devolve 500.

**Reprodução**

```bash
curl -i http://localhost:5000/api/resources/abc
```

Esperado: `400`. Observado: `500 {"error":"Internal server error"}`.

Erro de quem chama está sendo reportado como erro do servidor. Além de
incorreto, polui o log: todo `console.error` vira ruído e esconde falha real.

**Correção:** [BE-05](../specs/be-05-proper-http-status-codes/implementacao.md) —
middleware `validateIdParam` e mapeamento de SQLSTATE no tratamento central de erro.

---

## BUG-05 — Atualização parcial de recurso retorna 500

**Severidade:** ALTO · **Onde:** `server/src/models/resourceModel.js:25-33`

```sql
UPDATE resources
SET name = $1, type = $2, capacity = $3, updated_at = CURRENT_TIMESTAMP
WHERE id = $4
```

Os três campos são sempre sobrescritos. Um corpo parcial manda `undefined`,
que o driver converte em `NULL`, violando o `NOT NULL` de `name`.

**Reprodução**

```bash
curl -i -X PUT http://localhost:5000/api/resources/1 \
  -H 'Content-Type: application/json' -d '{"capacity":4}'
```

Esperado: `200` com só a capacidade alterada, ou `400` explicando que o corpo
precisa ser completo. Observado: `500`.

O endpoint só funciona com corpo completo, e isso não está documentado em
lugar nenhum.

**Correção:** [BE-05](../specs/be-05-proper-http-status-codes/implementacao.md).

---

## BUG-06 — Exclusão de espaço apaga reservas silenciosamente

**Severidade:** ALTO · **Onde:** `server/src/config/initDb.js:16`, `client/src/App.jsx:76-85`

```sql
resource_id INTEGER REFERENCES resources(id) ON DELETE CASCADE
```

`DELETE /api/resources/:id` apaga, junto, todas as reservas daquele espaço:
futuras, em andamento e concluídas. O frontend pede confirmação com
`window.confirm('Deseja realmente remover este espaço?')` e não menciona as
reservas.

**Reprodução:** criar um espaço, criar três reservas nele, excluir o espaço,
consultar `GET /api/reservations`. As três sumiram.

**Impacto:** perda de dado histórico sem aviso e sem trilha de auditoria. Num
sistema de reserva, o histórico é o registro de quem usou o quê e quando.

**Correção:** [BE-08](../specs/be-08-harden-http-surface/implementacao.md) para a
decisão de domínio (desativação lógica em vez de exclusão física) e
[FE-05](../specs/fe-05-resource-edit-and-cascade-warning/implementacao.md) para o
aviso na interface.

---

## BUG-07 — Horário da reserva desloca por falta de fuso

**Severidade:** ALTO · **Onde:** `server/src/config/initDb.js`, `client/src/App.jsx:264,303-304`

As quatro colunas de horário são `TIMESTAMP`, sem fuso. O input
`datetime-local` do frontend envia string local sem offset. A listagem faz
`new Date(rev.start_time).toLocaleString('pt-BR')`, e o `Date` do JavaScript
interpreta a string devolvida pela API como UTC.

Resultado: o horário exibido não é o horário digitado quando servidor, banco e
navegador não estão no mesmo fuso — exatamente o caso em qualquer deploy, e já
o caso num container Postgres padrão, que roda em UTC.

Num sistema cuja razão de existir é *em que horário a sala está ocupada*, isso
é defeito de domínio, não de apresentação.

**Correção:** [BE-07](../specs/be-07-timezone-aware-timestamps/implementacao.md) —
migrar para `TIMESTAMPTZ` e padronizar ISO 8601 com offset no contrato da API.

---

## BUG-08 — Reserva no passado é aceita

**Severidade:** MÉDIO · **Onde:** `server/src/controllers/reservationController.js`

Nada impede `start_time` anterior ao momento atual. É possível reservar uma
sala para ontem. Combinado com BUG-01, é possível criar conflito retroativo no
histórico.

**Correção:** [BE-02](../specs/be-02-validate-reservation-window/implementacao.md).

---

## BUG-09 — Capacidade inválida é aceita

**Severidade:** MÉDIO · **Onde:** `server/src/controllers/resourceController.js:10`

```js
const newResource = await ResourceModel.create(name, type, capacity || 1);
```

`capacity: 0` é falsy e vira `1` silenciosamente — o usuário pede zero e recebe
um. `capacity: -5` passa pelo `||` e é gravado, porque a coluna não tem
`CHECK`. O `min="1"` do input (`App.jsx:188`) é validação de navegador e não
vale nada para quem chama a API direto.

**Correção:** [BE-02](../specs/be-02-validate-reservation-window/implementacao.md).

---

## BUG-10 — Tipo de espaço aceita qualquer string

**Severidade:** MÉDIO · **Onde:** `server/src/config/initDb.js:7`, `client/src/App.jsx:212`

A coluna `type VARCHAR(50)` tem só um comentário dizendo
`-- 'workstation' or 'meeting_room'`, sem `CHECK`. O backend aceita qualquer
string. O frontend então renderiza assim:

```jsx
{res.type === 'meeting_room' ? 'Sala de Reunião' : 'Estação de Trabalho'}
```

Tudo que não for exatamente `meeting_room` aparece como "Estação de Trabalho".
Um espaço criado com `type: "auditorio"` mente para o usuário na tela.

**Correção:** [BE-03](../specs/be-03-restrict-reservation-status/implementacao.md).

---

## BUG-11 — Servidor sobe com o banco quebrado

**Severidade:** MÉDIO · **Onde:** `server/src/config/initDb.js:26-28`, `server/src/index.js:26-31`

```js
try {
  await db.query(queryText);
  console.log('Database tables ensured');
} catch (err) {
  console.error('Error creating tables', err);   // engole e segue
}
```

`createTables` não relança. `startServer` chama `await initDb()` e segue para
`app.listen` independentemente do resultado. O servidor sobe anunciando
`Server is running on port 5000`, parece saudável, e toda requisição vira 500.

Sem `/health`, nem orquestrador nem pessoa percebem.

**Correção:** [BE-08](../specs/be-08-harden-http-surface/implementacao.md) e
[OPS-04](../specs/ops-04-validated-config/implementacao.md).

---

## BUG-12 — Queda do Postgres mata o processo

**Severidade:** MÉDIO · **Onde:** `server/src/config/database.js`

O `Pool` registra `pool.on('connect', ...)` mas **não** registra
`pool.on('error', ...)`. O `pg` emite `'error'` quando um cliente ocioso cai
(restart do banco, queda de rede, timeout do servidor). Em Node, um evento
`'error'` sem listener vira exceção não tratada e derruba o processo.

Sem política de restart — e não há, porque não há container — o serviço fica
fora do ar até alguém reiniciar à mão.

**Correção:** [BE-08](../specs/be-08-harden-http-surface/implementacao.md).

---

## BUG-13 — Duplo clique cria duas reservas

**Severidade:** BAIXO (mas é o gatilho prático do BUG-01) · **Onde:** `client/src/App.jsx:87-104,281-283`

`handleCreateReservation` não mantém estado de envio e o botão de submit nunca
é desabilitado. Dois cliques rápidos disparam dois POST. Com o BUG-01 aberto,
é o caminho mais fácil para a dupla reserva, e não exige concorrência entre
usuários diferentes.

**Correção:** [FE-03](../specs/fe-03-form-validation-and-submit-lock/implementacao.md).

---

## BUG-14 — `setTimeout` do feedback nunca é limpo

**Severidade:** BAIXO · **Onde:** `client/src/App.jsx:32-35`

```js
const showFeedback = (text, type = 'success') => {
  setMessage({ text, type });
  setTimeout(() => setMessage({ text: '', type: '' }), 4000);
};
```

Sem `clearTimeout`. Duas ações em sequência agendam dois timers: o primeiro
apaga a mensagem do segundo antes da hora. E há `setState` após desmontagem.

**Correção:** [FE-04](../specs/fe-04-accessibility-and-effect-cleanup/implementacao.md).

---

## BUG-15 — Endpoint de edição de espaço é órfão

**Severidade:** BAIXO · **Onde:** `server/src/routes/resourceRoutes.js:8`, `client/src/services/api.js:24-35`

`PUT /api/resources/:id` existe no backend e `api.updateResource` existe no
cliente, mas **nenhuma tela chama**. Não há como editar um espaço pela
interface: só cadastrar e excluir. Um espaço com nome errado precisa ser
apagado e recriado — e apagar dispara o BUG-06, levando junto todas as
reservas.

**Correção:** [FE-05](../specs/fe-05-resource-edit-and-cascade-warning/implementacao.md).
