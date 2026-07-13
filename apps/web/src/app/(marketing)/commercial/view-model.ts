'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import type { TrackPublicEvent } from '@/common/core/analytics/track';
import { commercialEvents } from './events';
import {
  commercialInquiryDefaults,
  commercialInquirySchema,
  type CommercialInquiry,
} from './schema';

export const useCommercialInquiryViewModel = (track: TrackPublicEvent) => {
  const form = useForm<CommercialInquiry>({
    resolver: zodResolver(commercialInquirySchema),
    defaultValues: commercialInquiryDefaults,
  });

  const submit = (_inquiry: CommercialInquiry): void => {
    track(commercialEvents.inquiryFormCompleted());
    // Submission transport will be added when the commercial inquiry API exists.
  };

  return { form, submit } as const;
};
