# FE-05 — Tela de edição de recurso e aviso de exclusão em cascata

* **Responsável:** Renato Colin Neto (Desenvolvedor Frontend)
* **Issue:** #<a definir>
* **Branch:** `feature/resource-edit-and-cascade-warning`
* **Rubrica:** 2,5 — Melhoria comprovada do código recebido (BUG-15, BAIXO; dá superfície ao BUG-06, ALTO); 1,5 — Clareza nas alterações feitas, para a N3
* **Depende de:** FE-01 (formulário de recurso extraído), FE-02 (`ApiError` com `status`), FE-03 (`validateResource`, `useSubmit`), FE-04 (`idPrefix` no `ResourceForm`, `IconButton`). **Bloqueada parcialmente por BE-05** (PUT parcial devolve 500) e **condicionada à decisão de domínio da BE-08** (desativação lógica vs. exclusão física)

## Problema

### 1. `PUT /api/resources/:id` é um endpoint órfão (BUG-15)

A rota existe: `server/src/routes/resourceRoutes.js:8`.

```js
router.put('/:id', ResourceController.updateResource);
```

O controller existe: `resourceController.js:42-55`. O model existe:
`resourceModel.js:26-35`. **E o cliente também já tem o wrapper**,
`client/src/services/api.js:24-35`:

```js
  async updateResource(id, data) {
    const res = await fetch(`${API_BASE_URL}/resources/${id}`, {
      method: 'PUT',
      ...
```

O que não existe é **qualquer chamador**. Buscando no frontend recebido:

```bash
grep -rn "updateResource" client/src/
# => client/src/services/api.js:24    (a definição)
# nenhuma outra linha
```

Das 8 funções de `api.js`, **7 são chamadas** pelo `App.jsx` —
`getResources`, `getReservations`, `createResource`, `deleteResource`,
`createReservation`, `updateReservationStatus`, `deleteReservation`.
`updateResource` é a única sem chamador: código morto atravessando quatro
camadas (rota → controller → model → cliente) sem um pixel de interface.

Consequência funcional: **um espaço cadastrado não pode ser corrigido**. Um
erro de digitação no nome ("Sala de Reuniã Alpha"), uma capacidade errada ou
um tipo trocado só podem ser resolvidos **excluindo e recriando** o espaço — e
aí entra o problema 2, porque excluir apaga as reservas.

Isto alimenta a divergência nº 7 da auditoria (a documentação lista 5
endpoints, existem 10) e a nº 11 ("separação estrita de responsabilidades"):
camada escrita sem consumidor é dívida nascida pronta.

### 2. A exclusão de espaço apaga as reservas em silêncio (BUG-06)

`server/src/config/initDb.js:16`:

```sql
resource_id INTEGER REFERENCES resources(id) ON DELETE CASCADE,
```

E a confirmação que o usuário vê, `client/src/App.jsx:77`:

```js
if (!window.confirm('Deseja realmente remover este espaço?')) return;
```

Dezoito palavras de distância entre o que o diálogo diz e o que o banco faz. O
`DELETE /api/resources/:id` chega em `resourceModel.js:37-41`, um `DELETE FROM
resources`, e o Postgres propaga: **todas** as reservas daquele recurso são
apagadas — passadas, em andamento e **futuras**, de **todos** os responsáveis,
independentemente do `status`. O controller responde
`{ message: 'Resource deleted successfully' }` (`resourceController.js:64`) e o
front mostra "Espaço removido com sucesso!" (`App.jsx:80`).

Ninguém é avisado. Não há soft delete — a auditoria registra que a coluna
`resources.is_active` **está documentada no MER e não existe no código**
(divergência nº 2). Não há log, não há auditoria, não há desfazer. As reservas
simplesmente desaparecem da aba "Agendamentos" no próximo `loadData()`.

O agravante: como o problema 1 impede editar, o caminho natural de quem errou
o nome de uma sala é **excluir e recriar** — ou seja, o bug 1 empurra o usuário
para dentro do bug 2.

### 3. Não há como saber quantas reservas um espaço tem

O backend tem a consulta pronta — `ReservationModel.findByResourceId`,
`reservationModel.js:26-30`:

```js
  async findByResourceId(resource_id) {
    const query = 'SELECT * FROM reservations WHERE resource_id = $1 ORDER BY start_time ASC';
```

E **nenhuma rota a expõe**. `reservationRoutes.js` tem 5 rotas (linhas 5-9) e
nenhuma é `/resources/:id/reservations`. Nem o controller a chama —
`grep -c "findByResourceId" server/src/controllers/` → 0. É o segundo trecho
de código morto desta spec, agora no backend.

O que existe é `GET /api/reservations`, que devolve **todas** as reservas de
**todos** os recursos (`reservationModel.js:14-18`), sem filtro, sem
paginação. É com isso que o cliente tem de trabalhar hoje.

## Evidência

```bash
# 1. O endpoint órfão: existe em 4 camadas, sem um chamador
grep -rn "updateResource" server/src client/src
# => server/src/routes/resourceRoutes.js:8
# => server/src/controllers/resourceController.js:42
# => server/src/models/resourceModel.js:26
# => client/src/services/api.js:24
# nenhuma chamada

# 2. Nenhuma superfície de edição em toda a interface
grep -rniE "editar|edit|Pencil|Pencil2|Edit3" client/src/   # => 0 linhas

# 3. A cascata, demonstrada ponta a ponta (backend rodando, banco limpo)
curl -s -X POST http://localhost:5000/api/resources \
  -H 'Content-Type: application/json' \
  -d '{"name":"Sala Cascata","type":"meeting_room","capacity":6}'
# => {"id":1,...}

for d in 22 23 24; do
  curl -s -o /dev/null -X POST http://localhost:5000/api/reservations \
    -H 'Content-Type: application/json' \
    -d "{\"resource_id\":1,\"user_name\":\"Teste $d\",\"start_time\":\"2026-11-${d}T14:00\",\"end_time\":\"2026-11-${d}T15:00\"}"
done

curl -s http://localhost:5000/api/reservations | python -c "import json,sys;print(len(json.load(sys.stdin)))"
# => 3

curl -s -X DELETE http://localhost:5000/api/resources/1
# => {"message":"Resource deleted successfully"}   <-- nada sobre as 3 reservas

curl -s http://localhost:5000/api/reservations | python -c "import json,sys;print(len(json.load(sys.stdin)))"
# => 0     <-- as 3 reservas futuras desapareceram

# 4. O PUT parcial quebra (BUG-05, escopo da BE-05) — relevante para esta spec
curl -s -o /dev/null -w "%{http_code}\n" -X PUT http://localhost:5000/api/resources/2 \
  -H 'Content-Type: application/json' -d '{"name":"Só o nome"}'
# => 500   (resourceModel.js:29 grava NULL em coluna NOT NULL)
```

| Métrica | Baseline medido |
|---|---|
| Métodos de `api.js` sem chamador | **1 de 8** (`updateResource`) |
| Endpoints do backend com superfície de UI | **7 de 10 (70 %)** |
| Endpoints cobertos por `api.js` | **8 de 10** (9 após a FE-02) |
| Telas/ações de edição de recurso | **0** |
| Funções de model sem rota (backend) | **1** (`findByResourceId`) |
| Palavras no diálogo de exclusão | **5** |
| Reservas mencionadas no diálogo de exclusão | **0** |
| Reservas apagadas pelo `DELETE` do teste acima | **3 de 3 (100 %)**, todas futuras |
| Confirmações destrutivas usando `window.confirm` | **2** (`App.jsx:77`, `:117`) |
| Confirmações que informam o impacto | **0 de 2** |

## Decisão

**Modo edição no `ResourceForm` existente (não um formulário novo), e um
`ConfirmDialog` próprio que consulta a contagem de reservas antes de permitir a
exclusão.**

### Edição: reaproveitar o formulário, não duplicar

A alternativa óbvia era um `ResourceEditForm.jsx` separado. Recusada: os campos
são os mesmos três, a validação é a mesma `validateResource` (FE-03), os `id` e
rótulos são os mesmos (FE-04). Um segundo formulário seria ~90 linhas de
duplicação — o CS-01/CS-02 voltando pela porta dos fundos, numa N2 cujo mérito
é **reduzir** duplicação. O `ResourceForm` passa a aceitar `mode`
(`'create' | 'edit'`), `initialValues` e `onSubmit`, mantendo o
comportamento de criação **idêntico** por default. O `idPrefix` que a FE-04 já
previu é o que permite os dois modos coexistirem no DOM sem `id` duplicado.

Onde a edição aparece: **em linha, dentro do card "Espaços Cadastrados"** —
clicar no lápis de um item troca aquele item pelo formulário em modo edição. A
alternativa era um modal. Recusada porque modal exige armadilha de foco,
`Escape`, restauração de foco e `aria-modal` feitos à mão (não há biblioteca de
UI no projeto, e não vamos adicionar uma a quatro dias da entrega) — e nós já
precisamos gastar esse orçamento de acessibilidade **uma vez**, no
`ConfirmDialog`, que é onde o risco de perda de dado está. Edição em linha
reaproveita a estrutura que já existe e não precisa de nada disso.

### PUT completo, não PATCH parcial

O `PUT` do backend sobrescreve os três campos (`resourceModel.js:29`:
`SET name = $1, type = $2, capacity = $3`), e um corpo parcial grava `NULL` em
coluna `NOT NULL` → **500** (BUG-05). Então o formulário de edição **sempre
envia os três campos**, pré-preenchidos com os valores atuais. Isso é
deliberadamente conservador: funciona contra o backend recebido, hoje, sem
depender da BE-05.

> **Dependência da BE-05 (PUT parcial):** quando a BE-05 corrigir o model para
> aceitar corpo parcial (`COALESCE` ou update dinâmico), esta tela **não precisa
> mudar** — enviar os três campos continua válido. O que muda é que a BE-05
> libera futuras telas a mandarem só o campo alterado. Esta spec portanto **não
> fecha o BUG-05** e isso tem de estar escrito no PR. O que ela faz é parar de
> esconder o BUG-05: hoje nenhuma tela chama o `PUT`, então o 500 é invisível;
> depois desta spec, se alguém mandar corpo parcial, o erro aparece — com
> mensagem do servidor, porque a FE-02 passou a repassá-la.

### Contagem de reservas: filtrar no cliente, e dizer de onde veio o número

Não existe `GET /api/resources/:id/reservations`. As três opções eram:

1. **Pedir a rota nova ao backend.** É a certa a médio prazo
   (`findByResourceId` já está escrita, falta a rota), mas cria dependência de
   um PR do Adrian dentro da mesma janela de entrega — e esta spec já depende
   de BE-05 e BE-08.
2. **Usar a lista de reservas que já está em memória.** Custo zero de rede,
   mas o número pode estar desatualizado em minutos: outro usuário pode ter
   criado uma reserva depois do último `loadData()`. Mostrar "2 reservas serão
   apagadas" quando são 5 é pior que não mostrar nada.
3. **Rebuscar `GET /api/reservations` no momento do clique e filtrar por
   `resource_id`.** Uma requisição a mais, número fresco, zero mudança no
   backend.

Escolhida a **3**. O custo é honesto e está medido: a resposta de
`GET /api/reservations` é a lista inteira do sistema. Com o volume de um
coworking (centenas de reservas) é irrelevante; com milhares, não é. Por isso o
`ConfirmDialog` exibe a origem do número e a spec **registra o pedido da rota
dedicada** em `docs/time/divida-tecnica.md`, endereçado à N3 (ou à BE-08, se
ela já for mexer no contrato de exclusão).

### `ConfirmDialog` em vez de `window.confirm`

`window.confirm` (hoje em `App.jsx:77` e `:117`) não serve mais, por quatro
razões concretas:

* **Não aceita conteúdo estruturado.** Precisamos de uma contagem, um recorte
  entre futuras e passadas, e uma lista dos próximos responsáveis afetados.
* **Bloqueia a thread.** Não dá para buscar a contagem *e* mostrar o diálogo:
  `confirm` congela tudo. Precisaríamos buscar antes e montar uma string, o que
  nos deixa sem indicador de carregamento.
* **Não é testável** com Testing Library sem `vi.spyOn(window, 'confirm')`, que
  testa o mock e não a interface.
* **Não tem controle de acessibilidade.** Depois da FE-04, todo elemento
  interativo do projeto tem nome acessível e foco visível. Um `confirm` nativo
  é uma ilha fora desse padrão.

Para uma exclusão que apaga reservas futuras de terceiros em cascata, a
confirmação é **dupla**: o botão de confirmar só habilita quando o usuário
marca um checkbox reconhecendo a contagem. Fricção proporcional ao dano.

### A decisão de domínio que esta spec não toma

Se o comportamento correto é **apagar de verdade** ou **desativar logicamente**
(`resources.is_active`, que o MER documenta e o código não tem — divergência
nº 2 da auditoria) é decisão de produto, e está na **BE-08**, com o Igor como
PO. Esta spec é escrita para o comportamento **atual** (exclusão física com
cascata) e deixa o caminho pronto para os dois desfechos:

* **Se a BE-08 mantiver exclusão física:** o `ConfirmDialog` desta spec é o
  mitigador final, e os textos ficam como estão.
* **Se a BE-08 adotar desativação lógica:** o `ConfirmDialog` continua sendo a
  superfície, muda o texto ("o espaço será desativado e não aceitará novas
  reservas; as N reservas futuras serão mantidas") e o `onConfirm` passa a
  chamar `api.updateResource(id, { ...resource, is_active: false })`. O
  componente é parametrizado por `variant` justamente para que essa troca seja
  um ajuste de props, não uma reescrita.

Por isso o PR desta spec **não fecha a issue do BUG-06**. Ele reduz o dano
(o usuário passa a saber o que vai perder) e documenta a decisão pendente.

## Alterações

```
client/src/
  components/
    ConfirmDialog.jsx                            (NOVO ~86 linhas)
    ConfirmDialog.test.jsx                       (NOVO ~72 linhas)
  features/
    resources/
      ResourceForm.jsx                           (alterado: ~112 → ~118 linhas)
      ResourceListItem.jsx                       (alterado: ~32 → ~56 linhas)
      ResourceList.jsx                           (alterado: ~26 → ~40 linhas)
      ResourcesPanel.jsx                         (alterado: ~30 → ~92 linhas)
      ResourcesPanel.test.jsx                    (NOVO ~96 linhas)
      cascadeImpact.js                           (NOVO ~30 linhas)
      cascadeImpact.test.js                      (NOVO ~44 linhas)
  features/reservations/
    ReservationsPanel.jsx                        (alterado: window.confirm → ConfirmDialog)
  hooks/
    useResources.js                              (alterado: expor updateResource)
  index.css                                      (alterado: +4 regras de diálogo)
```

### `client/src/hooks/useResources.js` (alterado)

Liga o método órfão. Três linhas fecham o BUG-15 na camada de dados.

```js
  const updateResource = useCallback(
    (id, payload) =>
      api.updateResource(id, {
        // PUT completo: o backend sobrescreve os três campos e um corpo
        // parcial grava NULL em coluna NOT NULL (BUG-05 / BE-05).
        name: payload.name,
        type: payload.type,
        capacity: Number(payload.capacity),
      }),
    []
  );

  return { resources, loading, load, createResource, updateResource, removeResource };
```

### `client/src/features/resources/cascadeImpact.js` (novo)

Função pura: recebe a lista de reservas e o `resource_id`, devolve o recorte do
dano. Pura porque é o número que vai na tela de confirmação — e é o número que
vai ao PR como evidência.

```js
import { RESERVATION_STATUS } from '../../constants/domain';

/**
 * Recorte do impacto de excluir um recurso, dado o ON DELETE CASCADE
 * (initDb.js:16). Conta TUDO que será apagado, não só o que está agendado.
 */
export function cascadeImpact(reservations, resourceId, { now = new Date() } = {}) {
  const affected = reservations.filter(
    (reservation) => String(reservation.resource_id) === String(resourceId)
  );

  const future = affected.filter(
    (reservation) => new Date(reservation.start_time).getTime() > now.getTime()
  );
  const scheduledFuture = future.filter(
    (reservation) => reservation.status === RESERVATION_STATUS.SCHEDULED
  );

  return {
    total: affected.length,
    future: future.length,
    scheduledFuture: scheduledFuture.length,
    past: affected.length - future.length,
    // Nomes dos próximos afetados, para o diálogo não ser só um número.
    upcomingNames: [...new Set(
      [...scheduledFuture]
        .sort((a, b) => new Date(a.start_time) - new Date(b.start_time))
        .map((reservation) => reservation.user_name)
    )].slice(0, 3),
  };
}
```

### `client/src/components/ConfirmDialog.jsx` (novo)

Acessível à mão, no padrão que a FE-04 estabeleceu: `role="dialog"`,
`aria-modal`, rótulo via `aria-labelledby`, `Escape` fecha, foco inicial no
botão de cancelar (nunca no destrutivo), foco devolvido ao elemento de origem.

```js
import { useEffect, useRef } from 'react';

export function ConfirmDialog({
  open,
  title,
  confirmLabel,
  cancelLabel = 'Cancelar',
  busy = false,
  confirmDisabled = false,
  destructive = false,
  onConfirm,
  onCancel,
  children,
}) {
  const cancelRef = useRef(null);
  const openerRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    openerRef.current = document.activeElement;
    cancelRef.current?.focus(); // foco inicial NUNCA no botão destrutivo

    const onKeyDown = (event) => {
      if (event.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      openerRef.current?.focus?.();
    };
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="dialog-backdrop" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        className="dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 id="confirm-dialog-title" className="card-title">
          {title}
        </h3>
        <div className="dialog-body">{children}</div>
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onCancel} ref={cancelRef} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={destructive ? 'btn btn-danger' : 'btn btn-primary'}
            onClick={onConfirm}
            disabled={busy || confirmDisabled}
            aria-busy={busy}
          >
            {busy ? 'Processando...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
```

### `client/src/features/resources/ResourcesPanel.jsx` (alterado)

O coração da spec: substitui o `window.confirm` de 5 palavras por uma
consulta + diálogo informado.

```js
import { useState } from 'react';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { api } from '../../services/api';
import { cascadeImpact } from './cascadeImpact';
import { ResourceForm } from './ResourceForm';
import { ResourceList } from './ResourceList';

export function ResourcesPanel({ resources, loading, actions, onSuccess, onError }) {
  const [editingId, setEditingId] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null); // { resource, impact | null }
  const [deleting, setDeleting] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);

  // Rebusca no momento do clique: o número precisa estar fresco, porque
  // outro usuário pode ter criado reserva depois do último carregamento.
  const askDelete = async (resource) => {
    setAcknowledged(false);
    setPendingDelete({ resource, impact: null });
    try {
      const reservations = await api.getReservations();
      setPendingDelete({ resource, impact: cascadeImpact(reservations, resource.id) });
    } catch (err) {
      setPendingDelete(null);
      onError(`Não foi possível verificar as reservas deste espaço: ${err.message}`);
    }
  };

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      await actions.removeResource(pendingDelete.resource.id);
      const { total } = pendingDelete.impact ?? { total: 0 };
      onSuccess(
        total > 0
          ? `Espaço removido. ${total} reserva(s) foram apagadas junto.`
          : 'Espaço removido com sucesso!'
      );
      setPendingDelete(null);
    } catch (err) {
      onError(err.message);
    } finally {
      setDeleting(false);
    }
  };

  const saveEdit = async (values) => {
    await actions.updateResource(editingId, values);
    setEditingId(null);
    onSuccess('Espaço atualizado com sucesso!');
  };

  const impact = pendingDelete?.impact;

  return (
    <div className="grid grid-2">
      <ResourceForm
        idPrefix="resource-create"
        onSubmit={actions.createResource}
        onSuccess={onSuccess}
        onError={onError}
      />
      <ResourceList
        resources={resources}
        loading={loading}
        editingId={editingId}
        onStartEdit={setEditingId}
        onCancelEdit={() => setEditingId(null)}
        onSaveEdit={saveEdit}
        onDelete={askDelete}
        onError={onError}
      />

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title={`Remover "${pendingDelete?.resource.name}"?`}
        confirmLabel="Remover espaço e reservas"
        confirmDisabled={Boolean(impact?.total) && !acknowledged}
        busy={deleting}
        destructive
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      >
        {!impact && <p>Verificando as reservas deste espaço...</p>}

        {impact && impact.total === 0 && (
          <p>Este espaço não tem nenhuma reserva registrada. A remoção é segura.</p>
        )}

        {impact && impact.total > 0 && (
          <>
            <p>
              A remoção é <strong>permanente</strong> e vai apagar também{' '}
              <strong>
                {impact.total} reserva{impact.total > 1 ? 's' : ''}
              </strong>{' '}
              deste espaço:
            </p>
            <ul className="dialog-list">
              <li>
                <strong>{impact.scheduledFuture}</strong> agendada(s) para o futuro
              </li>
              <li>
                <strong>{impact.future - impact.scheduledFuture}</strong> futura(s) já
                cancelada(s) ou concluída(s)
              </li>
              <li>
                <strong>{impact.past}</strong> no passado (histórico)
              </li>
            </ul>
            {impact.upcomingNames.length > 0 && (
              <p>
                Responsáveis afetados a seguir: {impact.upcomingNames.join(', ')}
                {impact.scheduledFuture > impact.upcomingNames.length && ' e outros'}.
              </p>
            )}
            <p className="dialog-hint">
              Contagem obtida de GET /api/reservations no momento desta confirmação. Não há
              como desfazer: o banco usa ON DELETE CASCADE.
            </p>
            <label className="dialog-ack" htmlFor="confirm-cascade-ack">
              <input
                id="confirm-cascade-ack"
                type="checkbox"
                checked={acknowledged}
                onChange={(event) => setAcknowledged(event.target.checked)}
              />
              Entendo que {impact.total} reserva(s) serão apagadas e não poderão ser
              recuperadas.
            </label>
          </>
        )}
      </ConfirmDialog>
    </div>
  );
}
```

### `client/src/features/resources/ResourceListItem.jsx` (alterado)

Ganha o lápis e o modo edição em linha.

```js
import { Pencil, Trash2, Users } from 'lucide-react';
import { IconButton } from '../../components/IconButton';
import { ResourceForm } from './ResourceForm';
import { resourceTypeLabel } from '../../constants/domain';

export function ResourceListItem({ resource, editing, onStartEdit, onCancelEdit, onSaveEdit, onDelete, onError }) {
  if (editing) {
    return (
      <div className="item-card item-card-editing">
        <ResourceForm
          idPrefix={`resource-edit-${resource.id}`}
          mode="edit"
          initialValues={resource}
          onSubmit={(values) => onSaveEdit(values)}
          onCancel={onCancelEdit}
          onSuccess={() => {}}
          onError={onError}
        />
      </div>
    );
  }

  return (
    <div className="item-card">
      <div className="item-details">
        <h4>{resource.name}</h4>
        <p>
          Tipo: {resourceTypeLabel(resource.type)} |{' '}
          <Users size={14} className="icon-inline" /> Capacidade: {resource.capacity}
        </p>
      </div>
      <div className="item-actions">
        <IconButton
          label={`Editar o espaço ${resource.name}`}
          className="btn-outline-danger btn-outline-primary"
          onClick={() => onStartEdit(resource.id)}
        >
          <Pencil size={16} />
        </IconButton>
        <IconButton label={`Excluir o espaço ${resource.name}`} onClick={() => onDelete(resource)}>
          <Trash2 size={16} />
        </IconButton>
      </div>
    </div>
  );
}
```

### `client/src/features/resources/ResourceForm.jsx` (alterado)

Dois modos, comportamento de criação inalterado por default.

```js
export function ResourceForm({
  idPrefix = 'resource-form',
  mode = 'create',
  initialValues = null,
  onSubmit,
  onCancel,
  onSuccess,
  onError,
}) {
  const isEdit = mode === 'edit';
  const [name, setName] = useState(initialValues?.name ?? '');
  const [type, setType] = useState(initialValues?.type ?? RESOURCE_TYPE.WORKSTATION);
  const [capacity, setCapacity] = useState(initialValues?.capacity ?? 1);
  const [errors, setErrors] = useState({});

  const { submitting, submit } = useSubmit(async () => {
    const values = { name, type, capacity };
    const clientErrors = validateResource(values);
    if (hasErrors(clientErrors)) return setErrors(clientErrors);
    setErrors({});
    try {
      await onSubmit(values);
      if (!isEdit) {
        setName('');
        setCapacity(1);
        onSuccess('Espaço cadastrado com sucesso!');
      }
    } catch (err) {
      setErrors(applyServerErrors({}, err));
      onError(err.message);
    }
  });

  // ...mesmos 3 campos, com htmlFor/id derivados de idPrefix (FE-04)...

  return (
    <Card title={isEdit ? 'Editar Espaço' : 'Novo Espaço'}>
      <form onSubmit={submit} noValidate>
        {/* campos */}
        <div className="dialog-actions">
          {isEdit && (
            <button type="button" className="btn" onClick={onCancel} disabled={submitting}>
              Cancelar
            </button>
          )}
          <SubmitButton
            submitting={submitting}
            idleLabel={isEdit ? 'Salvar alterações' : 'Cadastrar Espaço'}
            busyLabel={isEdit ? 'Salvando...' : 'Cadastrando...'}
            icon={isEdit ? <Save size={18} /> : <PlusCircle size={18} />}
          />
        </div>
      </form>
    </Card>
  );
}
```

### `client/src/features/reservations/ReservationsPanel.jsx` (alterado)

O segundo `window.confirm` (`App.jsx:117`) também sai, por consistência — aqui
sem cascata, porque apagar reserva não propaga para nada.

```jsx
<ConfirmDialog
  open={Boolean(pendingDelete)}
  title="Excluir esta reserva?"
  confirmLabel="Excluir definitivamente"
  destructive
  onConfirm={confirmDelete}
  onCancel={() => setPendingDelete(null)}
>
  <p>
    A reserva de <strong>{pendingDelete?.user_name}</strong> em{' '}
    {new Date(pendingDelete?.start_time).toLocaleString('pt-BR')} será apagada do
    histórico. Não há como desfazer.
  </p>
  <p className="dialog-hint">
    Para manter o histórico, use o botão &quot;Cancelar Reserva&quot; em vez de excluir.
  </p>
</ConfirmDialog>
```

### `client/src/index.css` (alterado)

```css
.dialog-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(17, 24, 39, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  z-index: 50;
}

.dialog {
  background: white;
  border-radius: 0.5rem;
  padding: 1.5rem;
  max-width: 32rem;
  width: 100%;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
}

.dialog-actions {
  display: flex;
  gap: 0.75rem;
  margin-top: 1.25rem;
}

.dialog-list {
  margin: 0.5rem 0 0.75rem 1.25rem;
  font-size: 0.875rem;
}

.dialog-hint {
  font-size: 0.8125rem;
  color: #6b7280;
  margin-top: 0.5rem;
}

.dialog-ack {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  font-size: 0.875rem;
  margin-top: 0.75rem;
  color: #991b1b;
}

.btn-outline-primary {
  border-color: #3b82f6;
  color: #3b82f6;
}
```

## Testes

### `client/src/features/resources/cascadeImpact.test.js` (novo)

Função pura, 7 casos. É o número que vai à tela — se ele estiver errado, o
diálogo mente, e mentir sobre o impacto é pior que não avisar.

```js
import { describe, expect, it } from 'vitest';
import { cascadeImpact } from './cascadeImpact';

const NOW = new Date('2026-10-20T12:00:00-03:00');
const make = (id, resourceId, startIso, status = 'scheduled', userName = 'Alguém') => ({
  id,
  resource_id: resourceId,
  user_name: userName,
  start_time: startIso,
  end_time: startIso,
  status,
});

const RESERVATIONS = [
  make(1, 1, '2026-10-10T10:00:00-03:00', 'completed', 'Ana'),
  make(2, 1, '2026-10-25T10:00:00-03:00', 'scheduled', 'Bruno'),
  make(3, 1, '2026-10-26T10:00:00-03:00', 'scheduled', 'Carla'),
  make(4, 1, '2026-10-27T10:00:00-03:00', 'cancelled', 'Dani'),
  make(5, 2, '2026-10-28T10:00:00-03:00', 'scheduled', 'Elis'),
];

describe('cascadeImpact', () => {
  it('conta só as reservas do recurso alvo', () => {
    expect(cascadeImpact(RESERVATIONS, 1, { now: NOW }).total).toBe(4);
  });

  it('separa futuras de passadas', () => {
    const impact = cascadeImpact(RESERVATIONS, 1, { now: NOW });
    expect(impact.future).toBe(3);
    expect(impact.past).toBe(1);
  });

  it('conta separadamente as futuras ainda agendadas', () => {
    expect(cascadeImpact(RESERVATIONS, 1, { now: NOW }).scheduledFuture).toBe(2);
  });

  it('lista os próximos responsáveis em ordem de horário, sem repetir', () => {
    expect(cascadeImpact(RESERVATIONS, 1, { now: NOW }).upcomingNames).toEqual(['Bruno', 'Carla']);
  });

  it('compara resource_id como string e como número', () => {
    expect(cascadeImpact(RESERVATIONS, '1', { now: NOW }).total).toBe(4);
  });

  it('devolve zeros para recurso sem reserva', () => {
    expect(cascadeImpact(RESERVATIONS, 99, { now: NOW })).toMatchObject({
      total: 0,
      future: 0,
      past: 0,
      scheduledFuture: 0,
      upcomingNames: [],
    });
  });

  it('não quebra com lista vazia', () => {
    expect(cascadeImpact([], 1, { now: NOW }).total).toBe(0);
  });
});
```

### `client/src/features/resources/ResourcesPanel.test.jsx` (novo) — o que falha antes

```js
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ResourcesPanel } from './ResourcesPanel';
import { api } from '../../services/api';

vi.mock('../../services/api', () => ({
  api: { getReservations: vi.fn(), updateResource: vi.fn() },
}));

const RESOURCES = [{ id: 1, name: 'Sala Alpha', type: 'meeting_room', capacity: 8 }];
const RESERVATIONS = [
  { id: 1, resource_id: 1, user_name: 'Bruno', start_time: '2099-01-01T10:00:00-03:00', end_time: '2099-01-01T11:00:00-03:00', status: 'scheduled' },
  { id: 2, resource_id: 1, user_name: 'Carla', start_time: '2099-01-02T10:00:00-03:00', end_time: '2099-01-02T11:00:00-03:00', status: 'scheduled' },
  { id: 3, resource_id: 1, user_name: 'Ana', start_time: '2020-01-01T10:00:00-03:00', end_time: '2020-01-01T11:00:00-03:00', status: 'completed' },
];

function setup(overrides = {}) {
  const actions = {
    createResource: vi.fn(),
    updateResource: vi.fn().mockResolvedValue({}),
    removeResource: vi.fn().mockResolvedValue({}),
    ...overrides,
  };
  render(
    <ResourcesPanel
      resources={RESOURCES}
      loading={false}
      actions={actions}
      onSuccess={vi.fn()}
      onError={vi.fn()}
    />
  );
  return actions;
}

beforeEach(() => {
  vi.clearAllMocks();
  api.getReservations.mockResolvedValue(RESERVATIONS);
});

describe('ResourcesPanel — edição (BUG-15)', () => {
  // FALHA ANTES: não existe nenhum botão de editar em toda a interface.
  it('tem um botão de editar por espaço', () => {
    setup();
    expect(screen.getByRole('button', { name: /Editar o espaço Sala Alpha/ })).toBeInTheDocument();
  });

  // FALHA ANTES: api.updateResource nunca é chamada por tela nenhuma.
  it('salva a edição enviando os três campos ao PUT', async () => {
    const user = userEvent.setup();
    const actions = setup();

    await user.click(screen.getByRole('button', { name: /Editar o espaço Sala Alpha/ }));
    const nameInput = screen.getByLabelText('Nome do Espaço / Estação');
    expect(nameInput).toHaveValue('Sala Alpha'); // pré-preenchido
    await user.clear(nameInput);
    await user.type(nameInput, 'Sala Beta');
    await user.click(screen.getByRole('button', { name: /Salvar alterações/ }));

    await waitFor(() =>
      expect(actions.updateResource).toHaveBeenCalledWith(1, {
        name: 'Sala Beta',
        type: 'meeting_room',
        capacity: 8, // PUT completo: os 3 campos sempre (BUG-05/BE-05)
      })
    );
  });

  it('cancelar a edição não chama o PUT e volta para o item', async () => {
    const user = userEvent.setup();
    const actions = setup();
    await user.click(screen.getByRole('button', { name: /Editar o espaço Sala Alpha/ }));
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(actions.updateResource).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Editar o espaço Sala Alpha/ })).toBeInTheDocument();
  });
});

describe('ResourcesPanel — aviso de cascata (BUG-06)', () => {
  // FALHA ANTES: o texto é 'Deseja realmente remover este espaço?' e não
  // menciona nenhuma reserva.
  it('mostra a contagem de reservas afetadas antes de excluir', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('button', { name: /Excluir o espaço Sala Alpha/ }));

    expect(await screen.findByText(/3 reservas/)).toBeInTheDocument();
    expect(screen.getByText(/2/)).toBeInTheDocument();             // futuras agendadas
    expect(screen.getByText(/Bruno, Carla/)).toBeInTheDocument();  // afetados
    expect(api.getReservations).toHaveBeenCalledTimes(1);          // número fresco
  });

  // FALHA ANTES: window.confirm exclui no primeiro OK, sem segunda barreira.
  it('mantém o botão de remover desabilitado até o usuário reconhecer o impacto', async () => {
    const user = userEvent.setup();
    const actions = setup();
    await user.click(screen.getByRole('button', { name: /Excluir o espaço Sala Alpha/ }));

    const confirm = await screen.findByRole('button', { name: /Remover espaço e reservas/ });
    expect(confirm).toBeDisabled();
    await user.click(screen.getByRole('checkbox'));
    expect(confirm).toBeEnabled();

    await user.click(confirm);
    await waitFor(() => expect(actions.removeResource).toHaveBeenCalledWith(1));
  });

  it('não exige reconhecimento quando o espaço não tem reserva', async () => {
    const user = userEvent.setup();
    api.getReservations.mockResolvedValue([]);
    setup();
    await user.click(screen.getByRole('button', { name: /Excluir o espaço Sala Alpha/ }));
    expect(await screen.findByText(/não tem nenhuma reserva/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Remover espaço e reservas/ })).toBeEnabled();
  });

  it('não exclui nada quando a consulta de reservas falha', async () => {
    const user = userEvent.setup();
    api.getReservations.mockRejectedValue(new Error('rede caiu'));
    const actions = setup();
    await user.click(screen.getByRole('button', { name: /Excluir o espaço Sala Alpha/ }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(actions.removeResource).not.toHaveBeenCalled();
  });

  it('Escape cancela sem excluir', async () => {
    const user = userEvent.setup();
    const actions = setup();
    await user.click(screen.getByRole('button', { name: /Excluir o espaço Sala Alpha/ }));
    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(actions.removeResource).not.toHaveBeenCalled();
  });
});
```

### `client/src/components/ConfirmDialog.test.jsx` (novo)

5 casos de acessibilidade do diálogo: `role="dialog"` com `aria-modal`,
rótulo associado por `aria-labelledby`, foco inicial no **Cancelar** (não no
destrutivo), `Escape` fechando, e foco devolvido ao botão de origem ao fechar.

### Comandos

```bash
cd client
TZ=America/Sao_Paulo npm run test    # 46 (FE-01..FE-04) + 24 novos = 70
npm run lint                          # 0 erros, com as regras de a11y da FE-04
npm run build
```

### Verificação manual obrigatória (QA, Igor Seberino)

Com o banco em estado conhecido:

1. Criar "Sala Cascata" e 3 reservas futuras nela (roteiro `curl` da seção
   "Evidência").
2. Clicar no lápis, corrigir o nome para "Sala Cascata II", salvar. A lista tem
   de refletir o novo nome, e DevTools → Network tem de mostrar **1
   `PUT /api/resources/1`** com os três campos no corpo. **Antes desta spec,
   esse `PUT` nunca era disparado por nenhuma tela.**
3. Clicar na lixeira. O diálogo tem de dizer **3 reserva(s)**, listar Bruno,
   Carla etc., e o botão de remover tem de estar **desabilitado** até marcar o
   checkbox.
4. Pressionar `Escape` e confirmar com `GET /api/reservations` que as 3
   reservas continuam lá.
5. Repetir e confirmar de verdade. A mensagem de sucesso tem de dizer "3
   reserva(s) foram apagadas junto" — comparar com o "Espaço removido com
   sucesso!" do baseline, que não mencionava nada.
6. Navegação por teclado: abrir o diálogo com `Enter` no botão da lixeira, o
   foco tem de cair no **Cancelar**, `Tab` circula entre os dois botões e o
   checkbox, `Escape` fecha e o foco volta para a lixeira.

Os prints de 3 e 5, lado a lado com o print do `window.confirm` de 5 palavras
do baseline, são a evidência do pitch.

## Critérios de aceite

* [ ] Métodos de `api.js` sem chamador: **0** (baseline: 1, `updateResource`).
* [ ] Endpoints do backend com superfície de UI: **8 de 10 (80 %)**
      (baseline: 7 de 10, 70 %).
* [ ] Existe um botão "Editar" por espaço, com nome acessível contendo o nome
      do espaço (baseline: 0 ações de edição em toda a interface).
* [ ] O formulário de edição vem **pré-preenchido** com `name`, `type` e
      `capacity` atuais, e envia **os três** campos no `PUT` — teste
      automatizado conferindo o corpo.
* [ ] Nenhum arquivo `.jsx` acima de **120 linhas** (meta herdada da FE-01);
      `ResourcesPanel.jsx` ≤ 120.
* [ ] `ResourceForm.jsx` é **um único** componente, usado nos dois modos —
      `ls client/src/features/resources/*Form*.jsx` retorna **1 arquivo**
      (nenhum `ResourceEditForm.jsx`).
* [ ] `id` duplicado no documento com os dois formulários montados: **0** —
      teste automatizado (via `idPrefix` da FE-04).
* [ ] Chamadas a `window.confirm` em `client/src/`: **0** (baseline: 2, em
      `App.jsx:77` e `:117`).
* [ ] O diálogo de exclusão de espaço informa: total de reservas, quantas são
      futuras agendadas, quantas futuras não agendadas, quantas no passado, até
      3 responsáveis afetados, e a origem do número (baseline: 5 palavras, 0
      menção a reservas).
* [ ] A contagem é obtida **no momento do clique** — `api.getReservations`
      chamada 1 vez por abertura do diálogo, comprovado por teste.
* [ ] O botão destrutivo fica **desabilitado** até o checkbox de
      reconhecimento ser marcado, quando houver reserva afetada
      (baseline: `window.confirm` executa no primeiro OK).
* [ ] Falha na consulta de reservas **aborta** a exclusão e informa o usuário —
      teste automatizado.
* [ ] Diálogo acessível: `role="dialog"`, `aria-modal="true"`,
      `aria-labelledby`, foco inicial no **Cancelar**, `Escape` fecha, foco
      devolvido ao botão de origem — 5 testes automatizados.
* [ ] A mensagem de sucesso cita quantas reservas foram apagadas
      (baseline: "Espaço removido com sucesso!", sem número).
* [ ] Testes de frontend: **70 passando** (baseline do projeto recebido: 0).
* [ ] `npm run lint` com 0 erros e 0 violações de a11y. `npm run build` verde,
      bundle ≤ **206 kB** (baseline 201,86 kB); **nenhuma `dependency` de
      produção adicionada** (`Pencil` e `Save` vêm do `lucide-react` já
      instalado).
* [ ] A descrição do PR declara, em texto: **BUG-05 continua aberto** (corpo
      parcial no `PUT` ainda devolve 500 — link para a BE-05) e **BUG-06
      continua aberto** (a cascata no banco não foi alterada; esta spec só
      informa o usuário — link para a BE-08).
* [ ] `docs/time/divida-tecnica.md` registra os dois itens pendentes:
      (a) a rota `GET /api/resources/:id/reservations`, para parar de baixar a
      lista inteira só para contar, aproveitando o `findByResourceId` que já
      existe em `reservationModel.js:26-30` e não tem rota; (b) a decisão da
      BE-08 sobre desativação lógica.
* [ ] `docs/arquitetura/contrato-api.md` atualizado: 8 de 10 endpoints com
      superfície de UI, e a nota sobre `ON DELETE CASCADE`.
* [ ] PR aprovado por Igor Seberino (`@igorSeberino`, QA) com CI verde.

## Passo a passo TBD

```bash
git checkout main
git pull origin main
git checkout -b feature/resource-edit-and-cascade-warning

cd client
npm ci --legacy-peer-deps

# Baseline
grep -rn "updateResource" src/        # => só a definição em services/api.js
grep -rc "window.confirm" src/        # => 2
# executar o roteiro curl da secao Evidencia e salvar a saida em
# docs/auditoria/evidencias/fe-05-cascata-antes.txt (3 reservas -> 0)
# e o print do window.confirm de 5 palavras em fe-05-confirm-antes.png

# 1. RED — testes que falham contra o código atual
# criar src/features/resources/ResourcesPanel.test.jsx
TZ=America/Sao_Paulo npm run test   # os casos de edição e de cascata DEVEM falhar
cd ..
git add client/src/features/resources/ResourcesPanel.test.jsx
git commit -m "test(resources): cobrir edicao de espaco e aviso de exclusao em cascata"

# 2. Cálculo do impacto da cascata (função pura)
git add client/src/features/resources/cascadeImpact.js \
        client/src/features/resources/cascadeImpact.test.js
git commit -m "feat(resources): calcular o impacto da exclusao em cascata de um espaco"

# 3. Diálogo de confirmação acessível
git add client/src/components/ConfirmDialog.jsx \
        client/src/components/ConfirmDialog.test.jsx client/src/index.css
git commit -m "feat(client): adicionar dialogo de confirmacao acessivel em substituicao ao window.confirm"

# 4. Ligar o endpoint órfão na camada de dados (BUG-15)
git add client/src/hooks/useResources.js
git commit -m "fix(resources): ligar o PUT de recurso que estava orfao no hook de dados"

# 5. Modo edição no formulário existente
git add client/src/features/resources/ResourceForm.jsx \
        client/src/features/resources/ResourceListItem.jsx \
        client/src/features/resources/ResourceList.jsx
git commit -m "feat(resources): permitir editar espaco reaproveitando o formulario de cadastro"

# 6. Aviso de cascata na exclusão (BUG-06)
git add client/src/features/resources/ResourcesPanel.jsx
git commit -m "feat(resources): avisar quantas reservas serao apagadas antes de excluir o espaco"

# 7. Trocar o segundo window.confirm, por consistência
git add client/src/features/reservations/ReservationsPanel.jsx
git commit -m "refactor(reservations): substituir window.confirm pelo dialogo de confirmacao"

# 8. GREEN + evidência
cd client
TZ=America/Sao_Paulo npm run test && npm run lint && npm run build
# roteiro manual dos 6 itens; salvar fe-05-dialogo-depois.png e
# fe-05-put-network.png (o PUT que antes nunca acontecia)
cd ..
git add docs/auditoria/evidencias docs/time/divida-tecnica.md \
        docs/arquitetura/contrato-api.md
git commit -m "docs(arquitetura): registrar cobertura de endpoints e dependencias BE-05 e BE-08"

git push -u origin feature/resource-edit-and-cascade-warning
# PR para main, título:
#   feat(resources): editar espaco e avisar o impacto da exclusao em cascata
# Corpo: link para docs/specs/fe-05-resource-edit-and-cascade-warning/implementacao.md,
#   tabela antes/depois (1 -> 0 metodo orfao; 7/10 -> 8/10 endpoints com UI;
#   0 -> 1 tela de edicao; 5 palavras -> contagem completa no dialogo;
#   2 -> 0 window.confirm; 0 -> 70 testes), os prints antes/depois do diálogo,
#   e o parágrafo declarando BUG-05 e BUG-06 ainda abertos (links BE-05 e BE-08).
# Revisor obrigatório: @igorSeberino (QA), que também decide como PO o
# encaminhamento da BE-08.
```

## Prompt para o Claude Code

```text
Você está na raiz do repositório igorSeberino/srec, na branch
feature/resource-edit-and-cascade-warning. Carregue a skill de arquitetura de
frontend do repositório antes de começar.

Leia, por inteiro:
  1. docs/specs/fe-05-resource-edit-and-cascade-warning/implementacao.md  (ordem de serviço)
  2. docs/specs/be-05-*/implementacao.md  (PUT parcial — por que mandamos os 3 campos)
  3. docs/specs/be-08-*/implementacao.md  (decisão de domínio sobre desativação lógica)
  4. client/src/services/api.js  (updateResource, o método órfão)
  5. client/src/features/resources/  (ResourceForm, ResourceList, ResourceListItem, ResourcesPanel)
  6. client/src/hooks/useResources.js
  7. server/src/models/resourceModel.js  (linhas 26-35: o UPDATE sobrescreve os 3 campos)
  8. server/src/config/initDb.js  (linha 16: ON DELETE CASCADE)
  9. server/src/models/reservationModel.js  (linhas 26-30: findByResourceId, sem rota)

Tarefa: implementar a edição de espaço e o aviso de exclusão em cascata
descritos na seção "Alterações" da spec, com o código proposto lá.

Regras não negociáveis:
- TDD: crie ResourcesPanel.test.jsx PRIMEIRO e me mostre a saída vermelha dos
  casos de edição e de cascata antes de escrever qualquer implementação.
- UM ÚNICO ResourceForm. NÃO crie ResourceEditForm.jsx nem duplique os campos.
  O modo vem pela prop `mode` e o comportamento de criação com os defaults tem
  de ficar IDÊNTICO ao de hoje.
- O PUT envia SEMPRE os três campos (name, type, capacity). Corpo parcial causa
  500 no backend recebido (BUG-05). Não "otimize" para mandar só o campo
  alterado, mesmo que pareça melhor.
- Use `idPrefix` no ResourceForm (prop já prevista pela FE-04) para que criação
  e edição coexistam sem id duplicado no documento. Um teste cobre isso.
- A contagem de reservas afetadas é buscada NO MOMENTO DO CLIQUE, com
  api.getReservations(), e filtrada por cascadeImpact(). NÃO use a lista que já
  está em memória: o número tem de estar fresco.
- Se a busca da contagem falhar, ABORTE a exclusão e informe o usuário. Nunca
  excluir com número desconhecido.
- window.confirm sai dos DOIS painéis. Zero chamadas em client/src/ no final.
- O ConfirmDialog tem de ter role="dialog", aria-modal, aria-labelledby, foco
  inicial no CANCELAR (nunca no botão destrutivo), Escape fechando e foco
  devolvido ao elemento de origem. Isso é continuidade da FE-04, não enfeite.
- NÃO adicione dependency de produção. Pencil e Save vêm do lucide-react já
  instalado. Nenhuma biblioteca de modal, nenhum headless UI.
- NÃO toque em server/. Esta spec NÃO corrige BUG-05 nem BUG-06. Não altere o
  ON DELETE CASCADE, não crie a rota GET /api/resources/:id/reservations, não
  adicione is_active. Se você sentir que "seria fácil arrumar no backend", não
  arrume: BE-05 e BE-08 são de outra pessoa e a BE-08 é decisão de produto em
  aberto.
- Um commit por passo do "Passo a passo TBD", com as mensagens prontas de lá.
- Não rode comandos git push nem abra PR.

Ao terminar, me devolva: `grep -rn "updateResource" client/src/` (tem de
mostrar chamador, não só definição), `grep -rc "window.confirm" client/src/`
(tem de ser 0), `find client/src -name '*.jsx' | xargs wc -l | sort -rn | head -3`
(nenhum acima de 120), o total de testes passando, e o tamanho do bundle
comparado com 201,86 kB (63,26 kB gzip).
```
