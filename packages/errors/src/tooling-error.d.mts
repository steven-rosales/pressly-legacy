export type ToolingError = Error &
  Readonly<{
    tag: 'ToolingError';
    code: string;
  }>;

export type ToolingErrorInput = Readonly<{
  code: string;
  message: string;
  cause?: unknown;
  nativeKind?: 'Error' | 'RangeError' | 'TypeError';
}>;

export declare const toolingError: (input: ToolingErrorInput) => ToolingError;
