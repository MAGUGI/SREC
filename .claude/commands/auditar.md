---
description: Audita um arquivo ou pasta do código recebido com o subagent code-auditor e grava o achado no formato do time
argument-hint: "<caminho> — ex. server/src/controllers/reservationController.js ou client/src"
---

# Auditar `$ARGUMENTS`

## 1. Validar o alvo

```bash
ls -la $ARGUMENTS
```

Se o caminho não existir, pare e peça o correto. Alvos típicos desta base:

```
server/src/controllers/reservationController.js    90 linhas, 5 try/catch
server/src/controllers/resourceController.js       72 linhas, 5 try/catch
server/src/models/reservationModel.js              64 linhas, SQL cru + checkAvailability
server/src/models/resourceModel.js                 44 linhas, 0 % de cobertura
server/src/config/initDb.js                        33 linhas, schema no boot, erro engolido
server/src/config/database.js                      14 linhas, Pool sem handler de 'error'
client/src/App.jsx                                351 linhas, 41 % do JS/JSX
client/src/services/api.js                         82 linhas, API_BASE_URL cravado
server/src   client/src                            pasta inteira
```

Nada fora de `server/`, `client/` e `docs/` é alvo de auditoria. `node_modules/`
e `package-lock.json` nunca entram — contá-los infla o LOC e destrói a comparação
antes/depois.

## 2. Disparar o subagent `code-auditor`

Dispare o subagent `code-auditor` sobre `$ARGUMENTS`. Ele é **somente leitura**:
não edita arquivo, não cria branch, não abre issue. No prompt, exija:

1. **Carregar a skill `srec-audit` por completo** — taxonomia fechada de code
   smell, escala de severidade com a definição de cada nível e o formato
   obrigatório do achado (`templates/achado.md`). Categoria e severidade são as
   do time; não se inventa nova.
2. **Carregar a skill de arquitetura do lado auditado** —
   `srec-backend-architecture` para `server/`, `srec-frontend-architecture` para
   `client/`. Smell só é smell em relação à arquitetura alvo; sem isso o
   resultado é revisão genérica de JavaScript.
3. **Medir antes de ler em profundidade**, com os comandos da skill `srec-audit`
   pertinentes ao alvo, e registrar a saída crua:

```bash
cd server && npx jest --coverage --coverageReporters=text --collectCoverageFrom='src/**/*.js'
find server/src client/src -type f \( -name '*.js' -o -name '*.jsx' \) | xargs wc -l | sort -n
grep -c 'catch (err)' server/src/controllers/*.js
wc -l client/src/App.jsx
```

4. **Ler o arquivo inteiro**, não o trecho que o `grep` devolveu.
5. **Confirmar arquivo e linha com `Read`** antes de escrever o achado. Linha
   errada desacredita o achado inteiro, e com ele a auditoria.
6. **Cruzar com o catálogo existente** em `docs/auditoria/bugs-do-cliente.md` e
   `docs/auditoria/code-smells.md`: reaproveitar o ID (`BUG-xx` / `CS-xx`) quando
   já catalogado, dizendo se o número mudou; criar o próximo da sequência quando
   inédito, e declarar explicitamente que é inédito.

A regra que vale mais que tudo: **número medido, nunca impressão.** Proibido
"cobertura baixa", "arquivo grande", "muito acoplado". Obrigatório "cobertura de
statements 6,14 % (`npx jest --coverage`)", "`App.jsx` tem 351 linhas, 41 % das
853 de JS/JSX (`wc -l`)". Se não conseguiu medir, o achado diz **"não medido"** e
qual comando mediria — estimativa apresentada como medição é erro factual no
pitch.

## 3. Gravar o achado

O `code-auditor` **devolve** o achado; quem escreve no disco é esta sessão. Use o
formato de `.claude/skills/srec-audit/templates/achado.md`, sem alterar as
seções: cabeçalho (ID, Severidade com a definição citada, Categoria, Onde,
Status, Relacionado), Problema, Evidência, Impacto, Métrica associada,
Encaminhamento.

Destino, pela natureza do achado:

| Achado | Arquivo |
|---|---|
| bug de comportamento (`BUG-xx`) | `docs/auditoria/bugs-do-cliente.md` |
| smell de estrutura (`CS-xx`) | `docs/auditoria/code-smells.md` |
| documentação que afirma o que o código não faz | `docs/auditoria/divergencias-doc-codigo.md` |
| número novo de uma métrica já catalogada | `docs/auditoria/metricas-baseline.md`, coluna "Fim da N2" |

Antes de escrever, confirme com o usuário se o achado é **inédito**. Reescrever
um `CS-xx` que já existe duplica o catálogo e quebra a rastreabilidade
achado → issue → spec → PR, que é exatamente o que a rubrica cobra em
"rastreabilidade das alterações para a N3".

Na seção "Métrica associada", deixe a coluna "Depois" como *a medir* até o PR
fechar. Preencher antes é invenção.

## 4. Fechamento

Termine com a tabela de síntese, sempre:

```
| ID | Severidade | Smell ou bug | Arquivo:linha | Número medido |
```

E com **um** encaminhamento por achado, justificado em uma linha: corrigir na N2
(abrir issue + spec em `docs/specs/<slug>/implementacao.md`), registrar como
dívida técnica com dono, ou handoff para a N3.

Nada de plano de refatoração detalhado e nada de código proposto aqui: isso é
spec de implementação, não auditoria. O achado aponta e quantifica; a abordagem é
decidida pelo responsável da área com o PO.
