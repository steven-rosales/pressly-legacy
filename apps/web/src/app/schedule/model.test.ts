import { getSchedulePageModel } from './model';

describe('getSchedulePageModel', () => {
  it('builds schedule iframe, pricing, and FAQ data without UI logic', () => {
    const model = getSchedulePageModel();

    expect(model.orderUrl).toContain('app.trycents.com');
    expect(model.pricing.washFold).toEqual(
      expect.arrayContaining([expect.objectContaining({ label: 'Per pound' })]),
    );
    expect(model.faqs).toHaveLength(4);
  });
});
