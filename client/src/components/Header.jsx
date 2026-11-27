import { Building2 } from 'lucide-react';

export function Header() {
  return (
    <header>
      <div className="header-content">
        <div className="header-title">
          <Building2 size={28} color="#3b82f6" />
          <span>SREC - Sistema de Reservas & Coworking</span>
        </div>
        <span className="badge">v1.0.0</span>
      </div>
    </header>
  );
}
