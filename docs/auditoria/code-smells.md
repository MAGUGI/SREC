# Code Smells — SREC recebido

Quatorze achados no código recebido (`MAGUGI/SREC`, commit `8431181`). Cada um
traz a evidência que o sustenta, o custo de manutenção que impõe e a spec que
o resolve.

Um code smell não é um bug: o sistema funciona assim. É um sinal de que a
próxima mudança vai custar mais do que deveria — e a N2 inteira é sobre fazer
a próxima mudança custar menos, porque existe uma N3 depois de nós.

| ID | Sev. | Smell | Evidência | Spec |
|---|---|---|---|---|
| CS-01 | ALTO | God Component | `App.jsx` com 351 linhas, 41 % do JS/JSX | FE-01 |
| CS-02 | ALTO | Duplicated Code | 10 blocos `try/catch` idênticos | BE-04 |
| CS-03 | ALTO | Ausência de camada de serviço | regra de negócio no controller | BE-06 |
| CS-04 | ALTO | Validação ad-hoc | `if (!a \|\| !b)` em 2 lugares, sem schema | BE-02 |
| CS-05 | MÉDIO | Magic strings | 5 literais de domínio espalhados em 3 camadas | BE-03 |
| CS-06 | MÉDIO | Schema como efeito colateral do boot | `initDb.js`, 0 migrations | OPS-02 |
| CS-07 | MÉDIO | Configuração hardcoded | `API_BASE_URL` fixo no cliente | FE-02 |
| CS-08 | MÉDIO | Refetch total a cada mutação | `loadData()` recarrega tudo | FE-01 |
| CS-09 | MÉDIO | Zero índices | 0 índices além das PKs | OPS-02 |
| CS-10 | MÉDIO | Lint sem dente | 0 erros, 0 regras de qualidade | OPS-03 |
| CS-11 | BAIXO | Placeholders versionados | 3 arquivos `.txt` de 0 byte | OPS-01 |
| CS-12 | BAIXO | Supressões de lint | 2 `eslint-disable-next-line` | FE-04 |
| CS-13 | BAIXO | Rótulos sem associação | 7 `<label>` sem `htmlFor` | FE-04 |
| CS-14 | BAIXO | Superfície aberta | CORS liberado, sem helmet, sem rate limit | BE-08 |

---

## CS-01 — God Component

**Severidade:** ALTO · **Onde:** `client/src/App.jsx`

351 linhas num único componente, **41 % de todo o JS/JSX do projeto** (853
linhas no total). Dentro dele: 9 chamadas de `useState`, um `useEffect`, cinco
manipuladores de evento, duas abas, dois formulários, duas listas e toda a
renderização. Não existe `components/`, não existe `features/`, não existe
`hooks/`.

**Custo:** qualquer mudança no formulário de reserva obriga a abrir o arquivo
que também contém a lista de espaços. Duas pessoas mexendo em partes
diferentes da tela colidem no mesmo arquivo em todo PR. Nada pode ser testado
isoladamente porque nada existe isoladamente.

A ironia está em `Documentação Oficial SREC.md:139`, que declara
"**Clean Code:** Separação estrita de responsabilidades no backend e frontend".

**Meta:** nenhum `.jsx` acima de 120 linhas; `App.jsx` abaixo de 60.
**Resolve:** [FE-01](../specs/fe-01-split-god-component/implementacao.md).

---

## CS-02 — Duplicated Code no tratamento de erro

**Severidade:** ALTO · **Onde:** os dois controllers

```bash
$ grep -c 'catch (err)' server/src/controllers/*.js
server/src/controllers/reservationController.js:5
server/src/controllers/resourceController.js:5
```

Dez blocos idênticos, cinco em cada controller:

```js
} catch (err) {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
}
```

**Custo:** mudar o formato do erro da API exige editar dez lugares. Adicionar
correlação de log exige editar dez lugares. E o pior: o catch é genérico
demais, então **erro do cliente vira erro do servidor** — é literalmente a
causa do BUG-04.

**Meta:** 10 blocos duplicados viram 0, com um middleware de erro registrado
uma vez.
**Resolve:** [BE-04](../specs/be-04-central-error-middleware/implementacao.md).

---

## CS-03 — Ausência de camada de serviço

**Severidade:** ALTO · **Onde:** arquitetura do backend

As camadas existentes são `routes` → `controllers` → `models`. O model é SQL
cru. O controller faz HTTP **e** regra de negócio ao mesmo tempo: é ele quem
decide que indisponibilidade vira 409
(`reservationController.js:17-21`).

**Não existe nenhum lugar onde a regra de negócio possa ser chamada sem passar
por HTTP e sem passar por banco.**

**Custo:** esta é a causa raiz dos 6,14 % de cobertura. Testar a regra de
reserva exige subir Express e Postgres. O único teste que existe
(`reservationModel.test.js`) só consegue testar `checkAvailability` porque
mocka o módulo de banco inteiro — e, ao mockar, testa que a função chama
`db.query` uma vez, não que a regra de sobreposição está correta. É um teste
que passaria mesmo com a fórmula errada.

Mandar alguém "aumentar a cobertura" sem resolver isso é desperdiçar esforço.

**Resolve:** [BE-06](../specs/be-06-extract-service-layer/implementacao.md).

---

## CS-04 — Validação ad-hoc

**Severidade:** ALTO · **Onde:** `resourceController.js:7-9`, `reservationController.js:7-9`

Toda a validação de entrada do sistema são estas duas linhas:

```js
if (!name || !type) { ... }
if (!resource_id || !user_name || !start_time || !end_time) { ... }
```

Checam presença, nada mais. Não checam tipo, formato, faixa, nem relação entre
campos. É de onde saem os BUG-02, BUG-08, BUG-09 e BUG-10: quatro defeitos
distintos com a mesma origem.

E `!` é o operador errado para número: `capacity: 0` é falsy (BUG-09).

**Resolve:** [BE-02](../specs/be-02-validate-reservation-window/implementacao.md).

---

## CS-05 — Magic strings de domínio

**Severidade:** MÉDIO

Cinco valores de domínio aparecem como literal, espalhados por três camadas:

| Valor | SQL | Backend | Frontend |
|---|---|---|---|
| `'scheduled'` | `initDb.js:20` (DEFAULT) | — | `App.jsx:309` |
| `'cancelled'` | `reservationModel.js:52` | — | `App.jsx:324` |
| `'completed'` | — | — | `App.jsx:317` |
| `'workstation'` | `initDb.js:7` (comentário) | — | `App.jsx:23,180` |
| `'meeting_room'` | `initDb.js:7` (comentário) | — | `App.jsx:181,212` |

Repare que `'completed'` não aparece em lugar nenhum do backend: só o frontend
sabe que esse estado existe. Nada no servidor o conhece, valida ou produz.

**Custo:** renomear um estado exige caçar literais em três camadas, sem apoio
do compilador — e é JavaScript, não há compilador.

**Resolve:** [BE-03](../specs/be-03-restrict-reservation-status/implementacao.md).

---

## CS-06 — Schema como efeito colateral do boot

**Severidade:** MÉDIO · **Onde:** `server/src/config/initDb.js`

O schema é criado com `CREATE TABLE IF NOT EXISTS` toda vez que o servidor
sobe. Funciona exatamente uma vez: na primeira. Depois disso, **não há
mecanismo nenhum para evoluir o schema.** Adicionar uma coluna, uma constraint
ou um índice num banco que já existe é impossível por esse caminho, porque
`IF NOT EXISTS` vê a tabela e não faz nada.

**Custo:** a N2 inteira depende de alterar o schema — constraint `EXCLUDE`
(BE-01), `CHECK` de janela (BE-02), `CHECK` de status (BE-03), `TIMESTAMPTZ`
(BE-07), índices (CS-09). Nenhuma dessas mudanças tem como chegar na máquina
de outra pessoa sem migrations.

**Resolve:** [OPS-02](../specs/ops-02-versioned-migrations/implementacao.md).

---

## CS-07 — Configuração hardcoded no cliente

**Severidade:** MÉDIO · **Onde:** `client/src/services/api.js:1`

```js
const API_BASE_URL = 'http://localhost:5000/api';
```

Primeira linha do arquivo, valor fixo. O frontend só funciona apontado para
`localhost:5000`. Não existe `.env` no client. Publicar em qualquer lugar
exige editar código e recompilar.

**Resolve:** [FE-02](../specs/fe-02-api-layer-and-env-config/implementacao.md).

---

## CS-08 — Refetch total a cada mutação

**Severidade:** MÉDIO · **Onde:** `client/src/App.jsx:37-51`, chamado em 5 lugares

```js
const [resData, resvData] = await Promise.all([api.getResources(), api.getReservations()]);
```

`loadData()` é chamado depois de criar espaço, excluir espaço, criar reserva,
mudar status e excluir reserva. Toda vez recarrega **as duas** coleções
inteiras. Mudar o status de uma reserva recarrega a lista de espaços.

Como não há paginação em `findAll` (`SELECT * FROM reservations ORDER BY
start_time ASC`), isso cresce sem limite com o uso. Hoje é imperceptível
porque a base está vazia.

**Resolve:** [FE-01](../specs/fe-01-split-god-component/implementacao.md).

---

## CS-09 — Zero índices

**Severidade:** MÉDIO · **Onde:** `server/src/config/initDb.js`

```bash
$ grep -ci 'index' server/src/config/initDb.js
0
```

Não há um único índice além das chaves primárias implícitas. E as consultas do
sistema filtram e ordenam justamente pelas colunas sem índice:

* `findByResourceId` → `WHERE resource_id = $1 ORDER BY start_time`
* `checkAvailability` → `WHERE resource_id = $1 AND status != ... AND (start_time < $3 AND end_time > $2)`
* `findAll` → `ORDER BY start_time ASC`

`checkAvailability` roda em **toda criação de reserva**, que é a operação mais
frequente do sistema, e faz varredura completa da tabela.

**Resolve:** [OPS-02](../specs/ops-02-versioned-migrations/implementacao.md).

---

## CS-10 — Lint sem dente

**Severidade:** MÉDIO · **Onde:** `server/eslint.config.js`, `client/eslint.config.js`

```bash
$ cd server && npm run lint   # 0 erros
$ cd client && npm run lint   # 0 erros
```

Zero erros nos dois pacotes. Parece ótimo, e é o achado mais enganoso da
auditoria: a configuração é essencialmente `@eslint/js` recomendado mais
Prettier. **Não há nenhuma regra de complexidade ciclomática, tamanho de
função, tamanho de arquivo, segurança ou acessibilidade.**

Por isso um arquivo de 351 linhas passa. Por isso sete `<label>` sem `htmlFor`
passam. Por isso dez blocos duplicados passam. O CI verde está certificando
formatação e chamando isso de qualidade — e a CI do grupo anterior bloqueia
merge com base nesse verde.

**Resolve:** [OPS-03](../specs/ops-03-ci-quality-gates/implementacao.md).

---

## CS-11 — Placeholders versionados

**Severidade:** BAIXO

`client/client.txt`, `server/server.txt` e `shared/shared.txt`, **os três com
0 byte**. São marcadores de pasta que sobraram do scaffolding inicial.

Pior: `shared/` contém **só** o placeholder. A pasta sugere código
compartilhado entre front e back que nunca existiu — e é exatamente onde
deveriam morar os enums de domínio do CS-05.

**Resolve:** [OPS-01](../specs/ops-01-docker-compose-environment/implementacao.md).

---

## CS-12 — Supressões de lint

**Severidade:** BAIXO · **Onde:** `client/src/App.jsx:54,56`

```js
useEffect(() => {
  // eslint-disable-next-line react-hooks/set-state-in-effect
  loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);
```

Duas regras desligadas em três linhas de código. A segunda esconde uma
dependência faltando de verdade: `loadData` é recriada a cada render e o array
vazio mente sobre isso. Funciona por acidente, porque só roda na montagem.

**Resolve:** [FE-04](../specs/fe-04-accessibility-and-effect-cleanup/implementacao.md).

---

## CS-13 — Rótulos sem associação

**Severidade:** BAIXO · **Onde:** `client/src/App.jsx`

```bash
$ grep -c '<label>' client/src/App.jsx
7
```

Os sete `<label>` do sistema não têm `htmlFor`, e nenhum input tem `id`.
Clicar no rótulo não foca o campo, e leitor de tela não associa um ao outro.
Os botões de ação só têm `title`, sem `aria-label` — para quem usa leitor de
tela, são botões sem nome.

**Resolve:** [FE-04](../specs/fe-04-accessibility-and-effect-cleanup/implementacao.md).

---

## CS-14 — Superfície HTTP aberta

**Severidade:** BAIXO (nesta entrega) · **Onde:** `server/src/index.js:13`

```js
app.use(cors());
```

Sem argumento, libera qualquer origem. Não há `helmet`, não há rate limit, não
há limite de tamanho de corpo além do padrão do `express.json()`.

Está em BAIXO porque o sistema não tem autenticação nem dado sensível — não há
sessão para sequestrar. Mas combinado com a ausência de autenticação, qualquer
página web aberta no navegador de alguém pode apagar todas as reservas do
coworking. A severidade sobe para CRÍTICA no momento em que a N3 adicionar
login.

**Resolve parcialmente:** [BE-08](../specs/be-08-harden-http-surface/implementacao.md).
Autenticação fica como débito de prioridade máxima da N3.
