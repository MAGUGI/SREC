// Icon-only button: `title` is a tooltip, not an accessible name, so the label
// also goes to aria-label and the icon is hidden from assistive technology.
export function IconButton({ label, onClick, className = 'btn-outline-danger', children }) {
  return (
    <button type="button" className={className} onClick={onClick} aria-label={label} title={label}>
      <span aria-hidden="true">{children}</span>
    </button>
  );
}
