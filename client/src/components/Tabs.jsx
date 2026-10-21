export function Tabs({ items, activeId, onChange }) {
  return (
    <div className="nav-tabs">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`tab-btn ${activeId === item.id ? 'active' : ''}`}
          onClick={() => onChange(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
