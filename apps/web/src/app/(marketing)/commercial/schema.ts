import { z } from 'zod';

export const commercialInquirySchema = z.object({
  companyName: z.string().min(1, 'Company name is required'),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.email('Invalid email address'),
  phone: z.string().min(10, 'Phone number is required'),
  location: z.string().min(1, 'Location is required'),
  needs: z.string().min(10, 'Please tell us more about your needs'),
});

export type CommercialInquiry = z.infer<typeof commercialInquirySchema>;

export const commercialInquiryDefaults: CommercialInquiry = {
  companyName: '',
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  location: '',
  needs: '',
};
