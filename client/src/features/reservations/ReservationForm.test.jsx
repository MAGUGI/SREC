import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ReservationForm } from './ReservationForm';

const RESOURCES = [{ id: 1, name: 'Sala Alpha', type: 'meeting_room', capacity: 8 }];

function inputValue(hoursAhead) {
  const date = new Date(Date.now() + hoursAhead * 3600_000);
  const pad = (v) => String(v).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

function renderForm(props = {}) {
  render(
    <ReservationForm
      resources={RESOURCES}
      onCreate={vi.fn()}
      onSuccess={vi.fn()}
      onError={vi.fn()}
      {...props}
    />
  );
}

async function fill(user, { startHours = 24, endHours = 25 } = {}) {
  await user.type(screen.getByLabelText('Nome do Responsável'), 'Carlos Silva');
  await user.type(screen.getByLabelText('Horário de Início'), inputValue(startHours));
  await user.type(screen.getByLabelText('Horário de Término'), inputValue(endHours));
}

describe('ReservationForm', () => {
  // FAILS BEFORE (BUG-13): the button never disables and the POST goes out twice.
  it('dispara apenas um POST com duplo clique', async () => {
    const user = userEvent.setup();
    let resolve;
    const onCreate = vi.fn(
      () =>
        new Promise((r) => {
          resolve = r;
        })
    );
    renderForm({ onCreate });
    await fill(user);

    const button = screen.getByRole('button', { name: /Confirmar Reserva/ });
    await user.dblClick(button);

    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent('Confirmando...');

    resolve({ id: 1 });
    await waitFor(() => expect(button).toBeEnabled());
    expect(button).toHaveTextContent('Confirmar Reserva');
  });

  // FAILS BEFORE (mirrors BUG-02): the client sent an inverted window.
  it('não envia quando o término é antes do início', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    renderForm({ onCreate });
    await fill(user, { startHours: 25, endHours: 24 });
    await user.click(screen.getByRole('button', { name: /Confirmar Reserva/ }));

    expect(onCreate).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Horário de Término')).toHaveAccessibleDescription(
      'O término da reserva deve ser posterior ao início.'
    );
  });

  // FAILS BEFORE (mirrors BUG-08).
  it('não envia quando o início está no passado', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    renderForm({ onCreate });
    await fill(user, { startHours: -24, endHours: -23 });
    await user.click(screen.getByRole('button', { name: /Confirmar Reserva/ }));

    expect(onCreate).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Horário de Início')).toHaveAccessibleDescription(
      'Não é possível reservar um horário que já passou.'
    );
  });

  it('o input de início tem min e o de término acompanha o início', async () => {
    const user = userEvent.setup();
    renderForm();
    expect(screen.getByLabelText('Horário de Início')).toHaveAttribute('min');
    const start = inputValue(24);
    await user.type(screen.getByLabelText('Horário de Início'), start);
    expect(screen.getByLabelText('Horário de Término')).toHaveAttribute('min', start);
  });

  it('mostra o erro do servidor junto do campo pelo code do backend', async () => {
    const user = userEvent.setup();
    const apiError = Object.assign(new Error('Já existe uma reserva para este espaço.'), {
      status: 409,
      code: 'RESERVATION_OVERLAP',
      body: { error: 'Já existe uma reserva para este espaço.', code: 'RESERVATION_OVERLAP' },
    });
    renderForm({ onCreate: vi.fn().mockRejectedValue(apiError) });
    await fill(user);
    await user.click(screen.getByRole('button', { name: /Confirmar Reserva/ }));

    await waitFor(() =>
      expect(screen.getByLabelText('Horário de Início')).toHaveAccessibleDescription(
        'Já existe uma reserva para este espaço.'
      )
    );
  });

  it('libera o botão mesmo quando a requisição falha', async () => {
    const user = userEvent.setup();
    renderForm({ onCreate: vi.fn().mockRejectedValue(new Error('500')) });
    await fill(user);
    const button = screen.getByRole('button', { name: /Confirmar Reserva/ });
    await user.click(button);
    await waitFor(() => expect(button).toBeEnabled());
  });
});
