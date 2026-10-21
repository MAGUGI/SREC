## O quê

<!-- O que mudou neste PR, objetivamente. Se é correção, diga o ID do bug
(BUG-xx) ou do smell (CS-xx) do catálogo em docs/auditoria/. -->

## Por quê

<!-- O problema no código recebido, com arquivo e linha, e o link para a issue e
para docs/specs/<slug>/implementacao.md. Lembre: este código veio de outro grupo
e vai para um terceiro na N3 — quem lê este PR depois pode não ser do time. -->

Issue: #{número}
Spec: `docs/specs/{slug}/implementacao.md`
Achado: {BUG-xx | CS-xx} — severidade {CRÍTICO | ALTO | MÉDIO | BAIXO}

## Número antes e depois

<!-- Obrigatório quando o trabalho tem métrica. Comando reproduzível, não
estimativa. Este quadro é o conteúdo do pitch da N2. -->

| Indicador | Antes | Depois | Comando |
|---|---|---|---|
| {ex.: cobertura de statements} | {6,14 %} | {x,x %} | `cd server && npx jest --coverage --collectCoverageFrom='src/**/*.js'` |

Sem métrica aplicável? Escreva "não aplicável" e por quê — não deixe a seção em
branco.

## Evidência do teste

<!-- Para PR de fix/: a saída do teste VERMELHO antes da correção e do VERDE
depois. É o que comprova que o defeito existia. -->

```
# vermelho, antes da correção
```

```
# verde, depois da correção
```

## Como testar

<!-- Passos de verificação manual. Obrigatório em mudança de client/, onde não há
runner de teste configurado. -->

1.
2.

## Notas ao revisor

<!-- Opcional. Decisão de design, alternativa rejeitada, ponto de atenção,
achado colateral encontrado e NÃO corrigido aqui (com sugestão de issue nova).
Se algo da rotina foi pulado, registre aqui — não deixe implícito. -->

## Definition of Done

- [ ] A spec `docs/specs/{slug}/implementacao.md` foi cumprida — nenhum arquivo tocado fora da seção "Alterações"
- [ ] Escopo da issue respeitado — nada ampliado de passagem
- [ ] `cd server && npm run lint && npm test` verde local
- [ ] `cd client && npm run lint && npm run build` verde local
- [ ] Teste de regressão existe e falhava antes da correção (obrigatório em PR de `fix/`)
- [ ] Cobertura não caiu (obrigatório em PR de `refactor/`)
- [ ] Commits em Conventional Commits, português, imperativo, sem `wip`/`ajustes`
- [ ] Subagent `qa-reviewer` rodado nesta branch e achados endereçados
- [ ] Nenhum segredo no diff (`DATABASE_URL` real, senha, token)
- [ ] `docs/auditoria/` atualizado com o número depois, se havia métrica
- [ ] `docs/arquitetura/` atualizado, se mudou schema, contrato de API ou estrutura
- [ ] Aprovado por `@igorSeberino` (QA) — requisito da rubrica da N2
- [ ] CI verde (`.github/workflows/ci.yml`)

Closes #{número}
