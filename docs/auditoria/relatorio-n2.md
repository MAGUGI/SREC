# Relatório de Auditoria — SREC, entrega N2

Auditoria do sistema **SREC** (Sistema de Reserva de Espaços e Coworking),
recebido do grupo MAGUGI em `MAGUGI/SREC`, no commit `8431181`. Este documento
é a fotografia do estado em que o código chegou às nossas mãos e a base de
comparação para tudo que a N2 entrega.

Regra que vale para o documento inteiro: **nenhum número aqui é estimativa.**
Cada um veio de um comando, e o comando está escrito ao lado. Qualquer pessoa
pode reproduzir.

## 1. O que recebemos

Um sistema de reserva de estações de trabalho e salas de reunião para
coworking. Node.js 20 com Express 5 e PostgreSQL acessado por SQL cru no
backend; React 19 com Vite 8 no frontend. ESLint e Prettier configurados nos
dois pacotes, Jest no backend, GitHub Actions rodando lint, teste e build.

O sistema **funciona** no caminho feliz: cadastra espaços, cria reservas,
bloqueia sobreposição óbvia, cancela e conclui. A estrutura de pastas do
backend é legível e segue uma separação de rotas, controllers e models que
qualquer pessoa entende em dez minutos. Isso precisa ser dito, porque o resto
deste relatório é sobre o que está errado, e seria desonesto apresentar o
trabalho do grupo anterior como ruim. Ele é um v1.0 de prazo apertado, com os
problemas típicos de um v1.0 de prazo apertado.

Volume: **1.280 linhas** de código fonte (JS, JSX e CSS, fora os lock files),
das quais **853 linhas** de JS/JSX. É um sistema pequeno, e isso é uma boa
notícia: dá para auditar inteiro, linha por linha, e foi o que fizemos.

## 2. Como medimos

```bash
# backend: instalar, medir cobertura sobre TODO o fonte
cd server
npm ci
npx jest --coverage --coverageReporters=text --collectCoverageFrom='src/**/*.js'
npm run lint

# frontend: instalar, lint, build
cd ../client
npm ci --legacy-peer-deps
npm run lint
npm run build

# volume de código
find server/src client/src -type f \( -name '*.js' -o -name '*.jsx' -o -name '*.css' \) -exec wc -l {} +

# duplicação de tratamento de erro
grep -c 'catch (err)' server/src/controllers/*.js

# integridade declarada no schema
grep -ciE 'check|unique|exclude|index' server/src/config/initDb.js
```

Detalhe importante sobre a medição de cobertura: rodar `npx jest --coverage`
sem `--collectCoverageFrom` reporta **35,48 %**, porque o Jest só conta os
arquivos que algum teste importou. Esse número é enganoso e não deve ser
usado. Medindo contra todo o fonte, que é a pergunta real, o resultado é
**6,14 %**.

## 3. O veredito em uma tabela

| Métrica | Medido | Leitura |
|---|---|---|
| Cobertura de statements (backend) | **6,14 %** | praticamente nada é testado |
| Cobertura de branches (backend) | **0 %** | nenhuma decisão do código é exercitada |
| Cobertura de funções (backend) | **3,57 %** | 1 função de 28 |
| Arquivos de teste | **1** | `reservationModel.test.js` |
| Casos de teste | **2** | ambos sobre `checkAvailability`, com banco mockado |
| Cobertura dos controllers | **0 %** | toda a regra de negócio está aqui e nada é testado |
| Cobertura das rotas | **0 %** | nenhum endpoint é exercitado |
| Testes de frontend | **0** | não há infraestrutura de teste no client |
| Erros de ESLint | **0** | nos dois pacotes |
| Build do frontend | **OK** | 201,86 kB, 63,26 kB comprimido |
| Constraints de integridade no banco | **0** | nenhum CHECK, UNIQUE ou EXCLUDE |
| Índices além das chaves primárias | **0** | toda consulta filtra por colunas sem índice |
| Endpoints implementados | **10** | |
| Endpoints documentados | **5** | e 3 deles descritos errado |
| Maior arquivo | **351 linhas** | `client/src/App.jsx`, 41 % de todo o JS/JSX |
| Blocos `try/catch` idênticos | **10** | 5 em cada controller |
| Migrations versionadas | **0** | schema criado como efeito colateral do boot |
| Dockerfile / compose | **0** | ambiente montado à mão |
| Coleção de API (Swagger/Postman) | **0** | |
| Issues no repositório | **0** | |
| Commits | **10** | |

## 4. O achado mais importante

**O sistema falha na única regra de negócio que justifica sua existência.**

O SREC existe para impedir que duas pessoas reservem o mesmo espaço no mesmo
horário. Em `server/src/controllers/reservationController.js:12-28`, a criação
de uma reserva faz isto:

```js
const isAvailable = await ReservationModel.checkAvailability(resource_id, start_time, end_time);
if (!isAvailable) {
  return res.status(409).json({ error: 'Resource is not available for the selected time slot' });
}
const newReservation = await ReservationModel.create(resource_id, user_name, start_time, end_time);
```

São duas idas ao banco, separadas, sem transação. Entre a verificação e a
inserção existe uma janela em que outra requisição faz exatamente a mesma
verificação, recebe exatamente a mesma resposta, e insere também. É o padrão
clássico de *time-of-check to time-of-use*.

Normalmente o banco seria a última linha de defesa. Aqui não é: o schema em
`server/src/config/initDb.js` não tem **nenhuma** constraint de integridade —
verificado, zero ocorrências de `CHECK`, `UNIQUE` ou `EXCLUDE`. Não há nada
impedindo as duas linhas conflitantes de coexistirem.

E a fórmula de sobreposição está **certa**. O grupo anterior documentou
`Início_banco < Fim_novo AND Fim_banco > Início_novo` e implementou exatamente
isso. O defeito não é de lógica, é de arquitetura: a lógica certa foi colocada
no lugar errado.

A correção está especificada em
[`docs/specs/be-01-prevent-double-booking/`](../specs/be-01-prevent-double-booking/implementacao.md):
mover a garantia para o banco com uma constraint `EXCLUDE` sobre intervalos, e
traduzir a violação em HTTP 409.

## 5. Bugs do "Cliente"

Quinze defeitos confirmados por leitura de código, catalogados em
[`bugs-do-cliente.md`](bugs-do-cliente.md) com arquivo, linha, reprodução e
correção proposta.

| Severidade | Quantidade | Exemplos |
|---|---|---|
| **CRÍTICO** | 2 | dupla reserva sob concorrência; reserva com fim antes do início |
| **ALTO** | 5 | status arbitrário aceito; 500 em vez de 400; exclusão em cascata silenciosa; fuso horário |
| **MÉDIO** | 5 | reserva no passado; capacidade negativa; servidor sobe com banco quebrado |
| **BAIXO** | 3 | duplo clique cria duas reservas; vazamento de `setTimeout`; endpoint órfão |

Dois merecem destaque por serem contraintuitivos.

**A reserva invertida é pior do que parece.** Nada valida que `end_time` é
posterior a `start_time`. Uma reserva das 10h às 9h é aceita. E como a
condição de sobreposição é `start_time < novo_fim AND end_time > novo_início`,
um intervalo invertido **nunca satisfaz a condição** — vira uma reserva
fantasma, que ocupa espaço na listagem, não bloqueia ninguém, e não pode ser
detectada por nenhuma consulta de conflito.

**Excluir um espaço apaga o histórico.** A coluna `resource_id` tem
`ON DELETE CASCADE` (`initDb.js:16`). O botão de lixeira do frontend pergunta
apenas "Deseja realmente remover este espaço?" e, ao confirmar, apaga junto
todas as reservas daquele espaço — inclusive futuras e já concluídas. Perda de
dado sem aviso e sem trilha de auditoria.

## 6. Code smells

Quatorze catalogados em [`code-smells.md`](code-smells.md). Quatro são
estruturais e explicam todos os outros.

**CS-01, God Component.** `client/src/App.jsx` tem 351 linhas e concentra
estado, chamadas de API, duas abas, dois formulários, duas listas e toda a
renderização. É 41 % de todo o JS/JSX do projeto num arquivo só. Não existe
pasta de componentes.

**CS-02, duplicação do tratamento de erro.** Dez blocos `try/catch` idênticos
nos dois controllers, cinco em cada, todos com o mesmo
`console.error(err)` seguido de 500 `Internal server error`. Contado por
`grep`, não estimado. É por isso que o BUG-04 existe: o catch genérico
transforma erro de entrada do usuário em erro do servidor.

**CS-03, ausência de camada de serviço.** A regra de negócio mora no
controller, misturada com HTTP; o model é SQL cru. **Não há nenhum lugar onde
a regra possa ser testada sozinha.** Esta é a causa raiz dos 6,14 % de
cobertura — não é falta de disciplina do grupo anterior, é que a arquitetura
não oferece superfície de teste. Enquanto isso não mudar, escrever teste é
caro, e o que é caro não é feito.

**CS-10, lint sem dente.** O ESLint passa com **zero erros** nos dois pacotes.
Isso parece bom e não é: a configuração não tem nenhuma regra de complexidade,
tamanho de função, tamanho de arquivo, segurança ou acessibilidade. Um arquivo
de 351 linhas passa. Sete `<label>` sem `htmlFor` passam. O verde do CI não
está medindo qualidade, está medindo formatação.

## 7. A documentação não descreve o sistema

O repositório traz `Documentação Oficial SREC.md`, com MER, casos de uso e
tabela de endpoints. Confrontada linha a linha com o código, encontramos
**12 divergências**, detalhadas em
[`divergencias-doc-codigo.md`](divergencias-doc-codigo.md). As mais graves:

* O MER documenta `UUID` como chave primária. O código usa `SERIAL`.
* O MER documenta `resources.is_active`. A coluna não existe.
* O MER documenta `reservations.user_id UUID`. O código tem `user_name VARCHAR(100)`.
* A doc descreve `PUT /api/reservations/{id}/cancel`. A rota real é `PATCH /api/reservations/:id/status`.
* A doc marca `POST /api/resources` como "Nível de acesso Admin" e o diagrama de casos de uso separa Usuário de Administrador. **Não existe autenticação alguma no sistema.** Qualquer pessoa cria, edita e apaga qualquer coisa.
* A doc diz que `GET /api/reservations` lista "as reservas do usuário atual". Lista todas, de todos, porque não existe usuário.
* O guia de contribuição manda criar branch a partir de `develop`. **`develop` não existe.** Só existem `main`, `backend` e `frontend`. A CI referencia `develop` em `on.push.branches` e aquele gatilho nunca disparou.
* A doc afirma "Rastreabilidade: todas as tarefas mapeadas no Jira". O repositório tem 0 issues e não há Jira.

Isso não é detalhe de documentação. Um sistema cuja documentação promete
controle de acesso que não existe é um sistema que **parece** seguro para quem
lê o documento. Se a N2 só corrigisse código e deixasse a documentação como
está, o grupo da N3 herdaria a mesma armadilha.

## 8. O que isso significa para o planejamento da N2

A auditoria aponta para quatro frentes, nesta ordem de prioridade.

**Primeiro, fechar os dois bugs críticos.** A dupla reserva e a janela
invertida atacam a regra central do produto. Nenhuma outra melhoria importa se
o sistema erra naquilo para que foi feito.

**Segundo, criar superfície de teste antes de testar.** Não adianta mandar
alguém "aumentar a cobertura" com a arquitetura atual. A ordem é: extrair a
camada de serviço e o middleware central de erro (BE-04, BE-06), e só então
escrever a suíte (QA-01, QA-02). Invertido, o esforço de teste é desperdiçado
e jogado fora na primeira refatoração.

**Terceiro, tornar o ambiente reproduzível.** Hoje subir o sistema exige
instalar PostgreSQL na máquina, criar o banco à mão e montar o `.env`. São
sete passos manuais no README, e cada um é uma chance de alguém do time perder
uma tarde. Com `docker compose up` isso vira um passo — e o grupo da N3 recebe
um sistema que sobe no primeiro dia.

**Quarto, fazer a documentação voltar a descrever o sistema.** Fechar as 12
divergências, publicar o contrato real da API, e entregar o handoff da N3.

O desdobramento disso em 26 issues, com responsável e especificação de
implementação, está em [`docs/specs/`](../specs/) e no board do projeto.

## 9. O que deliberadamente não vamos fazer

Registrado aqui para não parecer esquecimento, e detalhado nos ADRs em
[`docs/arquitetura/decisoes.md`](../arquitetura/decisoes.md).

* **Não introduzir autenticação.** Está fora do escopo recebido e é grande
  demais para o prazo. Vira o débito de prioridade máxima da N3, com a
  ressalva de que a documentação atual promete um controle de acesso que nunca
  existiu.
* **Não trocar SQL cru por ORM.** Funciona, é legível, e trocar a camada de
  persistência inteira é reescrita, não manutenção.
* **Não ir para DDD completo.** A camada de serviço resolve o problema real
  (testabilidade) a uma fração do custo.
* **Não reescrever o frontend em TypeScript.** Tentador, e fora de escopo.

## 10. Documentos relacionados

* [Métricas de baseline](metricas-baseline.md) — a tabela completa e os comandos que a produzem
* [Bugs do Cliente](bugs-do-cliente.md) — os 15 defeitos, com reprodução
* [Code smells](code-smells.md) — os 14 achados, com evidência
* [Divergências entre documentação e código](divergencias-doc-codigo.md) — as 12 inconsistências
* [Estado atual da arquitetura](../arquitetura/estado-atual.md)
* [Arquitetura alvo](../arquitetura/arquitetura-alvo.md)
