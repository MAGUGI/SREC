# {BUG-xx | CS-xx} — {título em português, imperativo ou descritivo, sem ponto final}

* **Severidade:** {CRÍTICO | ALTO | MÉDIO | BAIXO} — {cite a definição da escala de `srec-audit`}
* **Categoria:** {bug de comportamento | uma das categorias da taxonomia, ex.: Duplicated Code}
* **Onde:** `{caminho/do/arquivo.js}:{linha}` {, e demais ocorrências}
* **Status:** {inédito | já catalogado em `docs/auditoria/`}
* **Relacionado:** {IDs que dependem deste ou que este bloqueia, ou "nada"}

## Problema

O que está errado, no código real. Cite o trecho recebido, com o número de linha
conferido no arquivo — não parafraseie.

```js
// server/src/controllers/reservationController.js:12-28
```

## Evidência

Como reproduzir, ou o número que comprova. Pelo menos um dos dois, com comando.

```bash
# comando exato
```

```
# saída crua do comando
```

Se não foi medido: escreva **não medido** e qual comando mediria. Não estime.

## Impacto

O que acontece com o usuário do SREC ou com quem mantém o código. Não repita o
problema com outras palavras — diga a consequência.

* Usuário: {o que ele vê ou perde}
* Manutenção: {o que fica mais caro ou impossível}
* Rubrica N2: {qual item este achado pontua ao ser resolvido}

## Métrica associada

| Indicador | Antes | Depois | Comando |
|---|---|---|---|
| {ex.: blocos `try/catch` em controller} | {10} | {a medir} | `grep -c "} catch (err) {" server/src/controllers/*.js` |

Deixe "a medir" em branco até o PR fechar. Preencher antes é invenção.

## Encaminhamento

* **Corrigir na N2** — abrir issue e spec em `docs/specs/<slug>/implementacao.md`.
* **Registrar como dívida** — `docs/time/divida-tecnica.md`, com dono e razão de
  não ser agora.
* **Handoff para a N3** — `docs/handoff/`, com o motivo de ficar fora do escopo
  desta entrega.

Escolha **uma** e justifique em uma linha. Não proponha a solução detalhada aqui:
a abordagem é decidida na spec, pelo responsável com o PO.
