import { useState } from 'react';
import { PlusCircle } from 'lucide-react';
import { Card } from '../../components/Card';
import { RESOURCE_TYPE } from '../../constants/domain';

export function ResourceForm({ onCreate, onSuccess, onError }) {
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
          <label>Nome do Espaço / Estação</label>
          <input
            type="text"
            className="form-control"
            placeholder="Ex: Sala de Reunião Alpha"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div className="form-group">
          <label>Tipo</label>
          <select className="form-control" value={type} onChange={(e) => setType(e.target.value)}>
            <option value={RESOURCE_TYPE.WORKSTATION}>Estação de Trabalho</option>
            <option value={RESOURCE_TYPE.MEETING_ROOM}>Sala de Reunião</option>
          </select>
        </div>
        <div className="form-group">
          <label>Capacidade (pessoas)</label>
          <input
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
