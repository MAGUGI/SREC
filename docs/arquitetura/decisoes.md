# Registro de decisões de arquitetura — SREC N2

Cada ADR registra uma decisão tomada sobre o código recebido, com o que foi
descartado e o que a escolha custa. Um ADR não é um argumento de venda: se a
decisão tem preço, o preço está escrito.

Contexto comum a todos: recebemos o SREC de outro grupo, com **1.280 linhas**
de fonte, **6,14 %** de cobertura de statements, **2** casos de teste, **15**
bugs catalogados, **0** constraints de integridade no banco e prazo de entrega
em 23/10. O retrato completo está em [estado-atual.md](estado-atual.md) e o
destino em [arquitetura-alvo.md](arquitetura-alvo.md).

## ADR-001 — Garantir a não sobreposição de reservas no banco, com constraint `EXCLUDE`

**Contexto.** A regra central do produto é que um recurso não tem duas reservas
sobrepostas. Hoje ela é um `SELECT` da aplicação
(`server/src/models/reservationModel.js:49-61`) seguido de um `INSERT`
(`reservationModel.js:4-12`), chamados em sequência pelo controller
(`reservationController.js:12-28`) sem transação. A fórmula está correta e é a
mesma que a documentação recebida descreve; o defeito é executá-la fora de
transação e sem nada no banco segurando o resultado — BUG-01, severidade
CRÍTICO. Agrava-se com BUG-13, o duplo clique no submit (`App.jsx:87-104`), que
dispara as duas requisições concorrentes sem precisar de dois usuários.

Detalhe que fecha o diagnóstico: `server/src/config/database.js:12-14` exporta
**apenas** `{ query }`. O `pool` não é exportado e `pool.connect()` não está
acessível, então hoje nenhuma camada tem como emitir `BEGIN`/`COMMIT` — não é
um `BEGIN` esquecido, é uma transação inexpressável.

**Decisão.** Declarar a invariante no schema, via extensão `btree_gist` e
`EXCLUDE USING gist (resource_id WITH =, tstzrange(start_time, end_time)
WITH &&) WHERE (status <> 'cancelled')`. A aplicação para de decidir e passa a
**traduzir**: o `INSERT` é a verificação, e o SQLSTATE `23P01` vira 409.
Entregue por BE-01, com o mapeamento de erro em BE-04/BE-05 e o teste de
concorrência em QA-01. O predicado `status <> 'cancelled'` preserva o
comportamento atual de que cancelar libera o horário, que já está em
`reservationModel.js:53`.

**Alternativas consideradas.**

* **Transação com `SERIALIZABLE` em volta do check e do insert.** Resolve, mas
  exige expor `pool.connect()`, gerenciar `BEGIN`/`COMMIT`/`ROLLBACK` à mão em
  cada fluxo, e tratar `40001` (serialization failure) com retry. Mais código,
  mais caminhos de erro, e a garantia continua valendo só para quem passar pelo
  nosso código.
* **`SELECT ... FOR UPDATE` no recurso, ou advisory lock por `resource_id`.**
  Funciona em um processo e continua funcionando em vários, mas serializa todas
  as reservas do mesmo recurso, acrescenta uma classe de bug de deadlock e
  depende de todo caminho de escrita lembrar de pegar o lock.
* **Lock em memória no Node (mutex por `resource_id`).** Mais simples e
  completamente ilusório: quebra com dois processos, com dois contêineres e com
  qualquer escrita feita fora da API. Rejeitado.
* **Checar no front antes de enviar.** Não é garantia, é cortesia.

**Consequências.** A sobreposição passa a ser impossível por definição do
schema, inclusive para `psql`, script e segundo processo. O índice GiST que a
constraint cria cobre `checkAvailability` e `findByResourceId`, resolvendo CS-09
de graça. Em troca: passamos a depender de uma extensão do Postgres
(`btree_gist`), o que amarra o projeto ao Postgres — aceitável, nunca houve
intenção de portabilidade. O ambiente de teste precisa de Postgres real, não
mock (ver ADR-009). E há um custo de desenho que é fácil esquecer: a mensagem de
erro do banco é genérica, então a mensagem útil para o usuário ("o recurso já
está reservado das 14h às 15h") exige uma consulta extra no caminho de erro, ou
aceitar uma mensagem mais pobre. Escolhemos aceitar a mensagem mais pobre nesta
entrega. Por fim, a constraint é aplicada por migration sobre dado existente: se
a base já tiver sobreposição gravada (e, com BUG-01 em produção, pode ter), a
migration **falha** até o dado ser limpo. Isso é um recurso, não um defeito, mas
precisa estar no runbook.

## ADR-002 — Manter SQL cru e não introduzir ORM nesta entrega

**Contexto.** Os models são 108 linhas de SQL cru em dois objetos literais
(`resourceModel.js`, 44 linhas; `reservationModel.js`, 64 linhas). Usam
parâmetros posicionais (`$1`, `$2`) em todas as queries, então não há injeção
de SQL. A crítica legítima a eles é outra: não há camada abaixo garantindo nada
(ADR-001) e o `UPDATE` de recurso escreve as três colunas sempre
(`resourceModel.js:26-35`), o que produz BUG-05 com corpo parcial.

**Decisão.** Manter `pg` com SQL cru. Nenhum ORM ou query builder entra na N2.

**Alternativas consideradas.**

* **Prisma.** Traria migrations, tipos e um client agradável. Também traria
  reescrita dos 12 métodos de model, um schema declarativo novo, um passo de
  geração no build e, principalmente, um problema com ADR-001: constraint
  `EXCLUDE` não é expressável no schema do Prisma e exigiria
  `migration.sql` cru de qualquer forma. Ganharíamos abstração e perderíamos o
  controle sobre a única coisa que realmente importa nesta entrega.
* **Knex ou Kysely.** Menor que Prisma, mas ainda assim reescreve 12 métodos
  para ganhar encadeamento de query em um sistema com duas tabelas.
* **Sequelize.** Mesma reescrita, com ergonomia mais antiga.

**Consequências.** O diff da N2 fica concentrado onde o defeito está, e cada PR
continua pequeno e revisável pelo QA. Mantemos controle total sobre o SQL,
necessário para `EXCLUDE`, `tstzrange` e o índice GiST. O custo é real e fica:
continuamos montando string SQL à mão, sem checagem de tipo entre coluna e
JavaScript, sem proteção contra erro de digitação em nome de coluna — um
`SELECT namee` só falha em runtime. A conversão de tipo fica por conta do driver
`pg`, o que é justamente a origem de BUG-04 (`22P02` em `:id` não numérico, que
tratamos no middleware em vez de no acesso a dados). E não ganhamos migrations
de brinde, por isso ADR-003 existe separadamente.

## ADR-003 — Adotar migrations versionadas e tirar o `initDb.js` do caminho de boot

**Contexto.** O schema nasce de `server/src/config/initDb.js`, chamado com
`await initDb()` antes do `app.listen` (`index.js:26-31`). O DDL usa
`CREATE TABLE IF NOT EXISTS` (`initDb.js:5` e `initDb.js:14`), portanto da
segunda subida em diante é no-op: não existe forma de adicionar uma coluna, um
`CHECK` ou um índice de maneira reprodutível (CS-06). O `catch` engole o erro
de DDL (`initDb.js:28-30`), então o servidor sobe e anuncia
`Server is running on port 5000` mesmo que a tabela não exista — BUG-11. E
ADR-001 exige, por definição, alterar o schema de uma base já existente.

**Decisão.** Adotar `node-pg-migrate` com arquivos versionados em
`server/migrations/`, e remover `initDb()` do caminho de boot. A primeira
migration reproduz o schema atual exatamente como está em `initDb.js:5-23`, para
que uma base existente não seja alterada por engano; as seguintes acrescentam as
constraints de BE-01, BE-02, BE-03 e a conversão de BE-07. Entregue por OPS-02,
com o passo de `migrate up` no compose (OPS-01) e na CI (OPS-03).

**Alternativas consideradas.**

* **Manter `initDb.js` e só acrescentar `ALTER TABLE ... IF NOT EXISTS`.** É o
  caminho de menor esforço e reconstrói o problema: a cada entrega o arquivo
  cresce, nada é versionado, e a ordem de aplicação é implícita.
* **Flyway ou Liquibase.** Maduros e com bom suporte a rollback. Introduzem JVM
  e XML/YAML em um projeto Node de 853 linhas de JS.
* **Migrations na mão, com `.sql` numerado e um script próprio.** Zero
  dependência, mas reescreveríamos o controle de versão de schema — incluindo a
  tabela de controle, o lock de concorrência e a ordenação — que é exatamente o
  que a biblioteca entrega.

**Consequências.** O schema passa a ser revisado em PR, aplicável de forma
idêntica em máquina de desenvolvedor, no compose e na CI, e a falha de migration
passa a impedir a subida em vez de ser engolida. O custo: entra uma dependência
nova e um **passo obrigatório** no fluxo — quem não rodar `migrate up` depois de
dar `pull` recebe um erro de coluna inexistente, e isso vai acontecer com
alguém. É também uma mudança de hábito no meio de uma entrega curta, com o
agravante de que o grupo da N3 herda uma convenção que precisa ser explicada no
handoff. Migration mal escrita em produção é mais perigosa que `CREATE TABLE IF
NOT EXISTS`, porque de fato altera dado.

## ADR-004 — Introduzir camada de serviço sem ir para DDD completo

**Contexto.** A regra de negócio mora no controller. `reservationController.js`
valida presença de campo (linhas 7-9), decide a disponibilidade (12-21) e
monta a resposta (29), e `resourceController.js:10` carrega o default de
capacidade. É CS-03, e a consequência é medida: **0 %** de cobertura em
`controllers/`, porque testar a regra exige subir Express e mockar `pg`. Os 2
testes que existem são do model, com `jest.mock('../config/database')` —
testam a função JavaScript, não a regra.

**Decisão.** Criar `services/` como dona da regra de negócio e `domain/` com
funções puras e enums. O controller vira adaptador HTTP: lê `req`, chama o
service, responde. Nada mais. Entregue por BE-06 e BE-03, testado por QA-02.

**Alternativas consideradas.**

* **DDD completo** — entidades ricas, agregados, value objects, repositórios com
  interface, inversão de dependência. Em um sistema de 2 tabelas e 10
  endpoints, o custo de cerimônia excede o benefício por uma margem larga, e a
  N2 é manutenção, não reescrita.
* **Arquitetura hexagonal com ports e adapters.** Mesma objeção: resolveria um
  problema de substituição de infraestrutura que não temos — o Postgres não vai
  sair (ADR-001 o amarra de propósito).
* **Deixar a regra no controller e só extrair funções auxiliares.** Diff menor,
  mas a regra continua amarrada ao `req`/`res` e continua intestável sem HTTP.
  Não resolve CS-03, só o maquia.

**Consequências.** A regra de reserva passa a ser testável sem banco e sem
Express, o que é o único caminho barato para sair de 0 % de branches. `domain/`
dá um lugar único para o enum de status, matando os literais espalhados
(CS-05). O custo: **mais uma camada** e mais arquivos em um projeto pequeno —
uma criação de recurso passa a atravessar route → middleware → controller →
service → model, cinco saltos para um `INSERT`. Em parte dos casos o service
vai ser repasse quase puro para o model, o que parece (e é) cerimônia. Aceitamos
porque o service é onde a tradução de `23P01` em 409 precisa morar, e porque sem
ele a cobertura não sai do lugar. Risco de médio prazo: sem disciplina, a regra
vaza de volta para o controller na próxima entrega — por isso o handoff precisa
dizer explicitamente onde a regra mora.

## ADR-005 — Migrar para `TIMESTAMPTZ` e padronizar ISO 8601 com offset na API

**Contexto.** `start_time` e `end_time` são `TIMESTAMP` sem fuso
(`initDb.js:18-19`). O front manda o valor cru de um
`<input type="datetime-local">` (`App.jsx:264` e `App.jsx:274`), que não tem
offset, e lê de volta com `new Date(...).toLocaleString('pt-BR')`
(`App.jsx:303-304`), que interpreta a string sem fuso segundo o fuso do
navegador. Servidor e navegador em fusos diferentes produzem um horário exibido
diferente do horário reservado — BUG-07. `created_at`/`updated_at` herdam o
mesmo tipo e o mesmo problema.

**Decisão.** Converter todas as colunas de tempo para `TIMESTAMPTZ` por
migration e fixar no contrato da API que todo instante entra e sai em ISO 8601
**com offset** (`2026-10-23T14:00:00-03:00`). O front compõe o offset local
antes de enviar. Entregue por BE-07, com a conversão em OPS-02.

**Alternativas consideradas.**

* **Guardar tudo em UTC em coluna `TIMESTAMP` e converter na aplicação.**
  Funciona e transfere a responsabilidade para todo chamador presente e futuro.
  Um único lugar que esqueça de converter reintroduz o bug silenciosamente, e
  nada no banco detecta.
* **Guardar `TIMESTAMPTZ` mas aceitar entrada sem offset, assumindo
  `America/Sao_Paulo`.** Menos atrito no front e uma premissa escondida no
  backend; quebra no dia em que houver usuário em outro fuso, e quebra sem
  mensagem de erro.
* **Não mexer, por ser sistema de uso local.** É a tentação: o coworking é num
  fuso só, e o bug não aparece na máquina de ninguém. Rejeitado porque a correção
  é uma migration e o defeito é do tipo que só aparece em produção, com dado
  real, e com reserva errada na cara do cliente.

**Consequências.** O instante deixa de depender de quem gravou e o tipo do banco
passa a documentar a semântica. O `tstzrange` de ADR-001 pede `TIMESTAMPTZ`, o
que torna as duas decisões solidárias. Custo: a conversão
`TIMESTAMP → TIMESTAMPTZ` em base com dado existente **interpreta** os valores
antigos no fuso da sessão de migration, então o `AT TIME ZONE` tem que ser
explícito na migration ou o dado histórico desloca. É uma mudança **quebrante de
contrato**: cliente que mandava `2026-10-23T14:00` passa a precisar do offset, e
o único cliente é o nosso front — mas qualquer coleção de requisições ou script
do grupo anterior para de funcionar. O `datetime-local` continua sendo o input,
porque trocá-lo por um seletor com fuso é escopo de produto, não de correção de
bug; então o front ganha um ponto de composição de offset que precisa de teste.

## ADR-006 — Tratar erro em middleware central, mapeando SQLSTATE para HTTP

**Contexto.** Há **10 blocos `try/catch` idênticos** nos controllers, 5 em cada
(`resourceController.js` linhas 12-15, 22-25, 36-39, 51-54, 65-68;
`reservationController.js` linhas 30-33, 40-43, 54-57, 69-72, 83-86). Todos
fazem `console.error(err)` e respondem
`500 {"error":"Internal server error"}` — é CS-02 e é destrutivo: apaga a
informação do erro. `GET /api/resources/abc` gera `22P02` no Postgres e chega ao
cliente como 500 em vez de 400, nas 6 rotas com `:id` (BUG-04); `PUT` com corpo
parcial viola `NOT NULL` e também vira 500 em vez de 400 (BUG-05). Express 5
encaminharia a rejeição de handler `async` para um middleware de erro
automaticamente, mas como os 10 handlers capturam antes, o mecanismo nunca é
exercitado e não há middleware registrado em `index.js` para receber.

**Decisão.** Uma classe `AppError` com código e status, um `asyncHandler` que
embrulha os handlers e encaminha a rejeição para o `next`, e um `errorHandler`
registrado como último `app.use` — o **único** lugar do backend que decide
status HTTP a partir de erro. Ele mapeia `AppError` para o status declarado,
SQLSTATE conhecido para o status correspondente (`23P01` → 409, `23514` → 400,
`23503` → 409 ou 404, `22P02` → 400) e qualquer outra coisa para 500 genérico,
sem vazar detalhe interno. Mais `validateIdParam` como middleware de rota, que
rejeita `:id` não numérico com 400 antes de qualquer query. Entregue por BE-04 e
BE-05.

**Alternativas consideradas.**

* **Manter try/catch por rota e só melhorar cada um.** 10 lugares para manter,
  10 lugares para esquecer. A duplicação é a causa, não o sintoma.
* **Checar `err.code` dentro de cada service.** Mantém a lógica de HTTP
  espalhada pela regra de negócio, que é a mistura que ADR-004 está desfazendo.
* **`express-async-errors` ou similar via patch global.** Elimina o
  `asyncHandler` explícito à custa de monkey-patch no Express; 15 linhas
  próprias e legíveis valem mais que uma dependência que altera comportamento de
  framework por efeito colateral de `require`.

**Consequências.** Os controllers encolhem, a tabela de códigos de resposta vira
documentação executável e o 409 de reserva sobreposta passa a ser derivado de
fato (`23P01`), não de opinião. O custo: acoplamos o `errorHandler` a códigos de
erro do Postgres, isto é, a aplicação passa a conhecer SQLSTATE — é
vazamento de abstração, assumido deliberadamente em troca de correção, e é a
contrapartida honesta de ADR-002. Há também o risco de mapeamento genérico
demais: `23503` (violação de FK) pode significar "recurso não existe" (404) ou
"não é possível excluir" (409) dependendo do caminho, então o mapa precisa ser
lido com cuidado e, em alguns casos, a origem precisa lançar `AppError`
explícito em vez de confiar no mapa. E um `asyncHandler` esquecido em uma rota
nova volta a produzir 500 silencioso — é o tipo de erro que só o teste de
integração de QA-01 pega.

## ADR-007 — Não introduzir autenticação na N2, e registrar como débito prioritário da N3

**Contexto.** A `Documentação Oficial SREC.md` recebida marca
`POST /api/resources` como "Nível de acesso Admin", separa Usuário e
Administrador no diagrama de casos de uso, documenta `reservations.user_id UUID`
no MER e afirma que `GET /api/reservations` lista "as reservas do usuário
atual". Nenhuma dessas coisas existe. O código não tem tabela de usuário, não
tem sessão, não tem token, não tem middleware de autorização; `GET
/api/reservations` (`reservationController.js:36-44` →
`reservationModel.js:14-18`) faz `SELECT * FROM reservations ORDER BY
start_time ASC` e devolve tudo de todos. A "identidade" é
`reservations.user_name VARCHAR(100)`, digitado em um `<input type="text">`
(`App.jsx:252-259`): qualquer pessoa cancela ou exclui a reserva de qualquer
outra, porque não há de quem a reserva seja.

**Decisão.** Não introduzir autenticação nesta entrega. Em vez disso: **corrigir
a documentação recebida** para descrever o sistema que existe (sem papéis, sem
Admin, sem usuário), registrar a ausência de autenticação como item de
severidade mais alta em `docs/time/divida-tecnica.md`, e entregá-la em
`docs/handoff/` como débito prioritário número 1 da N3.

**Alternativas consideradas.**

* **Implementar JWT com tabela de usuário, login e proteção das 10 rotas.** É a
  decisão "certa" em abstrato e impossível em concreto: exige modelar usuário,
  substituir `user_name` por FK para `users`, migrar dado existente, construir
  tela de login e registro no front, proteger 10 rotas e testar tudo isso — em
  um prazo que já contém BE-01 a BE-08, FE-01 a FE-05, OPS-01 a OPS-05 e QA-01 a
  QA-02. Autenticação é **feature**, e a rubrica da N2 pontua correção de bug e
  redução de dívida no código recebido, não funcionalidade nova.
* **Meia-autenticação: uma chave fixa em header, ou Basic Auth no `/api`.**
  Pior dos mundos. Dá aparência de segurança, não tem associação entre usuário e
  reserva (que é o problema real), e cria a ilusão de item resolvido — o grupo
  da N3 lê "tem auth" e não revisa.
* **Deixar a documentação como está, mencionando Admin.** Rejeitado sem
  discussão: é a divergência doc-código mais grave do pacote recebido. Documento
  que promete controle de acesso inexistente é pior que documento ausente,
  porque desarma o próximo leitor.

**Consequências.** O escopo da N2 permanece executável e o pitch defende
melhorias medidas em vez de uma feature pela metade. O custo é explícito e
desconfortável: **ao fim da N2 o SREC continua sendo um sistema sem controle de
acesso**, em que qualquer pessoa cancela a reserva de qualquer outra, e nenhum
dos nossos números de melhoria muda isso. Também significa que `user_name`
continua como texto livre, com todos os problemas de dado (duas pessoas com o
mesmo nome, nome digitado errado, reserva sem dono rastreável) que a N3 vai
herdar junto com o dado já gravado. Mitigação parcial: BE-08 fecha o CORS por
allowlist e acrescenta rate limit, o que reduz a superfície de abuso — reduz,
não resolve, e dizer o contrário seria falso.

## ADR-008 — Vendorizar o time de agentes de IA em `.claude/` dentro do repositório

**Contexto.** Na N1 o time de agentes de IA (skills, agents, commands) vivia
como plugin externo, instalado por máquina. Três problemas apareceram na
prática: **instalação por máquina** — cada pessoa precisava instalar e manter
atualizado, e quem não instalava trabalhava sem as convenções; **propagação por
versão** — corrigir uma skill significava publicar e pedir que todos
atualizassem, sem garantia de que a versão em uso fosse a mesma em revisão; e
**handoff** — na troca de projeto entre grupos, o repositório viajava e o plugin
não, então o grupo seguinte recebia código sem o ferramental que o produziu.

**Decisão.** Vendorizar: `.claude/` versionado na raiz do repositório, com
skills, agents e commands junto do código a que se aplicam, mais um `CLAUDE.md`
na raiz como orientação de entrada. Quem clona o repositório recebe o time de
agentes no mesmo `git clone`, na versão exata daquele commit. Mudança de skill é
PR, revisada e aprovada pelo QA como qualquer outra alteração.

**Alternativas consideradas.**

* **Manter o plugin externo da N1.** Já conhecido e já medido nos três problemas
  acima.
* **Submódulo git apontando para um repositório de skills.** Mantém uma fonte
  única e reintroduz um passo de instalação (`--recurse-submodules`), com o
  modo de falha clássico de submódulo em ponteiro desatualizado e silencioso.
* **Não usar agentes nesta entrega.** Descartado: o volume de artefatos da N2
  — auditoria, 20 specs de implementação, documentação de arquitetura, handoff —
  não cabe no prazo sem ferramental.

**Consequências.** Onboarding de zero passo, versão do ferramental amarrada à
versão do código, histórico de evolução das skills no mesmo log do projeto, e o
grupo da N3 recebe o ferramental junto com o sistema — que é o critério que a
rubrica cobra em "clareza nas alterações feitas, para a N3". Os custos: o
repositório carrega arquivos que **não são** o produto, e `.claude/` compete por
atenção com `server/` e `client/` na raiz; o conteúdo vira **fork por projeto**,
então uma melhoria de skill feita aqui não chega automaticamente a outro
repositório do time e tende a divergir; e PRs de skill aparecem no mesmo
histórico dos PRs de código, o que torna a leitura do log menos limpa. Há
também o risco de o próximo grupo tratar `.claude/` como peso morto e apagá-lo
sem entender para que serve — por isso o `CLAUDE.md` da raiz existe e por isso o
handoff tem que explicar a pasta, não só listá-la.

## ADR-009 — Testar com Supertest contra Postgres real, em vez de mockar o `pg`

**Contexto.** Os 2 testes existentes
(`server/src/models/reservationModel.test.js`) usam
`jest.mock('../config/database')` e devolvem `{ rows: [] }` ou
`{ rows: [{id:1}] }` no `db.query`. Eles verificam que `checkAvailability`
converte linha em booleano — a fórmula SQL de sobreposição
(`reservationModel.js:55`) **nunca é executada**. Cobertura de `controllers/` e
de `routes/`: **0 %**. Pior para a N2: ADR-001 põe a garantia dentro do banco,
e um teste que mocka o banco **não consegue nem falhar** antes da correção, o
que viola a exigência de ter o teste que falha antes.

**Decisão.** A suíte de integração de QA-01 roda com Supertest contra um
Postgres real, com migrations aplicadas, em contêiner no compose (OPS-01) e como
serviço do job na CI (OPS-03). O teste de dupla reserva dispara dois `POST`
concorrentes e exige exatamente um 201 e um 409. Os testes puros de domínio
(QA-02) continuam sem banco, sobre `domain/`. `supertest` já está em
`server/package.json:32` e não é usado por arquivo nenhum — a dependência está
instalada e parada.

**Alternativas consideradas.**

* **Continuar mockando `pg`.** Rápido, não exige infraestrutura e é incapaz de
  verificar a única coisa que a N2 precisa provar.
* **`pg-mem` ou SQLite em memória.** Rápidos e não implementam
  `EXCLUDE USING gist` nem `tstzrange` — justamente as features de que
  dependemos.
* **Testcontainers.** Mais isolamento por teste, à custa de outra dependência e
  de tempo de subida; o serviço Postgres nativo do GitHub Actions entrega o
  mesmo para o nosso tamanho.

**Consequências.** A suíte passa a provar comportamento de ponta a ponta,
incluindo as constraints, os códigos HTTP de BE-05 e a concorrência de BE-01, e
cada bug corrigido ganha um teste que falha antes. O custo: os testes deixam de
ser executáveis com um `npm test` seco — precisam de banco, de migration
aplicada e de limpeza entre casos, e quem não tiver Docker não roda a suíte
inteira. São mais lentos que mocks, e teste de concorrência é, por natureza,
o candidato mais provável a ficar intermitente; se ficar, a CI fica vermelha por
motivo errado e o time aprende a ignorar vermelho — que é o pior resultado
possível. A mitigação é manter o teste de concorrência determinístico
(`Promise.all` de dois `POST` com a mesma janela, asserção sobre o
**conjunto** de respostas, não sobre a ordem).

## ADR-010 — Docker Compose como caminho oficial de onboarding

**Contexto.** O onboarding recebido é manual (`README.md:40-63`): instalar
Postgres, criar a base `srec` à mão, copiar `.env.example` para `.env`, `npm
install` em duas pastas, subir dois processos. Não há `Dockerfile` nem
`docker-compose.yml`. A rubrica da N2 vale **1,5 ponto** por "o grupo conseguiu
subir o sistema do colega", e ADR-003 e ADR-009 acrescentam dois passos novos
(migration e banco de teste) ao que já era manual.

**Decisão.** `docker compose up` passa a ser o caminho oficial, subindo
Postgres, o job de migration, o server e o client. O caminho manual continua
documentado como alternativa. Entregue por OPS-01.

**Alternativas consideradas.**

* **Script de setup (`setup.sh`).** Menos dependência, mas tem que lidar com
  Windows, macOS e Linux, com Postgres instalado ou não, e com versões
  diferentes — é um compose pior, escrito por nós.
* **Só documentar melhor o caminho manual.** Não remove nenhum passo, e o
  problema é a quantidade de passos.

**Consequências.** Onboarding de um comando, ambiente idêntico entre as pessoas
e paridade com o que a CI executa — e o grupo da N3 sobe o sistema sem depender
de quem escreveu. O custo: **Docker passa a ser requisito** de máquina, e quem
não tiver cai no caminho manual, que fica menos exercitado e, portanto, mais
propenso a apodrecer sem ninguém notar. Acrescenta arquivos de infraestrutura
que precisam ser mantidos junto com o código, e hot reload dentro de contêiner
exige mapeamento de volume que às vezes se comporta diferente em Windows — o
atrito sai do onboarding e aparece no dia a dia.

## ADR-011 — Portões de qualidade na CI, com limiar de cobertura

**Contexto.** A CI recebida (`.github/workflows/ci.yml`) roda `lint` e `test` no
server e `lint` e `build` no client. Não há limiar de cobertura, então os
**6,14 %** de statements e **0 %** de branches passam verde. O gatilho é
`[main, develop]` (linhas 5-7) e **`develop` não existe** no repositório — só
`main`, `backend` e `frontend`. O ESLint do client tem 3 regras além do
`recommended` (`client/eslint.config.js:24-32`), nenhuma sobre complexidade,
tamanho de arquivo, segurança ou acessibilidade (CS-10), e `App.jsx` carrega 2
`eslint-disable-next-line` (linhas 54 e 56) que silenciam avisos legítimos.

**Decisão.** A CI passa a reprovar PR que deixe a cobertura abaixo do limiar
acordado, roda a suíte de integração com serviço Postgres, e o gatilho é
corrigido para refletir os branches que existem. Entregue por OPS-03, com a
proteção de branch e a exigência de aprovação do QA em OPS-05.

**Alternativas consideradas.**

* **Manter a CI informativa, sem portão.** É o estado atual, e é por isso que
  6,14 % nunca incomodou ninguém.
* **Limiar alto desde já (80 %).** Honesto como meta e suicida como portão no
  prazo da N2: trava todo PR, inclusive os que corrigem bug, e o time desliga o
  portão no segundo dia.
* **Só exigir que a cobertura não caia (delta).** Elegante, mas de 6,14 % quase
  qualquer coisa é subida — não pressiona o suficiente onde dói (controllers e
  rotas em 0 %).

**Consequências.** Melhoria de qualidade passa a ser verificada por máquina, não
prometida em reunião, e o número do pitch sai do mesmo comando que o portão —
sem discussão sobre qual medição vale. O custo: PR legítimo pode ficar vermelho
por cobertura e não por defeito, o que gasta tempo de quem está corrigindo bug;
a CI fica mais lenta por causa do Postgres de ADR-009; e o limiar é um número
negociado, portanto arbitrário — alto demais vira obstáculo, baixo demais vira
teatro. Também cria um incentivo ruim que precisa de vigilância do QA na
revisão: teste escrito para subir percentual em vez de verificar comportamento.

## ADR-012 — Quebrar o frontend por feature com hooks, sem roteador e sem estado global

**Contexto.** `client/src/App.jsx` tem **351 linhas** — 41 % de todo o JS/JSX —
com 12 `useState` (linhas 15-30), 1 `useEffect` (53-57), 5 handlers de mutação e
duas telas inteiras renderizadas por ternário de `activeTab` (linhas 157 e 230).
Não existe pasta `components/`. Os 5 handlers terminam chamando `loadData()`
(linhas 70, 81, 100, 110, 121), que refaz as duas listas completas: **3 viagens
de rede por mutação**, 1 escrita e 2 leituras (CS-01, CS-08).

**Decisão.** Quebrar por feature — `features/resources/` e
`features/reservations/`, cada uma com formulário, lista e um hook próprio de
estado de servidor — e manter `App.jsx` apenas como layout e composição. **Sem**
`react-router` e **sem** gerenciador de estado global (Redux, Zustand) ou
biblioteca de dado remoto (React Query). Entregue por FE-01, com apoio de FE-02
a FE-05.

**Alternativas consideradas.**

* **Introduzir React Query.** Resolveria cache, invalidação e estado de
  carregamento de forma correta, e é a resposta certa para CS-08 em um projeto
  maior. Em duas listas e cinco mutações, é uma dependência e um modelo mental
  novos para o grupo da N3 herdar — e a N2 é manutenção.
* **Introduzir `react-router` e transformar as abas em rotas.** Deixaria a aba
  linkável e acrescentaria uma dependência, um novo conceito e um `BrowserRouter`
  a configurar, para resolver um problema que ninguém relatou.
* **Reescrever o front.** Fora de escopo por definição.

**Consequências.** `App.jsx` sai de God Component, cada feature fica testável
isoladamente, e BUG-13 (submit sem trava) e BUG-14 (`setTimeout` sem cleanup)
passam a ter um lugar natural para serem corrigidos — o componente de formulário
e o `useFeedback`. O custo: a aba continua sendo estado local, logo **não está na
URL e não é compartilhável por link**, e um botão "voltar" do navegador continua
saindo da aplicação em vez de voltar de aba. O cache de dado remoto fica por
nossa conta nos hooks, à mão, sem deduplicação de requisição nem revalidação —
melhor que o refetch total atual e pior que uma biblioteca dedicada. E a quebra
por feature é a mudança com maior volume de diff da N2 sem **nenhum** teste de
frontend por baixo (hoje: **0** testes de front), então ela se apoia em revisão
e teste manual — é o risco mais alto da entrega, e vale reconhecê-lo como tal.

## ADR-013 — Corrigir a documentação recebida em vez de tentar fazer o código casar com ela

**Contexto.** A `Documentação Oficial SREC.md` recebida divergia do código em
**12 pontos**: MER com `UUID` onde o código usa `SERIAL`;
`resources.is_active BOOLEAN` que não existe; `reservations.user_id UUID` onde
há `user_name VARCHAR(100)`; `PUT /api/reservations/{id}/cancel` onde há
`PATCH /api/reservations/:id/status`; 5 endpoints documentados contra **10**
implementados; papéis de acesso inexistentes; "rastreabilidade no Jira" em um
repositório com **0 issues**; contribuição a partir de um branch `develop` que
não existe; "Clean Code com separação estrita de responsabilidades" convivendo
com CS-01 e CS-03; "testes unitários automatizados de domínio" com 2 testes e
6,14 % de cobertura.

**Decisão.** Onde documento e código divergem, **o código vence**: corrigimos o
documento. As exceções são os pontos em que a divergência aponta um defeito
real, e aí corrigimos o código com spec própria — foi o caso da sobreposição de
reservas, cuja fórmula documentada confere com a implementada e cujo defeito está
em executá-la fora de transação (ADR-001). Mudanças de modelo pedidas só pelo
documento (`UUID` como PK, `user_id`, `is_active`) **não** entram.

**Alternativas consideradas.**

* **Fazer o código casar com o documento.** Migrar PK de duas tabelas de
  `SERIAL` para `UUID`, criar `users` com `user_id`, acrescentar `is_active`,
  renomear endpoint. É reescrita disfarçada de conformidade, e o ganho funcional
  é zero — nenhum desses itens corrige um bug catalogado.
* **Deixar o documento como está e escrever um novo ao lado.** Produz duas
  fontes de verdade, que é exatamente o que a convenção de "uma casa canônica por
  assunto" existe para evitar.
* **Apagar o documento recebido.** Perderia o rastro histórico do que o grupo
  anterior pretendeu — útil para entender a intenção e para o diagnóstico.

**Consequências.** A documentação volta a ser confiável, o que é o que a rubrica
cobra em "atualização dos diagramas/README e clareza para a N3", e as 12
divergências ficam registradas em `docs/auditoria/` como achado de auditoria —
viram evidência do pitch em vez de ruído. O custo: a intenção original do grupo
anterior fica rebaixada a nota histórica, e alguns itens que o documento pedia
eram, na verdade, **boas ideias** — `is_active` em `resources` é precisamente a
saída para BUG-06 (`ON DELETE CASCADE` apagando histórico), e `user_id` é o
começo de ADR-007. Decidir "o código vence" fecha a divergência de documentação
e **não** fecha o débito de produto: esses dois itens vão para o handoff como
alvo da N3, não como coisa resolvida.
