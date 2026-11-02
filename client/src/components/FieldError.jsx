export function FieldError({ id, message }) {
  if (!message) return null;
  return (
    <p className="form-error" id={id} role="alert">
      {message}
    </p>
  );
}
