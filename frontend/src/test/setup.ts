// Vitest global setup. Runs once per test file (before the test module loads).
//
// Why this exists: Node ≥22 ships an experimental built-in `globalThis.localStorage`
// that is *disabled* unless the process is started with `--localstorage-file`. On
// such Node versions that native global shadows the jsdom-provided storage, so a
// bare `localStorage.clear()` throws `Cannot read properties of undefined`. (CI on
// Node 20 has no native global, so jsdom's storage worked there — this only bit
// local runs on newer Node.) We install a real in-memory Web Storage polyfill,
// overriding the broken native getter (its descriptor is `configurable: true`).

class MemoryStorage implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) as string) : null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(String(key), String(value));
  }
}

function installStorage(name: "localStorage" | "sessionStorage"): void {
  const storage = new MemoryStorage();
  const define = (target: object) =>
    Object.defineProperty(target, name, {
      value: storage,
      configurable: true,
      writable: true,
    });
  define(globalThis);
  if (typeof window !== "undefined" && window !== (globalThis as unknown)) {
    define(window);
  }
}

installStorage("localStorage");
installStorage("sessionStorage");
