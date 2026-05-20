type Primitive = string | number | boolean | bigint | symbol | null | undefined;

type Builtin = Primitive | Date | RegExp | Error | ((...args: never[]) => unknown);

declare global {
  type DeepReadonly<T> = T extends Builtin
    ? T
    : T extends Promise<infer U>
      ? Promise<DeepReadonly<U>>
      : T extends Map<infer K, infer V>
        ? ReadonlyMap<DeepReadonly<K>, DeepReadonly<V>>
        : T extends Set<infer U>
          ? ReadonlySet<DeepReadonly<U>>
          : T extends readonly (infer U)[]
            ? readonly DeepReadonly<U>[]
            : T extends object
              ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
              : T;
}

export {};
