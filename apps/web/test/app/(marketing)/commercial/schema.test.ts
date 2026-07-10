import {
  commercialInquiryDefaults,
  commercialInquirySchema,
} from '@/app/(marketing)/commercial/schema';

describe('commercialInquirySchema', () => {
  it('accepts a complete commercial inquiry', () => {
    const inquiry = {
      companyName: 'Pressly Test Co.',
      firstName: 'Pat',
      lastName: 'Lee',
      email: 'pat@example.com',
      phone: '8623106447',
      location: 'Newark, NJ',
      needs: 'Weekly towel service for our studio.',
    };

    expect(commercialInquirySchema.parse(inquiry)).toEqual(inquiry);
  });

  it('rejects the empty form model at the validation boundary', () => {
    const result = commercialInquirySchema.safeParse(commercialInquiryDefaults);

    expect(result.success).toBe(false);
  });
});
