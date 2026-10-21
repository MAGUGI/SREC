import { CheckCircle2, Clock, Trash2, XCircle } from 'lucide-react';
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
            <button
              className="btn-outline-danger btn-outline-success"
              onClick={() => onChangeStatus(reservation.id, RESERVATION_STATUS.COMPLETED)}
              title="Concluir"
            >
              <CheckCircle2 size={16} />
            </button>
            <button
              className="btn-outline-danger"
              onClick={() => onChangeStatus(reservation.id, RESERVATION_STATUS.CANCELLED)}
              title="Cancelar Reserva"
            >
              <XCircle size={16} />
            </button>
          </>
        )}
        <button
          className="btn-outline-danger"
          onClick={() => onDelete(reservation.id)}
          title="Excluir Definitivamente"
        >
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
}
