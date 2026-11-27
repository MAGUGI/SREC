// The live region stays in the DOM even when empty: screen readers often skip
// content of a live region that was just inserted.
export function Alert({ text, type }) {
  return (
    <div
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
      className={text ? `alert alert-${type}` : 'alert-placeholder'}
    >
      {text}
    </div>
  );
}
