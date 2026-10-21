---
description: Revisa um PR no papel do QA com o subagent qa-reviewer e produz o parecer — aprovar, aprovar com ressalva ou bloquear
argument-hint: "<número do PR> — ex. 42; sem argumento, revisa a branch atual"
---

# Revisar o PR #$ARGUMENTS

## 1. Levantar o material

```bash
gh pr view $ARGUMENTS --json title,body,headRefName,baseRefName,files,commits,state
gh pr diff $ARGUMENTS
```

Sem argumento, revise a branch atual antes de o PR existir — é o passo 6 do ciclo
da skill `tbd-flow`, e serve para não chegar no QA humano com não-conformidade
óbvia:

```bash
git log main..HEAD --oneline
git diff main...HEAD
```

Se o PR não existir ou o número estiver errado: `gh pr list --state open`.

## 2. Disparar o subagent `qa-reviewer`

Dispare o subagent `qa-reviewer` sobre o PR `$ARGUMENTS`. Ele é **somente
leitura**: não corrige o PR, não commita na branch, não roda `gh pr review` nem
`gh pr merge`. Exija no prompt esta ordem de revisão:

**1. Achar e ler a spec.** O corpo do PR referencia uma issue e uma pasta
`docs/specs/<slug>/`. Leia `docs/specs/<slug>/implementacao.md` **inteiro antes**
de olhar o diff. PR sem spec referenciada já é ressalva: a N2 tem formato
obrigatório de spec e o handoff da N3 depende dele.

**2. Confrontar o diff com a spec, seção por seção.**

| Seção da spec | O que verificar |
|---|---|
| Alterações | Todo arquivo listado foi tocado? Algum arquivo **fora** da lista foi tocado? |
| Testes | Os casos descritos existem como teste real e passam? O teste que "falha antes" existe? |
| Critérios de aceite | Cada item do checklist tem evidência verificável no diff ou na saída de teste |
| Decisão | A implementação segue a abordagem decidida, ou trocou por outra em silêncio? |

Arquivo tocado fora de "Alterações" é **ampliação de escopo**: ressalva no
mínimo, bloqueio se invadir outro domínio (um `fix/reservation-overlap` que
também reorganiza `client/src/App.jsx`).

**3. Verificar a Definition of Done de `docs/time/overview.md`**, item por item,
dizendo para cada um se foi cumprido, não cumprido ou não verificado:

* comportamento dos critérios de aceite verificado de fato;
* teste automatizado cobrindo a mudança e, em correção de bug, o teste que
  **falhava antes**;
* suíte inteira passando e cobertura que não caiu;
* CI verde, incluindo lint e build;
* commits em Conventional Commits em português no imperativo;
* documentação afetada atualizada **no mesmo PR**;
* aprovação do QA;
* nenhum arquivo fora do escopo da issue.

**4. Conferir Conventional Commits.**

```bash
git log main..<branch> --oneline
```

Cada commit: `tipo(escopo): descrição`, tipo em
`feat|fix|refactor|docs|test|chore|perf|build|ci`, descrição em **português,
imperativo, minúscula, sem ponto final**, até 72 caracteres. Escopos desta base:
`reservations`, `resources`, `db`, `api`, `client`, `ci`, `docs`, `deps`.
Rejeite `update`, `ajustes`, `wip`, `correções`, `melhorias`, mensagem em inglês
e mensagem que nomeia o arquivo em vez do efeito (`fix: App.jsx`).

**5. Checar se a cobertura caiu.**

```bash
cd server && npx jest --coverage --coverageReporters=text --collectCoverageFrom='src/**/*.js'
```

Compare com o número declarado no corpo do PR e com o baseline (**6,14 %**
statements, **0 %** branches, **3,57 %** funções, **2** casos de teste). Use
sempre `--collectCoverageFrom='src/**/*.js'`: sem a flag o Jest reporta 35,48 %
porque só conta arquivo importado por algum teste, e comparar números medidos de
formas diferentes é o mesmo que não medir.

Regras: PR de `fix/` **tem** que trazer teste que reproduz o bug — sem ele o bug
volta na N3 e ninguém percebe. PR de `refactor/` **não pode** reduzir cobertura.
PR de `feat/` traz caminho feliz e caminho de erro. Teste que só verifica
`expect(db.query).toHaveBeenCalled()` sem conferir SQL e parâmetros é teste de
fachada: ressalva, com a linha citada.

**6. Caçar regressão.** Carregue a skill de arquitetura do lado tocado
(`srec-backend-architecture` para `server/`, `srec-frontend-architecture` para
`client/`) e confira os pontos sensíveis desta base: a fórmula
`start_time < $3 AND end_time > $2` em `reservationModel.js:49` está **correta** e
mexer nela exige justificativa explícita na spec; mudança no contrato de resposta
(`{ error: ... }`, 400/404/409) precisa que `client/src/services/api.js`
acompanhe; mudança em `initDb.js`/migrations precisa que um clone novo ainda suba
o banco; remoção de endpoint tem que estar na spec (são 10 implementados, o front
chama 8).

**7. Cobrar documentação para a N3.** 1,5 ponto da rubrica é "clareza nas
alterações feitas, para a N3". Mudou schema, contrato de API ou arquitetura sem
atualizar `docs/arquitetura/` ou `docs/auditoria/`? Ressalva — o próximo grupo
herda a divergência, que é exatamente o que nós sofremos ao receber o SREC com 12
divergências catalogadas.

## 3. Veredito explícito

O parecer termina com **um** destes três, nunca com um resumo ambíguo:

```
## Veredito: APROVAR
Nada pendente. DoD completa, spec cumprida, cobertura <X %> (era <Y %>).
```

```
## Veredito: APROVAR COM RESSALVA
Pode mergear. Pendências que não bloqueiam, cada uma com dono e destino:
* <ressalva> → issue de follow-up / docs/time/divida-tecnica.md
```

```
## Veredito: BLOQUEAR
Não mergear. Falta, em ordem de correção:
1. <o que falta> — <arquivo:linha> — <como corrigir>
```

Bloqueio é obrigatório quando: a spec não foi cumprida; `fix/` sem teste de
regressão; cobertura caiu; lint ou build vermelho; escopo ampliado para outro
domínio; segredo no diff (`DATABASE_URL` real, senha, token).

Nunca devolva "parece bom". O que não foi possível verificar entra como **"não
verificado"** e vira pendência, não aprovação.

## 4. O que este comando NÃO faz

**Este comando produz o parecer, não a aprovação.** Quem aprova no GitHub é o
**Igor (`@igorSeberino`), no papel de QA** — é literalmente o item de 1,5 ponto
da rubrica ("Pull Requests aprovados pelo QA"), e é ato humano, com clique dele.

Nenhum `gh pr review --approve`, nenhum `gh pr merge`, nenhum `gh pr edit` sai
daqui — `gh pr merge` está inclusive na lista `deny` de `.claude/settings.json`.
O parecer é o insumo da decisão do Igor e a evidência de que a revisão aconteceu;
cole-o como comentário no PR se ele pedir, e ninguém aprova o próprio PR.

Merge só com **1 aprovação do QA + CI verde + DoD toda marcada**.
