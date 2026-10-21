import { ResourceForm } from './ResourceForm';
import { ResourceList } from './ResourceList';

export function ResourcesPanel({ resources, loading, onCreate, onDelete, onSuccess, onError }) {
  // window.confirm is kept: the cascade-aware delete dialog is FE-05 (BUG-06).
  const handleDelete = async (id) => {
    if (!window.confirm('Deseja realmente remover este espaço?')) return;
    try {
      await onDelete(id);
      onSuccess('Espaço removido com sucesso!');
    } catch (err) {
      onError(err.message);
    }
  };

  return (
    <div className="grid grid-2">
      <ResourceForm onCreate={onCreate} onSuccess={onSuccess} onError={onError} />
      <ResourceList resources={resources} loading={loading} onDelete={handleDelete} />
    </div>
  );
}
