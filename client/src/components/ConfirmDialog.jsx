import { useEffect, useId, useRef } from 'react';

// Accessible replacement for window.confirm: role="dialog", aria-modal,
// labelled by its title, initial focus on Cancel (never on the destructive
// action), Escape cancels, and focus returns to the element that opened it.
export function ConfirmDialog({
  open,
  title,
  confirmLabel,
  cancelLabel = 'Cancelar',
  isBusy = false,
  confirmDisabled = false,
  destructive = false,
  onConfirm,
  onCancel,
  children,
}) {
  const titleId = useId();
  const cancelRef = useRef(null);
  // Latest onCancel without re-running the open effect on every render, which
  // would yank focus back to Cancel each time the dialog content changes.
  const onCancelRef = useRef(onCancel);
  useEffect(() => {
    onCancelRef.current = onCancel;
  });

  useEffect(() => {
    if (!open) return undefined;
    const opener = document.activeElement;
    cancelRef.current?.focus();

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onCancelRef.current();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      opener?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="dialog-backdrop">
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="dialog">
        <h3 id={titleId} className="card-title">
          {title}
        </h3>
        <div className="dialog-body">{children}</div>
        <div className="dialog-actions">
          <button
            type="button"
            className="btn"
            onClick={onCancel}
            ref={cancelRef}
            disabled={isBusy}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={destructive ? 'btn btn-danger' : 'btn btn-primary'}
            onClick={onConfirm}
            disabled={isBusy || confirmDisabled}
            aria-busy={isBusy}
          >
            {isBusy ? 'Processando...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
