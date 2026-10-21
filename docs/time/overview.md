# Equipe, Papéis e Matriz RACI — N2

A disciplina prevê **rodízio de papéis a cada entrega**: ninguém repete na N2 a
função que exerceu na N1. Este documento é a matriz atualizada, que a rubrica
da N2 cobra explicitamente no item de pitch e gestão.

## Integrantes e papéis

| Pessoa | GitHub | Papel na **N2** | Papel na N1 |
|---|---|---|---|
| Igor Thiago Seberino | [@igorSeberino](https://github.com/igorSeberino) | **Product Owner + QA** | Desenvolvedor Backend |
| Gabriel Carvalho | [@gabrielcarvallho](https://github.com/gabrielcarvallho) | **DevOps** | Product Owner + DevOps |
| Adrian Cesar Gonçalves | [@adrian-cesar](https://github.com/adrian-cesar) | **Desenvolvedor Backend** | Quality Assurance |
| Renato Colin Neto | [@RenatoColin](https://github.com/RenatoColin) | **Desenvolvedor Frontend** | Engenheiro de Requisitos |
| Diego Nessler | [@Diegonessler](https://github.com/Diegonessler) | **Engenheiro de Requisitos** | Desenvolvedor Frontend |

Quatro das cinco pessoas trocaram de área por completo. Gabriel mantém DevOps
e larga o papel de PO, que passa para o Igor.

Consequência prática do rodízio que vale registrar para o pitch: **quem
escreveu o backend na N1 agora revisa o backend como QA, e quem testava agora
escreve.** A pessoa que mais sabe de uma camada não é a que a implementa nesta
entrega. Isso é desconfortável de propósito, e é o que a disciplina está
ensinando: um sistema só é mantível quando não depende de quem o escreveu.

## O que cada papel entrega na N2

**Product Owner (Igor).** Define a prioridade do backlog a partir da auditoria,
decide o que fica de fora e defende a decisão no pitch. Dono do
[relatório de auditoria](../auditoria/relatorio-n2.md) e do
[relatório antes/depois](../specs/qa-04-before-after-report/implementacao.md).

**QA (Igor).** **Aprova todos os PRs do time** — é o que a rubrica cobra em
"Pull Requests aprovados pelo QA". Dono da suíte de testes de integração, dos
testes de domínio e do roteiro de regressão manual. Bloqueia merge quando a
Definition of Done não é cumprida.

Igor acumula os dois papéis, o que cria um conflito de interesse real: o PO
quer entregar, o QA quer bloquear. A regra que adotamos para isso: **quando os
dois papéis discordarem, o QA vence e o escopo é cortado.** Prazo não compra
qualidade nesta entrega, porque a nota de "melhoria comprovada" vale mais que
a de volume entregue.

**DevOps (Gabriel).** Ambiente reproduzível em um comando, migrations
versionadas, portões de qualidade na CI, proteção de branch e templates. É
quem transforma "funciona na minha máquina" em "funciona na do grupo da N3".

**Backend (Adrian).** Os dois bugs críticos, os cinco altos de servidor, a
camada de serviço e o tratamento central de erro. É o maior volume de trabalho
da entrega e o que sustenta os 2,5 pontos de melhoria comprovada.

**Frontend (Renato).** Quebrar o componente de 351 linhas, camada de API
configurável, validação, acessibilidade e a tela de edição que faltava.

**Engenheiro de Requisitos (Diego).** Engenharia reversa dos requisitos,
fechamento das 12 divergências entre documentação e código, contrato da API em
OpenAPI e o documento de handoff para a N3. Na N2 o trabalho de requisitos não
é inventar funcionalidade: é **descobrir e registrar o que o sistema realmente
faz**.

## Matriz RACI

Legenda: **R** executa, **A** aprova, **C** é consultado, **I** é informado.
Só aparecem os papéis efetivamente envolvidos em cada atividade.

| Atividade | Igor (PO/QA) | Gabriel (DevOps) | Adrian (BE) | Renato (FE) | Diego (Req) |
|---|---|---|---|---|---|
| Auditar o código recebido e medir o baseline | **R/A** | C | C | C | C |
| Priorizar o backlog da N2 | **R/A** | C | C | C | C |
| Tornar o ambiente reproduzível (Docker, migrations) | A | **R** | C | I | I |
| Portões de qualidade na CI e proteção de branch | A | **R** | C | C | I |
| Corrigir os bugs críticos de reserva | A | C | **R** | I | C |
| Refatorar o backend (serviço, erro central) | A | I | **R** | I | I |
| Refatorar o frontend e acessibilidade | A | I | I | **R** | C |
| Suíte de testes automatizados | **R** | C | C | C | I |
| Roteiro de regressão manual | **R** | I | I | C | I |
| Aprovar Pull Requests | **R/A** | C | C | C | C |
| Engenharia reversa dos requisitos e regras de negócio | A | I | C | C | **R** |
| DER e contrato da API (OpenAPI) | A | I | C | C | **R** |
| Documento de handoff para a N3 | A | C | C | C | **R** |
| Relatório antes/depois e pitch | **R/A** | C | C | C | C |

Regra de leitura: **cada linha tem exatamente um R.** Onde aparece `R/A` é o
Igor acumulando PO e QA, e nesse caso a aprovação é do papel que ele não está
executando.

## Qualidade: DoR e DoD

### Definition of Ready — pronto para entrar em desenvolvimento

Validado pelo PO junto com o Engenheiro de Requisitos.

* [ ] A issue aponta para uma spec em `docs/specs/<slug>/implementacao.md`.
* [ ] A spec identifica o bug ou code smell que resolve, com arquivo e linha.
* [ ] Existe evidência do problema: comando de reprodução ou número medido.
* [ ] Os critérios de aceite são objetivos e verificáveis.
* [ ] As dependências de outras issues estão declaradas.
* [ ] Está claro qual item da rubrica da N2 o trabalho pontua.

### Definition of Done — pronto para merge

Verificado pelo QA na revisão do PR.

* [ ] O comportamento descrito nos critérios de aceite foi verificado de fato.
* [ ] Existe teste automatizado cobrindo a mudança; para correção de bug, existe o teste que **falhava antes**.
* [ ] A suíte inteira passa e a cobertura não caiu.
* [ ] A CI está verde, incluindo lint e build.
* [ ] Os commits seguem Conventional Commits em português no imperativo.
* [ ] A documentação afetada foi atualizada no mesmo PR.
* [ ] O PR foi **aprovado pelo QA**.
* [ ] Nenhum arquivo fora do escopo da issue foi alterado.

O último item existe por um motivo específico desta entrega: é código de outra
pessoa, e a tentação de "já que estou aqui, arrumo isso também" destrói a
rastreabilidade entre o achado da auditoria e a correção — que é justamente o
que o pitch precisa demonstrar com dados.

## Gestão de débito técnico

### Política de registro

Todo atalho, pendência ou *workaround* vira issue com a label
`débito técnico` **no momento em que é criado**, não no fim da entrega,
contendo: descrição, motivo do atalho, impacto estimado e proposta de solução.

A N2 herdou débito de outro grupo e vai gerar débito próprio. Os dois entram
na mesma lista, marcados com `herdado` ou `criado-n2`, e o handoff da N3
entrega a lista inteira. Entregar débito conhecido e documentado é honesto;
entregar débito escondido é o que gerou os 6,14 % de cobertura que recebemos.

### Orçamento e priorização

A equipe reserva cerca de **15 % do esforço do ciclo** para liquidar débito
registrado.

Têm prioridade máxima os débitos que afetam:

* **a regra de negócio central** — não sobrepor reservas;
* **segurança** — hoje o sistema não tem autenticação alguma (D-06);
* **a capacidade do time de trabalhar** — ambiente que não sobe, teste que não roda, CI que mente.

### Débitos conhecidos hoje

Herdados: os 15 bugs e 14 code smells de
[`docs/auditoria/`](../auditoria/relatorio-n2.md), mais as 12 divergências
entre documentação e código.

Assumidos deliberadamente nesta entrega, com justificativa nos
[ADRs](../arquitetura/decisoes.md): ausência de autenticação, SQL cru sem ORM,
ausência de DDD, frontend em JavaScript sem TypeScript.

## Fluxo de trabalho

O time adota **Trunk-Based Development**: `main` é o único branch longevo,
branches curtas, PR pequeno, merge frequente. O fluxo completo, os nomes de
branch, o padrão de commit e o ciclo do PR estão em
[`fluxo-tbd.md`](fluxo-tbd.md).

O backlog vive no **GitHub Project** do repositório, não neste documento.
Cada issue aponta para a spec que a implementa.
