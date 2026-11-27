import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { ResourceListItem } from './ResourceListItem';

export function ResourceList({
  resources,
  loading,
  editingId,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
  onError,
}) {
  return (
    <Card title="Espaços Cadastrados">
      <EmptyState
        loading={loading}
        isEmpty={resources.length === 0}
        emptyText="Nenhum espaço cadastrado ainda."
      />
      <div className="item-list">
        {resources.map((resource) => (
          <ResourceListItem
            key={resource.id}
            resource={resource}
            isEditing={resource.id === editingId}
            onStartEdit={onStartEdit}
            onCancelEdit={onCancelEdit}
            onSaveEdit={onSaveEdit}
            onDelete={onDelete}
            onError={onError}
          />
        ))}
      </div>
    </Card>
  );
}
