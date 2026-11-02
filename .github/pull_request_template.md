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

Preenchido pelo revisor, não pelo autor. Se o autor é o próprio Igor, quem
preenche e aprova é o revisor substituto, @adrian-cesar.

- [ ] Os 7 itens acima foram conferidos, não apenas lidos.
- [ ] O diff não traz arquivo fora do escopo da issue.
- [ ] Aprovado — a aprovação registrada aqui é o que a rubrica N2 cobra.

<!-- Se este PR foi aberto pelo próprio QA e o merge precisou do bypass de
     admin, declare aqui o motivo e quem revisou no lugar dele. Ver a seção
     "Decisão" em docs/specs/ops-05-branch-protection-and-templates/. -->
