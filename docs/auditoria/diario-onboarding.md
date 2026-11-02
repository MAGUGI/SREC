# Diário de onboarding (ONB-01)

Registro de quem subiu o SREC localmente, quanto tempo levou e onde travou.
Serve de evidência da fricção real e sustenta a métrica **M-23** (passos
manuais para subir o sistema) de [`metricas-baseline.md`](metricas-baseline.md).

## Passos manuais

| Cenário | Passos | Fonte |
|---|---|---|
| Antes (código recebido) | **7**: instalar PostgreSQL; criar o banco `srec`; criar `server/.env`; `npm install` no server; `npm install --legacy-peer-deps` no client; `npm run dev` no server; `npm run dev` no client | M-23 do baseline e "Como rodar" do `README.md` recebido (`upstream/main` @ `8431181`) |
| Depois (OPS-01, `main`) | **1**: `docker compose up -d --build` | `docker-compose.yml` |

A contagem foi conferida nas 4 execuções do cenário "antes" abaixo: as 4
pessoas passaram pelos mesmos 7 passos, e ninguém conseguiu pular nenhum. Bate
com M-23.

Pré-requisito do cenário "depois": Docker com o daemon em execução (ver a
travada do Igor).

## Resumo

| Pessoa | Papel | Cenário | Tempo até o 200 em `/api/resources` | Travadas |
|---|---|---|---|---|
| Igor Seberino | PO + QA | depois | 55 s (só o comando) | 1 |
| Adrian Cesar | Backend | antes | 38 min | 2 |
| Renato Colin | Frontend | antes | 41 min | 1 |
| Gabriel Carvalho | DevOps | antes e depois | 47 min (antes) · 1 min 12 s (depois) | 2 |
| Diego Nessler | Requisitos | antes | 52 min | 2 |

5 de 5 pessoas subiram o sistema. No cenário "antes", as 4 execuções somam
**178 min** (média de **44,5 min**) e **6 travadas**. No cenário "depois", as 2
execuções levaram **55 s** e **72 s**. As 2 travadas foram de ambiente Docker,
nenhuma do projeto.

O tempo do "antes" inclui instalar o PostgreSQL. O do "depois" parte de Docker
Desktop já instalado, que é o pré-requisito declarado no README atual.

## Registros

### Igor Seberino (PO + QA): cenário "depois", `main` @ `1c7a0be`

* Máquina: Windows 11, Docker 29.8.2 (Docker Desktop), Node 24.22.0.
* Comando: `docker compose up -d --build` (imagens já com cache parcial).
* Tempo do comando: **55 s**.
* Verificação (o 200 é o que vale, ver BUG-11):

| Checagem | Obtido |
|---|---|
| `curl http://localhost:5000/` | `SREC Coworking API is running...` |
| `curl -w '%{http_code}' http://localhost:5000/api/resources` | `200` |
| `curl http://localhost:5173` contém `id="root"` | sim |
| `docker compose ps` | postgres `healthy`, server e client `Up` |

**Travadas**

1. Daemon parado. Com o Docker Desktop fechado, o primeiro comando falha:
   `failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine; check if the path is correct and if the daemon is running: open //./pipe/dockerDesktopLinuxEngine: O sistema não pode encontrar o arquivo especificado.`
   Resolução: iniciar o Docker Desktop e esperar o daemon responder em
   `docker info`. O README não menciona esse pré-requisito.

### Adrian Cesar (Backend): cenário "antes", `upstream/main` @ `8431181`

* Máquina: Windows 11, PostgreSQL 16 pelo instalador oficial, Node 22.
* Passos: os 7 do README recebido, na ordem.
* Tempo até o 200: **38 min**, dos quais uns 15 min no instalador do
  PostgreSQL.
* Verificação:

| Checagem | Obtido |
|---|---|
| `curl http://localhost:5000/` | `SREC Coworking API is running...` |
| `curl -w '%{http_code}' http://localhost:5000/api/resources` | `200`, só depois de resolver as duas travadas |
| `http://localhost:5173` no navegador | tela de espaços carregada |

**Travadas**

1. `.env` copiado sem ajustar a senha. Com o `DATABASE_URL` do
   `server/.env.example` usando uma senha diferente da escolhida no instalador,
   o servidor imprime `Server is running on port 5000`, e só o log mostra
   `Error creating tables error: password authentication failed for user "postgres"` (`code: '28P01'`).
   A primeira requisição devolve `{"error":"Internal server error"}` com HTTP
   500. É o BUG-11 na prática: o boot diz que está tudo certo.
   Resolução: corrigir a senha em `server/.env`.
2. Banco com nome errado. Na primeira tentativa o banco foi criado como
   `srec_dev`, mas o `DATABASE_URL` aponta para `srec`:
   `Error creating tables error: database "srec" does not exist` (`code: '3D000'`).
   De novo o servidor sobe "normal", e a falha só aparece no 500.
   Resolução: `createdb srec`.

### Renato Colin (Frontend): cenário "antes", `upstream/main` @ `8431181`

* Máquina: Windows 11, PostgreSQL 16 já instalado de outra disciplina, Node 22.
* Passos: os 7 do README recebido.
* Tempo até o 200: **41 min**.
* Verificação:

| Checagem | Obtido |
|---|---|
| `curl -w '%{http_code}' http://localhost:5000/api/resources` | `200` |
| `http://localhost:5173` no navegador | tela de espaços carregada |

**Travadas**

1. Peer dependency no client. Rodou `npm install` sem a flag. O README recebido
   pede `--legacy-peer-deps`, mas não diz por quê, e é fácil pular:

   ```text
   npm error code ERESOLVE
   npm error ERESOLVE could not resolve
   npm error While resolving: @eslint/js@10.0.1
   npm error Found: eslint@9.39.5
   npm error Could not resolve dependency:
   npm error peerOptional eslint@"^10.0.0" from @eslint/js@10.0.1
   npm error Conflicting peer dependency: eslint@10.13.0
   ```

   Causa: `@eslint/js@^10` junto com `eslint@^9` no `client/package.json`
   recebido. Resolução: `npm install --legacy-peer-deps`. O conflito continua no
   código e é o motivo da flag na CI.

### Gabriel Carvalho (DevOps): cenários "antes" e "depois"

* Máquina: Windows 11, Docker Desktop, Node 22, PostgreSQL 16 nativo instalado
  durante o cenário "antes".
* "Antes" (`upstream/main` @ `8431181`): os 7 passos, **47 min** até o 200.
* "Depois" (`main` @ `1c7a0be`): `docker compose up -d --build` sem cache,
  **1 min 12 s** depois de resolver a travada 2.
* Verificação do "depois":

| Checagem | Obtido |
|---|---|
| `curl -w '%{http_code}' http://localhost:5000/api/resources` | `200` |
| `curl http://localhost:5173` contém `id="root"` | sim |
| `docker compose ps` | postgres `healthy`, server e client `Up` |

**Travadas**

1. "Antes": o mesmo `password authentication failed for user "postgres"` do
   Adrian, pela mesma causa (`.env.example` copiado sem ajuste).
2. "Depois": o PostgreSQL nativo do cenário "antes" continuava rodando como
   serviço do Windows e ocupava a porta 5432:

   ```text
   Error response from daemon: ports are not available: exposing port TCP 0.0.0.0:5432 -> 127.0.0.1:0: listen tcp 0.0.0.0:5432: bind: Only one usage of each socket address (protocol/network address/access permissions) is normally permitted.
   ```

   Resolução: parar o serviço `postgresql-x64-16` antes do `docker compose up`.
   Quem já tem PostgreSQL local vai cair nisso, então vale uma nota na Opção A
   do README.

### Diego Nessler (Requisitos): cenário "antes", `upstream/main` @ `8431181`

* Máquina: Windows 11, sem PostgreSQL nem Node no início.
* Passos: os 7 do README recebido, mais instalar o Node 22.
* Tempo até o 200: **52 min**. É o caso de quem não é de desenvolvimento e
  começa com a máquina limpa.
* Verificação:

| Checagem | Obtido |
|---|---|
| `curl -w '%{http_code}' http://localhost:5000/api/resources` | `200` |
| `http://localhost:5173` no navegador | tela de espaços carregada |

**Travadas**

1. `createdb` fora do PATH. O instalador do PostgreSQL no Windows não coloca o
   `bin` no PATH:
   `'createdb' não é reconhecido como um comando interno ou externo, um programa operável ou um arquivo em lotes.`
   Resolução: criar o banco pelo pgAdmin. O README recebido só diz
   "certifique-se de ter o PostgreSQL instalado e rodando".
2. O mesmo `ERESOLVE` do Renato no client, com a mesma mensagem e a mesma
   resolução.

## O que o diário mostra

* As 6 travadas do cenário "antes" vêm de duas causas: configuração do banco
  (4: senha duas vezes, nome do banco, `createdb`) e peer dependency do client
  (2).
* Das 4 travadas de banco, 3 ficaram escondidas pelo BUG-11: o servidor disse
  que estava no ar e só falhou na primeira requisição.
* O cenário "depois" elimina as duas causas. As travadas que sobram são de
  ambiente Docker (daemon parado, porta 5432 ocupada) e se resolvem com uma
  nota de pré-requisito no README.

## Pendências

* [x] As 5 pessoas registraram sua execução (5 de 5).
* [ ] Transcrever M-23 com "depois" = 1 no relatório antes/depois (QA-04).
