import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ReservationsPanel } from './ReservationsPanel';

const RESOURCES = [{ id: 1, name: 'Sala Alpha', type: 'meeting_room', capacity: 8 }];
const RESERVATIONS = [
  {
    id: 7,
    resource_id: 1,
    user_name: 'Carlos Silva',
    start_time: '2099-01-01T10:00:00-03:00',
    end_time: '2099-01-01T11:00:00-03:00',
    status: 'scheduled',
  },
];

function setup() {
  const actions = {
    createReservation: vi.fn(),
    changeStatus: vi.fn(),
    removeReservation: vi.fn().mockResolvedValue({}),
  };
  render(
    <ReservationsPanel
      reservations={RESERVATIONS}
      resources={RESOURCES}
      loading={false}
      actions={actions}
      onSuccess={vi.fn()}
      onError={vi.fn()}
    />
  );
  return actions;
}

describe('ReservationsPanel — exclusão de reserva', () => {
  // FAILS BEFORE: deleting used window.confirm, outside the app's a11y pattern.
  it('pede confirmação num diálogo que cita o responsável', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm');
    const actions = setup();

    await user.click(
      screen.getByRole('button', { name: 'Excluir definitivamente a reserva de Carlos Silva' })
    );
    const dialog = await screen.findByRole('dialog', { name: 'Excluir esta reserva?' });
    expect(dialog).toHaveTextContent('Carlos Silva');
    expect(confirmSpy).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Excluir definitivamente' }));
    await waitFor(() => expect(actions.removeReservation).toHaveBeenCalledWith(7));
    confirmSpy.mockRestore();
  });
});
