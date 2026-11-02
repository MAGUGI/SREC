import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from './ConfirmDialog';

function Harness({ onConfirm = vi.fn(), onCancel = vi.fn() }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Abrir
      </button>
      <ConfirmDialog
        open={open}
        title="Excluir item?"
        confirmLabel="Excluir"
        destructive
        onConfirm={onConfirm}
        onCancel={() => {
          onCancel();
          setOpen(false);
        }}
      >
        <p>Não há como desfazer.</p>
      </ConfirmDialog>
    </>
  );
}

async function openDialog(props) {
  const user = userEvent.setup();
  render(<Harness {...props} />);
  await user.click(screen.getByRole('button', { name: 'Abrir' }));
  return user;
}

describe('ConfirmDialog', () => {
  it('é um diálogo modal', async () => {
    await openDialog();
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
  });

  it('tem o título como nome acessível', async () => {
    await openDialog();
    expect(screen.getByRole('dialog', { name: 'Excluir item?' })).toBeInTheDocument();
  });

  it('abre com o foco no Cancelar, nunca na ação destrutiva', async () => {
    await openDialog();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveFocus();
  });

  it('Escape cancela', async () => {
    const onCancel = vi.fn();
    const user = await openDialog({ onCancel });
    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('devolve o foco ao botão que abriu o diálogo', async () => {
    const user = await openDialog();
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.getByRole('button', { name: 'Abrir' })).toHaveFocus();
  });
});
