import { useState } from 'react';
import { Calendar } from 'lucide-react';
import { Card } from '../../components/Card';

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
          <label>Selecione o Espaço</label>
          <select
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
          <label>Nome do Responsável</label>
          <input
            type="text"
            className="form-control"
            placeholder="Ex: Carlos Silva"
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            required
          />
        </div>
        <div className="form-group">
          <label>Horário de Início</label>
          <input
            type="datetime-local"
            className="form-control"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            required
          />
        </div>
        <div className="form-group">
          <label>Horário de Término</label>
          <input
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
