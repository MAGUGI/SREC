export function Alert({ text, type }) {
  if (!text) return null;
  return <div className={`alert alert-${type}`}>{text}</div>;
}
