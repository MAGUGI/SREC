import { ReservationForm } from './ReservationForm';
import { ReservationList } from './ReservationList';

export function ReservationsPanel({
  reservations,
  resources,
  loading,
  actions,
  onSuccess,
  onError,
}) {
  const run = async (operation, successText) => {
    try {
      await operation();
      onSuccess(successText);
    } catch (err) {
      onError(err.message);
    }
  };

  const handleDelete = (id) => {
    if (!window.confirm('Deseja cancelar esta reserva permanentemente?')) return;
    run(() => actions.removeReservation(id), 'Reserva removida!');
  };

  return (
    <div className="grid grid-2">
      <ReservationForm
        resources={resources}
        onCreate={actions.createReservation}
        onSuccess={onSuccess}
        onError={onError}
      />
      <ReservationList
        reservations={reservations}
        resources={resources}
        loading={loading}
        onChangeStatus={(id, status) =>
          run(() => actions.changeStatus(id, status), 'Status da reserva atualizado!')
        }
        onDelete={handleDelete}
      />
    </div>
  );
}
