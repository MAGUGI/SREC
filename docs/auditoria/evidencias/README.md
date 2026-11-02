# Evidências de medição

Saída **bruta** de comando, sem edição. É o que sustenta cada número de
[`relatorio-antes-depois.md`](../relatorio-antes-depois.md).

Nomeação: `<spec>-<antes|depois|tema>.txt`

```
qa-01-antes.txt                 suíte de integração contra o código recebido (QA-01)
qa-01-depois.txt                a mesma suíte depois de BE-01..BE-08 (QA-01)
qa-02-dominio.txt               cobertura da camada de domínio (QA-02)
qa-04-antes-caso2.txt           Caso 2: coluna "antes" revalidada no commit 8431181
qa-04-armadilha-antes.txt       Caso 3: 35,48 % sem --collectCoverageFrom vs 6,14 % com
qa-04-medicoes-antes.txt        C-02..C-20 no commit 8431181
qa-04-medicoes-main.txt         C-02..C-20 no origin/main medido
qa-04-cobertura-main.txt        C-01 no origin/main: literal, serial, sem *.test.js, e pelo jest.config.js
qa-04-schema-main.txt           C-10 e C-11 no banco migrado do zero
qa-04-bug-11-12.txt             BUG-11 e BUG-12 reproduzidos por script, antes e depois
qa-04-processo-git.txt          C-06, C-07 e C-21 via gh
```

Duas regras:

* **Nada de saída editada.** Se precisou recortar, o arquivo perde o valor de
  evidência. Guarde inteiro. Quando uma medição não pôde ser repetida, o
  cabeçalho do arquivo diz qual commit foi medido e por que ele vale.
* **Todo número do relatório aponta para um arquivo daqui ou para um comando
  reproduzível.** Número sem uma das duas coisas sai do relatório.
