import { useState } from 'react';
import { Calendar } from 'lucide-react';
import { Card } from '../../components/Card';

const ID = {
  resource: 'reservation-form-resource',
  userName: 'reservation-form-user-name',
  startTime: 'reservation-form-start-time',
  endTime: 'reservation-form-end-time',
};

export function ReservationForm({ resources, onCreate, onSuccess, onError }) {
  const [resourceId, setResourceId] = useState('');
  const [userName, setUserName] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');

  // Same as the received App.jsx:43-45: preselect the first resource
  // without overwriting a choice the user already made. Derived instead of
  // set in an effect, so react-hooks/set-state-in-effect needs no suppression.
  const selectedResourceId = resourceId || resources[0]?.id || '';

  const handleSubmit = async (event) => {
    event.preventDefault();
    try {
      await onCreate({
        resource_id: selectedResourceId,
        user_name: userName,
        start_time: startTime,
        end_time: endTime,
      });
      setUserName('');
      setStartTime('');
      setEndTime('');
      onSuccess('Reserva confirmada com sucesso!');
    } catch (err) {
      onError(err.message);
    }
  };

  return (
    <Card title="Novo Agendamento">
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor={ID.resource}>Selecione o Espaço</label>
          <select
            id={ID.resource}
            className="form-control"
            value={selectedResourceId}
            onChange={(e) => setResourceId(e.target.value)}
            required
          >
            {resources.map((resource) => (
              <option key={resource.id} value={resource.id}>
                {resource.name} ({resource.type})
              </option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label htmlFor={ID.userName}>Nome do Responsável</label>
          <input
            id={ID.userName}
            type="text"
            className="form-control"
            placeholder="Ex: Carlos Silva"
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            required
          />
        </div>
        <div className="form-group">
          <label htmlFor={ID.startTime}>Horário de Início</label>
          <input
            id={ID.startTime}
            type="datetime-local"
            className="form-control"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            required
          />
        </div>
        <div className="form-group">
          <label htmlFor={ID.endTime}>Horário de Término</label>
          <input
            id={ID.endTime}
            type="datetime-local"
            className="form-control"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            required
          />
        </div>
        <button type="submit" className="btn btn-primary">
          <Calendar size={18} /> Confirmar Reserva
        </button>
      </form>
    </Card>
  );
}
