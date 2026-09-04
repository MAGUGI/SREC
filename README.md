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

### 1. Banco de Dados (PostgreSQL)
Certifique-se de ter o PostgreSQL instalado e rodando.
1. Crie um banco de dados chamado `srec`.
2. Configure as credenciais no arquivo `server/.env` (use o `server/.env.example` como base).

### 2. Backend (Node.js)
Abra um terminal na pasta raiz e navegue para o servidor:
```bash
cd server
npm install
npm run dev
```
O servidor rodará na porta `5000` e as tabelas do banco serão criadas automaticamente.

### 3. Frontend (React)
Abra outro terminal na pasta raiz e navegue para o cliente:
```bash
cd client
npm install --legacy-peer-deps
npm run dev
```
Acesse a aplicação no seu navegador pelo link fornecido no terminal (geralmente `http://localhost:5173`).

### 4. Testes e Linter
Para garantir a qualidade, você pode rodar os seguintes comandos nas pastas correspondentes (`server/` ou `client/`):
* `npm run lint`: Checa os padrões de código (impede PR se houver erro).
* `npm run test`: Roda os testes automatizados da regra de negócio (apenas na pasta `server`).
