export type OperationalOrderControlContextSource = Readonly<{
  order: Readonly<{
    id: string;
    externalOrderId: string;
  }>;
}>;
