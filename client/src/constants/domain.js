export const RESOURCE_TYPE = {
  WORKSTATION: 'workstation',
  MEETING_ROOM: 'meeting_room',
};

export const RESOURCE_TYPE_LABEL = {
  [RESOURCE_TYPE.WORKSTATION]: 'Estação de Trabalho',
  [RESOURCE_TYPE.MEETING_ROOM]: 'Sala de Reunião',
};

export const RESERVATION_STATUS = {
  SCHEDULED: 'scheduled',
  CANCELLED: 'cancelled',
  COMPLETED: 'completed',
};

// Keeps the current text for the two known types and exposes any `type`
// outside the contract (BUG-10) instead of labeling it as a workstation.
export function resourceTypeLabel(type) {
  return RESOURCE_TYPE_LABEL[type] ?? type;
}
