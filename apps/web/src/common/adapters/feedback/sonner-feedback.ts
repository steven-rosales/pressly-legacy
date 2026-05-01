'use client';

import { toast } from 'sonner';
import type {
  FeedbackId,
  FeedbackMessage,
  FeedbackPort,
} from '@/common/core/feedback/feedback';

const toDescription = (message: FeedbackMessage): { description?: string } =>
  message.description === undefined ? {} : { description: message.description };

export const makeSonnerFeedback = (): FeedbackPort => ({
  loading: (message) =>
    toast.loading(message.title, toDescription(message)) as FeedbackId,
  success: (message) => toast.success(message.title, toDescription(message)),
  error: (message) => toast.error(message.title, toDescription(message)),
  info: (message) => toast.info(message.title, toDescription(message)),
  dismiss: (id) => toast.dismiss(id),
});
