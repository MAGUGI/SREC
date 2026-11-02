import { Pencil, Trash2, Users } from 'lucide-react';
import { IconButton } from '../../components/IconButton';
import { resourceTypeLabel } from '../../constants/domain';
import { ResourceForm } from './ResourceForm';

export function ResourceListItem({
  resource,
  isEditing = false,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
  onError,
}) {
  if (isEditing) {
    return (
      <div className="item-card-editing">
        <ResourceForm
          idPrefix={`resource-edit-${resource.id}`}
          mode="edit"
          initialValues={resource}
          onSubmit={onSaveEdit}
          onCancel={onCancelEdit}
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
          Tipo: {resourceTypeLabel(resource.type)} | <Users size={14} className="icon-inline" />{' '}
          Capacidade: {resource.capacity}
        </p>
      </div>
      <div className="item-actions">
        <IconButton
          label={`Editar o espaço ${resource.name}`}
          className="btn-outline-danger btn-outline-primary"
          onClick={() => onStartEdit?.(resource.id)}
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
