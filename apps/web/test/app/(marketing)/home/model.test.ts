import { getHomePageModel } from '@/app/(marketing)/home/model';

describe('getHomePageModel', () => {
  it('centralizes home page section copy and CTA specs', () => {
    const model = getHomePageModel();

    expect(model.hero.primaryCtaSource).toBe('home_hero');
    expect(model.washFold.features).toHaveLength(4);
    expect(model.dryCleaning.image.src).toBe('/graphic-img/dry-cleaning.webp');
    expect(model.testimonials.items[0]?.rating).toBe(5);
  });
});
