import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { api } from './services/api';

vi.mock('./services/api', () => ({
  api: {
    getResources: vi.fn(),
    getReservations: vi.fn(),
    createResource: vi.fn(),
    deleteResource: vi.fn(),
    createReservation: vi.fn(),
    updateReservationStatus: vi.fn(),
    deleteReservation: vi.fn(),
  },
}));

const RESOURCES = [{ id: 1, name: 'Sala Alpha', type: 'meeting_room', capacity: 8 }];
const RESERVATIONS = [
  {
    id: 10,
    resource_id: 1,
    user_name: 'Carlos Silva',
    start_time: '2026-10-21T13:00:00.000Z',
    end_time: '2026-10-21T14:00:00.000Z',
    status: 'scheduled',
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  api.getResources.mockResolvedValue(RESOURCES);
  api.getReservations.mockResolvedValue(RESERVATIONS);
});

describe('App (caracterização do comportamento recebido)', () => {
  it('carrega as duas listas em uma única passada no mount', async () => {
    render(<App />);
    await waitFor(() => expect(api.getResources).toHaveBeenCalledTimes(1));
    expect(api.getReservations).toHaveBeenCalledTimes(1);
  });

  it('abre na aba de espaços e lista o recurso com tipo traduzido', async () => {
    render(<App />);
    expect(await screen.findByText('Sala Alpha')).toBeInTheDocument();
    expect(screen.getByText(/Tipo: Sala de Reunião/)).toBeInTheDocument();
    expect(screen.getByText(/Capacidade: 8/)).toBeInTheDocument();
  });

  it('troca para a aba de agendamentos e mostra a reserva', async () => {
    render(<App />);
    await screen.findByText('Sala Alpha');
    await userEvent.click(screen.getByRole('button', { name: 'Agendamentos' }));
    expect(screen.getByText('Reservas Realizadas')).toBeInTheDocument();
    expect(screen.getByText('Carlos Silva')).toBeInTheDocument();
    expect(screen.getByText('scheduled')).toBeInTheDocument();
  });

  it('cria espaço, mostra feedback e recarrega as duas listas', async () => {
    api.createResource.mockResolvedValue({ id: 2 });
    render(<App />);
    await screen.findByText('Sala Alpha');
    await userEvent.type(screen.getByPlaceholderText('Ex: Sala de Reunião Alpha'), 'Mesa 7');
    await userEvent.click(screen.getByRole('button', { name: /Cadastrar Espaço/ }));
    await waitFor(() =>
      expect(api.createResource).toHaveBeenCalledWith({
        name: 'Mesa 7',
        type: 'workstation',
        capacity: 1,
      })
    );
    expect(await screen.findByText('Espaço cadastrado com sucesso!')).toBeInTheDocument();
    await waitFor(() => expect(api.getResources).toHaveBeenCalledTimes(2));
  });
});
