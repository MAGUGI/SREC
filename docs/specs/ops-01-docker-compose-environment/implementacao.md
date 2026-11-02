# OPS-01 — Ambiente completo em um comando com Docker Compose

* **Responsável:** Gabriel Carvalho (DevOps)
* **Issue:** #<a definir>
* **Branch:** `feature/docker-compose-environment`
* **Rubrica:** 4,0 — Onboarding e diagnóstico → 1,5 pt "O grupo conseguiu subir o sistema do colega?". Também sustenta 1,5 pt de "Atualização do README e clareza para a N3".
* **Depende de:** nada. É pré-requisito prático de QA-01 (precisa de um Postgres real) e de OPS-02 (roda as migrations no boot do compose).

## Problema

Não existe nenhum artefato de containerização no repositório recebido. A busca por
`Dockerfile`, `docker-compose.yml`, `.dockerignore` ou `compose.yaml` na árvore de
trabalho retorna **0 arquivos**. O único caminho de execução documentado é o manual,
em `README.md:40-63`.

Esse caminho manual tem **7 passos** e depende de software instalado na máquina do
desenvolvedor:

1. `README.md:43` — "Certifique-se de ter o PostgreSQL instalado e rodando".
2. `README.md:44` — "Crie um banco de dados chamado `srec`".
3. `README.md:45` — "Configure as credenciais no arquivo `server/.env` (use o `server/.env.example` como base)".
4. `README.md:51` — `npm install` em `server/`.
5. `README.md:52` — `npm run dev` em `server/`.
6. `README.md:60` — `npm install --legacy-peer-deps` em `client/`.
7. `README.md:61` — `npm run dev` em `client/`.

Três agravantes verificados no código:

* `server/.env.example` tem só 2 linhas (`PORT=5000` e
  `DATABASE_URL=postgres://postgres:***@localhost:5432/srec`) e a senha está
  mascarada com `***`. Quem clona não consegue adivinhar a credencial local; tem
  que criar um usuário Postgres novo e reescrever a URL.
* `server/src/config/database.js:4-6` monta o `Pool` com `connectionString:
  process.env.DATABASE_URL` e nada mais. Se a variável não existir, o `pg` cai nos
  defaults do libpq (usuário do SO, banco com o nome do usuário) e o servidor
  **sobe** — a falha só aparece na primeira requisição. Diagnóstico caro para quem
  não conhece o projeto.
* `client/src/services/api.js:1` fixa `const API_BASE_URL =
  'http://localhost:5000/api';`. Qualquer topologia de rede que não exponha o
  backend em `localhost:5000` para o **navegador** quebra o front sem mensagem útil.

Para a N2 isso é caro duas vezes: cada uma das 5 pessoas do time paga o setup
manual, e o grupo da N3 vai pagar de novo em novembro.

## Evidência

Ausência dos artefatos, comprovável na raiz do repositório:

```bash
# na raiz do repositório
ls Dockerfile docker-compose.yml compose.yaml 2>/dev/null | wc -l   # => 0
find . -name 'Dockerfile*' -not -path './*/node_modules/*' | wc -l  # => 0
find . -name '.dockerignore' | wc -l                                # => 0
```

Reprodução da fricção, em máquina limpa: siga `README.md:42-63` até `npm run dev`
em `server/` sem instalar PostgreSQL. O servidor **imprime** `Server is running on
port 5000` (de `server/src/index.js:29`) e o log de erro de criação de tabela é
engolido pelo `catch` de `server/src/config/initDb.js:28-30`, que só faz
`console.error`. Em seguida, `curl http://localhost:5000/api/resources` responde
500. O sistema parece ter subido e não subiu — é exatamente BUG-11.

Medição que esta spec move:

| Métrica | Antes (medido) | Depois (meta) |
|---|---|---|
| Comandos para subir o sistema inteiro | **7** | **1** (`docker compose up`) |
| Software que o dev precisa instalar | PostgreSQL + Node 20 | Docker Desktop |
| Variáveis de ambiente para editar à mão | 2 (`PORT`, `DATABASE_URL`, com senha mascarada) | **0** |
| Terminais abertos simultaneamente | 2 | **1** |
| Dockerfiles no repositório | **0** | **2** |
| Arquivos compose | **0** | **2** (base + override de dev) |

## Decisão

**Docker Compose com três serviços, dois Dockerfiles multi-stage e um arquivo de
override para desenvolvimento.**

Decisões específicas e a alternativa que foi descartada em cada uma:

* **Compose, e não Dev Containers nem script `setup.sh`.** Um `setup.sh` que
  instala PostgreSQL continua dependente do SO (o time tem Windows e macOS) e não
  reproduz a versão do banco. Dev Containers resolveria o editor, mas amarra o time
  ao VS Code e não ajuda a CI. Compose é o único formato que serve às três
  necessidades: onboarding local, Postgres real para QA-01 e paridade com o job de
  CI de OPS-03.

* **`depends_on` com `condition: service_healthy`, e não `restart: on-failure` no
  server.** A versão ingênua (`depends_on: [postgres]`) só espera o container
  **iniciar**, não o Postgres **aceitar conexões** — e o Postgres oficial reinicia
  o cluster uma vez durante a inicialização, então a janela de falha é real.
  Deixar o server morrer e reiniciar funciona, mas polui o log com stack traces na
  primeira execução de todo mundo, o que é péssimo para uma spec cujo objetivo é
  onboarding. O `healthcheck` com `pg_isready` custa 6 linhas e elimina a classe
  inteira de erro.

* **Volume nomeado (`srec_pgdata`), e não bind mount para os dados do Postgres.**
  Bind mount de `PGDATA` em Windows/macOS via Docker Desktop tem problema de
  permissão e de performance de fsync. Volume nomeado é portátil, e
  `docker compose down -v` dá o reset limpo que o time vai precisar ao testar as
  migrations de OPS-02.

* **Dois arquivos compose em vez de um só com perfis.** `docker-compose.yml`
  descreve o alvo (imagens de produção, sem código montado); o
  `docker-compose.override.yml` é lido **automaticamente** pelo `docker compose up`
  e troca para bind mount + hot reload. Resultado: `docker compose up` é o comando
  de desenvolvimento (um comando, como a meta exige) e
  `docker compose -f docker-compose.yml up` é o de produção. Perfis (`--profile`)
  exigiriam flag em todo comando, violando a meta.

* **O `server` é publicado em `5000:5000` no host.** Isso não é estética: o
  navegador do dev executa `client/src/services/api.js:1`, que chama
  `http://localhost:5000/api`. Como o `fetch` roda no host, não na rede do compose,
  o backend **precisa** estar em `localhost:5000` para o front funcionar hoje, sem
  depender de outra spec. A variável `VITE_API_BASE_URL` já é injetada nos dois
  Dockerfiles do client para que a spec de frontend que resolve **CS-07**
  (`API_BASE_URL` hardcoded) só precise trocar a linha 1 de `api.js` por
  `import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5000/api'`, sem mexer em
  infraestrutura.

* **`npm ci --legacy-peer-deps` no client.** Não é preferência: `client/package.json`
  declara `eslint: ^9.39.5` junto de `eslint-plugin-react-hooks: ^7.1.1` e
  `@eslint/js: ^10.0.1`, e o `README.md:60` e o `.github/workflows/ci.yml:36` já
  usam a flag. O Dockerfile repete o que a CI já faz, para não divergir.

## Alterações

### Criar — `docker-compose.yml` (raiz)

```yaml
name: srec

services:
  postgres:
    image: postgres:16-alpine
    container_name: srec-postgres
    environment:
      POSTGRES_USER: srec
      POSTGRES_PASSWORD: srec
      POSTGRES_DB: srec
    ports:
      - '5432:5432'
    volumes:
      - srec_pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U srec -d srec']
      interval: 5s
      timeout: 5s
      retries: 10
      start_period: 10s
    restart: unless-stopped

  server:
    build:
      context: ./server
      target: production
    container_name: srec-server
    environment:
      NODE_ENV: production
      PORT: 5000
      DATABASE_URL: postgres://srec:srec@postgres:5432/srec
      CORS_ALLOWED_ORIGINS: http://localhost:5173
    ports:
      - '5000:5000'
    depends_on:
      postgres:
        condition: service_healthy
    restart: unless-stopped

  client:
    build:
      context: ./client
      target: production
      args:
        VITE_API_BASE_URL: http://localhost:5000/api
    container_name: srec-client
    ports:
      - '5173:80'
    depends_on:
      - server
    restart: unless-stopped

volumes:
  srec_pgdata:
```

Observação de contrato: `CORS_ALLOWED_ORIGINS` é consumida por **BE-08** e
validada por **OPS-04**. Enquanto BE-08 não entrar, `server/src/index.js:13`
continua com `app.use(cors())` liberado e a variável é inerte — declarar agora
evita um segundo PR de infraestrutura depois.

### Criar — `docker-compose.override.yml` (raiz)

Lido automaticamente pelo `docker compose up`. Troca as imagens de produção pelos
estágios de desenvolvimento, monta o código-fonte e liga o hot reload.

```yaml
services:
  server:
    build:
      target: development
    environment:
      NODE_ENV: development
    command: ['npm', 'run', 'dev']
    volumes:
      - ./server/src:/app/src:ro
      - ./server/migrations:/app/migrations:ro
    # node_modules fica na imagem; o anonymous volume abaixo impede que
    # o bind mount do host (que pode nem existir) mascare a pasta instalada.

  client:
    build:
      target: development
    command: ['npm', 'run', 'dev', '--', '--host', '0.0.0.0']
    environment:
      VITE_API_BASE_URL: http://localhost:5000/api
    ports:
      - '5173:5173'
    volumes:
      - ./client/src:/app/src
      - ./client/index.html:/app/index.html
      - ./client/vite.config.js:/app/vite.config.js
      - /app/node_modules
```

O `--host 0.0.0.0` é obrigatório: por padrão o Vite escuta só em `localhost`
dentro do container e a porta publicada não recebe nada. `client/vite.config.js`
tem 7 linhas e não define `server.host`, então a flag na linha de comando é o
ajuste mínimo — sem alterar arquivo de fonte nesta spec.

### Criar — `server/Dockerfile`

```dockerfile
# syntax=docker/dockerfile:1

# --- base: dependências de runtime resolvidas uma única vez ---
FROM node:20-alpine AS base
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./

# --- deps: node_modules completo, inclusive devDependencies ---
FROM base AS deps
RUN npm ci --include=dev

# --- development: nodemon + código montado por bind mount ---
FROM base AS development
ENV NODE_ENV=development
COPY --from=deps /app/node_modules ./node_modules
COPY . .
EXPOSE 5000
CMD ["npm", "run", "dev"]

# --- production: só dependências de runtime, usuário sem privilégio ---
FROM base AS production
RUN npm ci --omit=dev && npm cache clean --force
COPY src ./src
COPY migrations ./migrations
USER node
EXPOSE 5000
CMD ["npm", "run", "start"]
```

`COPY migrations ./migrations` já contempla OPS-02. Enquanto a pasta não existir,
crie-a com um `.gitkeep` no mesmo PR — o `COPY` de diretório inexistente **falha**
o build, e esse é o tipo de quebra que não pode acontecer na branch que serve de
onboarding.

`npm run dev` usa `nodemon`, declarado em `server/package.json:30`
(`"nodemon": "^3.1.14"`), e o script existe em `server/package.json:8`. Nada novo
a instalar.

### Criar — `client/Dockerfile`

```dockerfile
# syntax=docker/dockerfile:1

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

# --- development: dev server do Vite com HMR ---
FROM node:20-alpine AS development
WORKDIR /app
ENV NODE_ENV=development
COPY --from=deps /app/node_modules ./node_modules
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

# --- build: bundle estático ---
FROM node:20-alpine AS build
WORKDIR /app
ARG VITE_API_BASE_URL=http://localhost:5000/api
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# --- production: nginx servindo dist/, com fallback de SPA ---
FROM nginx:1.27-alpine AS production
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
```

O `ARG`/`ENV` antes do `npm run build` é necessário porque o Vite congela
`import.meta.env.*` **em tempo de build**; injetar a variável só no runtime do
nginx não teria efeito nenhum.

### Criar — `client/nginx.conf`

```nginx
server {
  listen 80;
  server_name _;
  root /usr/share/nginx/html;
  index index.html;

  # SPA: qualquer rota desconhecida cai no index.html
  location / {
    try_files $uri $uri/ /index.html;
  }

  # assets com hash no nome podem ser cacheados agressivamente
  location /assets/ {
    expires 1y;
    add_header Cache-Control "public, immutable";
  }

  gzip on;
  gzip_types text/css application/javascript image/svg+xml;
}
```

O build medido no baseline gera **201,86 kB (63,26 kB gzip)**; o `gzip on` é o que
faz a entrega cair para os 63 kB em vez dos 201 kB.

### Criar — `server/.dockerignore`

```
node_modules
npm-debug.log*
coverage
.env
.env.*
!.env.example
.git
.gitignore
.github
*.md
server.txt
.DS_Store
```

### Criar — `client/.dockerignore`

```
node_modules
npm-debug.log*
dist
build
coverage
.env
.env.*
!.env.example
.git
.gitignore
.github
*.md
client.txt
.DS_Store
```

A exclusão de `node_modules` não é cosmética: o `COPY . .` dos estágios de
desenvolvimento copiaria a árvore do host (Windows/macOS) por cima da instalada
no Alpine, e binários nativos do `pg`/`esbuild` não são compatíveis entre
plataformas. Sem o `.dockerignore`, o estágio `development` quebra.

### Alterar — `.gitignore` (raiz)

O arquivo hoje tem 6 linhas (`node_modules/`, `.env`, `.DS_Store`, `coverage/`,
`dist/`, `build/`). Acrescentar:

```
# Docker
docker-compose.local.yml
```

Não ignorar `docker-compose.override.yml`: diferente da convenção de produção,
aqui o override **é** a configuração de desenvolvimento compartilhada e tem que
estar versionada, senão a meta de "um comando" não se cumpre para quem clona.
Quem quiser customização pessoal usa `docker-compose.local.yml` com
`-f`, e esse sim fica fora do Git.

### Alterar — `server/.env.example`

Ampliado e documentado por **OPS-04**. Esta spec só garante que o compose não
precisa dele: todas as variáveis vêm declaradas em `docker-compose.yml`. O
`.env.example` continua servindo o fluxo sem Docker.

### Alterar — `README.md`

Substituir integralmente o bloco `README.md:40-68` ("Como Executar o Projeto
(Setup)") pelo texto abaixo.

````markdown
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
| API | <http://localhost:5000> | responde `SREC Coworking API is running...` |
| PostgreSQL | `localhost:5432` | usuário `srec`, senha `srec`, banco `srec` |

O `docker compose up` sobe o PostgreSQL, **espera o healthcheck** (`pg_isready`)
passar, aplica as migrations versionadas e só então inicia o backend. Nenhum
`.env` precisa ser criado: as variáveis estão em `docker-compose.yml`.

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
montados no container (`docker-compose.override.yml`), então salvar um arquivo
reinicia o `nodemon` ou dispara o HMR do Vite sem rebuild.

Para validar o modo de produção (nginx servindo o bundle, sem bind mount):

```bash
docker compose -f docker-compose.yml up --build
```

### Opção B — Execução local sem Docker

Mantida para quem já tem PostgreSQL 16 na máquina.

1. Crie o banco: `createdb srec`
2. `cp server/.env.example server/.env` e ajuste `DATABASE_URL`
3. `cd server && npm ci && npm run migrate:up && npm run dev`
4. `cd client && npm ci --legacy-peer-deps && npm run dev`

### Testes e qualidade

```bash
cd server && npm run lint && npm test     # backend: lint + Jest
cd client && npm run lint && npm run build # frontend: lint + build
```
````

### Remover — nada

`server/server.txt`, `client/client.txt` e `shared/shared.txt` são os
placeholders de 0 byte de **CS-11** e são removidos pela spec de limpeza
correspondente, não aqui. Esta spec só os exclui do contexto de build via
`.dockerignore`.

## Testes

Não há teste automatizado de Dockerfile neste PR (seria infraestrutura de teste
desproporcional ao escopo). A validação é um roteiro executável e verificável, e
o **gate real** é o job de CI adicionado abaixo.

### Roteiro manual — obrigatório antes de pedir review

```bash
# 1. Estado limpo: nenhuma imagem, nenhum volume, nenhum Postgres local
docker compose down -v
docker image rm srec-server srec-client 2>/dev/null || true

# 2. O comando único
docker compose up --build
```

Aceite do roteiro:

| # | Verificação | Esperado |
|---|---|---|
| T1 | Log do `postgres` | `database system is ready to accept connections` |
| T2 | Ordem dos logs | o `server` só inicia **depois** do healthcheck do postgres |
| T3 | `curl -s http://localhost:5000/` | `SREC Coworking API is running...` |
| T4 | `curl -s http://localhost:5000/api/resources` | `[]` (array vazio, **HTTP 200** — não 500) |
| T5 | `curl -s http://localhost:5173` | HTML com `<div id="root">` |
| T6 | Abrir <http://localhost:5173> e criar um recurso | aparece na lista, sem erro no console |
| T7 | Editar `client/src/App.jsx` e salvar | HMR atualiza a página sem reload manual |
| T8 | Editar `server/src/index.js` e salvar | `nodemon` reinicia; log `Server is running on port 5000` |
| T9 | `docker compose down && docker compose up` | o recurso criado em T6 **ainda existe** (volume nomeado) |
| T10 | `docker compose down -v && docker compose up` | banco vazio, tabelas recriadas pelas migrations |
| T11 | `docker compose exec server whoami` | `node` (não `root`) |
| T12 | `docker compose -f docker-compose.yml up --build` e `curl -I localhost:5173` | `Server: nginx` e `HTTP/1.1 200` |

### Teste que falha antes desta spec

T4 é o caso que comprova o ganho. No estado recebido, em máquina **sem**
PostgreSQL instalado, `npm run dev` em `server/` imprime `Server is running on
port 5000` (porque `server/src/config/initDb.js:28-30` engole o erro) e
`curl http://localhost:5000/api/resources` responde **500**. Com esta spec, a
mesma máquina limpa responde **200 `[]`** depois de um único comando.

### Gate automatizado — job novo em `.github/workflows/ci.yml`

OPS-03 reescreve esse arquivo; o job abaixo é o pedaço que **esta** spec
contribui, e deve ser mesclado por quem integrar por último.

```yaml
  docker-compose-smoke:
    name: Docker — build e smoke test do compose
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Build das imagens
        run: docker compose -f docker-compose.yml build

      - name: Subir a stack de produção
        run: docker compose -f docker-compose.yml up -d --wait --wait-timeout 180

      - name: Smoke test da API
        run: |
          curl --fail --silent --show-error http://localhost:5000/
          test "$(curl --fail --silent http://localhost:5000/api/resources)" = "[]"

      - name: Smoke test do frontend
        run: curl --fail --silent --show-error http://localhost:5173 | grep -q 'id="root"'

      - name: Logs em caso de falha
        if: failure()
        run: docker compose -f docker-compose.yml logs --no-color

      - name: Derrubar a stack
        if: always()
        run: docker compose -f docker-compose.yml down -v
```

O `--wait` do Compose v2 bloqueia até os healthchecks passarem — é o mesmo
mecanismo que o `depends_on` usa, então o job falha se o healthcheck estiver
errado.

## Critérios de aceite

* [ ] `docker-compose.yml` existe na raiz com exatamente os serviços `postgres`,
      `server` e `client`.
* [ ] `postgres` usa volume **nomeado** `srec_pgdata` e `healthcheck` com
      `pg_isready`.
* [ ] `server` declara `depends_on.postgres.condition: service_healthy`.
* [ ] `server/Dockerfile` e `client/Dockerfile` são multi-stage, com estágios
      `development` e `production` nomeados.
* [ ] `server/Dockerfile` roda a aplicação como usuário `node`, não `root`
      (verificado por T11).
* [ ] `server/.dockerignore` e `client/.dockerignore` existem e ignoram
      `node_modules`, `.env` e `.git`.
* [ ] `docker-compose.override.yml` existe, está versionado, e monta
      `./server/src` e `./client/src`.
* [ ] Hot reload funciona nos dois serviços (T7 e T8).
* [ ] Em máquina sem PostgreSQL instalado, `docker compose up` deixa
      `GET /api/resources` respondendo **200** (T4).
* [ ] Dados sobrevivem a `docker compose down` e são apagados por
      `docker compose down -v` (T9 e T10).
* [ ] `README.md:40-68` substituído: a seção de setup mostra **um** comando, e a
      opção manual virou "Opção B".
* [ ] O número **7 → 1** aparece no corpo do PR, com link para `README.md` antes
      e depois.
* [ ] O job `docker-compose-smoke` passa na CI.
* [ ] PR aprovado por `@igorSeberino` (QA).

## Passo a passo TBD

```bash
# 1. Partir de main atualizada
git checkout main
git pull origin main
git checkout -b feature/docker-compose-environment

# 2. Criar os arquivos de infraestrutura
#    docker-compose.yml
#    docker-compose.override.yml
#    server/Dockerfile
#    server/.dockerignore
#    client/Dockerfile
#    client/.dockerignore
#    client/nginx.conf
#    server/migrations/.gitkeep      <- impede o COPY de falhar antes de OPS-02

# 3. Validar antes de commitar
docker compose config                       # valida a sintaxe do merge dos dois arquivos
docker compose -f docker-compose.yml config # valida só o arquivo base

# 4. Rodar o roteiro T1..T12 da seção de Testes
docker compose down -v
docker compose up --build

# 5. Commits
git add server/Dockerfile server/.dockerignore server/migrations/.gitkeep
git commit -m "build(server): adicionar Dockerfile multi-stage e contexto de build"

git add client/Dockerfile client/.dockerignore client/nginx.conf
git commit -m "build(client): adicionar Dockerfile multi-stage com nginx para producao"

git add docker-compose.yml docker-compose.override.yml .gitignore
git commit -m "build: orquestrar postgres, server e client com docker compose"

git add .github/workflows/ci.yml
git commit -m "ci: validar build e smoke test do docker compose"

git add README.md
git commit -m "docs: substituir setup manual de 7 passos por docker compose up"

# 6. Publicar e abrir o PR
git push -u origin feature/docker-compose-environment
```

Corpo do PR (colar):

```
Fecha #<a definir>

## O que muda
Do clone ao sistema rodando em **1 comando** (`docker compose up`), contra os
**7 passos manuais** de README.md:40-63.

## Antes / depois
| Métrica | Antes | Depois |
|---|---|---|
| Comandos para subir tudo | 7 | 1 |
| Dependências na máquina | PostgreSQL + Node 20 | Docker Desktop |
| Variáveis para editar à mão | 2 | 0 |
| Terminais | 2 | 1 |
| Dockerfiles | 0 | 2 |

## Como validar
docker compose down -v && docker compose up --build
Roteiro T1..T12 na spec: docs/specs/ops-01-docker-compose-environment/implementacao.md

## Rubrica
4,0 — Onboarding (1,5 pt "conseguiu subir o sistema do colega")
```

Após aprovação do QA: **Squash and merge**, mantendo o título do PR em
Conventional Commits.

## Prompt para o Claude Code

```
Implemente a spec OPS-01 deste repositório.

Leia primeiro, por inteiro:
- docs/specs/ops-01-docker-compose-environment/implementacao.md
- README.md (linhas 40-68)
- server/package.json e client/package.json
- server/src/index.js, server/src/config/database.js, server/src/config/initDb.js
- client/vite.config.js e client/src/services/api.js (linha 1)

Carregue a skill de arquitetura/infraestrutura do time antes de começar
(.claude/skills) e siga as convenções de docs/time/.

Crie a branch feature/docker-compose-environment e produza exatamente os
arquivos listados na seção "Alterações" da spec, com o conteúdo proposto:
docker-compose.yml, docker-compose.override.yml, server/Dockerfile,
server/.dockerignore, client/Dockerfile, client/.dockerignore,
client/nginx.conf, server/migrations/.gitkeep, o job docker-compose-smoke em
.github/workflows/ci.yml e a substituição da seção de setup do README.md.

Regras não negociáveis:
- Não altere nenhum arquivo em server/src/ nem client/src/. Esta spec é só
  infraestrutura. CS-07 (API_BASE_URL hardcoded em client/src/services/api.js:1)
  é de outra spec; apenas injete VITE_API_BASE_URL para que ela possa consumir.
- O serviço server DEVE publicar 5000:5000 no host, porque o fetch do navegador
  aponta para http://localhost:5000/api.
- O serviço client no modo dev DEVE rodar o Vite com --host 0.0.0.0.
- O estágio production do server/Dockerfile DEVE terminar com USER node.
- Os .dockerignore DEVEM ignorar node_modules (bind mount de módulos nativos
  entre Windows/macOS e Alpine quebra o build).

Ao terminar, execute e me mostre a saída real:
  docker compose config
  docker compose -f docker-compose.yml config
  docker compose down -v
  docker compose up -d --build --wait --wait-timeout 180
  curl -s http://localhost:5000/
  curl -s -o /dev/null -w '%{http_code}\n' http://localhost:5000/api/resources
  curl -s http://localhost:5173 | grep -o 'id="root"'
  docker compose exec -T server whoami
  docker compose down -v

Se algum passo falhar, corrija e rode de novo. Não me entregue a spec aplicada
sem a saída real desses comandos. Não invente a saída.

Por fim, crie os 5 commits com as mensagens exatas da seção "Passo a passo TBD"
da spec, nessa ordem. Não abra o PR nem rode git push.
```
