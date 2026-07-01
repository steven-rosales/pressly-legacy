import { getFaqsPageModel } from '@/app/(marketing)/faqs/model';

describe('getFaqsPageModel', () => {
  it('builds visible FAQs and matching JSON-LD from the same model', () => {
    const model = getFaqsPageModel();

    expect(model.faqs.length).toBeGreaterThan(0);
    expect(model.jsonLd['@type']).toBe('FAQPage');
    expect(model.ctaSource).toBe('faq');
  });
});
