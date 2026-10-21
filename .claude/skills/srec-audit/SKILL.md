---
name: srec-audit
description: Use when auditing or measuring the SREC codebase — os comandos exatos de medição (cobertura, lint, LOC, duplicação), a taxonomia de code smell adotada pelo time, a escala de severidade CRÍTICO/ALTO/MÉDIO/BAIXO com definição de cada nível, e o formato obrigatório do achado. Use antes de abrir issue de bug ou de refatoração, e sempre que precisar de número antes/depois.
---

# Auditoria do código recebido — SREC

O time recebeu o SREC de outro grupo na N2 e precisa provar melhoria **com
número antes e número depois**. A rubrica paga 1,5 ponto por "relatório de
auditoria e métricas iniciais" e 2,5 por "melhoria comprovada do código
recebido". Auditoria sem medição não pontua.

Esta skill define três coisas: **como medir**, **como classificar** e **como
escrever o achado**. Os três são fechados — não invente comando, categoria nem
severidade própria.

## A regra zero

> Toda afirmação de melhoria carrega um número antes e um número depois, obtido
> por comando reproduzível.

Proibido: "cobertura baixa", "arquivo muito grande", "código acoplado", "muita
duplicação", "melhoramos a qualidade".

Obrigatório: "cobertura de statements 6,14 % → 71,3 %", "`App.jsx` 351 → 55
linhas", "10 → 0 blocos `try/catch` em controller", cada um com o comando ao
lado.

Se você não mediu, escreva **"não medido"** e diga qual comando mediria. Nunca
apresente estimativa como medição.

## Comandos exatos de medição

Rode da **raiz do repositório**. Instale uma vez por clone:
`cd server && npm ci` e `cd client && npm ci --legacy-peer-deps` (a flag é
obrigatória — React 19 + Vite 8).

### Cobertura (backend)

```bash
cd server && npx jest --coverage --coverageReporters=text --collectCoverageFrom='src/**/*.js'
```

Lê-se a tabela `% Stmts | % Branch | % Funcs | % Lines`, linha `All files` e as
linhas por pasta. Registre as quatro, mais a cobertura de `controllers/` e
`routes/` separadas — são as que estavam em 0 % e as que mais mudam na N2.

### Contagem de testes

```bash
cd server && npx jest --listTests                 # quantos arquivos de teste
cd server && npm test                             # a linha "Tests: N passed"
```

### Lint e build

```bash
cd server && npm run lint
cd client && npm run lint
cd client && npm run build                        # registre o tamanho do bundle
```

Lint do projeto recebido tem **0 erros** nas duas pontas — e isso é CS-10, não
elogio: a config não tem regra de complexidade, de tamanho de arquivo, de
segurança nem de acessibilidade. "0 erros" com lint sem dente não mede nada.

### LOC e maior arquivo

```bash
find server/src client/src -type f \( -name '*.js' -o -name '*.jsx' \) \
  | xargs wc -l | sort -n
```

Nunca inclua `package-lock.json`, `node_modules/`, CSS ou asset na contagem de
JS/JSX — infla o número e destrói a comparação antes/depois. Para o LOC de fonte
total (js/jsx/css), conte à parte e diga que é à parte.

```bash
wc -l client/src/App.jsx                          # o indicador do CS-01
```

### Duplicação

Não há ferramenta de clone detection instalada, e a N2 não vai instalar uma. A
duplicação desta base é estrutural e se mede com `grep`:

```bash
grep -c "} catch (err) {" server/src/controllers/*.js
grep -h "Internal server error" server/src/controllers/*.js | wc -l
grep -c "loadData()" client/src/App.jsx
grep -c "showFeedback(err.message, 'error')" client/src/App.jsx
```

Baseline medido: **5 e 5** blocos `catch` (um por ação de cada controller),
**10** respostas `Internal server error` idênticas.

### Integridade do schema e acessibilidade

```bash
grep -c "CHECK" server/src/config/initDb.js       # 0
grep -c "CREATE INDEX" server/src/config/initDb.js # 0
grep -c "<label>" client/src/App.jsx              # 7, nenhum com htmlFor
grep -c "eslint-disable" client/src/App.jsx       # 2
```

### Histórico

```bash
git log --oneline | wc -l                         # 10 commits no recebido
gh issue list --state all | wc -l                 # 0 issues no recebido
```

### Baseline de referência

Os números de partida estão em `docs/auditoria/`. **Reconfira antes de citar** —
se um PR já mergeou, o baseline da auditoria inicial continua sendo o de partida,
mas o número "atual" mudou, e confundir os dois é erro de auditoria.

## Taxonomia de code smell adotada

Categorias fechadas. Todo achado se encaixa em uma delas; se não encaixar, o
problema provavelmente é bug (comportamento) e não smell (estrutura).

| Categoria | Definição | Exemplo nesta base |
|---|---|---|
| **God Component / God Class** | uma unidade acumula responsabilidades de várias | `App.jsx`, 351 linhas, 12 `useState`, 5 handlers, 222 linhas de JSX (CS-01) |
| **Duplicated Code** | mesma estrutura repetida, mudança exige editar N lugares | 10 `try/catch` idênticos nos controllers (CS-02) |
| **Missing Layer** | falta uma camada, e a responsabilidade dela vaza para a vizinha | regra de negócio no controller, sem `services/` (CS-03) |
| **Ad-hoc Validation** | validação espalhada, sem ponto único nem schema | `if (!name \|\| type)` em dois controllers (CS-04) |
| **Magic String / Magic Number** | literal de domínio repetido sem constante | `'scheduled'`, `'meeting_room'` em controller, model e JSX (CS-05) |
| **Schema as Side Effect** | estrutura de dados criada implicitamente, sem versão | `initDb.js` no boot, sem migration (CS-06) |
| **Hardcoded Configuration** | valor de ambiente cravado no código | `API_BASE_URL = 'http://localhost:5000/api'` (CS-07) |
| **Inefficient Data Access** | leitura/escrita mais caras que o necessário | `loadData()` refaz as duas listas a cada mutação (CS-08); zero índice (CS-09) |
| **Toothless Quality Gate** | portão de qualidade que não reprova nada | lint com 0 erros e nenhuma regra de complexidade/tamanho/segurança/a11y (CS-10) |
| **Dead Code / Orphan** | código que ninguém chama | `findByResourceId`, `PUT /api/resources/:id`, `client.txt` (CS-11, BUG-15) |
| **Suppressed Warning** | aviso silenciado em vez de corrigido | 2 `eslint-disable-next-line` no `useEffect` (CS-12) |
| **Accessibility Gap** | barreira de uso por tecnologia assistiva | 7 `<label>` sem `htmlFor` (CS-13) |
| **Open Surface** | superfície exposta além do necessário | `cors()` liberado, sem helmet, sem rate limit (CS-14) |
| **Doc Drift** | documentação afirma o que o código não faz | 12 divergências entre a doc recebida e o código |

**Smell não é bug.** Smell é estrutura que encarece manutenção; bug é
comportamento errado agora. `App.jsx` com 351 linhas é smell (CS-01); duplo
clique criando duas reservas é bug (BUG-13). Prefixo `CS-` para smell, `BUG-`
para defeito. Nunca misture os dois no mesmo achado: a severidade e a correção
são de naturezas diferentes.

## Escala de severidade

A mesma escala para bug e para smell. Use a definição, não a intuição, e **cite a
definição** no achado.

| Nível | Definição | Prazo | Exemplos |
|---|---|---|---|
| **CRÍTICO** | Quebra a regra de negócio central do SREC (nunca reservar o mesmo recurso no mesmo intervalo) **ou** perde/corrompe dado de forma irrecuperável | corrigir na N2, antes de qualquer refatoração estética | BUG-01 dupla reserva sob concorrência; BUG-02 `end_time` antes de `start_time` aceito e que nunca colide |
| **ALTO** | Produz resposta errada ao cliente, derruba o serviço, **ou** é smell que bloqueia mecanicamente a correção de um CRÍTICO ou a escrita de teste | corrigir na N2 | BUG-03 status arbitrário; BUG-04 500 em vez de 400; BUG-05 500 em update parcial; BUG-06 cascade apaga reservas; CS-01 God Component; CS-02 duplicação; CS-03 ausência de serviço; CS-04 validação ad-hoc |
| **MÉDIO** | Corrompe dado de forma recuperável, degrada desempenho ou experiência, **ou** é dívida estrutural que não bloqueia ninguém hoje | corrigir na N2 se couber; senão registrar em `docs/time/divida-tecnica.md` com dono | BUG-08 reserva no passado; BUG-09 `capacity` 0/negativo; CS-05 magic string; CS-06 schema no boot; CS-09 zero índice |
| **BAIXO** | Incomoda, polui ou confunde, sem consequência funcional | oportunista, ou handoff para a N3 | BUG-13 duplo clique; BUG-14 timer não limpo; CS-11 placeholder versionado; CS-12 supressão de lint |

Duas regras de fronteira que evitam discussão:

* **Smell que impede teste é ALTO, não MÉDIO.** Ausência de `app.js` separado
  mantém controllers e rotas em 0 % de cobertura: é bloqueio mecânico.
* **Bug sem reprodução não é CRÍTICO.** Sem passo de reprodução ou número medido,
  o achado entra um nível abaixo até alguém reproduzir. A auditoria perde
  credibilidade por um CRÍTICO não comprovado inteira.

## O formato do achado

Use `templates/achado.md`, sem alterar as seções. O achado vai para
`docs/auditoria/` e, quando virar trabalho, alimenta a spec em
`docs/specs/<slug>/implementacao.md`.

Requisitos de cada achado:

* **ID** — `BUG-xx` ou `CS-xx`. Reaproveite o ID se já está catalogado; crie o
  próximo da sequência se é inédito, e diga explicitamente que é inédito.
* **Arquivo e linha** confirmados com `Read`, não de memória. Linha errada
  desacredita o achado inteiro.
* **Evidência** — saída de comando, ou passo de reprodução que qualquer pessoa do
  time repete. Nunca adjetivo.
* **Severidade** com a definição citada.
* **Impacto** — o que acontece com o usuário ou com a manutenção. Não repita o
  problema com outras palavras.
* **Nada de solução detalhada.** O achado aponta e quantifica. A abordagem é
  decidida na spec, pelo responsável com o PO.

## Erros de auditoria que custam ponto

| Erro | Por quê |
|---|---|
| Apontar a fórmula de sobreposição como defeito | `checkAvailability` (`reservationModel.js:49-61`) implementa a fórmula correta e documentada. O defeito é rodá-la fora de transação e sem constraint (BUG-01) |
| Celebrar "0 erros de lint" | É CS-10: lint sem regra de complexidade/tamanho/segurança/a11y não reprova nada |
| Contar `package-lock.json` no LOC | Infla o número e inviabiliza a comparação antes/depois |
| Chamar `console.error` nos controllers de achado novo | É sintoma do CS-02 (ausência de middleware de erro) |
| Reportar "sem TypeScript" como smell | O projeto é JavaScript por decisão; o achado real é ausência de `CHECK` no schema e de enum de domínio (CS-05) |
| Citar número do relatório sem reconferir | Depois de um PR mergeado o número mudou; citar o antigo como atual é erro factual no pitch |
| Juntar 3 bugs num achado | Cada bug tem severidade, evidência e correção próprias — e vira uma issue própria |
