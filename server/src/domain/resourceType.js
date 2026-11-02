const RESOURCE_TYPE = Object.freeze({
  WORKSTATION: 'workstation',
  MEETING_ROOM: 'meeting_room',
});
const RESOURCE_TYPES = Object.freeze(Object.values(RESOURCE_TYPE));
const MIN_CAPACITY = 1;
const MAX_CAPACITY = 100;

/** BUG-10: a coluna `type` aceitava qualquer string. */
const isValidResourceType = (type) => typeof type === 'string' && RESOURCE_TYPES.includes(type);
/** BUG-09: capacidade 0, negativa, fracionária ou não numérica era gravada. */
const isValidCapacity = (capacity) => Number.isInteger(capacity) && capacity >= MIN_CAPACITY && capacity <= MAX_CAPACITY;

module.exports = { RESOURCE_TYPE, RESOURCE_TYPES, MIN_CAPACITY, MAX_CAPACITY, isValidResourceType, isValidCapacity };
