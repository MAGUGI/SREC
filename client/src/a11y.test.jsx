import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import App from './App';
import { ResourceForm } from './features/resources/ResourceForm';
import { ResourceListItem } from './features/resources/ResourceListItem';
import { ReservationForm } from './features/reservations/ReservationForm';
import { ReservationListItem } from './features/reservations/ReservationListItem';

vi.mock('./services/api', () => ({
  api: {
    getResources: vi.fn().mockResolvedValue([]),
    getReservations: vi.fn().mockResolvedValue([]),
  },
}));

const noop = vi.fn();
const RESOURCES = [{ id: 1, name: 'Sala Alpha', type: 'meeting_room', capacity: 8 }];
const RESERVATION = {
  id: 7,
  resource_id: 1,
  user_name: 'Carlos Silva',
  status: 'scheduled',
  start_time: '2026-10-21T13:00:00-03:00',
  end_time: '2026-10-21T14:00:00-03:00',
};

describe('acessibilidade dos formulários', () => {
  // FAILS BEFORE (CS-13): getByLabelText finds nothing.
  it('os 3 campos do formulário de espaço têm rótulo associado', () => {
    render(<ResourceForm onCreate={noop} onSuccess={noop} onError={noop} />);
    expect(screen.getByLabelText('Nome do Espaço / Estação')).toHaveAttribute('type', 'text');
    expect(screen.getByLabelText('Tipo').tagName).toBe('SELECT');
    expect(screen.getByLabelText('Capacidade (pessoas)')).toHaveAttribute('type', 'number');
  });

  it('os 4 campos do formulário de agendamento têm rótulo associado', () => {
    render(
      <ReservationForm resources={RESOURCES} onCreate={noop} onSuccess={noop} onError={noop} />
    );
    expect(screen.getByLabelText('Selecione o Espaço').tagName).toBe('SELECT');
    expect(screen.getByLabelText('Nome do Responsável')).toHaveAttribute('type', 'text');
    expect(screen.getByLabelText('Horário de Início')).toHaveAttribute('type', 'datetime-local');
    expect(screen.getByLabelText('Horário de Término')).toHaveAttribute('type', 'datetime-local');
  });

  it('nenhum id de campo é duplicado no documento', () => {
    const { container } = render(
      <>
        <ResourceForm idPrefix="a" onCreate={noop} onSuccess={noop} onError={noop} />
        <ResourceForm idPrefix="b" onCreate={noop} onSuccess={noop} onError={noop} />
        <ReservationForm resources={RESOURCES} onCreate={noop} onSuccess={noop} onError={noop} />
      </>
    );
    const ids = [...container.querySelectorAll('[id]')].map((el) => el.id);
    expect(ids).toHaveLength(10);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('acessibilidade dos botões de ícone', () => {
  // FAILS BEFORE: the buttons only have `title`, which is not an accessible name.
  it('os botões da reserva têm nome que identifica o item', () => {
    render(
      <ReservationListItem
        reservation={RESERVATION}
        resourceName="Sala Alpha"
        onChangeStatus={noop}
        onDelete={noop}
      />
    );
    const names = [
      'Concluir a reserva de Carlos Silva',
      'Cancelar a reserva de Carlos Silva',
      'Excluir definitivamente a reserva de Carlos Silva',
    ];
    for (const name of names) {
      const button = screen.getByRole('button', { name });
      expect(button.querySelector('svg').closest('[aria-hidden="true"]')).not.toBeNull();
    }
  });

  it('o botão de excluir espaço tem nome que identifica o espaço', () => {
    render(<ResourceListItem resource={RESOURCES[0]} onDelete={noop} />);
    const button = screen.getByRole('button', { name: 'Excluir o espaço Sala Alpha' });
    expect(button.querySelector('svg').closest('[aria-hidden="true"]')).not.toBeNull();
  });
});

describe('região live do feedback', () => {
  it('a barra de feedback é uma região live sempre presente, mesmo vazia', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText('Nenhum espaço cadastrado ainda.')).toBeVisible());
    const alert = screen.getByRole('alert', { hidden: true });
    expect(alert).toHaveAttribute('aria-live', 'assertive');
    expect(alert).toBeEmptyDOMElement();
  });
});
