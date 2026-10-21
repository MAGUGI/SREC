import { Trash2, Users } from 'lucide-react';
import { resourceTypeLabel } from '../../constants/domain';

export function ResourceListItem({ resource, onDelete }) {
  return (
    <div className="item-card">
      <div className="item-details">
        <h4>{resource.name}</h4>
        <p>
          Tipo: {resourceTypeLabel(resource.type)} | <Users size={14} className="icon-inline" />{' '}
          Capacidade: {resource.capacity}
        </p>
      </div>
      <button
        className="btn-outline-danger"
        onClick={() => onDelete(resource.id)}
        title="Excluir Espaço"
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
}
