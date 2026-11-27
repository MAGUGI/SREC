import { useMemo, useState } from 'react';
import { Calendar } from 'lucide-react';
import { Card } from '../../components/Card';
import { FormField } from '../../components/FormField';
import { SubmitButton } from '../../components/SubmitButton';
import { fieldProps } from '../../components/fieldProps';
import { useSubmit } from '../../hooks/useSubmit';
import { hasErrors, nowForDateTimeInput, serverFieldErrors } from '../../lib/validation';
import { RESERVATION_ERROR_FIELDS, validateReservation } from './validation';

const ID = {
  resource: 'reservation-form-resource',
  userName: 'reservation-form-user-name',
  startTime: 'reservation-form-start-time',
  endTime: 'reservation-form-end-time',
};

export function ReservationForm({ resources, onCreate, onSuccess, onError }) {
  const [resourceId, setResourceId] = useState('');
  const [userName, setUserName] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [errors, setErrors] = useState({});
  const minStart = useMemo(() => nowForDateTimeInput(), []);

  // Same as the received App.jsx:43-45: preselect the first resource
  // without overwriting a choice the user already made. Derived instead of
  // set in an effect, so react-hooks/set-state-in-effect needs no suppression.
  const selectedResourceId = resourceId || resources[0]?.id || '';

  const { isSubmitting, submit } = useSubmit(async () => {
    const values = {
      resource_id: selectedResourceId,
      user_name: userName,
      start_time: startTime,
      end_time: endTime,
    };
    const clientErrors = validateReservation(values);
    setErrors(clientErrors);
    if (hasErrors(clientErrors)) return; // no request goes out

    try {
      await onCreate(values);
      setUserName('');
      setStartTime('');
      setEndTime('');
      onSuccess('Reserva confirmada com sucesso!');
    } catch (err) {
      // The server (BE-02) is the authority: its message wins over ours.
      setErrors(serverFieldErrors(err, RESERVATION_ERROR_FIELDS));
      onError(err.message);
    }
  });

  return (
    <Card title="Novo Agendamento">
      {/* noValidate: our messages replace the browser's native bubbles. */}
      <form onSubmit={submit} noValidate>
        <FormField id={ID.resource} label="Selecione o Espaço" error={errors.resource_id}>
          <select
            {...fieldProps(ID.resource, errors.resource_id)}
            value={selectedResourceId}
            onChange={(e) => setResourceId(e.target.value)}
            required
          >
            {resources.map((resource) => (
              <option key={resource.id} value={resource.id}>
                {resource.name} ({resource.type})
              </option>
            ))}
          </select>
        </FormField>
        <FormField id={ID.userName} label="Nome do Responsável" error={errors.user_name}>
          <input
            {...fieldProps(ID.userName, errors.user_name)}
            type="text"
            placeholder="Ex: Carlos Silva"
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            required
          />
        </FormField>
        <FormField id={ID.startTime} label="Horário de Início" error={errors.start_time}>
          <input
            {...fieldProps(ID.startTime, errors.start_time)}
            type="datetime-local"
            min={minStart}
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            required
          />
        </FormField>
        <FormField id={ID.endTime} label="Horário de Término" error={errors.end_time}>
          <input
            {...fieldProps(ID.endTime, errors.end_time)}
            type="datetime-local"
            min={startTime || minStart}
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            required
          />
        </FormField>
        <SubmitButton
          isSubmitting={isSubmitting}
          idleLabel="Confirmar Reserva"
          busyLabel="Confirmando..."
          icon={<Calendar size={18} />}
        />
      </form>
    </Card>
  );
}
