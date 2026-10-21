import { CheckCircle2, Clock, Trash2, XCircle } from 'lucide-react';
import { IconButton } from '../../components/IconButton';
import { RESERVATION_STATUS } from '../../constants/domain';

export function ReservationListItem({ reservation, resourceName, onChangeStatus, onDelete }) {
  return (
    <div className="item-card">
      <div className="item-details">
        <h4>{resourceName}</h4>
        <p>
          <strong>Responsável:</strong> {reservation.user_name}
        </p>
        <p>
          <Clock size={14} className="icon-inline" />{' '}
          {new Date(reservation.start_time).toLocaleString('pt-BR')} até{' '}
          {new Date(reservation.end_time).toLocaleString('pt-BR')}
        </p>
        <span className={`status-tag status-${reservation.status}`}>{reservation.status}</span>
      </div>
      <div className="item-actions">
        {reservation.status === RESERVATION_STATUS.SCHEDULED && (
          <>
            <IconButton
              label={`Concluir a reserva de ${reservation.user_name}`}
              className="btn-outline-danger btn-outline-success"
              onClick={() => onChangeStatus(reservation.id, RESERVATION_STATUS.COMPLETED)}
            >
              <CheckCircle2 size={16} />
            </IconButton>
            <IconButton
              label={`Cancelar a reserva de ${reservation.user_name}`}
              onClick={() => onChangeStatus(reservation.id, RESERVATION_STATUS.CANCELLED)}
            >
              <XCircle size={16} />
            </IconButton>
          </>
        )}
        <IconButton
          label={`Excluir definitivamente a reserva de ${reservation.user_name}`}
          onClick={() => onDelete(reservation.id)}
        >
          <Trash2 size={16} />
        </IconButton>
      </div>
    </div>
  );
}
