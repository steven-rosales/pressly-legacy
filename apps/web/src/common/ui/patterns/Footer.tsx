import Link from 'next/link';

type FooterLink = {
  label: string;
  href: string;
  isText?: boolean;
  isSubtext?: boolean;
  external?: boolean;
};

type FooterSection = {
  title: string;
  links: FooterLink[];
};

const FOOTER_SECTIONS: FooterSection[] = [
  {
    title: 'Contact Us',
    links: [
      { label: 'Customer Care Hours', href: '#', isText: true },
      {
        label: 'Mon-Sun | 1pm - 10pm',
        href: '#',
        isText: true,
        isSubtext: true,
      },
      { label: 'Phone Number', href: '#', isText: true },
      { label: '(862) 310-6447', href: 'tel:8623106447', isSubtext: true },
      { label: 'Email Address', href: '#', isText: true },
      {
        label: 'care@trypressly.com',
        href: 'mailto:care@trypressly.com',
        isSubtext: true,
      },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'Commercial', href: '/commercial' },
      { label: 'Services & Pricing', href: '/services-pricing/wash-fold' },
      { label: 'About Us', href: '/about' },
      { label: 'FAQs', href: '/faqs' },
      { label: 'Privacy Policy', href: '/privacy' },
      { label: 'Terms of Service', href: '/terms' },
      { label: 'Careers', href: '/careers' },
    ],
  },
  {
    title: 'Connect',
    links: [
      { label: 'Contact', href: '/contact' },
      { label: 'Instagram', href: 'https://instagram.com', external: true },
      { label: 'Facebook', href: 'https://facebook.com', external: true },
      { label: 'Tiktok', href: 'https://tiktok.com', external: true },
    ],
  },
  {
    title: 'Laundry',
    links: [
      {
        label: 'Newark Laundry',
        href: '/new-jersey/essex-county/laundry-service-in-newark',
      },
      {
        label: 'Jersey City Laundry',
        href: '/new-jersey/hudson-county/laundry-service-in-jersey-city',
      },
      {
        label: 'Paterson Laundry',
        href: '/new-jersey/passaic-county/laundry-service-in-paterson',
      },
      {
        label: 'Clifton Laundry',
        href: '/new-jersey/passaic-county/laundry-service-in-clifton',
      },
      {
        label: 'Union City Laundry',
        href: '/new-jersey/hudson-county/laundry-service-in-union-city',
      },
      {
        label: 'North Bergen Laundry',
        href: '/new-jersey/hudson-county/laundry-service-in-north-bergen',
      },
      {
        label: 'Hoboken Laundry',
        href: '/new-jersey/hudson-county/laundry-service-in-hoboken',
      },
      {
        label: 'Hackensack Laundry',
        href: '/new-jersey/bergen-county/laundry-service-in-hackensack',
      },
      {
        label: 'Teaneck Laundry',
        href: '/new-jersey/bergen-county/laundry-service-in-teaneck',
      },
      {
        label: 'Bloomfield Laundry',
        href: '/new-jersey/essex-county/laundry-service-in-bloomfield',
      },
      {
        label: 'Fort Lee Laundry',
        href: '/new-jersey/bergen-county/laundry-service-in-fort-lee',
      },
      {
        label: 'Belleville Laundry',
        href: '/new-jersey/essex-county/laundry-service-in-belleville',
      },
    ],
  },
  {
    title: 'Dry Cleaning',
    links: [
      {
        label: 'Newark Dry Cleaners',
        href: '/new-jersey/essex-county/dry-cleaners-in-newark',
      },
      {
        label: 'Jersey City Dry Cleaners',
        href: '/new-jersey/hudson-county/dry-cleaners-in-jersey-city',
      },
      {
        label: 'Paterson Dry Cleaners',
        href: '/new-jersey/passaic-county/dry-cleaners-in-paterson',
      },
      {
        label: 'Clifton Dry Cleaners',
        href: '/new-jersey/passaic-county/dry-cleaners-in-clifton',
      },
      {
        label: 'Union City Dry Cleaners',
        href: '/new-jersey/hudson-county/dry-cleaners-in-union-city',
      },
      {
        label: 'North Bergen Dry Cleaners',
        href: '/new-jersey/hudson-county/dry-cleaners-in-north-bergen',
      },
      {
        label: 'Hoboken Dry Cleaners',
        href: '/new-jersey/hudson-county/dry-cleaners-in-hoboken',
      },
      {
        label: 'Hackensack Dry Cleaners',
        href: '/new-jersey/bergen-county/dry-cleaners-in-hackensack',
      },
      {
        label: 'Teaneck Dry Cleaners',
        href: '/new-jersey/bergen-county/dry-cleaners-in-teaneck',
      },
      {
        label: 'Bloomfield Dry Cleaners',
        href: '/new-jersey/essex-county/dry-cleaners-in-bloomfield',
      },
      {
        label: 'Fort Lee Dry Cleaners',
        href: '/new-jersey/bergen-county/dry-cleaners-in-fort-lee',
      },
      {
        label: 'Belleville Dry Cleaners',
        href: '/new-jersey/essex-county/dry-cleaners-in-belleville',
      },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="bg-muted/30 border-t border-border">
      <div className="mx-auto max-w-360 px-4 sm:px-6 py-12 lg:py-16">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-3 lg:grid-cols-5">
          {FOOTER_SECTIONS.map((section, index) => (
            <div key={index}>
              <h3 className="mb-4 text-base font-semibold text-foreground">
                {section.title}
              </h3>
              <ul className="space-y-2">
                {section.links.map((link, linkIndex) => (
                  <li key={linkIndex}>
                    {link.isText ? (
                      <span
                        className={`text-sm ${link.isSubtext ? 'text-foreground' : 'text-foreground font-medium'}`}
                      >
                        {link.label}
                      </span>
                    ) : (
                      <Link
                        href={link.href}
                        className="text-sm text-muted-foreground transition hover:text-foreground cursor-pointer"
                        {...(link.external && {
                          target: '_blank',
                          rel: 'noopener noreferrer',
                        })}
                      >
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 border-t border-border pt-8">
          <p className="text-sm text-muted-foreground">
            © 2025 All Rights Reserved | Pressly, Inc.
          </p>
        </div>
      </div>
    </footer>
  );
}
