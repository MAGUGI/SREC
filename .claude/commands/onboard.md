---
description: Roteiro de primeiro acesso ao SREC — checa o ambiente, sobe o sistema, roda a suíte, lê a auditoria e aponta sua próxima issue
---

# Onboarding no SREC (N2)

Execute este roteiro do começo ao fim, na ordem, **na raiz do clone**. Pare no
primeiro passo que falhar e resolva antes de seguir — cada passo depende do
anterior.

## Contexto, em cinco linhas

O SREC é um sistema de reserva de estações de trabalho e salas de reunião para
coworking: Node 20 + Express 5 + PostgreSQL com SQL cru em `server/`, React 19 +
Vite 8 em `client/`. **Este código não é nosso.** Ele foi escrito por outro grupo
na N1 e chegou ao time com 10 commits, 0 issues, 2 testes e 6,14 % de cobertura.

Na N2 o trabalho é auditar, medir, corrigir bugs e refatorar — e **provar** cada
melhoria com um número antes e um número depois. No fim, o pacote vai para um
terceiro grupo na N3. Papéis, RACI e DoD estão em `docs/time/overview.md`; o
diagnóstico está em `docs/auditoria/`; o trabalho está quebrado em 26 specs em
`docs/specs/<slug>/implementacao.md`, uma por issue.

Regra que organiza tudo o que você vai fazer aqui: **nada entra em `main` sem
spec, sem teste e sem aprovação do QA (Igor, `@igorSeberino`).**

## 1. Checar o ambiente

```bash
python .claude/skills/srec-setup/scripts/check_environment.py
```

Carregue a skill `srec-setup` e mostre o relatório **inteiro** ao usuário, sem
resumir. Se o script sair com código diferente de 0, há item essencial faltando:
repasse a linha de correção que ele já imprimiu e **pare o roteiro aqui**. Não
tente instalar nada nem rodar `gh auth login` — é interativo e é da pessoa.

## 2. Instalar as dependências

```bash
cd server && npm ci && cd ..
cd client && npm ci --legacy-peer-deps && cd ..
```

`--legacy-peer-deps` no `client/` é obrigatório (React 19 + Vite 8 em conflito de
peer deps). Sem a flag o `npm ci` quebra; é o que a CI já faz em
`.github/workflows/ci.yml`.

## 3. Subir o sistema

```bash
docker compose up -d
```

Confirme que subiu **de verdade**, não só que o processo está vivo:

```bash
curl -s http://localhost:5000/
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:5000/api/resources
curl -s http://localhost:5173 | grep -o 'id="root"'
```

Esperado: a mensagem `SREC Coworking API is running...`, **200** em
`/api/resources` e o `id="root"` do frontend.

O 200 é o que vale. `server/src/config/initDb.js:26-28` engole o erro de criação
de tabela (BUG-11), então o servidor imprime "Server is running on port 5000"
mesmo sem banco e só falha na primeira requisição.

Se não existir `docker-compose.yml` na raiz, a spec OPS-01 ainda não foi
mergeada: use a Opção B do `README.md` (PostgreSQL local, `cp
server/.env.example server/.env`, `npm run dev` nos dois pacotes) e registre que
você pagou os 7 passos manuais — esse é o número que a N2 está derrubando para 1.

## 4. Rodar a suíte de teste

```bash
cd server && npm run lint && npm test && cd ..
cd client && npm run lint && npm run build && cd ..
```

No estado recebido, o esperado é: **1 suíte, 2 testes passando**, 0 erro de lint
nas duas pontas, build do client em torno de 201 kB (63 kB gzip). Se bater com
isso, seu ambiente reproduz o baseline da auditoria e os seus números são
comparáveis com os dela.

Se `main` já tiver PRs da N2 mergeados, o número será maior — e aí a referência é
o resultado atual, não o baseline. Para a tabela completa, rode `/metricas`.

## 5. Ler a auditoria

Leia por inteiro, nesta ordem, e resuma ao usuário em poucas linhas o que achou
mais relevante:

1. `docs/auditoria/relatorio-n2.md` — o diagnóstico consolidado do código recebido.
2. `docs/auditoria/metricas-baseline.md` — os números de partida (M-01 a M-29) e
   a armadilha da medição de cobertura.
3. `docs/auditoria/bugs-do-cliente.md` — os 15 bugs, com severidade, arquivo e linha.
4. `docs/auditoria/code-smells.md` — os 14 code smells.
5. `docs/time/overview.md` — papéis, RACI, Definition of Ready e Definition of Done.

Isso não é leitura cerimonial. O catálogo é o que evita os dois desperdícios mais
comuns desta entrega: "descobrir" um defeito que já tem ID, spec e dono; e
corrigir de passagem algo fora da sua issue — que é bloqueio na revisão do QA,
pela última linha da DoD.

## 6. Suas issues e a próxima

```bash
gh issue list --assignee @me --state open
gh issue list --state open --limit 40
```

Liste as issues abertas atribuídas à pessoa, com número, título e a spec
correspondente (`docs/specs/<slug>/implementacao.md`). Se nada estiver atribuído
a ela, use a área do papel para filtrar:

| Pessoa | Papel na N2 | Área | Primeira issue sem dependência |
|---|---|---|---|
| Igor Seberino (`@igorSeberino`) | PO + QA | auditoria, testes, aprovação de PR | #1 ONB-01 e #2 AUD-01; depois `qa-03-test-plan-and-regression` |
| Gabriel Carvalho (`@gabrielcarvallho`) | DevOps | `ops-*` | #16 `ops-01-docker-compose-environment` |
| Adrian Cesar (`@adrian-cesar`) | Backend | `be-*` | #3 `be-01-prevent-double-booking` (BUG-01, CRÍTICO) |
| Renato Colin (`@RenatoColin`) | Frontend | `fe-*` | #11 `fe-01-split-god-component` (CS-01, `App.jsx` com 351 linhas) |
| Diego Nessler (`@Diegonessler`) | Requisitos | `req-*` | #21 `req-01-reverse-engineer-requirements` |

Para escolher **a próxima** entre as issues da pessoa, aplique nesta ordem:

1. Abra a spec de cada candidata e leia o campo **Depende de**. Descarte toda
   issue cuja dependência não esteja mergeada em `main` — começar por ela gera
   conflito de merge garantido. Os pontos de entrada reais, sem dependência, são
   `be-01`, `fe-01`, `ops-01`, `ops-04` e `req-01`.
2. Entre as liberadas, priorize por severidade do achado: **CRÍTICO > ALTO >
   MÉDIO > BAIXO**.
3. Empate: priorize o que desbloqueia mais gente. `ops-01` destrava QA-01 e
   OPS-02; `be-04` destrava BE-05, BE-06 e BE-08; `fe-01` destrava FE-02 a FE-05.

Termine o onboarding anunciando **uma** issue: número, título, slug da spec, o
achado que ela resolve (`BUG-xx` / `CS-xx`) e o comando para começar:

```
/implementar <slug-da-spec>
```

## Fechamento

Reporte ao usuário, em lista curta: ambiente OK ou o que falta; sistema subiu ou
não (com o status HTTP real que você obteve); resultado da suíte; o que a
auditoria diz em duas linhas; as issues abertas dela; e a próxima com o comando
pronto. Não invente nenhuma dessas saídas — se um passo não rodou, diga que não
rodou e por quê.
