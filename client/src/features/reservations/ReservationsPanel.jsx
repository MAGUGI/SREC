import { useState } from 'react';
import { ConfirmDialog } from '../../components/ConfirmDialog';
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
  const [pendingDelete, setPendingDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const run = async (operation, successText) => {
    try {
      await operation();
      onSuccess(successText);
    } catch (err) {
      onError(err.message);
    }
  };

  const confirmDelete = async () => {
    setIsDeleting(true);
    await run(() => actions.removeReservation(pendingDelete.id), 'Reserva removida!');
    setIsDeleting(false);
    setPendingDelete(null);
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
        onDelete={(id) => setPendingDelete(reservations.find((r) => r.id === id) ?? null)}
      />
      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Excluir esta reserva?"
        confirmLabel="Excluir definitivamente"
        isBusy={isDeleting}
        destructive
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      >
        <p>
          A reserva de <strong>{pendingDelete?.user_name}</strong> em{' '}
          {pendingDelete && new Date(pendingDelete.start_time).toLocaleString('pt-BR')} será apagada
          do histórico. Não há como desfazer.
        </p>
        <p className="dialog-hint">
          Para manter o histórico, use o botão de cancelar a reserva em vez de excluir.
        </p>
      </ConfirmDialog>
    </div>
  );
}
