/* Stable, collision-resistant id factory. */
let counter = 0;
export function uid(prefix = "id") {
  counter++;
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}${counter.toString(36)}`;
}
export const newPageId = () => uid("pg");
export const newObjId = () => uid("ob");
