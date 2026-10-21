import { useState } from 'react';
import { Alert } from './components/Alert';
import { Header } from './components/Header';
import { Tabs } from './components/Tabs';
import { useAppData } from './hooks/useAppData';
import { useFeedback } from './hooks/useFeedback';
import { ResourcesPanel } from './features/resources/ResourcesPanel';
import { ReservationsPanel } from './features/reservations/ReservationsPanel';

const TABS = [
  { id: 'resources', label: 'Espaços e Salas' },
  { id: 'reservations', label: 'Agendamentos' },
];

function App() {
  const [activeTab, setActiveTab] = useState('resources');
  const { message, showFeedback } = useFeedback();
  const data = useAppData(showFeedback);

  const onSuccess = async (text) => {
    showFeedback(text);
    await data.reloadAll();
  };
  const onError = (text) => showFeedback(text, 'error');

  return (
    <div>
      <Header />
      <div className="container">
        <Alert text={message.text} type={message.type} />
        <Tabs items={TABS} activeId={activeTab} onChange={setActiveTab} />
        {activeTab === 'resources' && (
          <ResourcesPanel
            resources={data.resources}
            loading={data.loading}
            onCreate={data.resourceActions.createResource}
            onDelete={data.resourceActions.removeResource}
            onSuccess={onSuccess}
            onError={onError}
          />
        )}
        {activeTab === 'reservations' && (
          <ReservationsPanel
            reservations={data.reservations}
            resources={data.resources}
            loading={data.loading}
            actions={data.reservationActions}
            onSuccess={onSuccess}
            onError={onError}
          />
        )}
      </div>
    </div>
  );
}

export default App;
