# Divergências entre a documentação recebida e o código

O repositório recebido traz `Documentação Oficial SREC.md`, com visão de
produto, user stories, diagrama de casos de uso, MER e tabela de endpoints.
Confrontado linha a linha com o código do commit `8431181`, o documento
**descreve um sistema diferente do que existe**.

Doze divergências confirmadas. Nenhuma é sutil.

Isso importa além da estética: um documento que promete controle de acesso faz
o sistema **parecer** seguro para quem o lê. Se a N2 corrigisse só o código e
deixasse o documento, o grupo da N3 herdaria a mesma armadilha — e herdaria
pior, porque teria dois documentos errados em vez de um.

**Política adotada:** o código real e o comportamento observado têm prioridade.
Onde divergirem, corrige-se o documento, não se repete a informação
desatualizada. Onde o documento descrever algo desejável que não existe, vira
requisito com situação explícita ou débito registrado — nunca ficção mantida.

---

## Quadro de rastreamento

| # | O que a doc afirma | O que o código faz | Resolução |
|---|---|---|---|
| D-01 | MER: `UUID id PK` nas duas tabelas | `id SERIAL PRIMARY KEY` (inteiro) | Corrigir a doc (REQ-02) |
| D-02 | MER: `RESOURCE.is_active BOOLEAN` | coluna não existe | Corrigir a doc; avaliar implementar em BE-08 (ver BUG-06) |
| D-03 | MER: `RESERVATION.user_id UUID` | `user_name VARCHAR(100)` | Corrigir a doc; usuário identificado vira débito da N3 |
| D-04 | `PUT /api/reservations/{id}/cancel` | `PATCH /api/reservations/:id/status` | Corrigir a doc (REQ-03) |
| D-05 | `GET /api/reservations` lista "as reservas do usuário atual" | lista todas, de todos | Corrigir a doc; não há usuário |
| D-06 | `POST /api/resources` é "Nível de acesso Admin" | sem autenticação alguma | Corrigir a doc; autenticação vira débito prioritário da N3 |
| D-07 | 5 endpoints documentados | 10 implementados | Corrigir a doc (REQ-03, OpenAPI) |
| D-08 | Casos de uso separam Usuário e Administrador | não há papéis no sistema | Corrigir o diagrama (REQ-01) |
| D-09 | "Rastreabilidade: tarefas mapeadas no Jira" | 0 issues, não há Jira | Corrigir a doc; backlog passa a viver no GitHub Project |
| D-10 | "crie uma branch a partir da `develop`" | `develop` não existe | Corrigir a doc; adotar Trunk-Based (OPS-05) |
| D-11 | "Clean Code: separação estrita de responsabilidades" | ver CS-01 e CS-03 | Corrigir o código (FE-01, BE-06) |
| D-12 | "Testes unitários automatizados de domínio via Jest" | 2 testes, 6,14 % de cobertura | Corrigir o código (QA-01, QA-02) |

---

## As que mudam o entendimento do sistema

### D-06 — O sistema não tem controle de acesso

`Documentação Oficial SREC.md:109` marca `POST /api/resources` como
"Cadastra um novo espaço - Nível de acesso Admin", e o diagrama de casos de
uso (linhas 36-55) distingue `admin` de `user`, com `UC4 Gerenciar Espaços -
CRUD` ligado só ao administrador.

No código: não existe middleware de autenticação, não existe token, não existe
sessão, não existe tabela de usuário. `server/src/index.js` registra `cors()`,
`express.json()` e as duas rotas. Qualquer pessoa com acesso à porta 5000 cria,
edita e apaga qualquer espaço e qualquer reserva.

Esta é a divergência mais séria do conjunto. É a diferença entre "o sistema
tem uma falha de autorização" e "o sistema nunca teve autorização" — e só a
segunda é verdade.

**Encaminhamento:** documentar a ausência como RNF com situação
`documentado mas inexistente` (REQ-01); registrar autenticação como débito de
prioridade máxima da N3 (ADR-07); **não** implementar na N2, porque está fora
do escopo recebido e não cabe no prazo.

### D-03 e D-05 — Não existe noção de usuário

A doc modela `user_id UUID` e descreve a listagem como "do usuário atual". O
código tem `user_name VARCHAR(100)`, um texto livre digitado no formulário
(`App.jsx:252-259`), sem unicidade, sem vínculo e sem validação. Duas pessoas
chamadas "Carlos Silva" são a mesma coisa para o sistema; "carlos silva" e
"Carlos Silva" são pessoas diferentes.

Consequência prática que precisa constar no handoff: **não há como listar "as
minhas reservas"**, nem como impedir alguém de cancelar a reserva de outro.
Decorre direto de D-06.

### D-10 — O fluxo de git documentado não existe

O guia de contribuição (linha 153) manda criar branch a partir de `develop`.
As branches reais do repositório são `main`, `backend` e `frontend` —
`develop` nunca foi criada. E `.github/workflows/ci.yml` dispara em
`[ main, develop ]`, ou seja, metade do gatilho da CI aponta para uma branch
inexistente desde o primeiro commit.

Na prática o grupo anterior trabalhou com duas branches longas por camada
(`backend` e `frontend`), mergeadas uma vez cada via PR #1 e #2. Não é Git
Flow nem Trunk-Based; é um fluxo de entrega única.

**Encaminhamento:** adotar Trunk-Based Development explicitamente, com `main`
como único branch longevo, e corrigir o gatilho da CI (OPS-03, OPS-05).

### D-01 — `UUID` contra `SERIAL`

Parece detalhe e não é, por dois motivos. Primeiro, é a origem do BUG-04:
`SERIAL` é inteiro, então `GET /api/resources/abc` faz o Postgres explodir com
`invalid input syntax for type integer`; com `UUID` o sintoma seria outro.
Segundo, o frontend compara `r.id === rev.resource_id` (`App.jsx:293`) com
igualdade estrita entre números vindos da API, enquanto `selectedResourceId`
guarda a string do `<select>` (`App.jsx:240`) — um descuido que só não
quebrou porque o Postgres faz a coerção no `INSERT`.

Mantemos `SERIAL`. Trocar o tipo de chave primária de um sistema em
funcionamento é reescrita, não manutenção, e não resolve nenhum bug do
catálogo.

---

## O que confere

Vale registrar, porque auditoria que só encontra defeito é auditoria mal feita.

A **fórmula anti-sobreposição está correta e corretamente documentada.**
`Documentação Oficial SREC.md:72` declara:

```text
Início_banco < Fim_novo AND Fim_banco > Início_novo
```

E `reservationModel.js:52-55` implementa exatamente isso:

```sql
AND ((start_time < $3 AND end_time > $2))
```

Inclusive com o comportamento certo nas bordas: uma reserva que termina às
10:00 e outra que começa às 10:00 **não** conflitam, que é o resultado
desejado e o erro clássico nesse domínio. O grupo anterior acertou a parte
difícil.

O defeito (BUG-01) não está na fórmula. Está em executá-la fora de transação e
sem constraint no banco, que é um problema de arquitetura, não de lógica.

Também conferem: a stack declarada, a estrutura de pastas do backend, o ciclo
de vida da reserva (`Agendado -> Concluído ou Cancelado`) e o uso de ESLint,
Prettier e GitHub Actions.

---

## Como fica depois da N2

A documentação do grupo anterior é preservada como registro histórico e
**deixa de ser a fonte da verdade**. A verdade passa a viver em:

* [`docs/produto/requisitos.md`](../produto/requisitos.md) — RF e RNF com situação explícita (REQ-01)
* [`docs/produto/overview.md`](../produto/overview.md) — regras de negócio (REQ-02)
* [`docs/arquitetura/der.md`](../arquitetura/der.md) — o DER real, e o alvo (REQ-02)
* [`docs/arquitetura/openapi.yaml`](../arquitetura/openapi.yaml) — os 10 endpoints reais (REQ-03)
* [`docs/handoff/n3.md`](../handoff/n3.md) — o que o próximo grupo precisa saber (REQ-04)
