import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { ResourceListItem } from './ResourceListItem';

export function ResourceList({ resources, loading, onDelete }) {
  return (
    <Card title="Espaços Cadastrados">
      <EmptyState
        loading={loading}
        isEmpty={resources.length === 0}
        emptyText="Nenhum espaço cadastrado ainda."
      />
      <div className="item-list">
        {resources.map((resource) => (
          <ResourceListItem key={resource.id} resource={resource} onDelete={onDelete} />
        ))}
      </div>
    </Card>
  );
}
