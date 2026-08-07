const noteRequiredReasonCodes = new Set<string>([
  'recovery_entry',
  'manager_correction',
  'source_discrepancy',
  'manager_override',
  'production_hold',
]);

export const isOrderCommandReasonValid = <ReasonCode extends string>(input: {
  reasonCode: string;
  reasonNote: string | null;
  allowedReasonCodes: readonly ReasonCode[];
}): input is {
  reasonCode: ReasonCode;
  reasonNote: string | null;
  allowedReasonCodes: readonly ReasonCode[];
} => {
  const note = input.reasonNote?.trim() ?? null;
  return (
    input.allowedReasonCodes.some((code) => code === input.reasonCode) &&
    (note === null || (note.length > 0 && note.length <= 1_000)) &&
    (!noteRequiredReasonCodes.has(input.reasonCode) || note !== null)
  );
};
