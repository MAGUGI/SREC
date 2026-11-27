import { useState } from 'react';
import { PlusCircle, Save } from 'lucide-react';
import { Card } from '../../components/Card';
import { FormField } from '../../components/FormField';
import { SubmitButton } from '../../components/SubmitButton';
import { fieldProps } from '../../components/fieldProps';
import { RESOURCE_TYPE } from '../../constants/domain';
import { useSubmit } from '../../hooks/useSubmit';
import { hasErrors, serverFieldErrors } from '../../lib/validation';
import { RESOURCE_ERROR_FIELDS, validateResource } from './validation';

// One form for both modes (FE-05): create by default, edit with
// mode="edit" + initialValues. Literal ids (not useId) so tests and DevTools
// can reference them; idPrefix keeps both forms in the DOM without clashes.
export function ResourceForm({
  idPrefix = 'resource-form',
  mode = 'create',
  initialValues = null,
  onSubmit,
  onCancel,
  onSuccess,
  onError,
}) {
  const isEdit = mode === 'edit';
  const title = isEdit ? 'Editar Espaço' : 'Novo Espaço';
  const ID = {
    name: `${idPrefix}-name`,
    type: `${idPrefix}-type`,
    capacity: `${idPrefix}-capacity`,
  };

  const [name, setName] = useState(initialValues?.name ?? '');
  const [type, setType] = useState(initialValues?.type ?? RESOURCE_TYPE.WORKSTATION);
  const [capacity, setCapacity] = useState(initialValues?.capacity ?? 1);
  const [errors, setErrors] = useState({});

  const { isSubmitting, submit } = useSubmit(async () => {
    const values = { name, type, capacity };
    const clientErrors = validateResource(values);
    setErrors(clientErrors);
    if (hasErrors(clientErrors)) return; // no request goes out

    try {
      await onSubmit(values);
      if (isEdit) return; // the panel closes the edit form and reports success
      setName('');
      setCapacity(1);
      onSuccess('Espaço cadastrado com sucesso!');
    } catch (err) {
      setErrors(serverFieldErrors(err, RESOURCE_ERROR_FIELDS));
      onError(err.message);
    }
  });

  return (
    <Card title={title}>
      {/* noValidate: our messages replace the browser's native bubbles. */}
      <form onSubmit={submit} noValidate aria-label={title}>
        <FormField id={ID.name} label="Nome do Espaço / Estação" error={errors.name}>
          <input
            {...fieldProps(ID.name, errors.name)}
            type="text"
            placeholder="Ex: Sala de Reunião Alpha"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </FormField>
        <FormField id={ID.type} label="Tipo" error={errors.type}>
          <select
            {...fieldProps(ID.type, errors.type)}
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option value={RESOURCE_TYPE.WORKSTATION}>Estação de Trabalho</option>
            <option value={RESOURCE_TYPE.MEETING_ROOM}>Sala de Reunião</option>
          </select>
        </FormField>
        <FormField id={ID.capacity} label="Capacidade (pessoas)" error={errors.capacity}>
          <input
            {...fieldProps(ID.capacity, errors.capacity)}
            type="number"
            min="1"
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
            required
          />
        </FormField>
        <div className="dialog-actions">
          {isEdit && (
            <button type="button" className="btn" onClick={onCancel} disabled={isSubmitting}>
              Cancelar
            </button>
          )}
          <SubmitButton
            isSubmitting={isSubmitting}
            idleLabel={isEdit ? 'Salvar alterações' : 'Cadastrar Espaço'}
            busyLabel={isEdit ? 'Salvando...' : 'Cadastrando...'}
            icon={isEdit ? <Save size={18} /> : <PlusCircle size={18} />}
          />
        </div>
      </form>
    </Card>
  );
}
