# Plano de testes — SREC, entrega N2

O que é testado, com qual instrumento, por quem, e com base em que critério um
Pull Request é aprovado ou bloqueado.

Baseline do que recebemos, para que o alvo faça sentido: **6,14 %** de cobertura
de statements, **0 %** de branches, **1** arquivo de teste, **2** casos,
**0** testes de frontend. Números medidos, não estimados — ver
[métricas de baseline](../auditoria/metricas-baseline.md).

## 1. Objetivo

Garantir duas coisas diferentes, que exigem instrumentos diferentes:

* **Que os 15 bugs do catálogo foram corrigidos de fato**, e não apenas que o
  diff parece correto. Cada correção precisa de um teste que falhava antes.
* **Que a refatoração não quebrou o que já funcionava.** FE-01 reescreve as 351
  linhas de `client/src/App.jsx` afirmando comportamento idêntico; BE-04 e BE-06
  reescrevem os dois controllers. Afirmação não é prova.

## 2. Estratégia

### 2.1 O que é automatizado

| Camada | Instrumento | Spec | Comando | Alvo |
|---|---|---|---|---|
| Regra de domínio (sobreposição, janela, status, tipo, capacidade) | Jest, funções puras, sem banco | [QA-02](../specs/qa-02-domain-rule-tests/implementacao.md) | `npm run test:unit` | 100 % de `src/domain/` |
| Contrato HTTP dos 10 endpoints | Supertest + Postgres descartável | [QA-01](../specs/qa-01-api-integration-suite/implementacao.md) | `npm run test:integration` | 10 de 10 endpoints |
| Concorrência na criação de reserva | Supertest, 5 requisições simultâneas (caso V-12) | QA-01 | `npx jest -t 'V-12'` | 1×201 e 4×409 |
| Lint, formato, cobertura, auditoria de dependência, build | GitHub Actions | [OPS-03](../specs/ops-03-ci-quality-gates/implementacao.md) | CI em todo PR | 4 checks verdes |
| Ambiente sobe em um comando | compose + smoke test | [OPS-01](../specs/ops-01-docker-compose-environment/implementacao.md) | CI, job de compose | 1 comando |

### 2.2 O que fica manual, e por quê

| Área | Por que não é automatizada nesta entrega |
|---|---|
| Fluxo de interface, texto visível, feedback, diálogo de confirmação | Não há infraestrutura de teste no `client/` (0 testes) e `App.jsx` não tem um único `id` ou `data-testid` para seletor. FE-01 a FE-05 mudam a estrutura cinco vezes: um teste de ponta a ponta escrito agora nasce para ser reescrito. |
| Formatação de data e fuso horário na tela | O defeito (BUG-07) depende do fuso do navegador, do servidor e do Postgres ao mesmo tempo. Reproduzir isso em runner exige fixar três fusos diferentes; na mesa de quem executa, é digitar 14:00 e ler o que apareceu. |
| Acessibilidade de teclado e nome acessível de botão | `eslint-plugin-jsx-a11y` entra como aviso em OPS-03 e pega o estático (os 7 `<label>` sem `htmlFor`). O que ele não pega — ordem de tabulação, foco visível, botão que só tem `title` — é observação humana. |
| Comportamento do processo: subir com o banco parado (BUG-11), derrubar o Postgres em execução (BUG-12) | Exige matar processo e observar o que acontece com o servidor. Injeção de falha controlada está fora do escopo da N2. |
| Duplo clique no submit (BUG-13) | É um defeito de tempo de interação no navegador. |

Automação de ponta a ponta fica como **débito registrado para a N3**, com o
[roteiro de regressão](roteiro-regressao.md) como especificação de entrada: os
51 passos de verificação numerados são os cenários a automatizar, já escritos.

### 2.3 Regra de fronteira

Fica manual **o que exige um navegador ou matar um processo**. Todo o resto é
automatizado.

Corolário operacional: quando um caso manual ganha teste automatizado, ele
**sai** do roteiro no mesmo PR que o automatiza. Roteiro que duplica teste verde
é roteiro que ninguém executa.

## 3. Quando cada coisa roda

| Momento | O que roda | Quem |
|---|---|---|
| A cada salvamento, durante o desenvolvimento | `npm run test:unit` (< 1 s, sem banco) | quem está escrevendo |
| Antes de abrir o PR | `npm run test:coverage` e `npm run lint` nos pacotes tocados | autor |
| Em todo PR | os 4 checks da CI | automático |
| Em PR que toca `client/src/` | o bloco do roteiro correspondente ao fluxo alterado | autor, e o QA confere |
| **Antes de FE-01** | o roteiro **inteiro**, registrado como execução "antes" | QA, com apoio do Frontend |
| **Depois de FE-05** | o roteiro **inteiro**, registrado como execução "depois" | QA |
| Antes do pitch | o roteiro inteiro, na máquina que vai ser apresentada | QA |

## 4. Definition of Done — como o QA verifica cada item

O texto canônico da DoD é o de [`docs/time/overview.md`](../time/overview.md).
Esta seção não o repete: ela diz como cada item é **verificado**, e o que
invalida uma caixa marcada.

| # | Item da DoD | Como o QA verifica | Invalida a marcação |
|---|---|---|---|
| 1 | O comportamento dos critérios de aceite foi verificado de fato | Rodar a sequência da seção "Como verificar" do PR. Se o PR toca `client/src/`, executar o bloco do roteiro correspondente. | Não ter seção "Como verificar", ou ela não rodar como escrita |
| 2 | Existe teste automatizado cobrindo a mudança; para bug, o teste que falhava antes | Conferir a saída do **antes** (vermelho) e do **depois** (verde) no corpo do PR, com o nome do caso | Teste que passa igual com e sem a correção. O QA testa isso revertendo a linha da correção localmente |
| 3 | A suíte inteira passa e a cobertura não caiu | Comparar os 4 percentuais com o PR anterior mesclado. Medir **sempre** com `--collectCoverageFrom='src/**/*.js'` | `--forceExit`, `it.skip` novo, ou medição sem `collectCoverageFrom` (que infla para 35,48 %) |
| 4 | A CI está verde, incluindo lint e build | Os 4 checks obrigatórios na aba Checks | Check pulado por `continue-on-error` que não seja o `quality-report` da Fase 1 |
| 5 | Commits em Conventional Commits, em português, no imperativo | O check `Título do PR (Conventional Commits)` mais leitura do `git log` da branch | Particípio ("adicionado") ou commit sem tipo |
| 6 | Documentação afetada atualizada no mesmo PR | Se o PR muda contrato, schema, variável de ambiente ou passo de setup, tem de haver diff em `docs/` ou no `README.md` | Diff só de código em PR que muda contrato |
| 7 | Nenhum arquivo fora do escopo da issue foi alterado | `git diff --stat origin/main...` e confronto com a spec | Arquivo "arrumado de passagem". Vira issue própria |
| 8 | **Aprovado pelo QA** | É a aprovação em si, exigida pelo `CODEOWNERS` e pela proteção de `main` ([OPS-05](../specs/ops-05-branch-protection-and-templates/implementacao.md)) | — |

Item 7 tem

... [OUTPUT TRUNCATED - 1,006 chars omitted out of 50,934 total] ...

 as duas execuções do roteiro anexadas**, quando toca
   `client/src/` ou os controllers.
8. **Divergência não explicada** entre a execução "antes" e a "depois" em
   qualquer passo dos blocos A, B ou D do roteiro. Divergência *explicada e
   aprovada pelo PO* é registrada no próprio registro de execução e liberada.
9. **Caso do bloco C que piorou:** um defeito que era MÉDIO e passou a perder
   dado, ou um que estava corrigido e voltou.
10. **Arquivo fora do escopo da issue** no diff, sem justificativa.
11. **Afirmação de melhoria sem número dos dois lados** no corpo do PR.
12. **Documentação de contrato não atualizada** em PR que muda contrato, schema
    ou variável de ambiente.
13. **Nenhuma ação de bloqueio pode ser resolvida desabilitando a verificação.**
    Baixar limiar de cobertura, adicionar `eslint-disable`, marcar `it.skip` ou
    pôr `continue-on-error` para fazer o PR passar é motivo de bloqueio por si
    só.

### 5.3 O que **não** bloqueia

Preferência de estilo que o Prettier não pega, nome de variável, ordem de
`import`, e escolha de abordagem já decidida na spec. Vira comentário sem
`request changes`. O QA não é revisor de gosto; é quem garante que o que o PR
afirma é verdade.

### 5.4 Quando o PO e o QA discordam

Vale a regra de [`docs/time/overview.md`](../time/overview.md): **o QA vence e o
escopo é cortado.** Nesta entrega a nota de "melhoria comprovada" vale mais do
que a de volume entregue.

## 6. Template de registro de bug

Encontrou algo durante a execução do roteiro? Abra issue pelo formulário
**"Bug do cliente"** (`.github/ISSUE_TEMPLATE/bug-do-cliente.yml`, criado por
OPS-05), que já pede estes campos. Se for registrar fora do GitHub — num
registro de execução, por exemplo — use este formato, que é o mesmo:

```markdown
### <ID> — <título em uma linha, sem adjetivo>

* **Severidade:** CRÍTICO | ALTO | MÉDIO | BAIXO
* **Onde:** arquivo:linha (ou "interface, aba Agendamentos")
* **Encontrado em:** passo <A-07 | B-04 | C-09 ...> do roteiro de regressão
* **Commit:** <saída de `git rev-parse --short HEAD`>
* **Ambiente:** navegador e versão · fuso do SO · fuso do Postgres (`SHOW timezone`)
* **Origem:** herdado | criado-n2

**Passos para reproduzir**

1. <ação literal, com o valor digitado>
2. <ação literal>
3. <ação literal>

**Resultado esperado**

<uma frase. O que deveria ter acontecido, e por quê — regra de negócio, contrato
da API, ou o comportamento registrado na execução "antes" do roteiro.>

**Resultado obtido**

<o que aconteceu. Resposta HTTP com código e corpo, ou o texto exato que apareceu
na tela. Copie, não parafraseie.>

**Impacto**

<o que acontece com o usuário ou com o dado. Uma ou duas frases.>

**Evidência**

<saída de comando, trecho do console do navegador, print. Nome do arquivo em
`docs/auditoria/evidencias/` quando houver.>
```

Escala de severidade, a mesma de
[`bugs-do-cliente.md`](../auditoria/bugs-do-cliente.md):

* **CRÍTICO** — quebra a regra de negócio central ou perde dado do usuário.
* **ALTO** — produz resposta errada, derruba o serviço ou corrompe estado.
* **MÉDIO** — permite dado inválido entrar no sistema ou degrada a operação.
* **BAIXO** — incomoda o usuário ou suja o código, sem perder dado.

Duas regras de escrita que economizam uma ida e volta inteira:

* **Resultado obtido é transcrição, não interpretação.** "A reserva ficou
  errada" não é resultado obtido. `201 Created` com
  `"start_time":"2026-10-21T17:00:00.000Z"` é.
* **Sem passo, não há bug.** Um defeito que ninguém sabe reproduzir não entra
  no placar de QA-04 — entra como "a investigar", com o que se sabe.

## 7. Registros de execução

Cada execução do roteiro gera um arquivo próprio, copiado do molde:

```
docs/qa/execucoes/2026-10-21-antes-igor.md
docs/qa/execucoes/2026-10-22-depois-igor.md
```

O cabeçalho do roteiro exige commit, data, executor, navegador e fuso. Sem isso
a comparação entre antes e depois não é comparação — BUG-07 depende justamente
do fuso.

Os registros vão anexados ao PR que os exige e versionados no repositório: o
`git diff` entre o "antes" e o "depois" é a prova mais barata de que a
refatoração preservou o comportamento.

## 8. Documentos relacionados

* [Roteiro de regressão manual](roteiro-regressao.md) — o checklist executável
* [Definition of Ready e Definition of Done](../time/overview.md)
* [Catálogo de bugs do cliente](../auditoria/bugs-do-cliente.md) — os 15 defeitos
* [Métricas de baseline](../auditoria/metricas-baseline.md) — os números do "antes"
* [Relatório antes/depois](../auditoria/relatorio-antes-depois.md) — onde os resultados viram placar