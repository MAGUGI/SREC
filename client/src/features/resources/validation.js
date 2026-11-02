import { isBlank } from '../../lib/validation';
import { RESOURCE_TYPE } from '../../constants/domain';

const VALID_TYPES = Object.values(RESOURCE_TYPE);
// VARCHAR(100) in the schema.
const MAX_NAME_LENGTH = 100;

// Backend error codes (resourceService) and the field each one is about.
export const RESOURCE_ERROR_FIELDS = {
  RESOURCE_FIELDS_REQUIRED: 'name',
  INVALID_NAME: 'name',
};

export function validateResource(values) {
  const errors = {};

  if (isBlank(values.name)) {
    errors.name = 'Informe o nome do espaço.';
  } else if (values.name.trim().length > MAX_NAME_LENGTH) {
    errors.name = `O nome tem no máximo ${MAX_NAME_LENGTH} caracteres.`;
  }

  if (!VALID_TYPES.includes(values.type)) {
    errors.type = 'Selecione um tipo válido.';
  }

  // Mirrors BUG-09: the server still turns 0 into 1 silently.
  const capacity = Number(values.capacity);
  if (isBlank(values.capacity) || !Number.isInteger(capacity) || capacity < 1) {
    errors.capacity = 'A capacidade precisa ser um número inteiro de 1 ou mais.';
  }

  return errors;
}
