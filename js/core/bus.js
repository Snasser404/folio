/* Typed publish/subscribe event bus. */
export function createBus() {
  const map = new Map();
  return {
    on(type, fn) {
      if (!map.has(type)) map.set(type, new Set());
      map.get(type).add(fn);
      return () => this.off(type, fn);
    },
    off(type, fn) {
      const s = map.get(type);
      if (s) s.delete(fn);
    },
    emit(type, payload) {
      const s = map.get(type);
      if (s) for (const fn of [...s]) {
        try { fn(payload); } catch (e) { console.error(`[bus] handler for "${type}" threw`, e); }
      }
    },
  };
}
