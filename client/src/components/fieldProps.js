// Props that tie a control to its label and inline error (see FormField).
export function fieldProps(id, error) {
  return {
    id,
    className: `form-control${error ? ' is-invalid' : ''}`,
    'aria-invalid': error ? 'true' : undefined,
    'aria-describedby': error ? `${id}-error` : undefined,
  };
}
