import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { ReservationListItem } from './ReservationListItem';

export function ReservationList({ reservations, resources, loading, onChangeStatus, onDelete }) {
  const nameOf = (resourceId) =>
    resources.find((resource) => resource.id === resourceId)?.name ?? `Espaço #${resourceId}`;

  return (
    <Card title="Reservas Realizadas">
      <EmptyState
        loading={loading}
        isEmpty={reservations.length === 0}
        emptyText="Nenhuma reserva registrada."
      />
      <div className="item-list">
        {reservations.map((reservation) => (
          <ReservationListItem
            key={reservation.id}
            reservation={reservation}
            resourceName={nameOf(reservation.resource_id)}
            onChangeStatus={onChangeStatus}
            onDelete={onDelete}
          />
        ))}
      </div>
    </Card>
  );
}
