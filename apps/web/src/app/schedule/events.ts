import { defineEvent } from '@pressly/observability';

export const scheduleEvents = {
  faqOpened: (input: { questionId: string }) =>
    defineEvent('faq_dialog_opened')({ question_id: input.questionId }),
};
