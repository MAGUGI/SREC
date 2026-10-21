import { useState } from 'react';
import { PlusCircle } from 'lucide-react';
import { Card } from '../../components/Card';
import { RESOURCE_TYPE } from '../../constants/domain';

// Literal ids (not useId) so tests and DevTools can reference them; FE-05
// passes its own idPrefix to render an edit form next to this one.
export function ResourceForm({ idPrefix = 'resource-form', onCreate, onSuccess, onError }) {
  const ID = {
    name: `${idPrefix}-name`,
    type: `${idPrefix}-type`,
    capacity: `${idPrefix}-capacity`,
  };

  const [name, setName] = useState('');
  const [type, setType] = useState(RESOURCE_TYPE.WORKSTATION);
  const [capacity, setCapacity] = useState(1);

  const handleSubmit = async (event) => {
    event.preventDefault();
    try {
      await onCreate({ name, type, capacity });
      setName('');
      setCapacity(1);
      onSuccess('Espaço cadastrado com sucesso!');
    } catch (err) {
      onError(err.message);
    }
  };

  return (
    <Card title="Novo Espaço">
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor={ID.name}>Nome do Espaço / Estação</label>
          <input
            id={ID.name}
            type="text"
            className="form-control"
            placeholder="Ex: Sala de Reunião Alpha"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div className="form-group">
          <label htmlFor={ID.type}>Tipo</label>
          <select
            id={ID.type}
            className="form-control"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option value={RESOURCE_TYPE.WORKSTATION}>Estação de Trabalho</option>
            <option value={RESOURCE_TYPE.MEETING_ROOM}>Sala de Reunião</option>
          </select>
        </div>
        <div className="form-group">
          <label htmlFor={ID.capacity}>Capacidade (pessoas)</label>
          <input
            id={ID.capacity}
            type="number"
            min="1"
            className="form-control"
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
            required
          />
        </div>
        <button type="submit" className="btn btn-primary">
          <PlusCircle size={18} /> Cadastrar Espaço
        </button>
      </form>
    </Card>
  );
}
