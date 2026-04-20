export type SqlTypeIconKey =
  | 'numeric'
  | 'text'
  | 'date'
  | 'boolean'
  | 'json'
  | 'decimal'
  | 'uuid'
  | 'binary'
  | 'generic';

export function getTypeIconKey(rawType: string): SqlTypeIconKey {
  const normalized = rawType.toLowerCase();

  if (normalized.includes('int') || normalized.includes('number') || normalized.includes('serial')) return 'numeric';
  if (normalized.includes('char') || normalized.includes('text') || normalized.includes('clob')) return 'text';
  if (normalized.includes('date') || normalized.includes('time')) return 'date';
  if (normalized.includes('bool')) return 'boolean';
  if (normalized.includes('json') || normalized.includes('xml')) return 'json';
  if (normalized.includes('float') || normalized.includes('decimal') || normalized.includes('numeric')) return 'decimal';
  if (normalized.includes('uuid')) return 'uuid';
  if (normalized.includes('blob') || normalized.includes('bytea') || normalized.includes('raw')) return 'binary';

  return 'generic';
}
