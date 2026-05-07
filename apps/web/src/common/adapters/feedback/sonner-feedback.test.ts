import { toast } from 'sonner';
import { makeSonnerFeedback } from './sonner-feedback';

vi.mock('sonner', () => ({
  toast: {
    loading: vi.fn(() => 'toast-id'),
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    dismiss: vi.fn(),
  },
}));

describe('makeSonnerFeedback', () => {
  it('adapts feedback calls to sonner', () => {
    const feedback = makeSonnerFeedback();

    const id = feedback.loading({
      title: 'Saving...',
      description: 'One moment.',
    });

    feedback.success({ title: 'Saved.' });
    feedback.error({ title: 'Failed.' });
    feedback.info({ title: 'Info.' });
    feedback.dismiss(id);

    expect(toast.loading).toHaveBeenCalledWith('Saving...', {
      description: 'One moment.',
    });
    expect(toast.success).toHaveBeenCalledWith('Saved.', {});
    expect(toast.error).toHaveBeenCalledWith('Failed.', {});
    expect(toast.info).toHaveBeenCalledWith('Info.', {});
    expect(toast.dismiss).toHaveBeenCalledWith('toast-id');
  });
});
