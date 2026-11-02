import { ConfirmDialog } from '../../components/ConfirmDialog';

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

// Tells the user what the ON DELETE CASCADE will take with the resource
// (BUG-06). `pending` is { resource, impact } and impact is null while loading.
export function CascadeDeleteDialog({
  pending,
  acknowledged,
  onAcknowledge,
  isBusy,
  onConfirm,
  onCancel,
}) {
  const impact = pending?.impact;
  const hasReservations = Boolean(impact?.total);

  return (
    <ConfirmDialog
      open={Boolean(pending)}
      title={`Remover "${pending?.resource.name}"?`}
      confirmLabel={hasReservations ? 'Remover espaço e reservas' : 'Remover espaço'}
      confirmDisabled={!impact || (hasReservations && !acknowledged)}
      isBusy={isBusy}
      destructive
      onConfirm={onConfirm}
      onCancel={onCancel}
    >
      {!impact && <p>Verificando as reservas deste espaço...</p>}

      {impact && !hasReservations && (
        <p>Este espaço não tem nenhuma reserva registrada. A remoção é segura.</p>
      )}

      {hasReservations && (
        <>
          <p>
            A remoção é <strong>permanente</strong> e vai apagar também{' '}
            <strong>{plural(impact.total, 'reserva')}</strong> deste espaço:
          </p>
          <ul className="dialog-list">
            <li>
              <strong>{impact.scheduledFuture}</strong> agendada(s) para o futuro
            </li>
            <li>
              <strong>{impact.future - impact.scheduledFuture}</strong> futura(s) já cancelada(s) ou
              concluída(s)
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
            Contagem obtida do servidor no momento desta confirmação. Não há como desfazer: o banco
            apaga as reservas junto com o espaço (ON DELETE CASCADE).
          </p>
          <label className="dialog-ack" htmlFor="confirm-cascade-ack">
            <input
              id="confirm-cascade-ack"
              type="checkbox"
              checked={acknowledged}
              onChange={(event) => onAcknowledge(event.target.checked)}
            />
            {impact.total === 1
              ? 'Entendo que 1 reserva será apagada e não poderá ser recuperada.'
              : `Entendo que ${impact.total} reservas serão apagadas e não poderão ser recuperadas.`}
          </label>
        </>
      )}
    </ConfirmDialog>
  );
}
