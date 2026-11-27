import { FieldError } from './FieldError';

// Label + control + inline error. The control gets its a11y wiring from
// fieldProps(id, error), so label, error and aria-describedby always match.
export function FormField({ id, label, error, children }) {
  return (
    <div className="form-group">
      <label htmlFor={id}>{label}</label>
      {children}
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}
