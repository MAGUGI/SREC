import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ResourceForm } from './ResourceForm';

describe('ResourceForm', () => {
  // FAILS BEFORE (mirrors BUG-09): capacity 0 was sent to the server.
  it('não envia com capacidade 0', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    render(<ResourceForm onSubmit={onCreate} onSuccess={vi.fn()} onError={vi.fn()} />);
    await user.type(screen.getByLabelText('Nome do Espaço / Estação'), 'Mesa 7');
    await user.clear(screen.getByLabelText('Capacidade (pessoas)'));
    await user.type(screen.getByLabelText('Capacidade (pessoas)'), '0');
    await user.click(screen.getByRole('button', { name: /Cadastrar Espaço/ }));

    expect(onCreate).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Capacidade (pessoas)')).toHaveAccessibleDescription(
      'A capacidade precisa ser um número inteiro de 1 ou mais.'
    );
  });

  // FAILS BEFORE (BUG-13 on the resource form).
  it('desabilita o botão durante o envio', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn(() => new Promise(() => {}));
    render(<ResourceForm onSubmit={onCreate} onSuccess={vi.fn()} onError={vi.fn()} />);
    await user.type(screen.getByLabelText('Nome do Espaço / Estação'), 'Mesa 7');
    const button = screen.getByRole('button', { name: /Cadastrar Espaço/ });
    await user.dblClick(button);

    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent('Cadastrando...');
  });
});
