export interface LazyResource<T> {
  readonly opened: boolean;
  get(): T;
  closeIfOpened(): void;
}

export function createLazyResource<T>(factory: () => T, close?: (value: T) => void): LazyResource<T> {
  let value: T | null = null;
  return {
    get opened() {
      return value !== null;
    },
    get() {
      if (value === null) value = factory();
      return value;
    },
    closeIfOpened() {
      if (value === null) return;
      const current = value;
      value = null;
      close?.(current);
    },
  };
}

export function createLazyResourceProxy<T extends object>(resource: LazyResource<T>): T {
  return new Proxy({} as T, {
    get(_target, property) {
      const current = resource.get();
      const value = Reflect.get(current, property, current);
      return typeof value === "function" ? value.bind(current) : value;
    },
    set(_target, property, value) {
      const current = resource.get();
      return Reflect.set(current, property, value, current);
    },
    has(_target, property) {
      return property in resource.get();
    },
  });
}
