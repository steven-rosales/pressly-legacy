export type CommercialPageModel = Readonly<{
  contact: Readonly<{
    title: string;
    description: string;
    submitLabel: string;
    fields: Readonly<{
      companyName: Readonly<{ label: string; placeholder: string }>;
      firstName: Readonly<{ label: string; placeholder: string }>;
      lastName: Readonly<{ label: string; placeholder: string }>;
      email: Readonly<{ label: string; placeholder: string }>;
      phone: Readonly<{ label: string; placeholder: string }>;
      location: Readonly<{ label: string; placeholder: string }>;
      needs: Readonly<{ label: string; placeholder: string }>;
    }>;
  }>;
  story: Readonly<{
    title: string;
    paragraphs: readonly string[];
  }>;
}>;

export const getCommercialPageModel = (): CommercialPageModel => ({
  contact: {
    title: 'Get Started Today',
    description:
      'Fill out the form below and our team will get back to you within 24 hours.',
    submitLabel: 'Submit Request',
    fields: {
      companyName: { label: 'Company Name', placeholder: 'Acme Corporation' },
      firstName: { label: 'First Name', placeholder: 'John' },
      lastName: { label: 'Last Name', placeholder: 'Doe' },
      email: { label: 'Email', placeholder: 'john@example.com' },
      phone: { label: 'Phone', placeholder: '(555) 123-4567' },
      location: { label: 'Location', placeholder: 'New York, NY' },
      needs: {
        label: 'Tell us more about your needs',
        placeholder: 'Please describe your commercial laundry needs...',
      },
    },
  },
  story: {
    title: 'Enterprise Laundry Solutions for Your Business',
    paragraphs: [
      'Running a business comes with enough moving parts—your laundry shouldn’t be one of them. Whether you manage a busy office, a wellness studio, or a growing hospitality team, we’re here to keep things fresh, clean, and always ready to go.',
      'From reliable pickups to high-quality cleaning, our commercial services are designed to give you peace of mind and one less thing to worry about. We handle everything with care, consistency, and a focus on making your days a little easier.',
      'If you have unique needs or special items, just let us know. We’ll work with you to build a simple, flexible plan that fits your workflow and helps your team shine.',
    ],
  },
});
