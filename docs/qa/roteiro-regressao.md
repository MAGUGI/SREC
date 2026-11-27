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
| P-03 | `curl -s http://localhost:5000/` | JSON `{"name":"SREC Coworking API","status":"running","health":"/health"}` | | |
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
| C-03 | BUG-02 | `API` `curl -i -X POST http://localhost:5000/api/reservations -H 'Content-Type: application/json' -d '{"resource_id":1,"user_name":"t","start_time":"2026-11-10T11:00:00Z","end_time":"2026-11-10T09:00:00Z"}'` | `201`, e a reserva aparece na lista sem bloquear ninguém (reserva fantasma) | `400` com motivo de janela inválida | | |
| C-04 | BUG-03 | `API` `curl -i -X PATCH http://localhost:5000/api/reservations/1/status -H 'Content-Type: application/json' -d '{"status":"banana"}'` e recarregar a tela | `200`; a etiqueta mostra `banana` sem estilo e a reserva fica **sem nenhum botão de ação** | `400`; o status permanece `scheduled` | | |
| C-05 | BUG-04 | `API` `curl -i http://localhost:5000/api/resources/abc` | `500 {"error":"Internal server error"}` | `400`, indicando que o id precisa ser numérico | | |
| C-06 | BUG-05 | `API` `curl -i -X PUT http://localhost:5000/api/resources/1 -H 'Content-Type: application/json' -d '{"capacity":4}'` | `500` | `200` com só a capacidade alterada, ou `400` explicando que o corpo precisa ser completo — **nunca 500** | | |
| C-07 | BUG-06 | Criar um espaço, criar **três** reservas nele, excluir o espaço confirmando o diálogo, e abrir a aba "Agendamentos" | As três reservas **desapareceram**, e o diálogo não avisou nada sobre elas | O diálogo informa quantas reservas serão afetadas, ou a exclusão é recusada / vira desativação | | |
| C-08 | BUG-07 | Criar reserva para amanhã às **14:00**, ler o horário exibido, e comparar com `SELECT start_time FROM reservations;` no banco | Os três valores (digitado, exibido, gravado) **não** coincidem. Registrar a diferença em horas | Os três coincidem | | |
| C-09 | BUG-08 | Criar reserva com início **ontem** | Aceita | `400` | | |
| C-10 | BUG-09 | `API` `curl -i -X POST http://localhost:5000/api/resources -H 'Content-Type: application/json' -d '{"name":"X","type":"workstation","capacity":-5}'` e depois com `"capacity":0` | `-5` é **gravado**; `0` vira `1` silenciosamente | `400` nos dois casos | | |
| C-11 | BUG-10 | `API` criar espaço com `"type":"auditorio"` e observar a lista na tela | Aparece como "**Estação de Trabalho**" — a tela mente | `400` | | |
| C-12 | BUG-11 | Parar o Postgres (`docker compose stop postgres`) e subir o servidor | O servidor sobe anunciando "Server is running on port 5000" e **toda** requisição devolve 500 | O servidor **não** sobe, ou sobe e reporta a falha num endpoint de saúde | | |
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
| D-05 | Parar o container do backend (`docker compose stop server`) e recarregar a página | Alerta vermelho "Falha ao carregar recursos"; a interface continua navegável, apenas vazia — não tela branca | | | |

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