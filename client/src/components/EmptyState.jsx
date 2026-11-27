export function EmptyState({ loading, isEmpty, emptyText }) {
  if (loading) return <p>Carregando...</p>;
  if (isEmpty) return <p>{emptyText}</p>;
  return null;
}
