export type ContractIssue = Readonly<{
  path: readonly (string | number)[];
  message: string;
}>;

export type DecodeResult<Value> =
  | Readonly<{ kind: 'valid'; value: Value }>
  | Readonly<{ kind: 'invalid'; issues: readonly ContractIssue[] }>;

export type CellOutcome<Output, Failure> =
  | Readonly<{ kind: 'success'; value: Output }>
  | Readonly<{ kind: 'failure'; failure: Failure }>;

export type BoundaryContractDescriptor = Readonly<{
  version: number;
}>;

export type BoundaryContract<Value> = BoundaryContractDescriptor &
  Readonly<{
    decode: (serialized: unknown) => DecodeResult<Value>;
    encode: (value: Value) => unknown;
  }>;

export type CellContractDescriptor = Readonly<{
  input: BoundaryContractDescriptor;
  output: BoundaryContractDescriptor;
  failure: BoundaryContractDescriptor;
}>;

export type CellContract<Input, Output, Failure> = Readonly<{
  input: BoundaryContract<Input>;
  output: BoundaryContract<Output>;
  failure: BoundaryContract<Failure>;
}>;

export type SubscriptionContractDescriptor = CellContractDescriptor &
  Readonly<{
    event: BoundaryContractDescriptor;
  }>;

/**
 * A subscription has one finite initial output and a versioned sequence of
 * later events. The live session itself is runtime-only and is deliberately
 * absent from this serialized contract.
 */
export type SubscriptionContract<Input, Output, Event, Failure> = CellContract<
  Input,
  Output,
  Failure
> &
  Readonly<{
    event: BoundaryContract<Event>;
  }>;

export type MessageScope = 'internal' | 'external';

export type MessageContractDescriptor = Readonly<{
  id: string;
  type: string;
  version: number;
  scope: MessageScope;
}>;

export type MessageContract<Payload> = MessageContractDescriptor &
  Readonly<{
    payload: BoundaryContract<Payload>;
  }>;

export const decode = Object.freeze({
  valid: <Value>(value: Value): DecodeResult<Value> =>
    Object.freeze({ kind: 'valid', value }),
  invalid: (issues: readonly ContractIssue[]): DecodeResult<never> =>
    Object.freeze({
      kind: 'invalid',
      issues: Object.freeze(
        issues.map((issue) =>
          Object.freeze({
            path: Object.freeze([...issue.path]),
            message: issue.message,
          }),
        ),
      ),
    }),
});

export const defineBoundaryContract = <Value>(
  definition: BoundaryContract<Value>,
): BoundaryContract<Value> => Object.freeze({ ...definition });

export const defineCellContract = <Input, Output, Failure>(
  definition: CellContract<Input, Output, Failure>,
): CellContract<Input, Output, Failure> => Object.freeze({ ...definition });

export const defineSubscriptionContract = <Input, Output, Event, Failure>(
  definition: SubscriptionContract<Input, Output, Event, Failure>,
): SubscriptionContract<Input, Output, Event, Failure> =>
  Object.freeze({ ...definition });

export const defineMessageContract = <Payload>(
  definition: Readonly<{
    type: string;
    version: number;
    scope?: MessageScope;
    payload: BoundaryContract<Payload>;
  }>,
): MessageContract<Payload> =>
  Object.freeze({
    id: `${definition.type}.v${definition.version}`,
    type: definition.type,
    version: definition.version,
    scope: definition.scope ?? 'internal',
    payload: definition.payload,
  });
