import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ResourcesPanel } from './ResourcesPanel';

const RESOURCES = [{ id: 1, name: 'Sala Alpha', type: 'meeting_room', capacity: 8 }];
const reservation = (id, userName, startIso, status = 'scheduled') => ({
  id,
  resource_id: 1,
  user_name: userName,
  start_time: startIso,
  end_time: startIso,
  status,
});
const RESERVATIONS = [
  reservation(1, 'Bruno', '2099-01-01T10:00:00-03:00'),
  reservation(2, 'Carla', '2099-01-02T10:00:00-03:00'),
  reservation(3, 'Ana', '2020-01-01T10:00:00-03:00', 'completed'),
];

function setup({ reservations = RESERVATIONS, ...overrides } = {}) {
  const actions = {
    createResource: vi.fn(),
    updateResource: vi.fn().mockResolvedValue({}),
    removeResource: vi.fn().mockResolvedValue({}),
    fetchReservations: vi.fn().mockResolvedValue(reservations),
    ...overrides,
  };
  const onSuccess = vi.fn();
  const onError = vi.fn();
  render(
    <ResourcesPanel
      resources={RESOURCES}
      loading={false}
      actions={actions}
      onSuccess={onSuccess}
      onError={onError}
    />
  );
  return { actions, onSuccess, onError };
}

const openDelete = (user) =>
  user.click(screen.getByRole('button', { name: 'Excluir o espaço Sala Alpha' }));

describe('ResourcesPanel — edição (BUG-15)', () => {
  // FAILS BEFORE: there is no edit button anywhere in the interface.
  it('tem um botão de editar por espaço', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Editar o espaço Sala Alpha' })).toBeInTheDocument();
  });

  // FAILS BEFORE: api.updateResource is never called by any screen.
  it('salva a edição enviando os três campos ao PUT', async () => {
    const user = userEvent.setup();
    const { actions, onSuccess } = setup();

    await user.click(screen.getByRole('button', { name: 'Editar o espaço Sala Alpha' }));
    const item = screen.getByRole('form', { name: 'Editar Espaço' });
    const nameInput = within(item).getByLabelText('Nome do Espaço / Estação');
    expect(nameInput).toHaveValue('Sala Alpha');
    await user.clear(nameInput);
    await user.type(nameInput, 'Sala Beta');
    await user.click(within(item).getByRole('button', { name: /Salvar alterações/ }));

    await waitFor(() =>
      expect(actions.updateResource).toHaveBeenCalledWith(1, {
        name: 'Sala Beta',
        type: 'meeting_room',
        capacity: 8,
      })
    );
    expect(onSuccess).toHaveBeenCalledWith('Espaço atualizado com sucesso!');
  });

  it('cancelar a edição não chama o PUT e volta para o item', async () => {
    const user = userEvent.setup();
    const { actions } = setup();
    await user.click(screen.getByRole('button', { name: 'Editar o espaço Sala Alpha' }));
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(actions.updateResource).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Editar o espaço Sala Alpha' })).toBeInTheDocument();
  });

  it('criação e edição abertas juntas não duplicam id', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('button', { name: 'Editar o espaço Sala Alpha' }));
    const ids = [...document.querySelectorAll('[id]')].map((el) => el.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('ResourcesPanel — aviso de cascata (BUG-06)', () => {
  // FAILS BEFORE: window.confirm says 'Deseja realmente remover este espaço?'
  // and mentions no reservation at all.
  it('mostra a contagem de reservas afetadas antes de excluir', async () => {
    const user = userEvent.setup();
    const { actions } = setup();
    await openDelete(user);

    const dialog = await screen.findByRole('dialog', { name: 'Remover "Sala Alpha"?' });
    expect(
      await within(dialog).findByText('3 reservas', { selector: 'strong' })
    ).toBeInTheDocument();
    expect(within(dialog).getByText(/agendada\(s\) para o futuro/)).toHaveTextContent(/^2/);
    expect(within(dialog).getByText(/Bruno, Carla/)).toBeInTheDocument();
    expect(actions.fetchReservations).toHaveBeenCalledTimes(1);
  });

  // FAILS BEFORE: window.confirm deletes on the first OK, no second barrier.
  it('mantém o botão de remover desabilitado até o usuário reconhecer o impacto', async () => {
    const user = userEvent.setup();
    const { actions, onSuccess } = setup();
    await openDelete(user);

    const confirm = await screen.findByRole('button', { name: /Remover espaço e reservas/ });
    await screen.findByRole('checkbox');
    expect(confirm).toBeDisabled();
    await user.click(screen.getByRole('checkbox'));
    expect(confirm).toBeEnabled();

    await user.click(confirm);
    await waitFor(() => expect(actions.removeResource).toHaveBeenCalledWith(1));
    expect(onSuccess).toHaveBeenCalledWith('Espaço removido. 3 reserva(s) foram apagadas junto.');
  });

  it('não exige reconhecimento quando o espaço não tem reserva', async () => {
    const user = userEvent.setup();
    setup({ reservations: [] });
    await openDelete(user);
    expect(await screen.findByText(/não tem nenhuma reserva/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Remover espaço/ })).toBeEnabled();
  });

  it('não exclui nada quando a consulta de reservas falha', async () => {
    const user = userEvent.setup();
    const { actions, onError } = setup({
      fetchReservations: vi.fn().mockRejectedValue(new Error('rede caiu')),
    });
    await openDelete(user);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(actions.removeResource).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(
      'Não foi possível verificar as reservas deste espaço: rede caiu'
    );
  });

  it('Escape cancela sem excluir', async () => {
    const user = userEvent.setup();
    const { actions } = setup();
    await openDelete(user);
    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(actions.removeResource).not.toHaveBeenCalled();
  });
});
