export type FeedbackId = string | number;

export type FeedbackMessage = Readonly<{ title: string; description?: string }>;

export type FeedbackPort = Readonly<{
  loading: (message: FeedbackMessage) => FeedbackId;
  success: (message: FeedbackMessage) => void;
  error: (message: FeedbackMessage) => void;
  info: (message: FeedbackMessage) => void;
  dismiss: (id: FeedbackId) => void;
}>;
