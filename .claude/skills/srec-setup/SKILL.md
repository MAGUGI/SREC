---
name: srec-setup
description: Use when preparing or diagnosing a local environment for the SREC project — checa git, gh autenticado, Node 20, npm, Docker com daemon respondendo, Python 3 e permissão de push no fork igorSeberino/srec, e dá o comando exato de correção de cada item que falta. Use no primeiro clone, quando `docker compose up` ou `npm test` falha sem motivo claro, e antes de medir qualquer métrica.
---

# Preparar o ambiente para trabalhar no SREC

O SREC chegou ao time com **7 passos manuais de setup** (`README.md:40-63`),
nenhum Dockerfile e um `server/.env.example` com a senha mascarada como `***`.
Metade do custo de onboarding da N2 é ambiente, não código — e a rubrica paga
1,5 ponto por "o grupo conseguiu subir o sistema do colega".

Esta skill existe para que esse diagnóstico leve minutos e não uma tarde, e para
que a resposta seja sempre a mesma em qualquer máquina do time (Windows e Linux
convivem no grupo).

## 1. Rode a checagem automática primeiro

Da raiz do repositório:

```bash
python .claude/skills/srec-setup/scripts/check_environment.py
```

No Linux/macOS, se `python` não existir no PATH, use `python3`. Para pular a
consulta à API do GitHub (avião, rede ruim): `--offline`.

O script é **somente leitura**: não escreve no repositório, não muta nada no
GitHub, não sobe container. Ele devolve `OK` / `AVISO` / `FALHA` por item, a
ação corretiva de cada falha, e sai com código `0` apenas quando tudo
**essencial** passa.

Mostre o relatório **inteiro** a quem pediu, inclusive os itens que passaram —
saber que o Docker está de pé é informação, não ruído. Não tente corrigir
automaticamente: `gh auth login` é interativo e instalar Node na máquina de
outra pessoa não é trabalho de agente.

## 2. O que é obrigatório e por quê

| Item | Mínimo | Por que o SREC precisa |
|---|---|---|
| **git** | qualquer 2.x | O fluxo é TBD sobre `main`; sem `user.email` configurado o commit sai sem autor válido |
| **gh** autenticado | qualquer 2.x | Issue, PR e revisão do QA passam pelo `gh`. 26 specs → 26 PRs |
| **push no fork** | permissão de escrita em `igorSeberino/srec` | Sem ela você implementa e não consegue abrir PR — descobrir isso depois de 2 h de trabalho é o pior momento |
| **Node.js** | 20 (LTS) | Express 5 e Vite 8 exigem ≥ 20, e a CI (`.github/workflows/ci.yml`) roda em **20** |
| **npm** | ≥ 9 | `npm ci` com lockfile v3 nos dois pacotes |
| **Docker com daemon de pé** | Engine 24+ e Compose **v2** | É o pré-requisito único da Opção A do README, e o PostgreSQL real que a suíte de integração (QA-01) exige |
| **Python 3** | 3.9+ | Os scripts das skills do time, incluindo este |

Essencial é o que bloqueia: sem qualquer um destes, não há como implementar uma
spec do começo ao fim. O resto do relatório é `AVISO` — não impede trabalhar,
mas custa tempo depois.

## 3. Correção item a item

### git ausente ou repositório errado

```bash
# instalar: https://git-scm.com/downloads
git clone https://github.com/igorSeberino/srec.git
cd srec
git config --global user.name "Seu Nome"
git config --global user.email "seu@email"
```

Se o `origin` aponta para `MAGUGI/SREC`, você clonou o **upstream**, não o fork
onde a N2 trabalha:

```bash
git remote set-url origin https://github.com/igorSeberino/srec.git
git remote add upstream https://github.com/MAGUGI/SREC.git   # opcional, para comparar
```

Se você está em `backend`, `frontend` ou tentando criar `develop`: essas branches
vieram no repositório recebido e **não são usadas na N2** (`develop` nunca
existiu, apesar de o `ci.yml` citá-la). `main` é o único branch longevo — veja a
skill `tbd-flow`.

### gh não instalado ou não autenticado

```bash
# Windows
winget install GitHub.cli
# Linux (Debian/Ubuntu): https://github.com/cli/cli/blob/trunk/docs/install_linux.md

gh auth login        # interativo: rode num terminal seu, não dentro da sessão do agente
gh auth status       # confirme a conta
```

Escolha escopo `repo` no login. Autenticado com a conta errada:
`gh auth switch`.

### sem permissão de push no fork

O script lê `.permissions.push` de `repos/igorSeberino/srec`. Se vier `false`,
sua conta é só leitora. Duas saídas, nesta ordem de preferência:

1. Pedir ao **Igor (`@igorSeberino`)** para adicionar sua conta como
   colaboradora do fork — é o caminho normal do time.
2. Forkar para a sua conta e abrir PR cruzado para `igorSeberino/srec:main`. Dá
   trabalho extra na revisão; use só se o item 1 travar.

### Node na versão errada

```bash
nvm install 20 && nvm use 20     # Windows: nvm-windows; Linux/macOS: nvm
node --version                   # precisa imprimir v20.x
```

**Node 22 ou 24 não é "melhor que 20" aqui.** A CI roda em 20: lint e build que
passam no seu Node 24 podem falhar no PR, e pior, um número de cobertura medido
em outra versão não é comparável com o baseline. Mesmo ambiente, mesmo número.

### npm antigo

```bash
npm install -g npm@10
```

### Docker: instalado ≠ daemon respondendo

Esta é a falha que mais custa tempo no time, e o script separa os dois casos de
propósito:

* **`Docker instalado: FALHA`** → o binário não está no PATH. Instale o Docker
  Desktop (<https://docs.docker.com/get-docker/>).
* **`Docker instalado: OK` + `Docker — daemon respondendo: FALHA`** → o binário
  existe, o serviço não. `docker --version` responde mesmo com o daemon morto, e
  é exatamente por isso que "eu tenho Docker instalado" não é resposta
  suficiente. Corrija conforme o sistema:

```bash
# Windows / macOS: abra o Docker Desktop e espere o ícone ficar verde
# Linux:
sudo systemctl start docker
sudo usermod -aG docker $USER    # e reabra a sessão, se der "permission denied"

docker info                      # tem que responder Server Version
```

* **`Docker Compose v2: FALHA`** → falta o plugin. O `docker-compose` v1, com
  hífen, **não serve**: a stack do SREC usa `healthcheck` com
  `condition: service_healthy` e o job de CI usa `--wait`, que só existem no
  Compose v2.

```bash
sudo apt install docker-compose-plugin    # Linux; no Docker Desktop já vem
docker compose version
```

### Python antigo

Instale o Python 3.9+ (<https://www.python.org/downloads>) e garanta que está no
PATH. No Windows, marque "Add python.exe to PATH" no instalador.

## 4. Primeiro acesso ao projeto

Depois que o script sai com código 0, esta é a sequência. O comando `/onboard`
executa exatamente isso, nesta ordem.

### 4.1 Clonar e instalar

```bash
git clone https://github.com/igorSeberino/srec.git
cd srec
cd server && npm ci && cd ..
cd client && npm ci --legacy-peer-deps && cd ..
```

A flag `--legacy-peer-deps` no `client/` **não é opcional**: React 19 com Vite 8
tem peer deps em conflito e o `npm ci` limpo falha sem ela. É o que o
`README.md:60` e o `.github/workflows/ci.yml:36` já fazem.

### 4.2 Subir o sistema

```bash
docker compose up
```

Serviços: frontend em <http://localhost:5173>, API em <http://localhost:5000>,
PostgreSQL em `localhost:5432` (usuário/senha/banco `srec`).

Enquanto **OPS-01** (`docs/specs/ops-01-docker-compose-environment/`) não estiver
mergeada em `main`, não existe `docker-compose.yml` e o caminho é a Opção B:
PostgreSQL local, `cp server/.env.example server/.env`, `npm run dev` nos dois
pacotes — os 7 passos que a N2 está eliminando.

Verificação mínima de que subiu de verdade:

```bash
curl -s http://localhost:5000/                  # SREC Coworking API is running...
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:5000/api/resources   # 200
```

**O 200 em `/api/resources` é o teste que importa**, não a mensagem da raiz. O
servidor imprime "Server is running on port 5000" mesmo sem banco, porque
`server/src/config/initDb.js:26-28` engole o erro de criação de tabela (BUG-11):
o sistema *parece* ter subido e responde 500 na primeira requisição.

### 4.3 Rodar a suíte

```bash
cd server && npm run lint && npm test
cd client && npm run lint && npm run build
```

O que você deve ver no estado recebido: **1 suíte, 2 testes passando**, 0 erros
de lint nas duas pontas e build do client em ~201 kB. Se bater com isso, seu
ambiente reproduz o baseline da auditoria e você pode confiar nos seus números.

### 4.4 Ler a auditoria antes de tocar em código

Nesta ordem, por inteiro:

1. `docs/auditoria/relatorio-n2.md` — o diagnóstico consolidado.
2. `docs/auditoria/metricas-baseline.md` — os números de partida e a armadilha
   da medição de cobertura.
3. `docs/auditoria/bugs-do-cliente.md` e `docs/auditoria/code-smells.md` — os 15
   bugs e 14 smells catalogados, com arquivo e linha.
4. `docs/time/overview.md` — papéis, RACI, DoR e DoD.
5. `docs/arquitetura/estado-atual.md` e `arquitetura-alvo.md`.

Este código é de outro grupo. Ler o catálogo primeiro evita dois desperdícios
clássicos: "descobrir" um bug que já tem ID e spec, e corrigir de passagem algo
fora da sua issue — que é bloqueio na revisão do QA.

### 4.5 Pegar a próxima issue

```bash
gh issue list --assignee @me --state open
```

As 28 issues do board apontam para `docs/specs/<slug>/implementacao.md`. Leia a
spec inteira e rode `/implementar <slug>`.

## 5. Armadilhas desta base que o script não vê

| Sintoma | Causa real | Saída |
|---|---|---|
| `npm ci` quebra no `client/` com `ERESOLVE` | faltou `--legacy-peer-deps` | `cd client && npm ci --legacy-peer-deps` |
| `docker compose up` falha no bind da 5432 | PostgreSQL local já ocupa a porta | pare o serviço local, ou `docker compose down` de uma stack antiga |
| API responde 500 em tudo, mas o log diz que subiu | BUG-11: `initDb.js` engole o erro do banco | confira `DATABASE_URL`; valide sempre com `curl /api/resources`, não com a raiz |
| `server/.env` com senha `***` | o `.env.example` recebido mascara a credencial | com Docker, não precisa de `.env`; sem Docker, defina a sua e ajuste `DATABASE_URL` |
| Jest termina com "did not exit" | pool do `pg` com handle aberto | `db.close()` no `afterAll` — veja a skill `srec-testing` |
| Cobertura "35,48 %" | `jest --coverage` sem `--collectCoverageFrom` só conta arquivo importado por teste | use sempre `--collectCoverageFrom='src/**/*.js'`; o número real é 6,14 % |
| CI vermelha com local verde | seu Node não é 20 | `nvm use 20` |

## 6. O que esta skill não faz

Não instala nada, não roda `gh auth login`, não cria `.env`, não sobe container e
não altera o repositório. Ela diagnostica e entrega o comando exato — a execução
é da pessoa, na máquina dela.

Fluxo de trabalho depois do setup: skill `tbd-flow`. Medição: skill `srec-audit`
ou `/metricas`. Primeiro acesso guiado: `/onboard`.
