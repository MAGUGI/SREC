# OPS-02 — Migrations versionadas com node-pg-migrate

* **Responsável:** Gabriel Carvalho (DevOps)
* **Issue:** #<a definir>
* **Branch:** `feature/versioned-migrations`
* **Rubrica:** 4,0 — Onboarding e diagnóstico → 2,5 pt "Melhoria comprovada do código recebido (code smells resolvidos)". Resolve **CS-06** (MÉDIO) e é pré-requisito de boa parte dos 2,5 pt de bugs.
* **Depende de:** OPS-01 (o `server/Dockerfile` já copia `migrations/`; o compose roda `migrate:up` no boot). **Bloqueia:** BE-01, BE-02, BE-03, BE-07, CS-09 e QA-01.

## Problema

O schema do SREC é criado como **efeito colateral do boot do servidor**.

`server/src/index.js:26-31`:

```js
const startServer = async () => {
  await initDb();
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
};
```

`server/src/config/initDb.js:3-31` executa um único `db.query` com duas instruções
`CREATE TABLE IF NOT EXISTS` (linhas 5-23) e engole qualquer falha:

```js
  try {
    await db.query(queryText);
    console.log('Database tables ensured');
  } catch (err) {
    console.error('Error creating tables', err);
  }
```

Três defeitos estruturais decorrem disso:

1. **Funciona exatamente uma vez.** Qualquer alteração de schema — `ADD COLUMN`,
   `ADD CONSTRAINT`, `CREATE INDEX`, `ALTER COLUMN TYPE` — é **ignorada** em banco
   já existente, porque `IF NOT EXISTS` só decide se a tabela existe, não se ela
   está na forma correta. Editar `initDb.js` para adicionar uma constraint não tem
   nenhum efeito em nenhum banco já inicializado, inclusive no do colega e no do
   grupo da N3.
2. **Não há estado versionado.** Não existe tabela de controle de migrations nem
   histórico. Não há como responder "em qual versão de schema este banco está?",
   nem como voltar atrás.
3. **A falha é silenciosa.** O `catch` de `initDb.js:28-30` só loga. O
   `app.listen` da linha 28 de `index.js` roda de qualquer forma. É literalmente
   **BUG-11**.

Isso não é dívida abstrata: **a N2 inteira depende de alterar o schema.** O
levantamento mediu **0 constraints de integridade** e **0 índices além das PKs**, e
as seguintes specs já aprovadas precisam de DDL:

| Spec | DDL necessário | Bug/smell que fecha |
|---|---|---|
| BE-01 | `CREATE EXTENSION btree_gist` + `ALTER TABLE reservations ADD CONSTRAINT ... EXCLUDE USING gist` | BUG-01 (CRÍTICO) |
| BE-02 | `ADD CONSTRAINT ... CHECK (end_time > start_time)` | BUG-02 (CRÍTICO) |
| BE-03 | `ADD CONSTRAINT ... CHECK (status IN (...))` | BUG-03 (ALTO) |
| BE-07 | `ALTER COLUMN ... TYPE TIMESTAMPTZ` em 6 colunas | BUG-07 (ALTO) |
| CS-09 | `CREATE INDEX` em `resource_id` e `start_time` | CS-09 (MÉDIO) |

Sem migrations, cada uma dessas specs teria que editar `initDb.js` — e nenhuma
delas funcionaria em banco existente. O resultado seria cinco PRs verdes e zero
constraints aplicadas em produção. É o pior cenário possível para uma entrega que
precisa provar melhoria com número.

## Evidência

Ausência de qualquer mecanismo de migration:

```bash
cd server
ls migrations 2>/dev/null | wc -l                            # => 0 (pasta não existe)
grep -riE 'migrat|knex|sequelize|prisma|flyway|liquibase' \
  src/ package.json | wc -l                                  # => 0
grep -c 'CREATE TABLE IF NOT EXISTS' src/config/initDb.js    # => 2
```

Reprodução do defeito nº 1 (a mais importante de demonstrar no pitch):

```bash
# 1. Suba o sistema uma vez — as tabelas são criadas
docker compose up -d
docker compose exec postgres psql -U srec -d srec -c '\d reservations'
# => nenhuma constraint CHECK, nenhum EXCLUDE

# 2. Simule o que BE-02 faria sem migrations: edite
#    server/src/config/initDb.js:18-19 acrescentando
#    CHECK (end_time > start_time) dentro do CREATE TABLE

# 3. Reinicie o servidor
docker compose restart server
docker compose exec postgres psql -U srec -d srec -c '\d reservations'
# => AINDA nenhuma constraint. O IF NOT EXISTS pulou o CREATE inteiro.

# 4. Prova de que o banco aceita o dado inválido
docker compose exec postgres psql -U srec -d srec -c \
  "INSERT INTO resources (name,type) VALUES ('Sala 1','meeting_room');"
docker compose exec postgres psql -U srec -d srec -c \
  "INSERT INTO reservations (resource_id,user_name,start_time,end_time)
   VALUES (1,'teste','2026-01-02 10:00','2026-01-01 09:00');"
# => INSERT 0 1  (reserva que termina antes de começar: aceita)
```

Verificação do defeito nº 3:

```bash
# Sem Postgres acessível, o servidor sobe assim mesmo
cd server && DATABASE_URL=postgres://nao:existe@127.0.0.1:1/x npm start
# => Error creating tables ...
# => Server is running on port 5000     <-- subiu
```

Medição que esta spec move:

| Métrica | Antes (medido) | Depois (meta) |
|---|---|---|
| Migrations versionadas | **0** | **1** (inicial) + 7 slots reservados |
| Mecanismo de controle de versão de schema | **nenhum** | tabela `pgmigrations` |
| Alterações de schema aplicáveis em banco existente | **0** | **todas** |
| `CREATE TABLE` no caminho de boot do servidor | **2** | **0** |
| Falha de DDL que não impede o boot | **1** (`initDb.js:28-30`) | **0** |
| Arquivos no caminho de boot que fazem DDL | **1** (`initDb.js`, 33 linhas) | **0** (arquivo removido) |

## Decisão

**`node-pg-migrate`, com migrations em JavaScript CommonJS em `server/migrations/`,
numeração de prefixo reservada por spec e remoção total de `initDb.js` do caminho
de boot.**

* **`node-pg-migrate`, e não Knex nem Sequelize/Prisma.** Knex e Sequelize trazem
  um query builder e um ORM que o projeto **não** vai usar: `server/src/models/`
  é SQL cru deliberadamente (`reservationModel.js:49-61` tem a consulta de
  sobreposição escrita à mão, e BE-01 vai substituí-la por uma constraint do
  Postgres). Instalar um ORM para usar 5 % dele é aumentar superfície de
  dependência num projeto que a auditoria vai avaliar. Prisma exige um schema
  declarativo próprio e geraria uma segunda fonte de verdade sobre o schema,
  conflitando com a convenção "uma casa canônica por assunto". `node-pg-migrate`
  usa o mesmo `pg` que já está em `server/package.json:22`, roda SQL/DDL
  explícito, e tem `up`/`down` de verdade.

* **Migrations em JavaScript (`.js`), e não em `.sql` puro.** O
  `node-pg-migrate` aceita os dois. JS ganha por dois motivos concretos desta
  entrega: `pgm.sql()` permite SQL cru quando precisa (`CREATE EXTENSION
  btree_gist` de BE-01, por exemplo), mas `pgm.createTable` / `pgm.addConstraint`
  geram o `down` correspondente **automaticamente** — e `down` que funciona é o
  que vai permitir ao grupo da N3 reverter uma migration nossa sem adivinhar.
  Em `.sql` puro cada `down` teria que ser escrito e mantido à mão.

* **Prefixos numéricos reservados, e não timestamps gerados por
  `migrate:create`.** O `node-pg-migrate create` usa timestamp em milissegundos.
  Como **cinco specs de backend criam migrations em paralelo, em branches
  separadas**, dois desenvolvedores podem gerar timestamps cuja ordem relativa
  não é a ordem de merge — e a ordem importa muito aqui: BE-07 converte
  `TIMESTAMP` para `TIMESTAMPTZ` e BE-01 cria um `EXCLUDE` sobre um range de
  timestamp. Se BE-01 entrar antes de BE-07, o `EXCLUDE` é criado sobre
  `tsrange` e o `ALTER COLUMN TYPE` de BE-07 falha com
  `cannot alter type of a column used in a constraint`. A tabela de prefixos
  reservados da seção seguinte resolve isso **antes** de alguém perder meio dia.

* **`initDb.js` removido, não desativado.** Deixar o arquivo "só por garantia"
  mantém duas fontes de verdade sobre o schema e o `console.error` silencioso de
  BUG-11. A migration inicial representa exatamente o mesmo schema, então o
  arquivo não tem razão de existir.

* **A migration inicial usa `ifNotExists: true`.** Não é descuido: existem bancos
  locais já criados por `initDb.js` (o do colega, o nosso durante a auditoria).
  Se a migration inicial fizesse `CREATE TABLE` sem guarda, `migrate:up` falharia
  nesses bancos com `relation "resources" already exists` e o onboarding de
  OPS-01 quebraria na primeira execução de quem já tinha rodado o projeto. Com a
  guarda, o `migrate:up` registra a versão `1761000001000` como aplicada e segue
  para as migrations seguintes, que então **efetivamente alteram** o banco
  existente. É o comportamento que a seção "Problema" diz que falta hoje.

* **`migrate:up` roda no `command` do compose e num step próprio da CI**, não
  dentro do `index.js`. Migration no boot da aplicação é a mesma armadilha de
  `initDb.js` com outro nome: com 2+ réplicas, duas instâncias disputam o lock, e
  o servidor volta a ser responsável pelo schema. Separar deixa o deploy
  explícito: migra, depois sobe.

## Alterações

### Alterar — `server/package.json`

Adicionar a dependência e os quatro scripts.

```json
{
  "scripts": {
    "start": "node src/index.js",
    "dev": "nodemon src/index.js",
    "lint": "eslint src/",
    "lint:fix": "eslint src/ --fix",
    "format": "prettier --write \"src/**/*.js\" \"migrations/**/*.js\"",
    "test": "jest",
    "migrate": "node-pg-migrate",
    "migrate:up": "node-pg-migrate up",
    "migrate:down": "node-pg-migrate down 1",
    "migrate:create": "node-pg-migrate create --",
    "migrate:status": "node-pg-migrate --dry-run up"
  },
  "dependencies": {
    "cors": "^2.8.6",
    "dotenv": "^17.4.2",
    "express": "^5.2.1",
    "pg": "^8.23.0"
  },
  "devDependencies": {
    "node-pg-migrate": "^7.9.0"
  }
}
```

Dois pontos de implementação:

* `node-pg-migrate` entra em **`devDependencies`**, não em `dependencies`. O
  estágio `production` de `server/Dockerfile` roda `npm ci --omit=dev`; a
  migration é aplicada pelo estágio de desenvolvimento ou por um step de CI/deploy
  dedicado, nunca pelo processo da API. Se o time optar por rodar `migrate:up` no
  container de produção, mover para `dependencies` e registrar a mudança aqui.
* `migrate:down` é fixado em `down 1`. Sem o argumento, `node-pg-migrate down`
  reverte **uma** migration por padrão, mas deixar explícito evita que alguém
  passe `npm run migrate:down -- 5` sem perceber o que está desfazendo.
* `format` passa a cobrir `migrations/**/*.js`, senão o `prettier --check` de
  OPS-03 reprova as migrations novas.

### Criar — `server/.node-pg-migraterc.json`

Configuração explícita, para que nenhum comando dependa de flag na linha de
comando.

```json
{
  "migrations-dir": "migrations",
  "migrations-table": "pgmigrations",
  "migration-file-language": "js",
  "check-order": true,
  "verbose": true
}
```

A conexão vem de `DATABASE_URL` (comportamento padrão do `node-pg-migrate`), que
é a mesma variável usada em `server/src/config/database.js:5` e validada por
**OPS-04**. Não há segunda fonte de configuração de conexão.

### Criar — `server/migrations/1761000001000_initial-schema.js`

Representa o schema atual **exatamente** como `server/src/config/initDb.js:5-23`
o cria. Nenhuma melhoria entra aqui: o objetivo é que bancos existentes e bancos
novos convirjam para o mesmo ponto de partida, e que o `git log` mostre cada
melhoria de schema em sua própria migration, atribuível à spec que a motivou.

```js
/* eslint-disable camelcase */

exports.shorthands = undefined;

/**
 * Baseline do schema recebido do grupo anterior.
 *
 * Reproduz, sem nenhuma alteração, o DDL de server/src/config/initDb.js:5-23 do
 * commit de recebimento. Intencionalmente SEM constraints, SEM indices e com
 * TIMESTAMP sem fuso: as melhorias entram nas migrations seguintes (BE-01,
 * BE-02, BE-03, BE-07, CS-09), cada uma rastreavel a uma issue.
 *
 * ifNotExists: true e obrigatorio. Bancos criados pelo initDb.js antigo ja tem
 * essas tabelas; sem a guarda, o primeiro `migrate:up` falharia com
 * 'relation already exists' e nenhuma migration posterior seria aplicada.
 */
exports.up = (pgm) => {
  pgm.createTable(
    'resources',
    {
      id: { type: 'serial', primaryKey: true },
      name: { type: 'varchar(100)', notNull: true },
      type: { type: 'varchar(50)', notNull: true },
      capacity: { type: 'integer', notNull: true, default: 1 },
      created_at: { type: 'timestamp', default: pgm.func('CURRENT_TIMESTAMP') },
      updated_at: { type: 'timestamp', default: pgm.func('CURRENT_TIMESTAMP') },
    },
    { ifNotExists: true },
  );

  pgm.createTable(
    'reservations',
    {
      id: { type: 'serial', primaryKey: true },
      resource_id: {
        type: 'integer',
        references: 'resources(id)',
        onDelete: 'CASCADE',
      },
      user_name: { type: 'varchar(100)', notNull: true },
      start_time: { type: 'timestamp', notNull: true },
      end_time: { type: 'timestamp', notNull: true },
      status: { type: 'varchar(20)', default: 'scheduled' },
      created_at: { type: 'timestamp', default: pgm.func('CURRENT_TIMESTAMP') },
      updated_at: { type: 'timestamp', default: pgm.func('CURRENT_TIMESTAMP') },
    },
    { ifNotExists: true },
  );
};

exports.down = (pgm) => {
  pgm.dropTable('reservations', { ifExists: true });
  pgm.dropTable('resources', { ifExists: true });
};
```

O `ON DELETE CASCADE` é reproduzido de propósito, porque é o que `initDb.js:16`
tem hoje — e é **BUG-06**. Trocá-lo aqui esconderia a correção; ela tem prefixo
reservado na tabela abaixo.

### Criar — `server/migrations/.gitkeep`

Já criado por OPS-01 para que o `COPY migrations ./migrations` do Dockerfile não
falhe. Pode ser removido neste PR, já que a pasta passa a ter a migration inicial.

### Alterar — `server/src/index.js`

Remover `initDb` do caminho de boot. Diff conceitual sobre o arquivo de 33 linhas:

```diff
 const express = require('express');
 const cors = require('cors');
 require('dotenv').config();

-const initDb = require('./config/initDb');
 const resourceRoutes = require('./routes/resourceRoutes');
 const reservationRoutes = require('./routes/reservationRoutes');
@@
-// Initialize DB and start server
-const startServer = async () => {
-  await initDb();
-  app.listen(PORT, () => {
-    console.log(`Server is running on port ${PORT}`);
-  });
-};
-
-startServer();
+// O schema e aplicado por migrations versionadas (`npm run migrate:up`),
+// fora do caminho de boot. Ver docs/specs/ops-02-versioned-migrations/.
+app.listen(PORT, () => {
+  console.log(`Server is running on port ${PORT}`);
+});
```

Limite de escopo desta spec: aqui o `index.js` perde o `startServer` e ganha um
`app.listen` direto. A **validação** de `DATABASE_URL` no boot é de **OPS-04**, o
`/health` e o handler de erro do pool são de **BE-08**, e a exportação de `app`
para o Supertest é de **QA-01**. Este PR só remove o `initDb`.

### Remover — `server/src/config/initDb.js`

Arquivo inteiro (33 linhas). Com ele saem:

* os 2 `CREATE TABLE IF NOT EXISTS` (linhas 5-23);
* o `catch` que engole falha de DDL (linhas 28-30) — **BUG-11** deixa de existir
  no arquivo em que foi catalogado, e BE-08/OPS-04 cobrem a classe restante
  (conexão de banco ausente no boot).

Confirmar que nada mais importa o módulo antes de remover:

```bash
cd server && grep -rn "initDb" src/ migrations/ || echo 'nenhuma referencia restante'
```

Efeito colateral positivo nas métricas: `initDb.js` era um dos arquivos com
**0 % de cobertura** no baseline de 6,14 %. Removê-lo tira 33 linhas não
cobertas do denominador — o relatório de cobertura do PR deve registrar o número
antes e depois, para que o ganho não seja confundido com teste novo (quem
adiciona teste de verdade é QA-01).

### Alterar — `docker-compose.override.yml`

O serviço `server` passa a migrar antes de subir. Substituir o `command` definido
por OPS-01:

```yaml
services:
  server:
    command:
      - sh
      - -c
      - 'npm run migrate:up && npm run dev'
```

### Alterar — `docker-compose.yml`

Mesmo ajuste no serviço de produção, com `start` em vez de `dev`:

```yaml
services:
  server:
    command:
      - sh
      - -c
      - 'npm run migrate:up && npm run start'
```

Nota de implementação: `node-pg-migrate` está em `devDependencies` e o estágio
`production` roda `npm ci --omit=dev`, então o `migrate:up` **não** existe nessa
imagem. Duas saídas, escolha uma e registre no PR:

1. Mover `node-pg-migrate` para `dependencies` (mais simples, +1 dependência de
   runtime); ou
2. Adicionar ao `docker-compose.yml` um serviço `migrate` de execução única que
   usa `target: development`, com `server` dependendo dele via
   `condition: service_completed_successfully`.

A opção 2 é a correta arquiteturalmente e é a recomendada:

```yaml
  migrate:
    build:
      context: ./server
      target: development
    environment:
      DATABASE_URL: postgres://srec:srec@postgres:5432/srec
    command: ['npm', 'run', 'migrate:up']
    depends_on:
      postgres:
        condition: service_healthy
    restart: 'no'

  server:
    depends_on:
      postgres:
        condition: service_healthy
      migrate:
        condition: service_completed_successfully
```

Com o serviço `migrate`, o `command` do `server` volta a ser o original
(`npm run start` / `npm run dev`) e a meta de OPS-01 — **um comando** — continua
valendo: `docker compose up` sobe postgres → migrate → server → client na ordem
correta.

### Alterar — `.github/workflows/ci.yml`

OPS-03 reescreve o arquivo. O step que **esta** spec contribui, no job de
backend, entre o `npm ci` e o `npm test`:

```yaml
      - name: Aplicar migrations no banco de teste
        run: npm run migrate:up
        env:
          DATABASE_URL: postgres://srec:srec@localhost:5432/srec_test

      - name: Verificar que o down da ultima migration funciona
        run: npm run migrate:down && npm run migrate:up
        env:
          DATABASE_URL: postgres://srec:srec@localhost:5432/srec_test
```

O segundo step é o que impede `down` quebrado de entrar no repositório — é
baratíssimo e é exatamente o que o grupo da N3 vai agradecer.

### Alterar — `server/eslint.config.js`

O arquivo tem 28 linhas e `files` não é declarado, então o config vale para tudo
que o `eslint src/` alcança. Como o `lint` do `package.json:9` só olha `src/`, as
migrations não são lintadas. Ampliar:

```json
  "lint": "eslint src/ migrations/",
  "lint:fix": "eslint src/ migrations/ --fix"
```

E acrescentar o bloco de globals de migration ao `server/eslint.config.js`,
depois do bloco atual e antes do `prettier`:

```js
  {
    files: ['migrations/**/*.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { exports: 'writable', module: 'readonly', require: 'readonly' },
    },
    rules: {
      // migrations sao DDL declarativo: nao se aplicam limites de tamanho
      'max-lines-per-function': 'off',
      'max-lines': 'off',
    },
  },
```

As duas regras desativadas são as que **OPS-03** introduz; desativá-las já aqui
evita que o PR de OPS-03 chegue com avisos nas migrations.

### Alterar — `README.md`

Na seção "Opção B — Execução local sem Docker" criada por OPS-01, o passo 3 já
inclui `npm run migrate:up`. Acrescentar uma subseção nova:

````markdown
### Migrations de banco

O schema é versionado em `server/migrations/`, com `node-pg-migrate`. O servidor
**não** cria tabelas: `npm start` apenas sobe a API.

```bash
cd server
npm run migrate:up              # aplica todas as migrations pendentes
npm run migrate:down            # reverte a última migration
npm run migrate:status          # mostra o que está pendente (dry run)
npm run migrate:create nome-da-mudanca   # cria um arquivo novo
```

Com Docker, o `docker compose up` roda `migrate:up` automaticamente no serviço
`migrate` antes de subir o `server`.

O estado é registrado na tabela `pgmigrations` do próprio banco:

```bash
docker compose exec postgres psql -U srec -d srec -c 'SELECT * FROM pgmigrations ORDER BY id;'
```

Convenção: **uma migration por issue**, com o prefixo numérico reservado em
`docs/specs/ops-02-versioned-migrations/implementacao.md`. Nunca edite uma
migration já mesclada em `main` — crie uma nova.
````

## Prefixos reservados — para ninguém colidir

O `node-pg-migrate` ordena as migrations **pelo nome do arquivo**, em ordem
lexicográfica. Os prefixos abaixo estão **reservados**. Quem implementa a spec
cria o arquivo com o nome exato da tabela, **à mão**, em vez de usar
`npm run migrate:create` (que geraria um timestamp arbitrário e poderia inverter a
ordem entre branches paralelas).

| Prefixo | Arquivo | Spec | Responsável | DDL |
|---|---|---|---|---|
| `1761000001000` | `initial-schema.js` | **OPS-02** (este) | Gabriel Carvalho | baseline do schema recebido |
| `1761000002000` | `add-reservation-time-window-check.js` | **BE-02** | Adrian Cesar | `CHECK (end_time > start_time)` em `reservations` |
| `1761000003000` | `add-reservation-status-check.js` | **BE-03** | Adrian Cesar | `CHECK (status IN ('scheduled','cancelled','completed'))` + `SET NOT NULL` em `status` |
| `1761000004000` | `alter-timestamps-to-timestamptz.js` | **BE-07** | Adrian Cesar | `ALTER COLUMN TYPE TIMESTAMPTZ` em `start_time`, `end_time`, `created_at`, `updated_at` (ambas as tabelas) |
| `1761000005000` | `add-reservation-overlap-exclude-constraint.js` | **BE-01** | Adrian Cesar | `CREATE EXTENSION IF NOT EXISTS btree_gist` + `EXCLUDE USING gist (resource_id WITH =, tstzrange(start_time, end_time) WITH &&) WHERE (status <> 'cancelled')` |
| `1761000006000` | `add-reservation-lookup-indexes.js` | **CS-09** | Adrian Cesar | `CREATE INDEX` em `reservations(resource_id)` e `reservations(start_time)` |
| `1761000007000` | `add-resource-type-and-capacity-checks.js` | BUG-09 / BUG-10 | Adrian Cesar | `CHECK (type IN ('workstation','meeting_room'))` e `CHECK (capacity > 0)` |
| `1761000008000` | `change-reservation-fk-to-restrict.js` | BUG-06 | Adrian Cesar | trocar `ON DELETE CASCADE` por `ON DELETE RESTRICT` na FK `reservations.resource_id` |

**A ordem não é negociável, e aqui está o porquê de cada dependência:**

* **`1761000004000` (BE-07) vem antes de `1761000005000` (BE-01).** A constraint
  `EXCLUDE` de BE-01 é construída sobre um range de timestamp. Se ela entrar
  primeiro, o `ALTER COLUMN ... TYPE TIMESTAMPTZ` de BE-07 falha com
  `cannot alter type of a column used in a constraint` e BE-07 teria que dropar e
  recriar a constraint de outra pessoa. Com BE-07 antes, BE-01 cria o `EXCLUDE`
  direto sobre `tstzrange` e nada precisa ser refeito.
* **`1761000002000` (BE-02) vem antes de `1761000005000` (BE-01).** O `EXCLUDE`
  só protege contra sobreposição; uma reserva com `end_time < start_time` produz
  um `tstzrange` **vazio**, que não colide com nada (é exatamente o segundo
  parágrafo de BUG-02). A `CHECK` de janela é o que torna o `EXCLUDE` efetivo.
* **`1761000003000` (BE-03) vem antes de `1761000005000` (BE-01).** O `EXCLUDE`
  de BE-01 usa `WHERE (status <> 'cancelled')`; se `status` puder ser `NULL` ou
  qualquer string, o predicado parcial fica indefinido para parte das linhas.
* **`1761000006000` (CS-09) vem por último entre as estruturais.** O `EXCLUDE` de
  BE-01 cria um índice GiST em `(resource_id, tstzrange(...))`; só depois de ver
  esse índice é que se decide quais índices B-tree de CS-09 ainda fazem diferença.
  Criar índice redundante é piora de escrita sem ganho de leitura, e CS-09 precisa
  mostrar `EXPLAIN ANALYZE` antes e depois.
* **BE-02 e BE-03 podem falhar em banco com dado sujo.** A migration de cada uma
  precisa de um `UPDATE`/`DELETE` de saneamento **antes** do `ADD CONSTRAINT`, ou
  o `migrate:up` de quem tem dados de teste inválidos quebra. Cada spec trata o
  seu; esta aqui só avisa.

Regra operacional: se uma spec precisar de uma migration não prevista acima,
abra o número **`1761000009000`** em diante e **atualize esta tabela no mesmo
PR**. A tabela é a casa canônica da ordem de schema do projeto.

## Testes

### Teste que falha antes desta spec

Não existe hoje nenhuma forma de aplicar uma alteração de schema em banco
existente. O teste abaixo é o que comprova a correção; **antes** desta spec ele
não tem nem como ser escrito, porque o comando `npm run migrate:up` não existe.

```bash
cd server && npm run migrate:up
# ANTES: npm error Missing script: "migrate:up"
# DEPOIS: > Migrating files: > 1761000001000_initial-schema ... done
```

### Caso 1 — banco novo converge para o schema do baseline

```bash
docker compose down -v
docker compose up -d postgres
cd server
DATABASE_URL=postgres://srec:srec@localhost:5432/srec npm run migrate:up
docker compose exec postgres psql -U srec -d srec -c '\d resources'
docker compose exec postgres psql -U srec -d srec -c '\d reservations'
```

Aceite: as 6 colunas de `resources` e as 8 de `reservations` existem, com os
mesmos tipos de `initDb.js:5-23`; a tabela `pgmigrations` tem **1** linha.

### Caso 2 — banco já criado pelo `initDb.js` antigo não quebra

Este é o caso que justifica o `ifNotExists`.

```bash
docker compose down -v
docker compose up -d postgres
# recria as tabelas pelo caminho antigo, direto no psql
docker compose exec postgres psql -U srec -d srec <<'SQL'
CREATE TABLE IF NOT EXISTS resources (
  id SERIAL PRIMARY KEY, name VARCHAR(100) NOT NULL, type VARCHAR(50) NOT NULL,
  capacity INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS reservations (
  id SERIAL PRIMARY KEY,
  resource_id INTEGER REFERENCES resources(id) ON DELETE CASCADE,
  user_name VARCHAR(100) NOT NULL, start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP NOT NULL, status VARCHAR(20) DEFAULT 'scheduled',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
SQL
cd server
DATABASE_URL=postgres://srec:srec@localhost:5432/srec npm run migrate:up
```

Aceite: sai com código **0**, sem `relation "resources" already exists`, e
`pgmigrations` registra `1761000001000`.

### Caso 3 — `down` reverte sem resíduo

```bash
cd server
npm run migrate:down
docker compose exec postgres psql -U srec -d srec -c '\dt'
```

Aceite: `resources` e `reservations` desaparecem; `pgmigrations` fica com
**0** linhas; a tabela `pgmigrations` em si permanece.

### Caso 4 — idempotência de `up`

```bash
npm run migrate:up && npm run migrate:up
```

Aceite: a segunda execução imprime `No migrations to run!` e sai 0.

### Caso 5 — o servidor não cria mais tabelas

```bash
docker compose down -v
docker compose up -d postgres
cd server
DATABASE_URL=postgres://srec:srec@localhost:5432/srec npm start &
sleep 3
docker compose exec postgres psql -U srec -d srec -c '\dt'
```

Aceite: **nenhuma** tabela de aplicação existe. É a prova direta de que CS-06 foi
resolvido: o boot do servidor deixou de ter efeito colateral sobre o schema.

### Caso 6 — suíte Jest existente continua verde

`server/src/models/reservationModel.test.js` (38 linhas, 2 testes) faz
`jest.mock('../config/database')` na linha 4 e não toca em `initDb`, então a
remoção não deve afetá-lo.

```bash
cd server && npx jest --coverage --coverageReporters=text --collectCoverageFrom='src/**/*.js'
```

Aceite: **2 testes passando**, e a cobertura de statements **sobe** em relação aos
6,14 % do baseline — porque as 33 linhas não cobertas de `initDb.js` saíram do
denominador. Registrar os dois números no corpo do PR e deixar claro que o ganho
é por remoção de código morto, não por teste novo.

## Critérios de aceite

* [ ] `node-pg-migrate` consta em `server/package.json`.
* [ ] `server/.node-pg-migraterc.json` existe e aponta `migrations-dir: migrations`.
* [ ] Os scripts `migrate`, `migrate:up`, `migrate:down`, `migrate:create` e
      `migrate:status` existem em `server/package.json`.
* [ ] `server/migrations/1761000001000_initial-schema.js` existe, usa
      `ifNotExists: true` nas duas tabelas e reproduz `initDb.js:5-23` **sem
      nenhuma melhoria embutida** (inclusive mantendo o `ON DELETE CASCADE`).
* [ ] A migration inicial tem `down` que dropa as duas tabelas na ordem correta
      (`reservations` antes de `resources`).
* [ ] `server/src/config/initDb.js` foi **removido** e
      `grep -rn initDb server/` não retorna nada.
* [ ] `server/src/index.js` não importa `initDb` e não tem mais `startServer`.
* [ ] `docker compose up` aplica as migrations antes de o `server` iniciar, via
      serviço `migrate` com `condition: service_completed_successfully`.
* [ ] `.github/workflows/ci.yml` tem step de `migrate:up` **e** o step de
      `migrate:down && migrate:up`.
* [ ] `npm run lint` cobre `migrations/` e sai com 0 erros.
* [ ] Os 6 casos de teste da seção anterior foram executados, com a saída colada
      no PR.
* [ ] A tabela de **prefixos reservados** está no corpo do PR e foi comunicada no
      canal do time, para BE-01/BE-02/BE-03/BE-07/CS-09.
* [ ] `README.md` tem a subseção "Migrations de banco".
* [ ] O par de números de cobertura (antes 6,14 % / depois) está no PR, com a
      ressalva de que o ganho vem da remoção de `initDb.js`.
* [ ] PR aprovado por `@igorSeberino` (QA).

## Passo a passo TBD

```bash
# 1. Esta branch sai de OPS-01 já mesclada (o Dockerfile precisa de migrations/)
git checkout main
git pull origin main
git checkout -b feature/versioned-migrations

# 2. Instalar a ferramenta
cd server
npm install --save-dev node-pg-migrate

# 3. Criar a configuração e a migration inicial
#    server/.node-pg-migraterc.json
#    server/migrations/1761000001000_initial-schema.js
#    (criar o arquivo À MÃO com esse nome; NÃO usar `migrate:create`)
rm -f migrations/.gitkeep

# 4. Validar contra um Postgres limpo
cd ..
docker compose down -v
docker compose up -d postgres
cd server
export DATABASE_URL=postgres://srec:srec@localhost:5432/srec
npm run migrate:up
npm run migrate:up            # Caso 4: idempotência
npm run migrate:down          # Caso 3: down limpo
npm run migrate:up

# 5. Remover o initDb do caminho de boot
#    editar server/src/index.js (remover import e startServer)
#    git rm server/src/config/initDb.js
grep -rn "initDb" src/ migrations/ || echo 'nenhuma referencia restante'

# 6. Caso 5: o servidor não cria mais tabelas
cd .. && docker compose down -v && docker compose up -d postgres
cd server && npm start & sleep 3
docker compose exec postgres psql -U srec -d srec -c '\dt'
kill %1

# 7. Testes e lint
npm run lint
npx jest --coverage --coverageReporters=text --collectCoverageFrom='src/**/*.js'

# 8. Commits
git add server/package.json server/package-lock.json server/.node-pg-migraterc.json
git commit -m "build(server): adicionar node-pg-migrate e scripts de migration"

git add server/migrations/1761000001000_initial-schema.js
git rm --cached server/migrations/.gitkeep
git commit -m "feat(db): versionar o schema recebido como migration inicial"

git add server/src/index.js
git rm server/src/config/initDb.js
git commit -m "refactor(server): remover criacao de tabelas do caminho de boot"

git add docker-compose.yml docker-compose.override.yml
git commit -m "build: aplicar migrations antes de subir o server no compose"

git add .github/workflows/ci.yml
git commit -m "ci: aplicar migrations e validar o down no job de backend"

git add server/eslint.config.js server/package.json README.md
git commit -m "docs: documentar o fluxo de migrations e os prefixos reservados"

# 9. Publicar
git push -u origin feature/versioned-migrations
```

Corpo do PR (colar):

```
Fecha #<a definir>
Resolve CS-06 (MÉDIO) e remove BUG-11 do arquivo em que foi catalogado.

## O que muda
O schema deixa de ser efeito colateral do boot (server/src/config/initDb.js,
removido) e passa a ser versionado em server/migrations/ com node-pg-migrate.

## Antes / depois
| Métrica | Antes | Depois |
|---|---|---|
| Migrations versionadas | 0 | 1 + 7 prefixos reservados |
| Controle de versão de schema | nenhum | tabela pgmigrations |
| Alterações de schema aplicáveis em banco existente | 0 | todas |
| CREATE TABLE no boot do servidor | 2 | 0 |
| Falha de DDL que não impede o boot | 1 | 0 |
| Arquivos de DDL no caminho de boot | 1 (33 linhas) | 0 |
| Cobertura de statements | 6,14 % | <preencher> (ganho por remoção de 33 linhas não cobertas) |

## ATENÇÃO — BE-01, BE-02, BE-03, BE-07, CS-09
A tabela de PREFIXOS RESERVADOS está na spec. Crie seu arquivo de migration com
o nome exato reservado e NÃO use `npm run migrate:create`. A ordem importa:
BE-07 (TIMESTAMPTZ) precisa entrar ANTES de BE-01 (EXCLUDE), senão o ALTER
COLUMN TYPE falha.

## Como validar
Casos 1 a 6 da spec: docs/specs/ops-02-versioned-migrations/implementacao.md

## Rubrica
4,0 — Onboarding e diagnóstico (2,5 pt de melhoria comprovada)
```

## Prompt para o Claude Code

```
Implemente a spec OPS-02 deste repositório.

Leia primeiro, por inteiro:
- docs/specs/ops-02-versioned-migrations/implementacao.md
- server/src/config/initDb.js (as 33 linhas)
- server/src/index.js
- server/src/config/database.js
- server/package.json
- docker-compose.yml e docker-compose.override.yml

Carregue a skill de arquitetura/banco do time (.claude/skills) antes de começar.

Crie a branch feature/versioned-migrations e execute a seção "Alterações" da
spec.

Regras não negociáveis:
1. A migration inicial DEVE se chamar exatamente
   server/migrations/1761000001000_initial-schema.js. Crie o arquivo à mão.
   NÃO rode `node-pg-migrate create`: o timestamp gerado quebraria a tabela de
   prefixos reservados que cinco outras specs vão usar.
2. A migration inicial DEVE reproduzir server/src/config/initDb.js:5-23 EXATAMENTE
   como está. Não adicione CHECK, não adicione índice, não troque TIMESTAMP por
   TIMESTAMPTZ, não troque ON DELETE CASCADE por RESTRICT. Essas melhorias
   pertencem a BE-01, BE-02, BE-03, BE-07, CS-09 e às issues de BUG-06/09/10,
   cada uma na sua própria migration com prefixo reservado.
3. As duas chamadas de pgm.createTable DEVEM usar { ifNotExists: true }, senão o
   primeiro migrate:up falha em bancos já criados pelo initDb.js antigo.
4. server/src/config/initDb.js DEVE ser removido com `git rm`, não comentado nem
   renomeado.
5. node-pg-migrate entra em devDependencies, e o compose ganha um serviço
   `migrate` de execução única (target: development) com o server dependendo dele
   via condition: service_completed_successfully.
6. Não implemente /health nem pool.on('error') — são de BE-08. Não implemente
   validação de env — é de OPS-04. Não adicione testes de integração — são de
   QA-01.

Ao terminar, rode e me mostre a saída REAL de cada comando (os casos 1 a 6 da
seção "Testes" da spec):
  docker compose down -v && docker compose up -d postgres
  cd server && export DATABASE_URL=postgres://srec:srec@localhost:5432/srec
  npm run migrate:up
  npm run migrate:up
  npm run migrate:down
  npm run migrate:up
  docker compose exec -T postgres psql -U srec -d srec -c '\d reservations'
  docker compose exec -T postgres psql -U srec -d srec -c 'SELECT * FROM pgmigrations;'
  grep -rn initDb src/ migrations/ ; echo "exit=$?"
  npm run lint
  npx jest --coverage --coverageReporters=text --collectCoverageFrom='src/**/*.js'

Me diga o número de cobertura de statements antes (6,14 %) e depois, medido.
Não invente nenhuma saída. Se algo falhar, corrija e rode de novo.

Por fim, crie os 6 commits com as mensagens exatas da seção "Passo a passo TBD",
nessa ordem. Não abra o PR nem rode git push.
```
