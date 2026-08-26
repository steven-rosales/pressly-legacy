export type MeasurementName = string;

export type MeasurementLabels = Readonly<Record<string, string>>;

/** Business metric-name unions are supplied by the deployment catalog. */
export type MeasurementSink<Name extends string = MeasurementName> = Readonly<{
  observe: (name: Name, value: number, labels?: MeasurementLabels) => void;
}>;

export const nullMeasurementSink: MeasurementSink = {
  observe: () => undefined,
};
