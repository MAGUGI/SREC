import { useState } from 'react';
import { cascadeImpact } from './cascadeImpact';
import { CascadeDeleteDialog } from './CascadeDeleteDialog';
import { ResourceForm } from './ResourceForm';
import { ResourceList } from './ResourceList';

export function ResourcesPanel({ resources, loading, actions, onSuccess, onError }) {
  const [editingId, setEditingId] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null); // { resource, impact | null }
  const [acknowledged, setAcknowledged] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Fetched at click time: another user may have booked this resource since
  // the last load, and the dialog must not under-report what gets deleted.
  const askDelete = async (resource) => {
    setAcknowledged(false);
    setPendingDelete({ resource, impact: null });
    try {
      const reservations = await actions.fetchReservations();
      setPendingDelete({ resource, impact: cascadeImpact(reservations, resource.id) });
    } catch (err) {
      // Never delete with an unknown count.
      setPendingDelete(null);
      onError(`Não foi possível verificar as reservas deste espaço: ${err.message}`);
    }
  };

  const confirmDelete = async () => {
    const { resource, impact } = pendingDelete;
    setIsDeleting(true);
    try {
      await actions.removeResource(resource.id);
      setPendingDelete(null);
      onSuccess(
        impact.total > 0
          ? `Espaço removido. ${impact.total} reserva(s) foram apagadas junto.`
          : 'Espaço removido com sucesso!'
      );
    } catch (err) {
      onError(err.message);
    } finally {
      setIsDeleting(false);
    }
  };

  const saveEdit = async (values) => {
    await actions.updateResource(editingId, values);
    setEditingId(null);
    onSuccess('Espaço atualizado com sucesso!');
  };

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
      <CascadeDeleteDialog
        pending={pendingDelete}
        acknowledged={acknowledged}
        onAcknowledge={setAcknowledged}
        isBusy={isDeleting}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
