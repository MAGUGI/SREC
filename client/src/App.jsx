import { useState, useEffect } from 'react';
import { api } from './services/api';
import {
  Building2,
  Calendar,
  Users,
  PlusCircle,
  Trash2,
  Clock,
  CheckCircle2,
  XCircle,
} from 'lucide-react';

function App() {
  const [activeTab, setActiveTab] = useState('resources');
  const [resources, setResources] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });

  // Resource Form State
  const [resName, setResName] = useState('');
  const [resType, setResType] = useState('workstation');
  const [resCapacity, setResCapacity] = useState(1);

  // Reservation Form State
  const [selectedResourceId, setSelectedResourceId] = useState('');
  const [userName, setUserName] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');

  const showFeedback = (text, type = 'success') => {
    setMessage({ text, type });
    setTimeout(() => setMessage({ text: '', type: '' }), 4000);
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const [resData, resvData] = await Promise.all([api.getResources(), api.getReservations()]);
      setResources(resData);
      setReservations(resvData);
      if (resData.length > 0) {
        setSelectedResourceId((prev) => prev || resData[0].id);
      }
    } catch (err) {
      showFeedback(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreateResource = async (e) => {
    e.preventDefault();
    try {
      await api.createResource({
        name: resName,
        type: resType,
        capacity: Number(resCapacity),
      });
      setResName('');
      setResCapacity(1);
      showFeedback('Espaço cadastrado com sucesso!');
      loadData();
    } catch (err) {
      showFeedback(err.message, 'error');
    }
  };

  const handleDeleteResource = async (id) => {
    if (!window.confirm('Deseja realmente remover este espaço?')) return;
    try {
      await api.deleteResource(id);
      showFeedback('Espaço removido com sucesso!');
      loadData();
    } catch (err) {
      showFeedback(err.message, 'error');
    }
  };

  const handleCreateReservation = async (e) => {
    e.preventDefault();
    try {
      await api.createReservation({
        resource_id: selectedResourceId,
        user_name: userName,
        start_time: startTime,
        end_time: endTime,
      });
      setUserName('');
      setStartTime('');
      setEndTime('');
      showFeedback('Reserva confirmada com sucesso!');
      loadData();
    } catch (err) {
      showFeedback(err.message, 'error');
    }
  };

  const handleStatusChange = async (id, status) => {
    try {
      await api.updateReservationStatus(id, status);
      showFeedback('Status da reserva atualizado!');
      loadData();
    } catch (err) {
      showFeedback(err.message, 'error');
    }
  };

  const handleDeleteReservation = async (id) => {
    if (!window.confirm('Deseja cancelar esta reserva permanentemente?')) return;
    try {
      await api.deleteReservation(id);
      showFeedback('Reserva removida!');
      loadData();
    } catch (err) {
      showFeedback(err.message, 'error');
    }
  };

  return (
    <div>
      <header>
        <div className="header-content">
          <div className="header-title">
            <Building2 size={28} color="#3b82f6" />
            <span>SREC - Sistema de Reservas & Coworking</span>
          </div>
          <span className="badge">v1.0.0</span>
        </div>
      </header>

      <div className="container">
        {message.text && <div className={`alert alert-${message.type}`}>{message.text}</div>}

        <div className="nav-tabs">
          <button
            className={`tab-btn ${activeTab === 'resources' ? 'active' : ''}`}
            onClick={() => setActiveTab('resources')}
          >
            Espaços e Salas
          </button>
          <button
            className={`tab-btn ${activeTab === 'reservations' ? 'active' : ''}`}
            onClick={() => setActiveTab('reservations')}
          >
            Agendamentos
          </button>
        </div>

        {activeTab === 'resources' && (
          <div className="grid grid-2">
            <div className="card">
              <h3 className="card-title">Novo Espaço</h3>
              <form onSubmit={handleCreateResource}>
                <div className="form-group">
                  <label>Nome do Espaço / Estação</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Ex: Sala de Reunião Alpha"
                    value={resName}
                    onChange={(e) => setResName(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Tipo</label>
                  <select
                    className="form-control"
                    value={resType}
                    onChange={(e) => setResType(e.target.value)}
                  >
                    <option value="workstation">Estação de Trabalho</option>
                    <option value="meeting_room">Sala de Reunião</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Capacidade (pessoas)</label>
                  <input
                    type="number"
                    min="1"
                    className="form-control"
                    value={resCapacity}
                    onChange={(e) => setResCapacity(e.target.value)}
                    required
                  />
                </div>
                <button type="submit" className="btn btn-primary">
                  <PlusCircle size={18} /> Cadastrar Espaço
                </button>
              </form>
            </div>

            <div className="card">
              <h3 className="card-title">Espaços Cadastrados</h3>
              {loading && <p>Carregando...</p>}
              {!loading && resources.length === 0 && <p>Nenhum espaço cadastrado ainda.</p>}
              <div className="item-list">
                {resources.map((res) => (
                  <div key={res.id} className="item-card">
                    <div className="item-details">
                      <h4>{res.name}</h4>
                      <p>
                        Tipo:{' '}
                        {res.type === 'meeting_room' ? 'Sala de Reunião' : 'Estação de Trabalho'} |{' '}
                        <Users size={14} style={{ display: 'inline' }} /> Capacidade: {res.capacity}
                      </p>
                    </div>
                    <button
                      className="btn-outline-danger"
                      onClick={() => handleDeleteResource(res.id)}
                      title="Excluir Espaço"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'reservations' && (
          <div className="grid grid-2">
            <div className="card">
              <h3 className="card-title">Novo Agendamento</h3>
              <form onSubmit={handleCreateReservation}>
                <div className="form-group">
                  <label>Selecione o Espaço</label>
                  <select
                    className="form-control"
                    value={selectedResourceId}
                    onChange={(e) => setSelectedResourceId(e.target.value)}
                    required
                  >
                    {resources.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} ({r.type})
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
            </div>

            <div className="card">
              <h3 className="card-title">Reservas Realizadas</h3>
              {loading && <p>Carregando...</p>}
              {!loading && reservations.length === 0 && <p>Nenhuma reserva registrada.</p>}
              <div className="item-list">
                {reservations.map((rev) => {
                  const resourceObj = resources.find((r) => r.id === rev.resource_id);
                  return (
                    <div key={rev.id} className="item-card">
                      <div className="item-details">
                        <h4>{resourceObj ? resourceObj.name : `Espaço #${rev.resource_id}`}</h4>
                        <p>
                          <strong>Responsável:</strong> {rev.user_name}
                        </p>
                        <p>
                          <Clock size={14} style={{ display: 'inline' }} />{' '}
                          {new Date(rev.start_time).toLocaleString('pt-BR')} até{' '}
                          {new Date(rev.end_time).toLocaleString('pt-BR')}
                        </p>
                        <span className={`status-tag status-${rev.status}`}>{rev.status}</span>
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        {rev.status === 'scheduled' && (
                          <>
                            <button
                              className="btn-outline-danger"
                              style={{
                                borderColor: '#16a34a',
                                color: '#16a34a',
                              }}
                              onClick={() => handleStatusChange(rev.id, 'completed')}
                              title="Concluir"
                            >
                              <CheckCircle2 size={16} />
                            </button>
                            <button
                              className="btn-outline-danger"
                              onClick={() => handleStatusChange(rev.id, 'cancelled')}
                              title="Cancelar Reserva"
                            >
                              <XCircle size={16} />
                            </button>
                          </>
                        )}
                        <button
                          className="btn-outline-danger"
                          onClick={() => handleDeleteReservation(rev.id)}
                          title="Excluir Definitivamente"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
