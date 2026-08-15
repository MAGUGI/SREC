# SREC

## Objetivo do Projeto
O projeto consiste no desenvolvimento de um sistema completo para o gerenciamento e a reserva de estações de trabalho e salas de reunião em um ambiente de coworking. O objetivo principal é automatizar o controle de disponibilidade, facilitar o agendamento para os usuários e garantir uma gestão eficiente dos recursos do espaço, aplicando as melhores práticas de Engenharia de Software.

## Tecnologias e Ferramentas (Stack)
As seguintes tecnologias foram definidas para o desenvolvimento da aplicação:

* **Frontend:** React
* **Backend:** Node.js
* **Banco de Dados:** PostgreSQL
* **Ferramentas de Qualidade de Código:** ESLint e Prettier

## Colaboradores e Papéis
A equipe responsável pelo planejamento, desenvolvimento e garantia de qualidade do sistema é composta por:

* **Maria Eduarda Huida:** Product Owner (PO) e Engenharia de Requisitos
* **Lucas Giovani Fruck:** Desenvolvedor Backend e Quality Assurance (QA)
* **Gustavo José Paulo:** Desenvolvedor Frontend e DevOps

## Testes e QA
* O foco primário da automação de testes será nas regras de negócio (backend/domain).
* O QA realizará roteiros de testes cobrindo o fluxo principal antes de entregas oficiais.
* Bugs encontrados devem ser documentados com os passos esperados e os passos obtidos.

## Padrões de Versionamento (Git Flow) e Commits
O projeto adota uma estratégia de branches padronizada e integração contínua:

* **main / master:** Código estável para produção.
* **develop:** Ambiente de integração para a entrega atual.
* **Branches de Funcionalidade:** Seguem o padrão `feature/nome_da_funcionalidade` ou `fix/descricao_do_bug`.
* **Regra de PR:** Nenhum Pull Request será mesclado se o linter apontar erros críticos.

### Especificação de Commits
* **feat:** Implementação de nova funcionalidade.
* **fix:** Correção de bug.
* **refactor:** Refatoração de código sem alteração do comportamento externo.
* **docs:** Modificações e adições na documentação.

## Como Executar o Projeto (Setup)
