# Fluxo Trunk-Based Development

O fluxo que o time segue na N2. Versão operacional das convenções: se algo
aqui divergir da prática, a prática observada vence e este documento é
corrigido.

## Por que Trunk-Based e não Git Flow

O README recebido declarava Git Flow com `main` e `develop`. Na prática,
`develop` **nunca existiu** no repositório — e a CI referenciava aquela branch
em `on.push.branches` desde o primeiro commit, ou seja, metade do gatilho nunca
disparou. O grupo anterior trabalhou com duas branches longas por camada
(`backend` e `frontend`), mergeadas uma vez cada.

Para uma entrega de três semanas, com cinco pessoas e issues pequenas e
independentes, branch longa só acumula conflito. Adotamos Trunk-Based de forma
explícita, e a CI passa a apontar só para branch que existe.

## O ciclo

```
main
 │
 ├── 1. pegar a issue no board e ler a spec inteira
 │
 ├── 2. criar a branch a partir de main atualizada
 │
 ├── 3. implementar (teste que falha primeiro, quando a spec pede)
 │
 ├── 4. commits pequenos, Conventional Commits em português
 │
 ├── 5. abrir PR, pequeno, vinculado à issue
 │
 ├── 6. CI verde + revisão do QA
 │
 └── 7. merge em main, branch apagada
```

Branch viva por mais de três dias é sinal de que a issue era grande demais:
quebre em duas.

## 1. Pegar a issue

O backlog vive no
[GitHub Project](https://github.com/users/igorSeberino/projects/1). Filtre por
`Responsavel` e pegue a de maior severidade entre as que não têm dependência
pendente. O campo **Depende de** no corpo da issue diz o que precisa estar
mergeado antes — respeite, porque várias specs de backend dependem das
migrations de OPS-02 e do middleware de erro de BE-04.

Antes de começar, confirme a **Definition of Ready** em
[`overview.md`](overview.md).

## 2. Criar a branch

Sempre a partir de `main` atualizada:

```bash
git checkout main
git pull origin main
git checkout -b fix/prevent-double-booking
```

### Prefixos

| Prefixo | Quando usar |
|---|---|
| `fix/` | corrigir defeito de comportamento |
| `feature/` | capacidade nova |
| `refactor/` | mudar estrutura preservando comportamento |
| `test/` | adicionar ou reorganizar teste |
| `docs/` | documentação, requisitos, contrato |
| `chore/` | processo, ferramental, configuração |

O nome da branch é **em inglês**, em `kebab-case`, e normalmente igual ao slug
da spec. Cada spec já declara a branch no cabeçalho — use aquela, para que
branch, issue e spec sejam rastreáveis entre si.

## 3. Implementar

Carregue a skill de arquitetura da área antes de escrever código, ou rode
`/implementar <slug>`, que carrega a spec e a skill e conduz o ciclo.

Duas regras que não se negociam:

* **Para correção de bug, o teste que falha vem primeiro.** Escreva, rode, veja
  falhar, e só então corrija. O teste que nunca falhou não prova que o bug
  existia — e provar os bugs é metade da nota desta entrega.
* **Não amplie o escopo.** Encontrou outro problema? Abra issue com
  `debito tecnico` ou `bug do cliente` e siga. A DoD tem item explícito:
  nenhum arquivo fora do escopo da issue foi alterado.

## 4. Commitar

[Conventional Commits](https://www.conventionalcommits.org/pt-br/), mensagem em
**português no imperativo**, escopo entre parênteses:

```
fix(reservations): impedir dupla reserva concorrente
refactor(errors): centralizar tratamento de erro em middleware
test(reservations): cobrir sobreposicao nas bordas do intervalo
docs(api): documentar os 10 endpoints em OpenAPI 3.1
chore(ci): corrigir gatilho que apontava para branch inexistente
```

Tipos: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `build`,
`ci`.

Imperativo significa "impedir", não "impedindo" nem "impedido". O teste mental:
a mensagem completa a frase *"ao aplicar, este commit vai ..."*.

Commits pequenos e coerentes. Se a mensagem precisa de "e" para descrever o que
foi feito, provavelmente são dois commits.

## 5. Abrir o PR

```bash
git push -u origin fix/prevent-double-booking
gh pr create --fill
```

O template de PR já carrega o checklist da Definition of Done. Preencha de
verdade: o QA usa aquele checklist para decidir.

No corpo, use `Closes #<n>` para a issue fechar no merge.

**PR pequeno de propósito.** Revisão de 80 linhas encontra bug; revisão de 800
linhas encontra erro de digitação. Se o diff passou de ~400 linhas e não é
refatoração mecânica, quebre.

## 6. Revisão

Merge exige **1 aprovação do QA (@igorSeberino) + CI verde**. Os dois, não um
dos dois.

O QA confronta o diff com a spec da issue, verifica a DoD, confere o padrão de
commit e checa se a cobertura caiu. `/revisar-pr <número>` produz o parecer com
o subagent `qa-reviewer` — o parecer é insumo, a aprovação é humana.

Critérios de bloqueio estão em [`../qa/plano-de-testes.md`](../qa/plano-de-testes.md).

Discordância técnica se resolve no PR, por escrito. O histórico da discussão é
material de pitch: mostra que a decisão foi deliberada, não acidental.

## 7. Merge

Merge do PR, branch remota apagada, issue fechada automaticamente, card vai
para `Done` no board.

```bash
git checkout main
git pull origin main
git branch -d fix/prevent-double-booking
```

## O que a automação garante

Processo que depende de todo mundo lembrar não é processo. Depois de
[OPS-05](../specs/ops-05-branch-protection-and-templates/implementacao.md):

* `main` recusa push direto;
* PR sem aprovação não mergeia;
* PR com CI vermelha não mergeia;
* `CODEOWNERS` puxa o QA como revisor automaticamente;
* título de PR fora do Conventional Commits falha na CI.

Até lá, vale a disciplina — e vale lembrar que o grupo anterior também tinha
tudo isso escrito no README e nada disso configurado.
