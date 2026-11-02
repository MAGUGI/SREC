# QA-04 — Relatório antes/depois e roteiro do pitch

* **Responsável:** Igor Thiago Seberino (Product Owner + QA)
* **Issue:** #28
* **Branch:** `docs/before-after-report`
* **Rubrica:** 3,0 — **Pitch da solução e gestão**: "apresentação técnica defendendo **com dados** as melhorias feitas no código alheio, e matriz de papéis atualizada". É o documento que transforma 26 PRs em três slides defensáveis.
* **Depende de:** `docs/auditoria/metricas-baseline.md` (as 29 métricas do "antes") e, para medir o "depois", de **todas** as specs da entrega. Em particular QA-01 e QA-02 (cobertura e contagem de casos), OPS-02 (constraints e índices), OPS-03 (regras de lint e gate), OPS-05 (processo e Git) e QA-03 (os três bugs que só o roteiro manual prova).

## Problema

### O pitch vale 3,0 pontos e exige número, não adjetivo

A rubrica é explícita: defender **com dados** as melhorias feitas no código
alheio. Numa entrega de manutenção isso é mais difícil do que parece, porque
nada do que fizemos é visível na tela: o sistema recebido já cadastrava espaços e
já criava reservas. Quem assistir ao pitch vai ver a mesma tela do grupo
anterior. O que mudou está em lugares que não aparecem — numa constraint
`EXCLUDE`, num middleware de erro, numa suíte de testes, numa proteção de branch.

Então o pitch **é** a medição. Sem número dos dois lados, a apresentação vira
"refatoramos e melhoramos a qualidade", que não pontua.

### A coluna "depois" não existe em lugar nenhum

`docs/auditoria/metricas-baseline.md:90-120` tem a tabela das 29 métricas, com
baseline medido e meta da N2. A terceira coluna, "Fim da N2", está com
*a medir* nas **29** linhas, e a própria linha 122 do documento diz que quem a
preenche é esta spec.

Enquanto ela não existe, três coisas ficam frágeis:

* Nenhum PR tem onde transcrever o número que mediu. A seção "antes/depois" do
  template de PR (OPS-05) exige o número, mas o número morre no PR: não se
  acumula em nada.
* O placar de bugs e de code smells não tem casa. São 15 bugs e 14 code smells
  espalhados em dois catálogos e em 26 specs.
* Na véspera do pitch, alguém teria de reconstruir 29 medições de memória — e
  medição reconstruída de memória é estimativa, exatamente o que a auditoria se
  recusou a fazer.

### Existe uma armadilha de medição que invalida a comparação

`docs/auditoria/metricas-baseline.md:39-52` registra: rodar
`npx jest --coverage` **sem** `--collectCoverageFrom` reporta **35,48 %**, porque
o Jest só conta os arquivos que algum teste importou. Medindo contra todo o
fonte, o número é **6,14 %**.

Depois de QA-01, os dois comandos vão convergir — mas durante a entrega, um PR
que medisse do jeito errado reportaria uma melhora que não existe, ou uma queda
que não existe. Comparar números medidos de formas diferentes é como não medir, e
num pitch avaliado é pior: é alegação que não se sustenta sob pergunta.

### E o pitch tem 12 minutos para 26 PRs

Sem roteiro, a tentação é narrar as 26 issues em ordem cronológica. Isso usa os
12 minutos, não defende nada, e deixa de fora o único argumento que importa: o
sistema falhava na única regra de negócio que justifica sua existência, e agora
não falha mais.

## Evidência

O estado atual da coluna que esta spec preenche:

```bash
grep -c 'a medir' docs/auditoria/metricas-baseline.md
# => 29

grep -c '^| M-' docs/auditoria/metricas-baseline.md
# => 29
```

Os números do "antes", já medidos e reproduzíveis (`metricas-baseline.md:8-37`):

```bash
cd server && npm ci
npx jest --coverage --coverageReporters=text --collectCoverageFrom='src/**/*.js'
# => All files | 6.14 | 0 | 3.57 | 6.14
# => Test Suites: 1 passed, 1 total
# => Tests:       2 passed, 2 total
```

A armadilha, reproduzida em dois comandos:

```bash
npx jest --coverage --coverageReporters=text
# => All files | 35.48 | ...     <- número falso para a pergunta que interessa

npx jest --coverage --coverageReporters=text --collectCoverageFrom='src/**/*.js'
# => All files |  6.14 | ...     <- o número que vale
```

Escala do que precisa de placar:

| Conjunto | Quantidade | Fonte |
|---|---|---|
| Métricas numeradas | **29** (M-01 a M-29) | `metricas-baseline.md` |
| Bugs do cliente | **15** (2 críticos, 5 altos, 5 médios, 3 baixos) | `bugs-do-cliente.md` |
| Code smells | **14** (4 altos, 6 médios, 4 baixos) | `code-smells.md` |
| Divergências doc vs código | **12** (D-01 a D-12) | `divergencias-doc-codigo.md` |
| Specs de implementação | **26** | `docs/specs/` |

## Decisão

**Entregar agora o esqueleto do documento final, com a coluna "antes" já
preenchida com os números reais e a coluna "depois" explicitamente marcada como
a preencher, mais o comando que reproduz cada medição — e o roteiro do pitch no
mesmo arquivo.**

### Por que o esqueleto nasce com metade vazia

A alternativa óbvia é escrever este documento no fim, quando os números
existirem. Ela é errada por quatro motivos:

1. **O número precisa ser medido no PR que o produz, não reconstruído depois.**
   Quem mescla BE-01 sabe quantos casos viraram verdes; quem for escrever o
   relatório em 22/10 não sabe. O esqueleto existente dá **onde** transcrever, e
   o template de PR de OPS-05 exige transcrever.
2. **O comando ao lado da métrica é o que garante que a comparação é válida.**
   Guardado na cabeça de quem mediu o baseline, o `--collectCoverageFrom` se
   perde e o 35,48 % volta.
3. **Lacuna visível é lacuna cobrada.** Uma linha com *a preencher* na véspera
   do pitch é um item de trabalho. A mesma lacuna sem o esqueleto é invisível.
4. **Honestidade de medição.** Não há nenhum número inventado neste documento.
   Toda célula do "depois" nasce vazia e só recebe valor com saída de comando
   colada no PR correspondente.

Regra que acompanha o documento, e que vale como critério de revisão:
**nenhuma afirmação sem número dos dois lados.** "Melhoramos a qualidade" não
vale ponto. "A cobertura saiu de 6,14 % para X % e estes 7 testes falhavam
antes" vale.

### Por que a casa do número é aqui, e `metricas-baseline.md` perde a coluna

A convenção da N2 é uma casa canônica por assunto, com link em vez de cópia. Sem
decisão explícita, o mesmo número do "depois" viveria em dois arquivos e
divergiria no primeiro PR que atualizasse só um.

Divisão adotada:

| Documento | É a casa canônica de |
|---|---|
| `docs/auditoria/metricas-baseline.md` | o **baseline** medido no commit `8431181`, e as metas |
| `docs/auditoria/relatorio-antes-depois.md` | a **comparação**: antes, depois, delta, comando e leitura |

Então `metricas-baseline.md` perde a coluna "Fim da N2" e ganha uma linha de
link para cá. O baseline continua congelado onde está — ele é histórico, não se
atualiza nunca mais.

### Por que "bug corrigido" se mede por teste, e não por issue fechada

Issue fechada mede atividade. O que a rubrica cobra é melhoria comprovada. A
definição operacional adotada no placar, e ela é restritiva de propósito:

> Um bug só entra como **corrigido** quando existe um caso de teste
> identificado por ID que **reprovava** contra o código recebido e **passa**
> depois da correção — com as duas saídas colocadas no PR.

Consequência que precisa ser dita antes, não descoberta no dia: **três bugs não
têm como ter teste automatizado nesta entrega.** BUG-11 (servidor sobe com o
banco quebrado), BUG-12 (queda do Postgres mata o processo) e BUG-13 (duplo
clique cria duas reservas) exigem matar processo ou um navegador. Para esses
três, a prova é o passo correspondente do roteiro manual de QA-03 (C-12, C-13 e
C-01), com os dois registros de execução. Mesmo rigor, instrumento diferente —
e declarado, em vez de maquiado.

Terceira categoria, também declarada: bug cujo **status esperado é decisão de
produto em aberto**. BUG-06 (exclusão em cascata) depende da decisão de BE-08
entre desativação lógica e exclusão física; o caso R-21 de QA-01 está como
`it.todo`. Se a decisão não sair, BUG-06 vai para o placar como **débito da N3
com justificativa**, não como corrigido.

### Por que o roteiro do pitch mora no mesmo arquivo

Separar "o relatório" de "o que vamos falar" produz duas versões da história, e a
que vai ao ar é sempre a do slide. Com o roteiro no mesmo arquivo, cada bloco da
apresentação aponta para a linha da tabela que o sustenta — e um bloco sem
número ao lado é visível, o que é precisamente o teste que o documento precisa
passar.

### Por que a ordem do pitch não é cronológica

A ordem escolhida é: **o que estava quebrado na razão de existir do produto** →
**como provamos que não está mais** → **o que isso custou e o que ficou de
fora**.

A alternativa óbvia — narrar as 26 issues em ordem de merge, ou por frente de
trabalho — gasta os 12 minutos em inventário. Quem avalia não precisa saber que
fizemos 26 PRs; precisa saber que o SREC aceitava duas reservas no mesmo
horário, e que agora não aceita, e qual teste prova isso. O inventário vai nos
documentos; o pitch leva o argumento.

E abrir pelo defeito tem um segundo efeito, que é de gestão: deixa claro desde o
primeiro minuto que não estamos apresentando o nosso sistema, estamos
apresentando uma auditoria do sistema de outro grupo — que é o que a N2 pediu.

## Alterações

### 1. `docs/auditoria/relatorio-antes-depois.md` — criar

````markdown
# Relatório antes/depois — SREC, entrega N2

Comparação numérica entre o sistema recebido do grupo MAGUGI (commit `8431181`)
e o sistema que entregamos ao grupo da N3.

**Regra deste documento: nenhuma afirmação sem número dos dois lados.**
"Melhoramos a qualidade" não entra. "A cobertura de statements saiu de 6,14 %
para X %, e estes 7 casos de teste reprovavam antes" entra.

A coluna **Depois** nasce vazia, marcada *a preencher*, e só recebe valor com a
saída do comando colada no PR que a produziu. Número sem comando ao lado não é
medição, é lembrança.

* Baseline congelado: [`metricas-baseline.md`](metricas-baseline.md)
* Catálogo de defeitos: [`bugs-do-cliente.md`](bugs-do-cliente.md)
* Catálogo de smells: [`code-smells.md`](code-smells.md)
* Divergências: [`divergencias-doc-codigo.md`](divergencias-doc-codigo.md)

## 1. Armadilha de medição — leia antes de medir qualquer coisa

Rodar `npx jest --coverage` **sem** `--collectCoverageFrom` reporta **35,48 %**,
porque o Jest só conta os arquivos que algum teste importou. Medindo contra todo
o fonte, que é a pergunta real, o resultado do baseline é **6,14 %**.

**Toda medição de cobertura deste documento usa
`--collectCoverageFrom='src/**/*.js'`.** Comparar números medidos de formas
diferentes é como não medir.

Mesma regra para as outras famílias: a medição do "depois" usa **o mesmo comando**
que produziu o "antes". Quando o comando precisou mudar — porque o schema saiu
de `initDb.js` para migrations, por exemplo — a mudança está registrada na seção
2, ao lado do comando.

## 2. Comandos de medição

Ambiente: Node.js 20, `npm ci` limpo nos dois pacotes, stack de pé
(`docker compose up -d --wait`).

### C-01 — Cobertura do backend · M-01, M-02, M-03, M-06, M-07

```bash
cd server && npm ci
npx jest --coverage --coverageReporters=text --collectCoverageFrom='src/**/*.js'
```

### C-02 — Arquivos e casos de teste · M-04, M-05

```bash
cd server
npx jest --listTests | wc -l
npx jest 2>&1 | grep -E '^(Test Suites|Tests):'
```

### C-03 — Endpoints exercitados por teste · M-08

```bash
grep -rhoE "\.(get|post|put|patch|delete)\('/api/[^']*'" server/test/integration \
  | sed -E "s/\('/ /; s/'$//" | sort -u
```

Conferir à mão contra os 10 endpoints: rotas com `:id` contam como um endpoint
só, independentemente do valor usado no teste.

### C-04 — ESLint · M-09, M-10

```bash
cd server  && npm run lint; echo "exit=$?"
cd ../client && npm run lint; echo "exit=$?"

# contagem de avisos do portão da Fase 1 (OPS-03)
cd ../server  && npm run lint:strict 2>&1 | tail -3
cd ../client  && npm run lint:strict 2>&1 | tail -3
```

### C-05 — Regras de qualidade declaradas no ESLint · M-11

```bash
grep -cE 'complexity|max-lines|max-depth|max-params|security|jsx-a11y|eqeqeq' \
  server/eslint.config.js client/eslint.config.js
```

### C-06 — Bugs abertos por severidade · M-12, M-13, M-14, M-15

```bash
for s in critico alto medio baixo; do
  n=$(gh issue list --repo igorSeberino/srec --state open \
        --label 'bug do cliente' --label "sev: $s" --json number --jq 'length')
  echo "sev: $s = $n"
done
```

O número de issues abertas é indicador; **a prova é a seção 5**, caso de teste
por caso de teste.

### C-07 — Code smells abertos por severidade · M-16 e seção 6

```bash
for s in alto medio baixo; do
  n=$(gh issue list --repo igorSeberino/srec --state open \
        --label 'code smell' --label "sev: $s" --json number --jq 'length')
  echo "sev: $s = $n"
done
```

### C-08 — Blocos `try/catch` duplicados · M-17

```bash
grep -c 'catch (err)' server/src/controllers/*.js
grep -rc 'catch (err)' server/src | awk -F: '{s += $2} END {print s}'
```

### C-09 — Maior arquivo `.jsx` e tamanho de `App.jsx` · M-18, M-19

```bash
find client/src -name '*.jsx' -exec wc -l {} + | sort -n | tail -10
wc -l client/src/App.jsx
```

### C-10 — Constraints e índices · M-20, M-21

O baseline foi medido por `grep` em `src/config/initDb.js`. Depois de OPS-02 o
schema vem das migrations, então a medição passa a ser **no banco**, que é a
fonte de verdade. Mudança de comando registrada de propósito.

```bash
# constraints, sem contar PK (p) nem FK (f)
psql "$DATABASE_URL" -c "
  SELECT c.contype, count(*)
  FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
  WHERE t.relname IN ('resources','reservations') AND c.contype NOT IN ('p','f')
  GROUP BY c.contype ORDER BY c.contype;"
# c = CHECK · u = UNIQUE · x = EXCLUDE

# índices, sem contar os criados pelas PKs
psql "$DATABASE_URL" -c "
  SELECT tablename, indexname FROM pg_indexes
  WHERE tablename IN ('resources','reservations') AND indexname NOT LIKE '%_pkey'
  ORDER BY 1, 2;"
```

### C-11 — Migrations versionadas · M-22

```bash
ls server/migrations/*.js | wc -l
cd server && npm run migrate:status
```

### C-12 — Passos manuais para subir o sistema · M-23

Contagem à mão dos comandos da seção de instalação do `README.md`. Baseline
**7**: instalar PostgreSQL, criar o banco, copiar o `.env`, `cd server`,
`npm install`, `cd client`, `npm install --legacy-peer-deps`.

```bash
sed -n '/[Cc]omo subir/,/^## /p' README.md
```

### C-13 — Endpoints documentados vs implementados · M-24

```bash
# documentados no contrato OpenAPI (nome do arquivo definido por REQ-03)
grep -cE '^\s{4}(get|post|put|patch|delete):' docs/arquitetura/contrato-api.yaml

# implementados
grep -rhoE 'router\.(get|post|put|patch|delete)\(' server/src/routes | wc -l
```

### C-14 — Divergências doc vs código · M-25

```bash
grep -cE '^\| D-[0-9]+ ' docs/auditoria/divergencias-doc-codigo.md   # => 12
```

O denominador é 12. O numerador — quantas foram fechadas — vem da seção 9 deste
documento, item por item: contagem agregada aqui esconderia qual ficou aberta.

### C-15 — `<label>` sem `htmlFor` · M-26

```bash
grep -rhoE '<label[^>]*>' client/src --include='*.jsx' | grep -vc 'htmlFor'
```

### C-16 — Supressões de lint · M-27

```bash
grep -rc 'eslint-disable' client/src server/src | awk -F: '{s += $2} END {print s}'
```

### C-17 — Arquivos placeholder de 0 byte · M-28

```bash
find . -path ./node_modules -prune -o -path ./.git -prune -o -type f -size 0 -print
```

### C-18 — Testes de frontend · M-29

```bash
cd client && npm test 2>&1 | tail -5
```

### C-19 — Tamanho do bundle do client

```bash
cd client && npm run build
```

### C-20 — Volume de código

```bash
find server/src client/src -type f \( -name '*.js' -o -name '*.jsx' -o -name '*.css' \) \
  -exec wc -l {} + | tail -1
find server/src client/src -type f \( -name '*.js' -o -name '*.jsx' \) \
  -exec wc -l {} + | tail -1
```

### C-21 — Processo e Git

```bash
gh issue list --repo igorSeberino/srec --state all --json number --jq 'length'
gh pr   list --repo igorSeberino/srec --state all --json number --jq 'length'
git log --oneline | wc -l
ls .github/ISSUE_TEMPLATE/*.yml | wc -l
test -f .github/CODEOWNERS && grep -c '^[^#]' .github/CODEOWNERS
gh api /repos/igorSeberino/srec/branches/main/protection \
  --jq '{checks: (.required_status_checks.contexts | length),
         aprovacoes: .required_pull_request_reviews.required_approving_review_count,
         code_owners: .required_pull_request_reviews.require_code_owner_reviews}'
```

## 3. As 29 métricas

| # | Métrica | Antes (medido) | Meta N2 | Depois | Δ | Comando |
|---|---|---|---|---|---|---|
| M-01 | Cobertura de statements, backend | **6,14 %** | ≥ 70 % | _a preencher_ | | C-01 |
| M-02 | Cobertura de branches, backend | **0 %** | ≥ 60 % | _a preencher_ | | C-01 |
| M-03 | Cobertura de funções, backend | **3,57 %** | ≥ 75 % | _a preencher_ | | C-01 |
| M-04 | Arquivos de teste | **1** | ≥ 8 | _a preencher_ | | C-02 |
| M-05 | Casos de teste | **2** | ≥ 60 | _a preencher_ | | C-02 |
| M-06 | Cobertura dos controllers | **0 %** | ≥ 80 % | _a preencher_ | | C-01 |
| M-07 | Cobertura das rotas | **0 %** | 100 % | _a preencher_ | | C-01 |
| M-08 | Endpoints exercitados por teste | **0 de 10** | 10 de 10 | _a preencher_ | | C-03 |
| M-09 | Erros de ESLint, server | **0** | 0 | _a preencher_ | | C-04 |
| M-10 | Erros de ESLint, client | **0** | 0 | _a preencher_ | | C-04 |
| M-11 | Regras de qualidade no ESLint | **0** | ≥ 6 | _a preencher_ | | C-05 |
| M-12 | Bugs CRÍTICO abertos | **2** | 0 | _a preencher_ | | C-06 |
| M-13 | Bugs ALTO abertos | **5** | 0 | _a preencher_ | | C-06 |
| M-14 | Bugs MÉDIO abertos | **5** | ≤ 1 | _a preencher_ | | C-06 |
| M-15 | Bugs BAIXO abertos | **3** | ≤ 1 | _a preencher_ | | C-06 |
| M-16 | Code smells ALTO abertos | **4** | 0 | _a preencher_ | | C-07 |
| M-17 | Blocos `try/catch` duplicados | **10** | 0 | _a preencher_ | | C-08 |
| M-18 | Maior arquivo `.jsx`, em linhas | **351** | ≤ 120 | _a preencher_ | | C-09 |
| M-19 | Linhas de `App.jsx` | **351** | ≤ 60 | _a preencher_ | | C-09 |
| M-20 | Constraints de integridade no schema | **0** | ≥ 4 | _a preencher_ | | C-10 |
| M-21 | Índices além das PKs | **0** | ≥ 2 | _a preencher_ | | C-10 |
| M-22 | Migrations versionadas | **0** | ≥ 5 | _a preencher_ | | C-11 |
| M-23 | Passos manuais para subir o sistema | **7** | 1 | _a preencher_ | | C-12 |
| M-24 | Endpoints documentados vs implementados | **5 de 10** | 10 de 10 | _a preencher_ | | C-13 |
| M-25 | Divergências doc vs código | **12** | 0 | _a preencher_ | | C-14 |
| M-26 | `<label>` sem `htmlFor` | **7** | 0 | _a preencher_ | | C-15 |
| M-27 | Supressões `eslint-disable` | **2** | 0 | _a preencher_ | | C-16 |
| M-28 | Arquivos placeholder de 0 byte | **3** | 0 | _a preencher_ | | C-17 |
| M-29 | Testes de frontend | **0** | ≥ 1 | _a preencher_ | | C-18 |

A coluna **Δ** usa pontos percentuais (`pp`) para percentual e valor absoluto
para contagem. Métrica que **piorou** fica com o número e uma linha na seção 10
explicando — piora escondida é o único resultado que desqualifica o documento
inteiro.

## 4. Volume de código e bundle

Do bloco "Volume de código" de [`metricas-baseline.md`](metricas-baseline.md).
Não são métricas M: aqui não existe meta, e tamanho não é qualidade. Entram
porque o pitch vai falar de `App.jsx`, e falar de tamanho sem o número do todo
é fácil de contestar.

| Escopo | Antes | Depois | Comando |
|---|---|---|---|
| Fonte total (js, jsx, css) | **1.280** linhas | _a preencher_ | C-20 |
| JS e JSX | **853** linhas | _a preencher_ | C-20 |
| `client/src/App.jsx` | **351** linhas (**41 %** do JS/JSX) | _a preencher_ | C-09 |
| `client/src/index.css` + `App.css` | 427 linhas | _a preencher_ | C-20 |
| `server/src/` inteiro | 370 linhas | _a preencher_ | C-20 |
| Linhas de teste | **38** | _a preencher_ | C-20 |
| Bundle do client | **201,86 kB** (63,26 kB gzip) | _a preencher_ | C-19 |

Dado para o pitch: o backend **inteiro** tem 370 linhas — menos que o `App.jsx`
sozinho. Serve contra o argumento "o frontend é pequeno, reescreve do zero".

## 5. Placar de bugs do cliente

Baseline: **15** bugs — **2 CRÍTICO**, **5 ALTO**, **5 MÉDIO**, **3 BAIXO**.

### 5.1 Por severidade

| Severidade | Abertos antes | Meta N2 | Corrigidos | Abertos depois | Δ |
|---|---|---|---|---|---|
| CRÍTICO | **2** | 0 | _a preencher_ | _a preencher_ | |
| ALTO | **5** | 0 | _a preencher_ | _a preencher_ | |
| MÉDIO | **5** | ≤ 1 | _a preencher_ | _a preencher_ | |
| BAIXO | **3** | ≤ 1 | _a preencher_ | _a preencher_ | |
| **Total** | **15** | ≤ 2 | _a preencher_ | _a preencher_ | |

### 5.2 Definição de "corrigido"

Um bug entra como corrigido quando existe um caso de teste identificado por ID
que **reprovava** contra o código recebido e **passa** depois da correção, com as
duas saídas no PR.

Três bugs não têm esse instrumento disponível nesta entrega — BUG-11, BUG-12 e
BUG-13 exigem matar um processo ou um navegador. A prova deles é o passo
correspondente do [roteiro de regressão manual](../qa/roteiro-regressao.md), com
os dois registros de execução. Mesmo rigor, instrumento diferente.

### 5.3 Bug por bug

| ID | Sev. | Título | Spec | Prova (caso de teste) | Reprovava antes? | Passa depois? | PR |
|---|---|---|---|---|---|---|---|
| BUG-01 | CRÍTICO | Dupla reserva sob concorrência | BE-01 | QA-01 **V-12** (5 requisições simultâneas) | sim — 5×201 | _a preencher_ | |
| BUG-02 | CRÍTICO | Reserva com fim antes do início | BE-02 | QA-01 **V-03**; QA-02 **W-04**, **O-15** | sim — 201 | _a preencher_ | |
| BUG-03 | ALTO | Status arbitrário aceito | BE-03 | QA-01 **V-21**, **V-22**; QA-02 **S-10..S-13** | sim — 200 com `banana` | _a preencher_ | |
| BUG-04 | ALTO | ID não numérico retorna 500 | BE-05 | QA-01 **R-12**, **R-17**, **R-20**, **V-14**, **V-18**, **V-25**, **V-28** | sim — 500 nas 7 | _a preencher_ | |
| BUG-05 | ALTO | Atualização parcial retorna 500 | BE-05 | QA-01 **R-14**, **R-15** | sim — 500 | _a preencher_ | |
| BUG-06 | ALTO | Exclusão apaga reservas em silêncio | BE-08 / FE-05 | QA-01 **R-21** (`it.todo`), **R-22**; roteiro **C-07** | documentado por R-22 | _a preencher_ | |
| BUG-07 | ALTO | Horário desloca por falta de fuso | BE-07 | QA-02 **P-02**; roteiro **C-08** (três valores comparados) | sim — deslocamento registrado | _a preencher_ | |
| BUG-08 | MÉDIO | Reserva no passado é aceita | BE-02 | QA-01 **V-05**; QA-02 **W-06** | sim — 201 | _a preencher_ | |
| BUG-09 | MÉDIO | Capacidade inválida é aceita | BE-02 | QA-01 **R-06**, **R-07**; QA-02 `isValidCapacity` | sim — 201 | _a preencher_ | |
| BUG-10 | MÉDIO | `type` aceita qualquer string | BE-03 | QA-01 **R-05**; QA-02 `isValidResourceType`; roteiro **C-11** | sim — 201 | _a preencher_ | |
| BUG-11 | MÉDIO | Servidor sobe com o banco quebrado | BE-08 / OPS-04 | **roteiro C-12** (sem teste automatizado possível) | sim | _a preencher_ | |
| BUG-12 | MÉDIO | Queda do Postgres mata o processo | BE-08 | **roteiro C-13** (sem teste automatizado possível) | sim | _a preencher_ | |
| BUG-13 | BAIXO | Duplo clique cria duas reservas | FE-03 | **roteiro C-01** (sem teste automatizado possível) | sim — 2 reservas | _a preencher_ | |
| BUG-14 | BAIXO | `setTimeout` do feedback nunca é limpo | FE-04 | roteiro **A-10**, **C-14** | sim | _a preencher_ | |
| BUG-15 | BAIXO | Endpoint de edição é órfão | FE-05 | roteiro **A-15**, **C-15** | sim | _a preencher_ | |

Contagem para o pitch, a preencher junto: **quantos casos de teste reprovavam
contra o código recebido e passaram a passar.** QA-01 projeta **22** casos
reprovando no estado inicial; o número final é o que vale, e é a frase mais
forte da apresentação.

## 6. Placar de code smells

Baseline: **14** smells — **4 ALTO**, **6 MÉDIO**, **4 BAIXO**.

| Severidade | Abertos antes | Meta N2 | Resolvidos | Abertos depois |
|---|---|---|---|---|
| ALTO | **4** | 0 | _a preencher_ | _a preencher_ |
| MÉDIO | **6** | — | _a preencher_ | _a preencher_ |
| BAIXO | **4** | — | _a preencher_ | _a preencher_ |
| **Total** | **14** | — | _a preencher_ | _a preencher_ |

Smell não se mede por sentimento. Cada linha abaixo tem a métrica que o prova:

| ID | Sev. | Smell | Spec | Métrica que prova | Antes | Depois | Comando |
|---|---|---|---|---|---|---|---|
| CS-01 | ALTO | God Component | FE-01 | maior `.jsx` / `App.jsx` (M-18, M-19) | **351** / **351** linhas | _a preencher_ | C-09 |
| CS-02 | ALTO | Duplicated Code no tratamento de erro | BE-04 | blocos `catch (err)` (M-17) | **10** | _a preencher_ | C-08 |
| CS-03 | ALTO | Ausência de camada de serviço | BE-06 | cobertura de statements e dos controllers (M-01, M-06) | **6,14 %** / **0 %** | _a preencher_ | C-01 |
| CS-04 | ALTO | Validação ad-hoc | BE-02 | casos de validação de janela e de entrada que passam | **0** | _a preencher_ | C-02 |
| CS-05 | MÉDIO | Magic strings de domínio | BE-03 | literais de domínio fora de `src/domain/` | **5** valores em **3** camadas | _a preencher_ | `grep -rn "'scheduled'\|'cancelled'\|'completed'\|'workstation'\|'meeting_room'" server/src client/src` |
| CS-06 | MÉDIO | Schema como efeito colateral do boot | OPS-02 | migrations versionadas (M-22) | **0** | _a preencher_ | C-11 |
| CS-07 | MÉDIO | Configuração hardcoded no cliente | FE-02 | ocorrências de URL fixa em `client/src` | **1** (`api.js:1`) | _a preencher_ | `grep -rn 'http://localhost:5000' client/src` |
| CS-08 | MÉDIO | Refetch total a cada mutação | FE-01 | chamadas de `loadData()` após mutação | **5** | _a preencher_ | `grep -rc 'loadData()' client/src` |
| CS-09 | MÉDIO | Zero índices | OPS-02 | índices além das PKs (M-21) | **0** | _a preencher_ | C-10 |
| CS-10 | MÉDIO | Lint sem dente | OPS-03 | regras de qualidade declaradas (M-11) | **0** | _a preencher_ | C-05 |
| CS-11 | BAIXO | Placeholders versionados | OPS-01 | arquivos de 0 byte (M-28) | **3** | _a preencher_ | C-17 |
| CS-12 | BAIXO | Supressões de lint | FE-04 | `eslint-disable` (M-27) | **2** | _a preencher_ | C-16 |
| CS-13 | BAIXO | Rótulos sem associação | FE-04 | `<label>` sem `htmlFor` (M-26) | **7** | _a preencher_ | C-15 |
| CS-14 | BAIXO | Superfície HTTP aberta | BE-08 | middlewares de segurança registrados (helmet, rate limit, CORS com allowlist) | **0** de 3 | _a preencher_ | `grep -rnE 'helmet\|rateLimit\|CORS_ALLOWED_ORIGINS' server/src` |

## 7. Cobertura por camada

A saída literal do baseline, por arquivo (`metricas-baseline.md:58-79`). A
coluna do depois usa o **mesmo** comando, C-01.

| Caminho | % Stmts antes | % Branch antes | % Funcs antes | % Stmts depois | % Branch depois | % Funcs depois |
|---|---|---|---|---|---|---|
| **Todos os arquivos** | **6,14** | **0** | **3,57** | _a preencher_ | _a preencher_ | _a preencher_ |
| `src/index.js` | 0 | 0 | 0 | _a preencher_ | _a preencher_ | _a preencher_ |
| `src/config/database.js` | 71,42 | 100 | 0 | _a preencher_ | _a preencher_ | _a preencher_ |
| `src/config/initDb.js` | 0 | 100 | 0 | removido por OPS-02 | — | — |
| `src/controllers/reservationController.js` | **0** | **0** | **0** | _a preencher_ | _a preencher_ | _a preencher_ |
| `src/controllers/resourceController.js` | **0** | **0** | **0** | _a preencher_ | _a preencher_ | _a preencher_ |
| `src/models/reservationModel.js` | 25 | 100 | 14,28 | _a preencher_ | _a preencher_ | _a preencher_ |
| `src/models/resourceModel.js` | **0** | 100 | **0** | _a preencher_ | _a preencher_ | _a preencher_ |
| `src/routes/reservationRoutes.js` | **0** | 100 | 100 | _a preencher_ | _a preencher_ | _a preencher_ |
| `src/routes/resourceRoutes.js` | **0** | 100 | 100 | _a preencher_ | _a preencher_ | _a preencher_ |
| `src/domain/` (criado por QA-02) | não existia | — | — | _a preencher_ | _a preencher_ | _a preencher_ |
| `src/services/` (criado por BE-06) | não existia | — | — | _a preencher_ | _a preencher_ | _a preencher_ |
| `src/middlewares/` (criado por BE-04) | não existia | — | — | _a preencher_ | _a preencher_ | _a preencher_ |

Os `100` de branch nas linhas de modelo e rota são artefato de medição: um
arquivo sem nenhuma decisão executada reporta 100 % de branches porque não tem
branch coberta **nem** descoberta. A leitura honesta é a linha agregada: **0 %**.

## 8. Processo, Git e ambiente

| Métrica | Antes | Depois | Comando |
|---|---|---|---|
| Issues no repositório | **0** | _a preencher_ | C-21 |
| Pull requests | **2** | _a preencher_ | C-21 |
| Commits | **10** | _a preencher_ | C-21 |
| Templates de issue | **0** | _a preencher_ | C-21 |
| Template de PR | **0** | _a preencher_ | C-21 |
| Regras em `CODEOWNERS` | **não existe** | _a preencher_ | C-21 |
| Proteção de `main` | **não configurada** | _a preencher_ | C-21 |
| Checks obrigatórios no merge | **0** | _a preencher_ | C-21 |
| Aprovação do QA exigida | **nenhuma** | _a preencher_ | C-21 |
| Padrão de commit validado por CI | **não** | _a preencher_ | C-21 |
| Jobs na CI | **2** | _a preencher_ | `grep -cE '^  [a-z-]+:$' .github/workflows/ci.yml` |
| Branches no gatilho da CI que não existem | **1** (`develop`) | _a preencher_ | `grep -c develop .github/workflows/ci.yml` |
| Serviços de banco na CI | **0** | _a preencher_ | `grep -c 'services:' .github/workflows/ci.yml` |
| Gate de cobertura | **0** | _a preencher_ | `grep -A6 coverageThreshold server/jest.config.js` |
| Passos manuais para subir (M-23) | **7** | _a preencher_ | C-12 |
| Dockerfile / compose | **nenhum** | _a preencher_ | `ls docker-compose.yml server/Dockerfile client/Dockerfile` |

## 9. Documentação e requisitos

Denominador: **12** divergências (C-14). Agregar esconderia qual ficou aberta.

| ID | O que a doc afirma | Encaminhamento | Fechada? | PR |
|---|---|---|---|---|
| D-01 | `UUID` como PK | corrigir a doc (REQ-02) | _a preencher_ | |
| D-02 | `resources.is_active` | corrigir a doc; avaliar em BE-08 | _a preencher_ | |
| D-03 | `reservations.user_id UUID` | corrigir a doc; usuário vira débito N3 | _a preencher_ | |
| D-04 | `PUT /api/reservations/{id}/cancel` | corrigir a doc (REQ-03) | _a preencher_ | |
| D-05 | lista "as reservas do usuário atual" | corrigir a doc | _a preencher_ | |
| D-06 | "Nível de acesso Admin" | corrigir a doc; autenticação é débito N3 | _a preencher_ | |
| D-07 | 5 endpoints documentados | corrigir a doc (OpenAPI, REQ-03) | _a preencher_ | |
| D-08 | casos de uso com Usuário e Administrador | corrigir o diagrama (REQ-01) | _a preencher_ | |
| D-09 | "tarefas mapeadas no Jira" | backlog no GitHub Project (OPS-05) | _a preencher_ | |
| D-10 | "crie uma branch a partir da `develop`" | Trunk-Based (OPS-03, OPS-05) | _a preencher_ | |
| D-11 | "Clean Code: separação estrita" | corrigir o código (FE-01, BE-06) | _a preencher_ | |
| D-12 | "testes unitários automatizados de domínio" | corrigir o código (QA-01, QA-02) | _a preencher_ | |

| Métrica | Antes | Depois | Comando |
|---|---|---|---|
| Divergências abertas (M-25) | **12** | _a preencher_ | C-14 |
| Endpoints documentados (M-24) | **5 de 10** | _a preencher_ | C-13 |
| Contrato de API publicado (OpenAPI/Swagger/Postman) | **nenhum** | _a preencher_ | `ls docs/arquitetura/contrato-api.yaml` |
| DER atualizado contra o schema real | **não** | _a preencher_ | revisão de REQ-02 |
| Documento de handoff para a N3 | **não existe** | _a preencher_ | `ls docs/handoff/` |

## 10. O que piorou ou não atingiu a meta

Uma linha por métrica que ficou abaixo da meta, com o número e o motivo. Seção
obrigatória: relatório antes/depois em que tudo melhorou é relatório que ninguém
acredita, e a primeira pergunta do avaliador vai ser exatamente esta.

| Métrica ou item | Meta | Chegou a | Por que | Encaminhamento |
|---|---|---|---|---|
| _a preencher_ | | | | |

## 11. Débito entregue para a N3, com justificativa

Débito conhecido e documentado é entrega honesta. Débito escondido é o que
produziu os 6,14 % de cobertura que recebemos.

| # | Débito | Por que não foi feito na N2 | Custo de carregar | Prioridade na N3 |
|---|---|---|---|---|
| 1 | **Autenticação e autorização** | Fora do escopo recebido e grande demais para o prazo. A doc recebida já prometia "Nível de acesso Admin" (D-06) sem nunca ter existido | Qualquer pessoa com acesso à porta apaga todas as reservas. CS-14 sobe de BAIXO para CRÍTICO no momento em que houver login | **máxima** |
| 2 | **Testes de ponta a ponta (Playwright)** | `App.jsx` não tinha um `id` ou `data-testid`, e FE-01 a FE-05 mudam a estrutura cinco vezes. Teste escrito agora nasceria para ser reescrito | 51 passos de verificação manual, 40 a 55 min por execução ([roteiro](../qa/roteiro-regressao.md)) | **alta** — o roteiro já é a especificação de entrada |
| 3 | **Regras de ESLint ainda como `warn`** | OPS-03 adotou promoção em fases: ligar tudo como `error` no dia 1 reprovaria `App.jsx` (351 linhas) e os 7 `<label>` de CS-13, travando todos os PRs por dívida pré-existente | Portão que avisa e não bloqueia só funciona enquanto alguém lê o aviso | **alta** — Fase 3 em `.github/workflows/README.md` |
| 4 | **Decisão de domínio de BUG-06** (exclusão física vs. desativação lógica) | É decisão de produto, não de implementação, e depende de D-02 (`is_active`, coluna documentada que não existe) | Exclusão de espaço continua apagando histórico, ou fica recusada sem alternativa | **alta** |
| 5 | **`enforce_admins: false` na proteção de `main`** | Em repositório de usuário, um PR cujo autor é o único dono de código possível não pode ser aprovado por ninguém — ver OPS-05 | Bypass disponível ao dono do repositório; mitigado por ficar registrado na timeline do PR | média |
| 6 | **ORM no lugar de SQL cru** | Funciona, é legível, e trocar a camada de persistência é reescrita, não manutenção | SQL duplicado entre model e migration | baixa |
| 7 | **DDD completo** | A camada de serviço de BE-06 resolve o problema real (testabilidade) a uma fração do custo | — | baixa |
| 8 | **TypeScript no frontend** | Tentador e fora de escopo | Magic strings de CS-05 continuam sem apoio de compilador no client | baixa |
| 9 | **Bugs MÉDIO e BAIXO remanescentes** | As metas M-14 e M-15 admitem ≤ 1 de cada, desde que registrados com justificativa | _a preencher: quais sobraram_ | média |
| 10 | **Paginação em `GET /api/reservations`** | `findAll` faz `SELECT *` sem limite; imperceptível com a base vazia, cresce sem limite com o uso (CS-08) | Resposta cresce indefinidamente | média |

Lista completa e viva em [`docs/time/overview.md`](../time/overview.md) e no
documento de handoff.

## 12. Roteiro do pitch

**12 minutos.** Cada bloco tem o número que o sustenta; bloco sem número ao lado
não entra na apresentação.

| # | Bloco | Tempo | Quem | Argumento | Número que sustenta |
|---|---|---|---|---|---|
| 1 | Abertura | 0:45 | Igor | Não apresentamos um sistema nosso: auditamos o de outro grupo e medimos antes de tocar | 1.280 linhas auditadas linha por linha; 15 bugs e 14 smells confirmados por leitura de código |
| 2 | O que recebemos, e a matriz de papéis | 1:30 | Igor | O sistema funciona no caminho feliz e tem estrutura legível — e tem 6,14 % de cobertura. Os papéis rodaram: 4 de 5 trocaram de área por completo | M-01 **6,14 %**, M-02 **0 %**, M-05 **2** casos, M-29 **0** testes de frontend; tabela de papéis de `docs/time/overview.md` |
| 3 | O achado central: o SREC falhava na sua razão de existir | 2:00 | Adrian | Duas idas ao banco sem transação, e zero constraint para segurar. A fórmula estava certa; o lugar, errado | `reservationController.js:12-28`; M-20 **0** constraints; caso **V-12**: 5 requisições → antes 5×201, depois 1×201 e 4×409 |
| 4 | A prova: de alegação a assertion | 1:45 | Igor | Nenhuma correção entrou sem um teste que falhava antes. É a diferença entre dizer que corrigimos e mostrar | M-05 de **2** para _a preencher_; M-01 de **6,14 %** para _a preencher_; **22** casos reprovavam no estado inicial; M-08 de **0 de 10** para **10 de 10** |
| 5 | O frontend: 351 linhas num arquivo | 1:30 | Renato | 41 % de todo o JS/JSX num componente único. Quebrado em componentes, com o roteiro de regressão rodado antes e depois para provar que a tela não mudou de comportamento | M-19 de **351** para _a preencher_; M-26 de **7** para _a preencher_; 51 passos de verificação, duas execuções comparadas |
| 6 | O ambiente e o portão | 1:30 | Gabriel | Recebemos 7 passos manuais, 0 migrations, 0 issues, 0 templates, `main` aberta e uma CI que apontava para um branch inexistente | M-23 de **7** para **1**; M-22 de **0** para _a preencher_; proteção de `main`: de nenhuma para 1 aprovação do QA + 4 checks; `develop` de **1** referência para **0** |
| 7 | A documentação descrevia outro sistema | 1:15 | Diego | 12 divergências. A mais séria: a doc prometia "Nível de acesso Admin" num sistema sem autenticação alguma | M-25 de **12** para _a preencher_; M-24 de **5 de 10** para **10 de 10** |
| 8 | O que não fizemos, e a conta para a N3 | 1:15 | Igor | Escolhas declaradas, não esquecimentos. Autenticação é o débito nº 1, e a doc recebida já prometia o que nunca existiu | seção 11: 10 débitos, cada um com motivo e prioridade; seção 10: o que não atingiu a meta |
| 9 | Fechamento | 0:30 | Igor | Entregamos à N3 o que gostaríamos de ter recebido: um sistema que sobe em um comando, com teste que prova a regra, e a lista honesta do que falta | M-23 **7 → 1**; M-01 **6,14 % → _a preencher_**; M-12+M-13 **7 → _a preencher_** bugs CRÍTICO e ALTO |

### Abertura, literal

> "O SREC existe para impedir que duas pessoas reservem a mesma sala no mesmo
> horário. A primeira coisa que fizemos, antes de escrever uma linha, foi
> verificar se ele fazia isso. Ele não fazia: cinco requisições simultâneas no
> mesmo horário criavam cinco reservas. Nos próximos doze minutos a gente mostra
> o que mais encontramos nas 1.280 linhas que recebemos, o que corrigimos, e com
> qual número cada uma dessas afirmações se sustenta. Todo número que vamos dizer
> tem um comando ao lado dele no repositório, e qualquer um aqui pode rodar."

Três decisões dessa abertura, para quem for apresentar:

* Começa pelo **produto**, não pela stack. Quem avalia já sabe que é Node e
  React.
* O defeito aparece **em dez segundos**. É a informação mais valiosa que temos, e
  guardá-la para o meio da apresentação é desperdício.
* A última frase é um convite à verificação. Quem convida a conferir está
  dizendo que mediu.

### Fechamento, literal

> "Recebemos um sistema com 6,14 % de cobertura, zero constraint no banco, zero
> issue e a `main` aberta. Entregamos com _X_ % de cobertura, _N_ constraints,
> _N_ issues rastreáveis e nenhum merge sem aprovação do QA. E entregamos também
> a lista do que não fizemos, com o motivo — porque foi justamente o débito
> escondido que nos custou a primeira semana desta entrega."

### O que não dizer

* **Adjetivo sem número.** "Muito melhor", "bem mais limpo", "bastante mais
  seguro". Se não tem número dos dois lados, corta a frase.
* **Crítica ao grupo anterior.** O relatório de auditoria registra que o sistema
  é "um v1.0 de prazo apertado, com os problemas típicos de um v1.0 de prazo
  apertado". Mantenha esse tom: o nosso código vai para um terceiro grupo em
  duas semanas.
* **"Não deu tempo."** Toda decisão de escopo está na seção 11 com motivo
  técnico. Use o motivo.
* **Número medido de um jeito e comparado com outro.** Se alguém perguntar da
  cobertura, o número é o do `--collectCoverageFrom`. Os 35,48 % não entram nem
  como curiosidade.

### Perguntas prováveis, e o número que responde

| Pergunta | Resposta curta | Número |
|---|---|---|
| "Como vocês sabem que não quebraram nada?" | Suíte de integração nos 10 endpoints, suíte de domínio, e roteiro de regressão manual executado antes e depois, com os dois registros versionados | M-08 **0 de 10 → 10 de 10**; M-05 **2 → _a preencher_**; 51 passos, 2 execuções comparadas |
| "O que vocês não conseguiram fazer?" | Autenticação, teste de ponta a ponta e a promoção das regras de lint a bloqueantes. Os três estão registrados com motivo e prioridade | seção 11, 10 itens |
| "A cobertura não está baixa ainda?" | Está abaixo de 90 %, e de propósito: `index.js` é bootstrap e os `catch` de falha de infraestrutura exigiriam injeção de falha. A meta foi 70 %, não 100 %, para não gerar teste de getter | M-01 **6,14 % → _a preencher_**, meta **≥ 70 %**; justificativa em `metricas-baseline.md` |
| "Por que não reescreveram o frontend?" | O backend inteiro tem 370 linhas e o `App.jsx` tem 351. "Reescrever o frontend" é reescrever 41 % do sistema, e a N2 é manutenção | seção 4 |
| "Quem revisou o quê?" | Todos os PRs passaram por aprovação do QA, exigida pela proteção de `main` e pelo `CODEOWNERS`, não por combinação verbal | seção 8; `.github/CODEOWNERS` |

### Ensaio

Cronometrar duas vezes, uma delas com interrupção no meio do bloco 3 — é onde a
pergunta vai cair. Se passar de 12 minutos, o corte é no bloco 7 e no 8, nunca
no 3 nem no 4: são os dois que a rubrica paga.

Rodar `docker compose up -d --wait` e o roteiro de regressão **na máquina da
apresentação**, no dia, antes de começar.
````

### 2. `docs/auditoria/metricas-baseline.md` — alterar

Remover a coluna **"Fim da N2"** da tabela de 29 métricas e substituir a nota
das linhas 122-124 por um apontamento. O baseline é histórico: fica congelado no
commit `8431181` e não se atualiza nunca mais. A comparação passa a ter uma casa
só.

```markdown
A comparação antes/depois, com a coluna medida no fim da entrega, o comando que
reproduz cada medição e o roteiro do pitch está em
[`relatorio-antes-depois.md`](relatorio-antes-depois.md). Este documento
permanece congelado no commit `8431181`: é a fotografia do recebimento.
```

Sem isso, o mesmo número do "depois" passa a existir em dois arquivos e
divergem no primeiro PR que atualizar só um — e aí nenhum dos dois serve para o
pitch.

### 3. `docs/auditoria/evidencias/` — criar a pasta com `README.md`

QA-01 e QA-02 já gravam saída bruta aqui (`qa-01-antes.txt`,
`qa-02-dominio.txt`). O relatório passa a ter o par "depois", e a pasta precisa
de uma regra para não virar um depósito de `.txt` sem dono.

````markdown
# Evidências de medição

Saída **bruta** de comando, sem edição. É o que sustenta cada número de
[`relatorio-antes-depois.md`](../relatorio-antes-depois.md).

Nomeação: `<spec>-<antes|depois>-<metrica>.txt`

```
qa-01-antes.txt              suíte de integração contra o código recebido
qa-01-depois.txt             a mesma suíte depois de BE-01..BE-05
qa-02-dominio.txt            cobertura da camada de domínio
cobertura-antes.txt          C-01 no commit 8431181
cobertura-depois.txt         C-01 no fim da entrega
lint-strict-antes.txt        C-04, contagem de avisos na Fase 1
```

Duas regras:

* **Nada de saída editada.** Se precisou recortar, o arquivo perde o valor de
  evidência. Guarde inteiro.
* **Todo número do relatório aponta para um arquivo daqui ou para um comando
  reproduzível.** Número sem uma das duas coisas sai do relatório.
````

### 4. `README.md` — alterar

Acrescentar o link para `docs/auditoria/relatorio-antes-depois.md` na lista de
documentação, junto do relatório de auditoria. É o documento que o grupo da N3
vai abrir primeiro para entender o que mudou e por quê.

## Testes

Um relatório se testa pela reprodutibilidade dos seus números. Os casos abaixo
são o aceite.

### Caso 1 — cada comando roda copiado e colado

Executar os **21** comandos da seção 2 contra `main`, em sequência.

Aceite: nenhum precisa de ajuste para rodar. Comando que exige correção é
comando errado no relatório, e o conserto é no relatório.

Exceção declarada: C-10, C-11 e C-13 dependem de OPS-02 e REQ-03 e falham antes
delas, com mensagem clara (`No such file or directory`). Está correto — esses
números não existem ainda. O que **não** pode acontecer é o comando falhar por
erro de sintaxe.

### Caso 2 — os números do "antes" batem com os dois comandos

Confrontar cada célula da coluna "Antes" das seções 3, 4, 5.1, 6, 7 e 8 com a
saída do comando correspondente no commit `8431181`.

```bash
git stash && git checkout 8431181
cd server && npm ci
npx jest --coverage --coverageReporters=text --collectCoverageFrom='src/**/*.js'
# confrontar com: 6.14 / 0 / 3.57 / 6.14, 1 suite, 2 tests
wc -l ../client/src/App.jsx                      # => 351
grep -c 'catch (err)' src/controllers/*.js       # => 5 + 5
grep -c '<label>' ../client/src/App.jsx          # => 7
grep -rc 'eslint-disable' ../client/src          # => 2
git checkout - && git stash pop
```

Aceite: **zero** divergência. Qualquer número do "antes" que não reproduza é erro
do relatório, não do comando — e invalidaria o pitch inteiro, porque a coluna da
esquerda é a base de toda comparação.

### Caso 3 — a armadilha dos 35,48 % é reproduzível

```bash
cd server
npx jest --coverage --coverageReporters=text | grep 'All files'
# => 35.48
npx jest --coverage --coverageReporters=text --collectCoverageFrom='src/**/*.js' | grep 'All files'
# => 6.14
```

Aceite: os dois números aparecem, e a seção 1 do relatório explica a diferença
antes de qualquer tabela. Quem for medir no fim da entrega tem de tropeçar nesse
aviso antes de rodar o comando errado.

### Caso 4 — nenhuma célula do "depois" tem número inventado

```bash
grep -c 'a preencher' docs/auditoria/relatorio-antes-depois.md
```

Aceite: no momento do merge desta spec, **todas** as células de "depois" estão
como *a preencher*. Qualquer número já escrito ali é invenção, porque as specs
que os produzem não foram mescladas.

### Caso 5 — nenhuma afirmação sem número dos dois lados

Revisão manual, feita pelo QA, parágrafo por parágrafo. Procurar por
comparativo sem número:

```bash
grep -nE 'melhor|pior|mais limpo|mais seguro|mais rápido|bastante|muito' \
  docs/auditoria/relatorio-antes-depois.md
```

Aceite: cada ocorrência tem número antes e número depois na mesma frase ou na
linha da tabela. As que não tiverem são reescritas ou cortadas.

### Caso 6 — a soma dos placares fecha

| Verificação | Esperado |
|---|---|
| Linhas na seção 5.3 (bug por bug) | **15** |
| Soma por severidade na seção 5.1 | 2 + 5 + 5 + 3 = **15** |
| Linhas na seção 6 (smell por smell) | **14** |
| Soma por severidade na seção 6 | 4 + 6 + 4 = **14** |
| Linhas na seção 9 (divergências) | **12** |
| Linhas M- na seção 3 | **29** (M-01 a M-29) |
| Bugs com prova **só** no roteiro manual | **3** (BUG-11, BUG-12, BUG-13) |
| Blocos do roteiro do pitch | **9**, somando **12:00** |

```bash
grep -cE '^\| BUG-[0-9]+ ' docs/auditoria/relatorio-antes-depois.md   # => 15
grep -cE '^\| CS-[0-9]+ '  docs/auditoria/relatorio-antes-depois.md   # => 14
grep -cE '^\| D-[0-9]+ '   docs/auditoria/relatorio-antes-depois.md   # => 12
grep -cE '^\| M-[0-9]+ '   docs/auditoria/relatorio-antes-depois.md   # => 29
```

### Caso 7 — o pitch cabe em 12 minutos

Ensaiar com cronômetro, duas vezes, uma delas com uma pergunta plantada no meio
do bloco 3.

Aceite: 12:00 ± 00:45, e cada bloco com pelo menos um número da tabela na fala.
Bloco que o apresentador não consegue dizer sem olhar o slide é bloco mal
escrito no roteiro.

### Caso 8 — não há número vivendo em dois arquivos

```bash
grep -n 'Fim da N2' docs/auditoria/metricas-baseline.md
# Aceite: nenhuma ocorrência. A coluna saiu e virou link.
```

## Critérios de aceite

* [ ] `docs/auditoria/relatorio-antes-depois.md` existe.
* [ ] A seção 1 abre com a armadilha dos **35,48 % vs 6,14 %** e fixa
      `--collectCoverageFrom='src/**/*.js'` como regra do documento.
* [ ] A seção 2 tem **21** comandos (C-01 a C-21), cada um apontando quais
      métricas mede.
* [ ] Todas as **29** métricas M-01 a M-29 aparecem na seção 3, com a coluna
      "Antes" preenchida com o número de `metricas-baseline.md` e a coluna
      "Depois" marcada *a preencher*.
* [ ] Cada linha da seção 3 referencia o comando que a mede.
* [ ] Nenhuma célula de "depois" tem número no merge desta spec (Caso 4).
* [ ] Todos os números do "antes" reproduzem contra o commit `8431181`
      (Caso 2 executado, saída colada no PR).
* [ ] Placar de bugs por severidade com o baseline **2 / 5 / 5 / 3**, mais a
      tabela com as **15** linhas de bug, cada uma com o caso de teste que a
      prova.
* [ ] A definição operacional de "corrigido" está escrita: existe caso de teste
      identificado por ID que reprovava antes e passa depois.
* [ ] Os **3** bugs sem teste automatizado possível (BUG-11, BUG-12, BUG-13)
      estão identificados como tal, com o passo do roteiro manual que os prova.
* [ ] Placar de code smells com o baseline **4 ALTO / 6 MÉDIO / 4 BAIXO**, e
      cada um dos 14 com a métrica numérica que o prova e o comando que a mede.
* [ ] Cobertura por camada com a saída literal do baseline por arquivo, medida
      com o **mesmo** comando no depois.
* [ ] A seção "O que piorou ou não atingiu a meta" existe, mesmo vazia no merge.
* [ ] Débito da N3 com **10** itens, cada um com motivo técnico, custo de
      carregar e prioridade.
* [ ] Roteiro do pitch com **9** blocos somando **12:00**, cada bloco com quem
      fala, o argumento e o número que o sustenta.
* [ ] A abertura e o fechamento estão escritos literalmente, para serem
      ensaiados.
* [ ] A seção "o que não dizer" e a tabela de perguntas prováveis existem.
* [ ] `metricas-baseline.md` perdeu a coluna "Fim da N2" e ganhou o link
      (Caso 8).
* [ ] `docs/auditoria/evidencias/README.md` existe com a convenção de nomes e a
      regra de saída não editada.
* [ ] O Caso 5 foi executado: nenhum comparativo sem número dos dois lados.
* [ ] Os quatro `grep` de contagem do Caso 6 devolvem 15, 14, 12 e 29.
* [ ] PR aprovado por `@igorSeberino` (QA) — e, como é PR do próprio QA, pelo
      segundo dono de `/docs/` conforme `.github/CODEOWNERS` de OPS-05.

## Passo a passo TBD

```bash
# 1. Branch
git checkout main
git pull --ff-only origin main
git checkout -b docs/before-after-report

# 2. Esqueleto do relatório, com a coluna "antes" preenchida
mkdir -p docs/auditoria/evidencias
git add docs/auditoria/relatorio-antes-depois.md
git commit -m "docs(auditoria): adicionar esqueleto do relatorio antes/depois com as 29 metricas"

# 3. Comandos de medição e pasta de evidências
git add docs/auditoria/evidencias/README.md
git commit -m "docs(auditoria): definir convencao de evidencias de medicao"

# 4. VALIDAR a coluna "antes" contra o commit recebido — Caso 2.
#    Este passo é o que dá valor ao documento: a coluna da esquerda é a base de
#    toda comparação do pitch.
git stash
git checkout 8431181
cd server && npm ci
npx jest --coverage --coverageReporters=text --collectCoverageFrom='src/**/*.js' \
  2>&1 | tee "$TMPDIR/cobertura-antes.txt"
wc -l ../client/src/App.jsx
grep -c 'catch (err)' src/controllers/*.js
grep -c '<label>' ../client/src/App.jsx
cd .. && git checkout - && git stash pop
cp "$TMPDIR/cobertura-antes.txt" docs/auditoria/evidencias/cobertura-antes.txt
git add docs/auditoria/evidencias/cobertura-antes.txt
git commit -m "docs(auditoria): registrar evidencia bruta da cobertura no commit recebido"

# 5. Caso 3 — reproduzir a armadilha dos 35,48 %
cd server
npx jest --coverage --coverageReporters=text | grep 'All files'
npx jest --coverage --coverageReporters=text --collectCoverageFrom='src/**/*.js' | grep 'All files'
cd ..

# 6. Uma casa só para o número do "depois"
git add docs/auditoria/metricas-baseline.md
git commit -m "docs(auditoria): mover a coluna do fim da N2 para o relatorio antes/depois"

# 7. Caso 5 e Caso 6 — revisão de linguagem e contagem
grep -nE 'melhor|pior|mais limpo|mais seguro|bastante|muito' docs/auditoria/relatorio-antes-depois.md
grep -cE '^\| BUG-[0-9]+ ' docs/auditoria/relatorio-antes-depois.md   # => 15
grep -cE '^\| CS-[0-9]+ '  docs/auditoria/relatorio-antes-depois.md   # => 14
grep -cE '^\| D-[0-9]+ '   docs/auditoria/relatorio-antes-depois.md   # => 12
grep -cE '^\| M-[0-9]+ '   docs/auditoria/relatorio-antes-depois.md   # => 29
grep -c 'a preencher' docs/auditoria/relatorio-antes-depois.md        # > 0

# 8. Ponteiro no README
git add README.md
git commit -m "docs: apontar o relatorio antes/depois na porta de entrada"

# 9. Abrir PR
git push -u origin docs/before-after-report
gh pr create --fill
# PR: "QA-04 — Relatório antes/depois e roteiro do pitch"
# Corpo: colar a saída do Caso 2 (validação da coluna "antes") e as quatro
# contagens do Caso 6. Fecha a issue #28.
```

Cadência depois do merge — o documento é preenchido **durante** a entrega, não
na véspera:

| Quando | O que entra | Commit |
|---|---|---|
| A cada PR mesclado que move uma métrica | a célula do "depois" e o PR na coluna de rastreio | `docs(auditoria): atualizar <M-xx> depois de <SPEC>` |
| Ao fechar cada bug | a linha da seção 5.3, com o caso de teste e as duas saídas | `docs(auditoria): registrar correcao de BUG-xx no placar` |
| Ao fim do lote de backend | seção 7 inteira, com a saída de C-01 | `docs(auditoria): atualizar cobertura por camada` |
| Depois de FE-05 | seção 5 (bugs de interface), seção 4 e M-18, M-19, M-26 | `docs(auditoria): atualizar placar do frontend` |
| Véspera do pitch | seções 10 e 11, e o ensaio do Caso 7 | `docs(auditoria): fechar o relatorio e o roteiro do pitch` |

Preencher no PR que produz o número é a única forma de o número ter comando ao
lado. Reconstruir 29 medições na véspera é o caminho curto para o adjetivo sem
número — exatamente o que esta spec existe para impedir.

## Prompt para o Claude Code

```
Implemente a spec QA-04 deste repositório.

Leia primeiro, por inteiro:
- docs/specs/qa-04-before-after-report/implementacao.md
- docs/auditoria/metricas-baseline.md  (INTEIRO: as 29 métricas M-01..M-29, a
  armadilha dos 35,48 %, a saída literal de cobertura por arquivo, o bloco de
  volume de código e o de processo e histórico)
- docs/auditoria/bugs-do-cliente.md    (os 15 bugs e a severidade de cada um)
- docs/auditoria/code-smells.md        (os 14 smells e a severidade de cada um)
- docs/auditoria/divergencias-doc-codigo.md (o quadro D-01..D-12)
- docs/auditoria/relatorio-n2.md       (seção 9, o que deliberadamente não vamos fazer)
- docs/time/overview.md                (papéis, e a política de débito técnico)
- docs/specs/qa-01-api-integration-suite/implementacao.md e
  docs/specs/qa-02-domain-rule-tests/implementacao.md
  (os IDs de caso R-, V-, A-, O-, W-, P-, S-, usados na coluna de prova)

Carregue a skill de documentação/auditoria do time em .claude/skills/.

Crie a branch docs/before-after-report e entregue:
1. docs/auditoria/relatorio-antes-depois.md — o esqueleto completo das 12 seções
2. docs/auditoria/metricas-baseline.md — remover a coluna "Fim da N2" e trocar
   pela linha de link
3. docs/auditoria/evidencias/README.md
4. README.md — o ponteiro

Regras não negociáveis:
1. A coluna "Antes" é COPIADA de metricas-baseline.md, número por número. Não
   recalcule, não arredonde, não converta 6,14 em 6,1. Se algum número da spec
   divergir do de metricas-baseline.md, o DOCUMENTO DE BASELINE VENCE: use o
   dele e me avise qual divergiu.
2. A coluna "Depois" fica TODA como `_a preencher_`. ZERO número inventado.
   Se você escrever qualquer valor ali, o documento perde a função.
3. Todas as 29 métricas aparecem. Confira com:
   grep -cE '^\| M-[0-9]+ ' → 29
4. Os 15 bugs aparecem um por linha (grep → 15) e os 14 smells também
   (grep → 14), com as severidades exatas dos catálogos:
   bugs 2 CRÍTICO / 5 ALTO / 5 MÉDIO / 3 BAIXO;
   smells 4 ALTO / 6 MÉDIO / 4 BAIXO.
5. Cada bug tem a coluna de prova preenchida com os IDs REAIS de caso de QA-01
   e QA-02. Não invente ID: se não encontrar o caso na spec, escreva
   "sem caso automatizado" e diga qual passo do roteiro de QA-03 prova.
6. Cada comando da seção 2 precisa RODAR copiado e colado. Rode todos antes de
   me entregar. Os que dependem de OPS-02 ou REQ-03 vão falhar por arquivo
   inexistente — isso é esperado; o que não pode é falhar por erro de sintaxe.
7. Nenhuma frase comparativa sem número dos dois lados. Rode
   grep -nE 'melhor|pior|mais limpo|mais seguro|bastante|muito' no resultado e
   conserte cada ocorrência.
8. O roteiro do pitch tem 9 blocos somando exatamente 12:00, cada um com quem
   fala e o número que o sustenta. A abertura e o fechamento vão escritos
   literalmente.
9. Não altere nenhum arquivo em server/ ou client/. QA-04 é documento.
10. Nomes de arquivo em inglês; conteúdo e mensagens de commit em português, no
    imperativo.

Depois de escrever, VALIDE a coluna "antes" de verdade:
  git stash && git checkout 8431181
  cd server && npm ci
  npx jest --coverage --coverageReporters=text --collectCoverageFrom='src/**/*.js'
  wc -l ../client/src/App.jsx
  grep -c 'catch (err)' src/controllers/*.js
  grep -c '<label>' ../client/src/App.jsx
  grep -rc 'eslint-disable' ../client/src
  cd .. && git checkout - && git stash pop

Me responda, com a saída REAL:
- os 4 percentuais de cobertura do commit 8431181, e se batem com 6,14 / 0 /
  3,57 / 6,14
- os dois números da armadilha (com e sem --collectCoverageFrom)
- as quatro contagens de grep (M, BUG, CS, D)
- quantas células de "depois" ficaram como `_a preencher_`
- quais bugs ficaram sem caso de teste automatizado, e qual passo do roteiro
  manual prova cada um
- qualquer número da spec que divergiu de metricas-baseline.md

Não invente nenhuma saída de comando.
```
