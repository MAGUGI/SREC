# QA-03 — Plano de testes e roteiro de regressão manual

* **Responsável:** Igor Thiago Seberino (Product Owner + QA)
* **Issue:** #27
* **Branch:** `docs/test-plan-and-regression`
* **Rubrica:** 3,0 — Processo, Git & Documentação → **1,5 pt** "uso correto de branches, Pull Requests **aprovados pelo QA** e padrões de commit". É este documento que define *com base em quê* o QA aprova ou bloqueia um PR, e o que a palavra "aprovado" significa nos 26 PRs da entrega.
* **Depende de:** nada tecnicamente — é documento, e precisa existir **antes** de FE-01. Consome a fronteira definida por QA-01 (integração HTTP) e QA-02 (domínio puro), e a Definition of Done de `docs/time/overview.md:100-111`. **Bloqueia FE-01**: a execução "antes" do roteiro é pré-requisito daquele PR.

## Problema

### Não existe critério escrito para aprovar um PR

`docs/time/overview.md:33-36` atribui ao QA a responsabilidade de "aprovar todos
os PRs do time" e de "bloquear merge quando a Definition of Done não é
cumprida". A DoD está escrita (`overview.md:100-111`, oito itens), e para três
deles existe comando — a CI de OPS-03 verifica lint, build e cobertura.

Para os outros cinco não existe nada. "O comportamento descrito nos critérios de
aceite foi verificado de fato" é o primeiro item da lista e o único que
realmente exige alguém olhar o sistema funcionando. Hoje não há documento que
diga **como** olhar, **o que** olhar, nem **o que conta como verificado**. Com
26 PRs e três dias até a entrega, "o QA confere" sem instrumento vira "o QA
aprova".

### A refatoração do frontend é uma afirmação sem prova

FE-01 (`docs/specs/fe-01-split-god-component/implementacao.md`) reescreve
`client/src/App.jsx` — **351 linhas, 41 % de todo o JS/JSX do projeto** — e
afirma comportamento idêntico. Depois dela vêm FE-02, FE-03, FE-04 e FE-05, todas
dependentes dela, todas tocando a mesma tela.

O que existe hoje para sustentar essa afirmação:

| Rede de proteção do frontend | Quantidade |
|---|---|
| Testes de frontend | **0** (M-29 de `docs/auditoria/metricas-baseline.md`) |
| Infraestrutura de teste no `client/` | **nenhuma** — `client/package.json` não tem script `test` |
| Testes de ponta a ponta | **0** |
| Roteiro manual versionado | **nenhum** |

Ou seja: **zero**. Quem revisar o PR de FE-01 vai ler um diff de 351 linhas
removidas e uma dúzia de arquivos novos, e decidir com base em leitura se o
comportamento é o mesmo. Isso não é revisão, é fé.

E afirmar não basta: a rubrica da N2 cobra melhoria **comprovada**, e uma
refatoração que quebra a tela em silêncio é o pior resultado possível desta
entrega — mexemos em código alheio e entregamos pior do que recebemos, sem
notar.

### Boa parte do comportamento do SREC não é alcançável por teste automatizado nesta entrega

QA-01 cobre os 10 endpoints por HTTP. QA-02 cobre a regra de domínio em memória.
Nenhum dos dois vê o navegador — e é no navegador que moram oito comportamentos
observáveis que a auditoria registrou:

| Comportamento | Onde | Visível só na interface |
|---|---|---|
| `window.confirm('Deseja realmente remover este espaço?')` não menciona as reservas | `App.jsx:77` | sim (BUG-06) |
| Botão de submit não desabilita durante o envio | `App.jsx:195-197, 281-283` | sim (BUG-13) |
| `setTimeout` do feedback sem `clearTimeout` | `App.jsx:32-35` | sim (BUG-14) |
| Tag de status renderizada como `status-${rev.status}` | `App.jsx:306` | sim (BUG-03) |
| Tudo que não é `meeting_room` aparece como "Estação de Trabalho" | `App.jsx:212` | sim (BUG-10) |
| `datetime-local` sem offset + `toLocaleString('pt-BR')` | `App.jsx:264, 274, 303-304` | sim (BUG-07) |
| Não há tela de editar espaço | `App.jsx` inteiro | sim (BUG-15) |
| 7 `<label>` sem `htmlFor` | `App.jsx` | sim (CS-13) |

Oito dos 15 bugs do catálogo têm sintoma de interface. Deixá-los fora de
qualquer verificação significa que metade do placar do pitch (QA-04) ficaria sem
instrumento de medição.

### E o registro de bug não tem forma

Os 15 bugs de `docs/auditoria/bugs-do-cliente.md` foram catalogados por leitura
de código, com arquivo, linha, reprodução, esperado e obtido — porque foi uma
pessoa só fazendo auditoria com calma. O que aparecer durante a execução da N2
vai ser encontrado por cinco pessoas diferentes, sob prazo. Sem template, chega
como "a reserva ficou errada", que custa uma ida e volta de mensagens antes de
virar issue.

## Evidência

Baseline medido, dos documentos de auditoria:

```bash
cd server && npm ci
npx jest --coverage --coverageReporters=text --collectCoverageFrom='src/**/*.js'
# => All files | 6.14 | 0 | 3.57 | 6.14
# => Tests: 2 passed, 2 total

cd ../client
grep -c '"test"' package.json        # => 0
ls src/**/*.test.* 2>/dev/null | wc -l   # => 0
wc -l src/App.jsx                    # => 351
grep -c '<label>' src/App.jsx        # => 7
```

| Métrica | Valor medido no recebimento |
|---|---|
| Testes de frontend (M-29) | **0** |
| Cobertura de branches, backend (M-02) | **0 %** |
| Casos de teste (M-05) | **2** |
| Linhas de `App.jsx` (M-19) | **351** |
| Bugs com sintoma de interface | **8** de 15 |
| Documentos de plano de teste no repositório recebido | **0** |
| Roteiro de regressão versionado | **0** |

Verificação de que a afirmação "comportamento idêntico" não é verificável hoje —
rode isto antes e depois de qualquer mudança em `App.jsx` e compare:

```bash
cd client && npm test
# => npm error Missing script: "test"
```

É literalmente tudo que o time tem para detectar regressão de interface.

## Decisão

**Escrever dois documentos com papéis distintos: um plano de testes, que define
a estratégia e o critério de aprovação do QA, e um roteiro de regressão manual,
que é um checklist numerado executável por qualquer pessoa do time, rodado
antes e depois da refatoração do frontend.**

### Por que regressão manual e não Playwright

A alternativa óbvia é um teste de ponta a ponta de verdade: Playwright, 30
cenários, roda na CI, prova tudo para sempre. Ela é melhor em regime permanente,
e está errada **nesta** entrega, por três motivos mensuráveis:

1. **Prazo.** A entrega é 23/10. Playwright exige instalar navegador no runner,
   lidar com o `--legacy-peer-deps` que o `client/` já exige, resolver espera de
   rede e criar seletores — e `App.jsx` não tem um único `data-testid` nem `id`
   (os 7 `<label>` nem têm `htmlFor`). Os seletores teriam de se agarrar a texto
   e a estrutura de `div`, e **FE-01 vai mudar exatamente essa estrutura**. O
   teste nasceria para ser reescrito no PR seguinte.
2. **A ordem está invertida.** Teste de ponta a ponta se escreve contra uma
   interface estável. A nossa muda cinco vezes em cinco PRs (FE-01 a FE-05). O
   momento de automatizar é **depois** de FE-04, e aí não sobra entrega.
3. **O roteiro manual tem um segundo produto que o automatizado não tem.** Ele
   obriga cinco pessoas que nunca viram o SREC a usar o SREC, passo por passo.
   Metade dos oito bugs de interface da auditoria só é entendida de verdade
   quando a pessoa digita 14:00 e lê 11:00 na tela. Isso vale para o pitch.

Automação de ponta a ponta entra como **débito registrado da N3**, com o
roteiro desta spec como especificação de entrada — os **51 passos de
verificação** numerados são exatamente os cenários a automatizar, já escritos.

### Por que rodar o roteiro ANTES e não só depois

Este é o coração da spec. Um roteiro executado só depois da refatoração responde
"o sistema funciona?". A pergunta que FE-01 levanta é outra: **"o sistema se
comporta como antes?"** — e para responder isso é preciso ter registrado como
ele se comportava.

A diferença não é teórica. Metade dos comportamentos atuais do SREC é
*estranha mas intencional de se preservar*, e a outra metade é defeito:

| Comportamento observado hoje | É para preservar? |
|---|---|
| O tipo do espaço **não** é limpo depois de cadastrar (`App.jsx:67-68` só limpam nome e capacidade) | sim — é conveniente, e mudar isso é decisão de produto, não de refatoração |
| A tag de status mostra o literal em inglês `scheduled` (`App.jsx:306`) | não — mas quem decide é o PO, e não pode mudar "de brinde" num PR de refatoração |
| A opção do select mostra o tipo cru: `Sala Alpha (meeting_room)` (`App.jsx:245`) | não — mesma regra |
| Mensagem de conflito chega em inglês, do backend (`api.js:60`) | não — mesma regra |
| Botão de concluir/cancelar desaparece quando o status sai de `scheduled` (`App.jsx:309`) | sim |

Sem o registro do "antes", a conversa no PR de FE-01 vira "eu achei que era
assim". Com o registro, é uma coluna ao lado da outra. E o oitavo item da DoD —
"nenhum arquivo fora do escopo da issue foi alterado" — ganha um irmão
comportamental: *nenhum comportamento fora do escopo da issue foi alterado*.

Consequência prática, que entra como critério de bloqueio: **FE-01 não é
aprovado sem os dois registros anexados ao PR.**

### Fronteira entre automatizado e manual

Decidida com o Backend e o Frontend, para não haver caso coberto duas vezes nem
caso órfão:

| Camada | Instrumento | Spec | Roda onde |
|---|---|---|---|
| Regra de domínio pura (sobreposição, janela, status, capacidade) | Jest, sem banco | **QA-02** | `npm run test:unit`, < 1 s |
| Contrato HTTP dos 10 endpoints, códigos de status, envelope de erro | Supertest + Postgres real | **QA-01** | `npm run test:integration` |
| Concorrência na criação de reserva (BUG-01) | Supertest, 5 requisições simultâneas | **QA-01**, caso V-12 | integração |
| Lint, formato, build, cobertura, `npm audit` | GitHub Actions | **OPS-03** | CI, em todo PR |
| Ambiente sobe em um comando | `docker compose up` + smoke test | **OPS-01** | CI, job de compose |
| **Interface: fluxo, texto visível, feedback, confirmação, formatação de data** | **roteiro manual** | **QA-03** | **navegador, à mão** |
| **Acessibilidade de teclado e nome acessível de botão** | **roteiro manual** | **QA-03** | **navegador, à mão** |
| **Comportamento do processo: subir com o banco parado, derrubar o Postgres em execução** | **roteiro manual** | **QA-03** | **terminal, à mão** |

As três últimas linhas são o escopo desta spec. O critério de corte é direto:
**fica manual o que exige um navegador ou matar um processo.** Tudo o mais é
automatizado, e um caso que vira automatizado **sai** do roteiro manual no mesmo
PR — roteiro que duplica teste verde é roteiro que ninguém executa.

### Por que o roteiro é checklist numerado com coluna do obtido, versionado em markdown

Três alternativas foram consideradas e recusadas:

* **Planilha.** Não entra no PR, não tem diff, não tem revisão. O registro de
  execução precisa ser anexável ao PR e comparável entre o antes e o depois —
  `git diff` entre dois registros é a prova mais barata que existe.
* **Texto corrido descrevendo os fluxos.** Não é executável. Quem lê escolhe o
  que fazer, e duas pessoas executam coisas diferentes com o mesmo documento.
* **Lista de verificação sem resultado esperado.** É o formato mais comum e o
  mais inútil: "testar criação de reserva [ ]". Sem resultado esperado escrito,
  o executor decide no momento se o que viu está certo — e tudo passa.

Então: passo numerado, ação literal, **resultado esperado escrito**, espaço para
o obtido, e marcação de igualdade entre as duas execuções. O documento é
copiado para `docs/qa/execucoes/<data>-<antes|depois>-<executor>.md` e preenchido
ali; o roteiro em si permanece como molde em branco.

### Por que a Definition of Done aparece em três lugares, e isso não é duplicação

A convenção da N2 é "uma casa canônica por assunto; para relacionar documentos,
use link, não copie o texto". A DoD aparece em três lugares, de propósito, com
conteúdos diferentes:

| Lugar | O que tem | Para quem |
|---|---|---|
| `docs/time/overview.md:100-111` | **o texto canônico** dos 8 itens | o time, e quem define o processo |
| `.github/pull_request_template.md` (OPS-05) | as caixas de marcar | o autor do PR |
| `docs/qa/plano-de-testes.md` (esta spec) | **como o QA verifica cada item**, com comando e o que invalida a marcação | o QA, na revisão |

O terceiro não repete a DoD: ele a instrumenta. "A suíte inteira passa e a
cobertura não caiu" vira "rode `npm run test:coverage`, compare com o número do
PR anterior, e desconfie de caixa marcada com `--forceExit` na saída". Regra que
acompanha: se a DoD mudar, os três mudam no **mesmo PR**.

### Por que os bugs conhecidos entram no roteiro como casos de borda

Um roteiro de regressão clássico testa só o caminho que deve funcionar. O nosso
tem um bloco inteiro (**C-01 a C-15**) com os defeitos do catálogo, e cada caso
tem **duas** colunas de resultado esperado: o comportamento defeituoso de hoje e
o comportamento correto depois da correção.

Isso serve a três coisas ao mesmo tempo:

1. Na execução **antes**, os 15 casos de C reproduzem os defeitos. É a
   confirmação independente da auditoria, que até agora foi feita por leitura de
   código — e um bug catalogado que não reproduz é um item a retirar do placar
   de QA-04, não a esconder.
2. Na execução **depois**, viram a verificação de que a correção chegou até a
   interface. Vários bugs são corrigidos no backend (BE-02, BE-03, BE-05) e a
   tela pode continuar mostrando a mensagem errada.
3. Os três casos que **nenhum** teste automatizado alcança — BUG-11 (servidor
   sobe com banco quebrado), BUG-12 (queda do Postgres mata o processo) e BUG-13
   (duplo clique) — só têm prova aqui. Sem este roteiro, saem do placar.

## Alterações

### 1. `docs/qa/plano-de-testes.md` — criar

````markdown
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

Item 7 tem um irmão comportamental, criado por esta spec para os PRs de
refatoração: **nenhum comportamento fora do escopo da issue foi alterado.** A
prova é a comparação entre as duas execuções do roteiro.

## 5. Critérios objetivos de bloqueio de merge

O QA **bloqueia** o PR quando qualquer uma destas condições é verdadeira. A
lista é fechada: bloqueio fora dela é opinião e tem de virar comentário, não
*request changes*.

### 5.1 Bloqueio automático (a CI já reprova)

1. Qualquer um dos 4 checks obrigatórios vermelho.
2. Cobertura de statements, branches, funções ou linhas **abaixo** do limiar
   vigente em `server/jest.config.js`.
3. Título do PR fora de Conventional Commits.
4. Conversa não resolvida no PR.

### 5.2 Bloqueio pelo QA

5. **Correção de bug sem o teste que falhava antes**, ou sem a saída do antes e
   do depois no corpo do PR.
6. **Teste frouxo:** o caso passa igual com e sem a correção. O QA reverte a
   linha da correção e roda; se ficar verde, bloqueia.
7. **PR de refatoração sem as duas execuções do roteiro anexadas**, quando toca
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
````

### 2. `docs/qa/roteiro-regressao.md` — criar

````markdown
# Roteiro de regressão manual — SREC

Checklist executável por qualquer pessoa do time, sem conhecimento prévio do
sistema. **56 passos**: 5 de preparação e **51 de verificação**. Cada passo tem
ação literal e resultado esperado escrito.

**Como usar:** copie este arquivo para
`docs/qa/execucoes/<AAAA-MM-DD>-<antes|depois>-<seu-nome>.md`, preencha o
cabeçalho e as colunas de obtido, e anexe ao PR. Este arquivo permanece em
branco, como molde.

**Quando executar por inteiro:** antes de FE-01, depois de FE-05, e antes do
pitch. Em PR que toca `client/src/`, execute apenas o bloco do fluxo alterado.

Tempo da execução completa: **40 a 55 minutos**, incluindo a preparação.

## Cabeçalho da execução

| Campo | Valor |
|---|---|
| Momento | `antes` / `depois` |
| Commit | `git rev-parse --short HEAD` → |
| Data e hora de início | |
| Executor | |
| Navegador e versão | |
| Fuso do sistema operacional | |
| Fuso do Postgres (`SHOW timezone;`) | |
| Specs já mescladas em `main` | |

Legenda das colunas de resultado:

* **OK** — o obtido é igual ao esperado.
* **DIF** — diferente. Exige linha na seção "Divergências", no fim do arquivo.
* **N/A** — passo não aplicável neste momento (indique por quê).

## Bloco P — Preparação

| # | Passo | Resultado esperado | Obtido | OK? |
|---|---|---|---|---|
| P-01 | Preencher o cabeçalho desta execução, inclusive os dois fusos | Todos os campos preenchidos. Sem fuso registrado, os passos B-06 e C-08 não são comparáveis | | |
| P-02 | Subir o ambiente: `docker compose up -d --wait` (OPS-01). Sem OPS-01, seguir os 7 passos manuais do `README.md` | A stack sobe sem erro. Registrar quantos comandos foram necessários | | |
| P-03 | `curl -s http://localhost:5000/` | `SREC Coworking API is running...` | | |
| P-04 | Zerar a base: `TRUNCATE TABLE reservations, resources RESTART IDENTITY CASCADE;` | Comando aceito. `GET /api/resources` e `GET /api/reservations` devolvem `[]` | | |
| P-05 | Abrir `http://localhost:5173` com o console do navegador aberto (F12) | A página carrega. Registrar **todo** erro ou aviso de console da execução inteira | | |

## Bloco A — Gestão de espaços

| # | Passo | Resultado esperado | Obtido na execução ANTES | Obtido na execução DEPOIS | Igual? |
|---|---|---|---|---|---|
| A-01 | Observar o cabeçalho e a aba ativa ao abrir a aplicação | Cabeçalho "SREC - Sistema de Reservas & Coworking" com selo "v1.0.0"; a aba **"Espaços e Salas"** vem ativa | | | |
| A-02 | Observar o card "Espaços Cadastrados" com a base vazia | Texto "Nenhum espaço cadastrado ainda." | | | |
| A-03 | Observar o formulário "Novo Espaço" sem tocar em nada | Tipo pré-selecionado em "Estação de Trabalho"; capacidade pré-preenchida com `1` | | | |
| A-04 | Cadastrar: nome `Estação 01`, tipo "Estação de Trabalho", capacidade `1` | Alerta verde "Espaço cadastrado com sucesso!" e um item na lista com "Tipo: Estação de Trabalho \| Capacidade: 1" | | | |
| A-05 | Observar o formulário imediatamente após o sucesso de A-04 | Nome volta a vazio e capacidade volta a `1`; **o tipo permanece no último escolhido** (comportamento atual, a preservar) | | | |
| A-06 | Cadastrar: nome `Sala Alpha`, tipo "Sala de Reunião", capacidade `8` | Item na lista com "Tipo: Sala de Reunião \| Capacidade: 8" | | | |
| A-07 | Submeter o formulário com o nome vazio | O navegador bloqueia e aponta o campo obrigatório. Conferir na aba Network: **nenhuma** requisição é enviada | | | |
| A-08 | Digitar `0` em capacidade e submeter | O navegador bloqueia (`min="1"`). Registrar: a validação é **só** do navegador — ver C-10 | | | |
| A-09 | Esperar parado depois de uma ação bem-sucedida | A mensagem verde desaparece sozinha em cerca de 4 segundos | | | |
| A-10 | Cadastrar dois espaços em sequência rápida e cronometrar a segunda mensagem | A segunda mensagem desaparece **antes** dos 4 segundos (BUG-14). Anotar o tempo aproximado | | | |
| A-11 | Ir para a aba "Agendamentos" e voltar para "Espaços e Salas" | A lista continua completa, sem recarregar a página | | | |
| A-12 | Recarregar a página (F5) | Os espaços cadastrados continuam na lista | | | |
| A-13 | Clicar na lixeira de um espaço e escolher **Cancelar** no diálogo | Diálogo do navegador com o texto "Deseja realmente remover este espaço?"; ao cancelar, **nada** é excluído | | | |
| A-14 | Clicar na lixeira e **confirmar** | Alerta "Espaço removido com sucesso!" e o item sai da lista | | | |
| A-15 | Procurar, em toda a tela, uma forma de **editar** um espaço já cadastrado | Não existe (BUG-15). Há só cadastrar e excluir | | | |

## Bloco B — Ciclo de vida da reserva

Pré-condição: `Estação 01` e `Sala Alpha` cadastrados (A-04 e A-06). Use sempre
datas **futuras** — amanhã, para não tropeçar em BUG-08.

| # | Passo | Resultado esperado | Obtido na execução ANTES | Obtido na execução DEPOIS | Igual? |
|---|---|---|---|---|---|
| B-01 | Ir para a aba "Agendamentos" | Formulário "Novo Agendamento" à esquerda e card "Reservas Realizadas" à direita | | | |
| B-02 | Observar o card de reservas com a base vazia | Texto "Nenhuma reserva registrada." | | | |
| B-03 | Abrir o select "Selecione o Espaço" sem escolher nada | Já vem com o **primeiro** espaço pré-selecionado; as opções mostram o tipo **cru em inglês**: `Sala Alpha (meeting_room)` | | | |
| B-04 | Criar reserva: `Sala Alpha`, responsável `Carlos Silva`, início **amanhã 14:00**, fim **amanhã 15:00** | Alerta verde "Reserva confirmada com sucesso!" e um item na lista | | | |
| B-05 | Ler o item criado em B-04, campo por campo | Nome do espaço, "Responsável: Carlos Silva", o intervalo formatado em pt-BR, e uma etiqueta de status com o literal **em inglês**: `scheduled` | | | |
| B-06 | **Transcrever literalmente** o horário que aparece na tela e comparar com `14:00 até 15:00` | Hoje: pode aparecer deslocado (BUG-07). Anote o horário exibido **e a diferença em horas**. Este é o número que BE-07 tem de zerar | | | |
| B-07 | Observar o formulário após o sucesso de B-04 | Responsável, início e fim são limpos; o espaço selecionado **permanece** (comportamento atual, a preservar) | | | |
| B-08 | Criar reserva sobreposta: `Sala Alpha`, amanhã **14:30 → 15:30** | Alerta **vermelho**. Hoje a mensagem chega em inglês, do backend: "Resource is not available for the selected time slot". Nenhuma reserva nova na lista | | | |
| B-09 | Criar reserva encostando: `Sala Alpha`, amanhã **15:00 → 16:00** | **Aceita.** Uma reserva que começa exatamente quando a outra termina não conflita | | | |
| B-10 | Criar reserva no mesmo horário de B-04, mas em `Estação 01` | **Aceita.** O conflito é por espaço, não por horário | | | |
| B-11 | Clicar no botão verde de concluir na reserva de B-04 | Alerta "Status da reserva atualizado!"; a etiqueta passa a `completed` e os botões de concluir e cancelar **desaparecem** | | | |
| B-12 | Cancelar a reserva de B-09 pelo botão X | Etiqueta passa a `cancelled`; os botões de concluir e cancelar desaparecem; o botão de excluir permanece | | | |
| B-13 | Criar reserva no horário exato da reserva cancelada em B-12 | **Aceita.** Cancelar libera o horário | | | |
| B-14 | Clicar na lixeira de uma reserva, cancelar o diálogo, clicar de novo e confirmar | Diálogo "Deseja cancelar esta reserva permanentemente?"; ao cancelar, nada acontece; ao confirmar, alerta "Reserva removida!" e o item sai | | | |
| B-15 | Criar uma reserva para amanhã **18:00** e depois uma para amanhã **09:00** | A lista exibe em ordem **crescente de horário de início**: a de 09:00 aparece antes da de 18:00 | | | |
| B-16 | Excluir todos os espaços e tentar criar uma reserva | O select fica vazio e o navegador bloqueia o envio pelo campo obrigatório | | | |

## Bloco C — Bordas e bugs conhecidos

Cada caso tem **duas** colunas de esperado: o defeito de hoje e o comportamento
correto depois da correção. Na execução "antes", confirmar a coluna de defeito; na
"depois", a coluna de correto.

Os passos marcados com `API` se executam por `curl`, porque a interface não
oferece caminho até eles — e isso é parte do achado: a validação de navegador
não protege a API.

| # | Bug | Passo | Esperado HOJE (defeito) | Esperado APÓS a correção | Obtido ANTES | Obtido DEPOIS |
|---|---|---|---|---|---|---|
| C-01 | BUG-13 | Clicar **duas vezes rápido** em "Confirmar Reserva" com o formulário preenchido | **Duas** reservas idênticas na lista; o botão não desabilita | **Uma** reserva; o botão desabilita durante o envio | | |
| C-02 | BUG-01 | Abrir a aplicação em duas abas, preencher o mesmo horário no mesmo espaço nas duas e enviar quase junto | **Duas** reservas sobrepostas aceitas | Uma aceita, a outra recusada com mensagem de conflito | | |
| C-03 | BUG-02 | `API` `curl -i -X POST .../api/reservations -d '{"resource_id":1,"user_name":"t","start_time":"2026-11-10T11:00:00Z","end_time":"2026-11-10T09:00:00Z"}'` | `201`, e a reserva aparece na lista sem bloquear ninguém (reserva fantasma) | `400` com motivo de janela inválida | | |
| C-04 | BUG-03 | `API` `curl -i -X PATCH .../api/reservations/1/status -d '{"status":"banana"}'` e recarregar a tela | `200`; a etiqueta mostra `banana` sem estilo e a reserva fica **sem nenhum botão de ação** | `400`; o status permanece `scheduled` | | |
| C-05 | BUG-04 | `API` `curl -i http://localhost:5000/api/resources/abc` | `500 {"error":"Internal server error"}` | `400`, indicando que o id precisa ser numérico | | |
| C-06 | BUG-05 | `API` `curl -i -X PUT .../api/resources/1 -d '{"capacity":4}'` | `500` | `200` com só a capacidade alterada, ou `400` explicando que o corpo precisa ser completo — **nunca 500** | | |
| C-07 | BUG-06 | Criar um espaço, criar **três** reservas nele, excluir o espaço confirmando o diálogo, e abrir a aba "Agendamentos" | As três reservas **desapareceram**, e o diálogo não avisou nada sobre elas | O diálogo informa quantas reservas serão afetadas, ou a exclusão é recusada / vira desativação | | |
| C-08 | BUG-07 | Criar reserva para amanhã às **14:00**, ler o horário exibido, e comparar com `SELECT start_time FROM reservations;` no banco | Os três valores (digitado, exibido, gravado) **não** coincidem. Registrar a diferença em horas | Os três coincidem | | |
| C-09 | BUG-08 | Criar reserva com início **ontem** | Aceita | `400` | | |
| C-10 | BUG-09 | `API` `curl -i -X POST .../api/resources -d '{"name":"X","type":"workstation","capacity":-5}'` e depois com `"capacity":0` | `-5` é **gravado**; `0` vira `1` silenciosamente | `400` nos dois casos | | |
| C-11 | BUG-10 | `API` criar espaço com `"type":"auditorio"` e observar a lista na tela | Aparece como "**Estação de Trabalho**" — a tela mente | `400` | | |
| C-12 | BUG-11 | Parar o Postgres (`docker compose stop db`) e subir o servidor | O servidor sobe anunciando "Server is running on port 5000" e **toda** requisição devolve 500 | O servidor **não** sobe, ou sobe e reporta a falha num endpoint de saúde | | |
| C-13 | BUG-12 | Com o servidor rodando e funcionando, parar o Postgres e esperar 30 s | O processo do servidor **morre** | O processo sobrevive e registra o erro; volta a funcionar quando o banco retorna | | |
| C-14 | BUG-14 | Duas ações bem-sucedidas em sequência rápida (ver A-10) | A segunda mensagem desaparece antes dos 4 s | Cada mensagem dura seus 4 s; nenhum aviso de `setState` após desmontagem no console | | |
| C-15 | BUG-15 | Tentar renomear um espaço pela interface (ver A-15) | Impossível: só apagar e recriar — e apagar dispara C-07 | Existe ação de editar que chama `PUT /api/resources/:id` | | |

## Bloco D — Acessibilidade e robustez de interface

| # | Passo | Resultado esperado | Obtido na execução ANTES | Obtido na execução DEPOIS | Igual? |
|---|---|---|---|---|---|
| D-01 | Clicar **no texto** do rótulo "Nome do Espaço / Estação" | Hoje: o campo **não** recebe foco — os 7 `<label>` não têm `htmlFor` (CS-13). Depois de FE-04: o campo recebe foco | | | |
| D-02 | Percorrer o formulário "Novo Agendamento" usando **só** a tecla Tab | Todos os 4 campos e o botão são alcançáveis, na ordem visual, e o foco é visível em cada um | | | |
| D-03 | Parar com o Tab em cada um dos três botões de ação de uma reserva e observar o nome anunciado | Hoje: só existe `title` (dica de mouse), sem `aria-label` — para leitor de tela são botões sem nome. Depois de FE-04: cada botão tem nome acessível | | | |
| D-04 | Revisar o console do navegador referente à execução inteira | Registrar **todo** erro e aviso, com o texto. Alvo após FE-04: nenhum | | | |
| D-05 | Parar o container do backend (`docker compose stop api`) e recarregar a página | Alerta vermelho "Falha ao carregar recursos"; a interface continua navegável, apenas vazia — não tela branca | | | |

## Resumo da execução

| | Quantidade |
|---|---|
| Passos de verificação executados | de 51 |
| Passos de preparação executados | de 5 |
| OK | |
| DIF (divergências) | |
| N/A | |
| Bugs novos encontrados | |
| Tempo total | |

## Divergências

Uma linha por passo marcado **DIF**. Divergência sem linha aqui é motivo de
bloqueio de merge (critério 8 do [plano de testes](plano-de-testes.md)).

| Passo | O que o antes registrou | O que o depois registrou | É regressão? | Aprovada pelo PO? | Issue |
|---|---|---|---|---|---|
| | | | | | |

## Bugs novos encontrados

Um registro por bug, no formato da seção 6 do
[plano de testes](plano-de-testes.md). Abrir issue pelo formulário
"Bug do cliente" e anotar o número aqui.
````

### 3. `docs/qa/execucoes/.gitkeep` — criar

Pasta onde ficam os registros preenchidos. Nasce vazia e versionada para que o
primeiro executor não precise decidir onde salvar.

### 4. `docs/time/overview.md` — alterar

A matriz RACI (`overview.md:76`) já tem a linha "Roteiro de regressão manual"
com `R` no Igor. Acrescentar o link para `docs/qa/roteiro-regressao.md` na
descrição do papel de QA (`overview.md:33-36`), onde hoje se lê "Dono da suíte
de testes de integração, dos testes de domínio e do roteiro de regressão
manual" sem apontar para onde o roteiro vive.

### 5. `README.md` — alterar

Acrescentar `docs/qa/` ao mapa de documentação, na mesma lista que já cita
`docs/auditoria/` e `docs/time/`. Duas linhas.

## Testes

Um documento se testa executando-o. Os casos abaixo são o aceite da spec, não
metáfora.

### Caso 1 — execução piloto contra o código recebido

O autor da spec executa o roteiro inteiro contra `main` **antes** de qualquer
correção, cronometrando.

Resultado esperado, e é aqui que o roteiro se prova:

| | Esperado na execução piloto |
|---|---|
| Passos dos blocos A, B e D | **36** executados, todos com resultado esperado batendo |
| Passos do bloco C | **15** executados, todos confirmando o defeito descrito |
| Bugs do catálogo confirmados por execução | **15 de 15** |
| Tempo | 40 a 55 min |

Qualquer caso do bloco C que **não** reproduza o defeito é achado novo e
importante: significa que a auditoria por leitura de código errou, e o bug sai
do placar de QA-04 em vez de ser contado como corrigido. Registrar na seção
"Divergências" do registro de execução.

### Caso 2 — executável por quem não conhece o sistema

Uma pessoa do time que **não** escreveu o roteiro executa o bloco A inteiro sem
fazer nenhuma pergunta ao autor.

Aceite: zero perguntas. Cada pergunta feita é um passo mal escrito, e o conserto
é no roteiro, não na explicação verbal.

Candidato natural: Diego (Engenharia de Requisitos), que precisa conhecer o
comportamento real do sistema para fechar as 12 divergências de REQ-01 — o
mesmo esforço serve às duas specs.

### Caso 3 — o registro de execução compara

Executar o bloco A duas vezes contra o mesmo commit, por duas pessoas, salvando
em dois arquivos, e comparar:

```bash
diff docs/qa/execucoes/2026-10-21-antes-igor.md \
     docs/qa/execucoes/2026-10-21-antes-diego.md
```

Aceite: as diferenças ficam restritas ao cabeçalho (executor, hora, navegador).
Diferença numa coluna de "obtido" significa passo ambíguo — ou um defeito que
depende de ambiente, que é achado por si só.

### Caso 4 — o bloco C é executável por `curl` sem adivinhação

Copiar e colar cada comando da coluna "Passo" dos casos marcados `API` e rodar.

```bash
curl -i http://localhost:5000/api/resources/abc
curl -i -X PUT http://localhost:5000/api/resources/1 \
  -H 'Content-Type: application/json' -d '{"capacity":4}'
curl -i -X PATCH http://localhost:5000/api/reservations/1/status \
  -H 'Content-Type: application/json' -d '{"status":"banana"}'
curl -i -X POST http://localhost:5000/api/resources \
  -H 'Content-Type: application/json' -d '{"name":"X","type":"workstation","capacity":-5}'
```

Aceite: nenhum comando precisa ser corrigido para rodar. Comando que exige
ajuste é comando errado na spec.

### Caso 5 — a fronteira não tem caso órfão nem duplicado

Confrontar o roteiro com os mapas de caso de QA-01 (R-01..R-22, V-01..V-28,
A-01..A-04) e QA-02 (O, W, P, S).

| Verificação | Aceite |
|---|---|
| Bug do catálogo sem nenhuma cobertura, automatizada ou manual | **0** |
| Caso manual que já é coberto por teste automatizado verde | **0** |
| Bugs cobertos **só** pelo roteiro manual | **3** — BUG-11 (C-12), BUG-12 (C-13), BUG-13 (C-01) |

Esses três são o argumento de existência do roteiro: sem ele, três defeitos
ficam sem prova nenhuma e saem do placar do pitch.

### Caso 6 — o plano responde à pergunta de aprovação

Pegar três PRs já abertos e perguntar ao plano se aprovam ou bloqueiam, usando
só a seção 5:

| PR fictício | Veredito esperado | Critério |
|---|---|---|
| Correção de bug, CI verde, sem saída do teste vermelho no corpo | **bloqueia** | 5 |
| Refatoração de `App.jsx`, CI verde, sem registro de execução anexado | **bloqueia** | 7 |
| Correção com teste, CI verde, mais um `prettier` aplicado num arquivo de outra pasta | **bloqueia** | 10 |

Aceite: os três vereditos saem do documento sem interpretação.

## Critérios de aceite

* [ ] `docs/qa/plano-de-testes.md` e `docs/qa/roteiro-regressao.md` existem.
* [ ] O plano traz a tabela de fronteira automatizado/manual, com a spec
      responsável por cada linha, e a regra de corte escrita ("navegador ou
      matar um processo").
* [ ] O plano instrumenta os **8** itens da Definition of Done de
      `docs/time/overview.md`, cada um com *como verificar* e *o que invalida a
      marcação*, **sem** recopiar o texto canônico — o canônico continua em
      `overview.md`, linkado.
* [ ] O plano traz os critérios de bloqueio numerados (**13**), separados em
      automáticos e do QA, mais a lista do que **não** bloqueia.
* [ ] O critério 13 está presente: desabilitar a verificação para o PR passar é
      motivo de bloqueio por si só.
* [ ] O plano traz o template de registro de bug com passos numerados, resultado
      esperado, resultado obtido, impacto e evidência, e aponta para o formulário
      de issue de OPS-05.
* [ ] O roteiro é checklist **numerado** com **56** passos — 5 de preparação e
      **51 de verificação**: P-01..P-05, A-01..A-15, B-01..B-16, C-01..C-15,
      D-01..D-05.
* [ ] Todo passo tem resultado esperado escrito. **Nenhum** passo do tipo
      "verificar se funciona".
* [ ] Os blocos A, B e D têm coluna para o obtido **na execução antes** e **na
      execução depois**, mais coluna de igualdade.
* [ ] O bloco C tem **duas** colunas de esperado: defeito de hoje e
      comportamento correto após a correção.
* [ ] Os dois fluxos principais estão cobertos: gestão de espaços (bloco A, 15
      passos) e ciclo de vida da reserva (bloco B, 16 passos).
* [ ] Os **15** bugs do catálogo aparecem no bloco C, um caso por bug, com o ID
      do bug na linha.
* [ ] Os três bugs sem cobertura automatizada possível (BUG-11, BUG-12, BUG-13)
      têm caso no roteiro.
* [ ] O cabeçalho da execução exige commit, data, executor, navegador, fuso do
      sistema operacional e fuso do Postgres.
* [ ] O roteiro tem seção de divergências com coluna "é regressão?" e "aprovada
      pelo PO?".
* [ ] O Caso 1 foi executado contra `main` e o registro está em
      `docs/qa/execucoes/`, anexado a este PR, com o tempo cronometrado.
* [ ] O Caso 2 foi executado por outra pessoa do time, com **zero** perguntas ao
      autor.
* [ ] Todos os comandos `curl` do bloco C rodam copiados e colados, sem ajuste.
* [ ] `docs/qa/` aparece no mapa de documentação do `README.md`.
* [ ] PR aprovado por `@igorSeberino` (QA) — e, como este PR é do próprio QA,
      pelo segundo dono de `/docs/` conforme `.github/CODEOWNERS` de OPS-05.

## Passo a passo TBD

```bash
# 1. Branch
git checkout main
git pull --ff-only origin main
git checkout -b docs/test-plan-and-regression

# 2. Plano de testes
mkdir -p docs/qa/execucoes
git add docs/qa/plano-de-testes.md
git commit -m "docs(qa): adicionar plano de testes com a fronteira automatizado/manual"

# 3. Roteiro de regressão
git add docs/qa/roteiro-regressao.md docs/qa/execucoes/.gitkeep
git commit -m "docs(qa): adicionar roteiro de regressao manual com 56 passos"

# 4. EXECUTAR o roteiro contra o código recebido — este passo não é opcional.
#    É a execução "antes", e é ela que dá valor ao documento.
docker compose up -d --wait
psql "$DATABASE_URL" -c 'TRUNCATE TABLE reservations, resources RESTART IDENTITY CASCADE'
cp docs/qa/roteiro-regressao.md "docs/qa/execucoes/$(date +%F)-antes-igor.md"
# preencher o cabeçalho e as 51 colunas de "obtido" dos blocos A, B, C e D,
# cronometrando

git add docs/qa/execucoes/
git commit -m "test(qa): registrar execucao do roteiro antes das correcoes"

# 5. Caso 2 — outra pessoa executa o bloco A e anota as perguntas que precisou fazer
#    Cada pergunta vira correção no roteiro, neste mesmo PR.
git add docs/qa/roteiro-regressao.md
git commit -m "docs(qa): esclarecer passos do roteiro apontados na execucao piloto"

# 6. Ponteiros nos documentos existentes
git add docs/time/overview.md README.md
git commit -m "docs: apontar o plano de testes e o roteiro de regressao"

# 7. Abrir PR
git push -u origin docs/test-plan-and-regression
gh pr create --fill
# PR: "QA-03 — Plano de testes e roteiro de regressão manual"
# Corpo: colar o resumo da execução piloto (passos OK / DIF, bugs confirmados,
# tempo) e a lista dos bugs do catálogo que NÃO reproduziram, se houver.
# Fecha a issue #27.
```

Ordem de merge combinada com o time: **QA-03 entra antes de FE-01**, e com a
execução "antes" já registrada. Se FE-01 for mesclada primeiro, o registro do
comportamento original deixa de existir e a afirmação "comportamento idêntico"
fica sem como ser verificada — a esta altura da entrega, de forma definitiva.

## Prompt para o Claude Code

```
Implemente a spec QA-03 deste repositório.

Leia primeiro, por inteiro:
- docs/specs/qa-03-test-plan-and-regression/implementacao.md
- docs/time/overview.md (a Definition of Done, linhas 100-111)
- docs/auditoria/bugs-do-cliente.md (os 15 bugs, com reprodução)
- docs/auditoria/metricas-baseline.md
- client/src/App.jsx (as 351 linhas, INTEIRAS)
- client/src/services/api.js
- docs/specs/qa-01-api-integration-suite/implementacao.md e
  docs/specs/qa-02-domain-rule-tests/implementacao.md — só os mapas de caso,
  para não duplicar no manual o que já é automatizado

Carregue a skill de QA/testes do time em .claude/skills/ antes de começar.

Crie a branch docs/test-plan-and-regression e entregue:
1. docs/qa/plano-de-testes.md
2. docs/qa/roteiro-regressao.md
3. docs/qa/execucoes/.gitkeep
4. Os dois ponteiros: docs/time/overview.md e README.md

Use o conteúdo COMPLETO dos dois documentos como está na seção "Alterações" da
spec. Antes de escrever, CONFIRA no código, não presuma — cada resultado
esperado do roteiro tem de corresponder ao que App.jsx realmente faz:
- o texto exato de cada mensagem de feedback e de cada window.confirm
- que o tipo do espaço NÃO é limpo após o cadastro (só nome e capacidade)
- que a etiqueta de status mostra o literal em inglês
- que a opção do select mostra o tipo cru: "nome (meeting_room)"
- que não existe nenhuma ação de editar espaço
Se algum texto no roteiro não bater com o código, o CÓDIGO vence: corrija o
roteiro.

Regras rígidas:
- NENHUM passo pode ser "verificar se funciona". Todo passo tem resultado
  esperado escrito, com o texto literal que aparece na tela.
- Os blocos A, B e D têm duas colunas de obtido (antes e depois) e uma de
  igualdade. O bloco C tem duas colunas de ESPERADO (defeito de hoje e
  comportamento correto).
- Os 15 bugs do catálogo têm um caso cada no bloco C, com o ID na linha.
- Não inclua no roteiro manual nenhum caso que QA-01 ou QA-02 já cobrem com
  teste verde. Se encontrar duplicata, remova do manual e me diga qual.
- Não escreva nenhum teste automatizado nesta branch. QA-03 é documento.
- Não altere nenhum arquivo em client/ ou server/.
- Nomes de arquivo e de pasta em inglês; conteúdo dos documentos e mensagens de
  commit em português, no imperativo.

NÃO execute o roteiro por mim nem preencha as colunas de "obtido" com valor
inventado. Deixe o molde em branco e me diga exatamente quais comandos rodar
para a execução "antes".

Ao terminar, reporte:
- quantos passos tem cada bloco (P, A, B, C, D) e o total
- quais dos 15 bugs ficaram cobertos SÓ pelo roteiro manual
- quais textos do roteiro você corrigiu porque não batiam com App.jsx
- quantos passos do bloco C são executados por curl e não pela interface
```
