---
name: nextjs-company-seo-optimizer
description: >-
  next.js and react focused seo optimization for public company websites. use this skill when a user asks to audit, improve, migrate, implement, or review seo for a company website, including next.js app router or pages router metadata, server rendering, static generation, incremental static regeneration, streaming, sitemap, robots, canonicals, structured data, internal linking, content strategy, core web vitals, search console analysis, ai search visibility, serp research, or seo pr review. also use for public-only audits when no code or analytics access is available, and for code-level implementation plans when source files are available.
---

# Next.js Company SEO Optimizer

## Mission

Optimize a public company website for durable organic discovery, qualified search traffic, and measurable business outcomes.

Optimize in this order:

1. Indexability
2. Crawlability
3. Renderability
4. Canonical clarity
5. Information architecture
6. Page relevance
7. Structured understanding
8. Performance and page experience
9. Conversion alignment
10. Measurement and iteration

Treat SEO as a product and engineering system. The goal is not to add tags. The goal is to make the best canonical pages discoverable, understandable, fast, trustworthy, and useful for the queries and audiences that matter to the company.

## Non-negotiable rules

- Prefer evidence from the live website, source code, Search Console exports, analytics exports, server logs, crawler exports, and official platform documentation.
- Do not promise rankings, traffic volume, indexing, rich results, snippets, AI Overview inclusion, or AI Mode inclusion.
- Do not recommend keyword stuffing, doorway pages, hidden text, fake schema, fake reviews, copied content, scaled low-value AI content, link schemes, expired-domain abuse, misleading freshness updates, or cloaking.
- Do not use robots.txt to remove pages from the index. Use noindex or access control when the page must not appear in search.
- Do not add structured data for information that is not visible or verifiable on the page.
- Do not rely on client-only rendering for primary indexable content when server-rendered or statically rendered HTML is feasible.
- Do not treat generic SEO checklists as sufficient. Connect every recommendation to a page type, query intent, user need, implementation path, and measurement plan.
- Detect the installed Next.js version before giving version-specific instructions. Mark version-dependent guidance when the version is unknown.
- If the user says "SSE", clarify from context whether they mean SSR, SSG, streaming server rendering, or Server-Sent Events. For SEO leverage, SSR, SSG, ISR, RSC, streaming, and caching are primary. Server-Sent Events are not a primary SEO mechanism.

## Default assumptions

- The site is a public company website using Next.js or React.
- Prefer App Router patterns for new Next.js work.
- Support Pages Router when the codebase uses `pages/`.
- Prefer TypeScript examples unless the codebase is JavaScript.
- Prefer stable production features. Treat experimental Next.js features as opt-in only after checking the installed version and current docs.
- Use public web research for live SERP, competitor, and website state when the user gives a URL or company name.
- Use provided code, files, screenshots, exports, and connector results when available.

## Required intake

Collect or infer the following before giving a complete strategy. If missing, proceed with a public-only audit and state the limits.

### Business context

- Company name
- Website URL and canonical domain preference
- Primary product, service, or marketplace model
- Target geographies and languages
- Primary audiences and buying stages
- Business conversions: demo, signup, trial, purchase, lead, subscribe, contact, download, docs usage
- Main competitors and alternatives
- Brand constraints, legal constraints, compliance constraints

### Technical context

- Next.js version
- React version
- App Router or Pages Router
- Hosting platform and CDN
- CMS, database, or content source
- Sitemap URL
- robots.txt URL
- Important route patterns
- Rendering strategy per page type: static, dynamic, ISR, client-rendered, hybrid
- Internationalization strategy
- Authentication or gated content rules
- Staging and preview domains

### Data context

- Google Search Console property and exports when available
- Bing Webmaster Tools data when available
- GA4 or product analytics exports when available
- Crawl export from Screaming Frog, Sitebulb, Ahrefs, Semrush, JetOctopus, Lumar, or custom crawler when available
- Server log sample when crawl budget or indexation is an issue
- Lighthouse, CrUX, PageSpeed Insights, or web-vitals report when available

## Research workflow

Follow this sequence for full SEO optimization.

### 1. Define the search surface

Create a map of page types:

- Home
- Product or service pages
- Feature pages
- Use-case pages
- Industry pages
- Persona pages
- Pricing
- Comparison pages
- Alternatives pages
- Customer stories
- Blog or resource articles
- Documentation
- Developer docs or API references
- Marketplace listings
- Category pages
- Product detail pages
- Location pages
- Legal or trust pages
- About, careers, contact
- Search results, filtered pages, tag pages, author pages, pagination

For each page type, identify:

- Search intent
- Target audience
- Primary conversion
- Indexability policy
- Canonical policy
- Rendering strategy
- Metadata source
- Structured data type
- Internal-link role
- Freshness policy

### 2. Inspect the live site

When a URL is provided, inspect:

- `https://domain.com/robots.txt`
- Sitemap index and child sitemaps
- Homepage HTML source
- Representative pages from each page type
- Status codes and redirects
- Canonical tags
- Title and meta descriptions
- H1 and heading hierarchy
- Rendered DOM where tooling allows
- Link markup and navigation
- Image alt text and dimensions
- Structured data
- Open Graph and Twitter metadata
- `hreflang` and localized URLs
- Performance signals
- Mobile behavior
- Staging or duplicate host exposure

### 3. Research the SERP and competitors

For important page types and topics, compare:

- Dominant search intent
- SERP features
- AI Overview or AI Mode patterns when visible
- Query modifiers and related questions
- Competitor page formats
- Content depth and original value
- Schema usage
- Internal-link patterns
- Page experience
- Title and description positioning
- Commercial conversion paths

Do not copy competitors. Identify the minimum bar and the opportunity for original value.

### 4. Review code or implementation

When code is available, inspect:

- `app/` and `pages/` routing structure
- `layout.tsx`, `page.tsx`, `template.tsx`, `not-found.tsx`, `error.tsx`
- `generateMetadata`, static `metadata`, and metadata helper functions
- `app/sitemap.ts`, `app/robots.ts`, metadata files, `opengraph-image.tsx`, `twitter-image.tsx`
- `next.config.*`
- middleware or proxy files
- redirects and rewrites
- data fetching and caching behavior
- route segment config
- Client Component boundaries
- bundle size and third-party scripts
- dynamic route handling and 404 behavior
- content model and CMS field availability

## Next.js SEO leverage model

Use Next.js to make SEO implementation more reliable, more scalable, and easier to validate.

### App Router metadata

Use `metadata` for static metadata and `generateMetadata` for route-specific dynamic metadata.

Rules:

- Define `metadataBase` at the root layout for absolute canonical, Open Graph, and asset URLs.
- Use static `metadata` when page metadata does not depend on route params, request data, or CMS data.
- Use `generateMetadata` for products, posts, docs, locations, and other dynamic pages.
- Keep metadata exports in Server Components.
- Do not export both `metadata` and `generateMetadata` from the same route segment.
- Use file-based metadata for favicons, icons, OG images, Twitter images, robots, and sitemap when that is cleaner.
- Avoid route metadata that depends on unstable request-only data unless the page truly must be dynamic.
- Ensure title, description, canonical, robots, Open Graph, and Twitter metadata are page-specific.

Root example:

```tsx
import type { Metadata } from 'next';

export const metadata: Metadata = {
  metadataBase: new URL('https://www.example.com'),
  title: {
    default: 'Example | Category-defining product for target audience',
    template: '%s | Example',
  },
  description:
    'Clear one-sentence description of the company value proposition.',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    siteName: 'Example',
    url: '/',
  },
  twitter: {
    card: 'summary_large_image',
  },
};
```

Dynamic example:

```tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getProduct } from '@/lib/products';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProduct(slug);

  if (!product || product.noindex) {
    return {
      robots: { index: false, follow: false },
    };
  }

  return {
    title: product.seoTitle ?? product.name,
    description: product.seoDescription ?? product.summary,
    alternates: {
      canonical: `/products/${product.slug}`,
    },
    openGraph: {
      type: 'website',
      title: product.ogTitle ?? product.name,
      description: product.ogDescription ?? product.summary,
      url: `/products/${product.slug}`,
      images: product.ogImage
        ? [{ url: product.ogImage, alt: product.name }]
        : undefined,
    },
  };
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product || product.noindex) notFound();
  return <main>{/* indexable product content */}</main>;
}
```

### Rendering strategy selection

Choose rendering by page type.

#### Static rendering / SSG

Use for:

- Home pages with infrequent changes
- Evergreen product and feature pages
- Blog posts
- Docs pages
- Comparison pages
- Use-case pages
- Location pages with stable content

SEO benefit:

- Fast first byte from cache
- Stable HTML for crawlers
- Predictable canonical and metadata output
- Lower runtime cost

Next.js implementation:

- Use App Router Server Components by default.
- Use `generateStaticParams` for known dynamic routes.
- Use cached data fetches where useful.
- Use `dynamicParams = false` when only generated routes should exist.

#### ISR / revalidation

Use for:

- Pages with content that changes after publish
- Product inventory or pricing pages where real-time personalization is not required
- Article indexes and resource hubs
- Marketplace/category pages with controlled freshness needs

SEO benefit:

- Static-speed pages with scheduled or event-driven freshness
- Lower risk of stale SEO fields when revalidation is tied to CMS publish events

Next.js implementation:

- Use fetch caching and revalidation controls.
- Use `revalidatePath` or `revalidateTag` after CMS updates.
- Ensure metadata and visible content use the same source and revalidate together.

#### SSR / dynamic rendering

Use for:

- Pages requiring request-time data
- Personalization that cannot be safely cached
- Geo-specific content that changes by request
- Real-time inventory when stale content would harm users

SEO benefit:

- Server-rendered HTML can still expose primary content and metadata
- Useful when freshness is more important than static cache speed

Next.js implementation:

- Keep primary content server-rendered.
- Avoid making the entire route dynamic for trivial request data.
- Avoid request-time personalization in canonical content when it creates duplicate or inconsistent crawler output.
- Separate personalized UI from canonical page content.

#### Streaming server rendering

Use for:

- Slow secondary modules such as reviews, recommendations, related products, or dashboards
- Pages where the primary content can appear immediately while secondary content loads

SEO rule:

- Do not stream the title, H1, primary body, canonical content, or essential internal links behind slow boundaries when avoidable.
- Stream secondary content behind Suspense boundaries.

#### Partial Prerendering and Cache Components

Use only after checking the installed Next.js version and production readiness.

SEO pattern:

- Pre-render the stable, canonical shell.
- Stream or defer dynamic holes such as cart state, recommendations, user-specific banners, and account-specific widgets.
- Keep the page topic, metadata, primary copy, media, schema, and internal links in the stable shell when feasible.

### React Server Components

Use Server Components by default for indexable content.

Rules:

- Keep marketing copy, product details, article content, docs content, breadcrumbs, and structured data server-rendered.
- Use Client Components only for interactivity: filters, tabs, carousels, forms, calculators, login state, personalization.
- Push Client Component boundaries down the tree.
- Avoid `use client` at page or layout level unless the route truly requires it.
- Avoid fetching critical SEO content only in `useEffect`.

### Route handling and 404 quality

Rules:

- Use `notFound()` for missing dynamic resources.
- Do not return a 200 page with "not found" text.
- Use `redirect()` or configured redirects for moved canonical pages.
- Use 410 only when removal is intentional and permanent.
- Use `dynamicParams = false` when unknown dynamic paths must 404.
- Ensure noindex is not used as a substitute for correct 404 behavior.

### Sitemaps

Use `app/sitemap.ts` for smaller or medium sites and `generateSitemaps` or multiple sitemap files for large sites.

Rules:

- Include only canonical, indexable, 200-status URLs.
- Exclude redirects, 404s, soft 404s, noindex pages, faceted duplicates, internal search results, auth pages, staging URLs, and preview URLs.
- Keep `lastModified` tied to meaningful content changes.
- Split large sites by page type or sitemap index.
- Keep sitemap URLs consistent with canonical tags and internal links.
- Include localized alternates when supported and validated.

Example:

```tsx
import type { MetadataRoute } from 'next';
import { getPosts } from '@/lib/posts';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const posts = await getPosts();

  return [
    {
      url: 'https://www.example.com',
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
    ...posts
      .filter((post) => post.indexable)
      .map((post) => ({
        url: `https://www.example.com/blog/${post.slug}`,
        lastModified: post.updatedAt,
        changeFrequency: 'monthly' as const,
        priority: 0.7,
      })),
  ];
}
```

### Robots

Use `app/robots.ts` or static `robots.txt`.

Rules:

- Allow crawling of public assets required to render pages.
- Disallow crawl traps and private paths where appropriate.
- Do not disallow pages that need `noindex` to be seen.
- Include the sitemap URL.
- Block staging with authentication first; robots.txt alone is not a privacy boundary.

Example:

```tsx
import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/admin/', '/preview/'],
      },
    ],
    sitemap: 'https://www.example.com/sitemap.xml',
    host: 'https://www.example.com',
  };
}
```

### Dynamic Open Graph and social images

Use `opengraph-image.tsx`, `twitter-image.tsx`, or image-generation APIs when social sharing matters.

Rules:

- Generate page-specific OG images for articles, docs, products, case studies, and comparison pages.
- Include readable text, brand, and visual hierarchy.
- Set useful alt text in image metadata where supported.
- Cache dynamic images unless they require live data.

### Images

Use `next/image` for content images unless there is a clear reason not to.

Rules:

- Provide descriptive `alt` text for meaningful images.
- Use empty alt text for decorative images.
- Set dimensions or `fill` plus accurate `sizes` to avoid layout shift.
- Use `preload` for the likely LCP image on current Next.js versions that support it.
- For older versions, map LCP-image behavior to the version's supported prop.
- Avoid lazy loading the LCP image.
- Configure `remotePatterns` narrowly for external image hosts.
- Use AVIF/WebP where supported by the deployment path.
- Do not ship oversized hero images.

Example:

```tsx
import Image from 'next/image';

export function HeroImage() {
  return (
    <Image
      src="/images/platform-dashboard.png"
      alt="Example analytics dashboard showing revenue, retention, and activation metrics"
      width={1600}
      height={900}
      sizes="(min-width: 1024px) 50vw, 100vw"
      preload
    />
  );
}
```

### Fonts

Use `next/font` for local or Google fonts.

Rules:

- Prefer variable fonts.
- Apply core brand fonts in root layout.
- Avoid render-blocking external font CSS.
- Avoid font-induced layout shift.
- Do not load unused weights or subsets.

### Scripts and third parties

Use `next/script` and strategy selection.

Rules:

- Audit every third-party script for business necessity.
- Use `afterInteractive` for analytics and tag managers that need early execution.
- Use `lazyOnload` for chat widgets, social widgets, heatmaps, and low-priority tools.
- Use `beforeInteractive` only for scripts that must run before hydration, such as critical consent or bot tooling.
- Treat worker strategy as version- and router-dependent.
- Avoid third-party scripts on templates where they degrade LCP, INP, or conversion.

### Links and navigation

Use `next/link` for internal routes and ensure crawlable anchors exist.

Rules:

- Links must render as anchors with `href`.
- Do not rely on `onClick` navigation for crawl-critical links.
- Use descriptive anchor text.
- Link to canonical URLs.
- Build hub pages and contextual links around user journeys.
- Ensure breadcrumbs use links and match structured data.
- Avoid infinite faceted link spaces.

### International SEO

Rules:

- Set the correct `lang` attribute on `<html>`.
- Use `alternates.languages` or explicit `hreflang` for localized routes.
- Each localized page must canonicalize to the same-language canonical URL.
- Use self-referencing hreflang plus reciprocal language alternates.
- Do not canonicalize all languages to one English page unless those pages are true duplicates and should not be indexed.
- Localize metadata, body content, schema, currency, units, and conversion paths.

Example metadata fragment:

```tsx
export const metadata = {
  alternates: {
    canonical: '/pricing',
    languages: {
      'en-US': '/pricing',
      'es-ES': '/es/precios',
      'fr-FR': '/fr/tarifs',
    },
  },
};
```

## Technical SEO checklist

### Indexability

Check:

- Important pages return 200.
- Removed pages return 404, 410, or redirect to the closest relevant replacement.
- Thin internal search pages are noindexed or blocked from generation.
- Auth, account, cart, checkout, admin, preview, and staging routes are not indexable.
- `noindex` is present only where intentional.
- `X-Robots-Tag` is not accidentally applied to HTML, PDFs, images, or static assets.
- CDN, WAF, bot protection, geo rules, and consent tools do not block Googlebot or Bingbot from public content.

### Crawlability

Check:

- Public pages are discoverable through crawlable links.
- Navigation, footer, breadcrumbs, related content, and hub links use anchors with `href`.
- Orphan pages are either intentionally isolated or linked from a relevant hub.
- robots.txt avoids blocking CSS, JS, images, and route assets needed for rendering.
- XML sitemaps list canonical URLs only.
- Pagination is crawlable and useful.
- Faceted navigation does not create uncontrolled URL combinations.

### Canonicalization

Check:

- One canonical URL exists for each indexable page.
- Canonical tag, sitemap URL, internal links, redirects, Open Graph URL, and hreflang clusters agree.
- HTTP redirects to HTTPS.
- Non-preferred host redirects to preferred host.
- Trailing slash policy is consistent.
- Query-parameter variants canonicalize or noindex according to intent.
- UTM and tracking parameters do not create indexable duplicates.
- Locale pages canonicalize to same-locale pages.

### Rendering

Check:

- Primary content exists in initial HTML or reliably rendered DOM.
- Metadata is server-produced where possible.
- Canonical links are clear in source HTML for important pages.
- Primary headings and internal links are not gated behind client-only effects.
- Critical content does not require user interaction to load.
- Infinite scroll has crawlable paginated equivalents or server-rendered slices.
- Tabs and accordions contain accessible content.

### Metadata

Check:

- Unique title per indexable URL.
- Descriptive, concise title that matches page intent.
- H1 aligns with title without being identical in every template.
- Unique meta description for priority pages and generated page-specific descriptions for scaled page types.
- Robots metadata matches page policy.
- Canonical metadata is absolute or correctly resolved through `metadataBase`.
- Open Graph and Twitter metadata are complete for share-worthy pages.
- Favicon, icons, manifest, and site name signals are consistent.

### Structured data

Use JSON-LD unless the codebase has a clear reason to use another format.

Default schema map:

- Company homepage: `Organization`, `WebSite`, optional `SearchAction` when site search is useful and implemented.
- Product or SaaS feature page: `SoftwareApplication`, `Product` only when the page truly represents a product and has required visible fields.
- Breadcrumbs: `BreadcrumbList` on pages deeper than the homepage.
- Article or blog post: `Article` or `BlogPosting` with author, dates, image, headline.
- Docs pages: `TechArticle` or `Article` when appropriate.
- FAQ sections: `FAQPage` only when questions and answers are visible and eligible.
- Reviews: only mark up real visible reviews according to policy.
- Local business: `LocalBusiness` subtype with matching visible address, phone, hours, and profile data.
- Ecommerce: `Product`, `Offer`, `AggregateRating`, and `Review` only when data is real and visible.

Rules:

- Structured data must match visible content.
- Include required properties for the selected rich result type.
- Prefer fewer accurate properties over many weak or inferred properties.
- Validate with Rich Results Test or Schema Markup Validator.
- Avoid duplicate conflicting schema graphs.
- Use stable IDs such as `https://www.example.com/#organization`.

Example JSON-LD component:

```tsx
type JsonLdProps = {
  data: Record<string, unknown>;
};

export function JsonLd({ data }: JsonLdProps) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, '\\u003c'),
      }}
    />
  );
}
```

### Performance and Core Web Vitals

Audit:

- LCP: target 2.5 seconds or faster at the 75th percentile.
- INP: target 200 milliseconds or faster at the 75th percentile.
- CLS: target 0.1 or lower at the 75th percentile.
- TTFB, render-blocking resources, cache headers, image sizes, font loading, JavaScript execution, hydration cost, and third-party scripts.

Next.js actions:

- Keep marketing and content pages server-first.
- Remove unnecessary `use client` boundaries.
- Use `next/image` with correct dimensions and LCP handling.
- Use `next/font` and load only needed subsets/weights.
- Split heavy interactive components with dynamic import when they are non-critical.
- Defer or remove third-party scripts.
- Use route-level caching and revalidation intentionally.
- Stream secondary content, not primary content.
- Avoid layout shifts from ads, embeds, banners, cookie notices, fonts, images, and late-injected UI.

## Content and information architecture

### Page intent model

For every important page, define:

- Primary query intent
- Secondary intents
- User stage: problem-aware, solution-aware, product-aware, vendor selection, support
- Decision criteria
- Objections
- Proof needed
- Conversion action
- Internal links in and out

### Content quality rubric

Score each page 0-3 for:

- Intent match
- Original information or first-party insight
- Completeness for the user's task
- Clarity and scannability
- Evidence, examples, data, screenshots, or demos
- Demonstrated experience or expertise
- Trust signals: author, company, citations, policies, contact, security, reviews
- Freshness where freshness matters
- Differentiation from ranking pages
- Conversion fit without blocking information access

Prioritize pages with high business value and weak scores.

### Company website content strategy

Common high-leverage company pages:

- Category narrative: what the product is and why the category matters.
- Feature pages: one search intent per page, clear use cases, proof, screenshots, FAQs, internal links.
- Use-case pages: user problem, workflow, outcomes, proof, related features.
- Industry pages: industry-specific pain, integrations, compliance, terminology, case studies.
- Persona pages: role-specific jobs-to-be-done and evaluation criteria.
- Comparison pages: honest differences, target buyer, limitations, migration path, proof.
- Alternatives pages: fair criteria, product fit, pricing, implementation, support.
- Integrations pages: integration capabilities, setup, use cases, docs, schema where applicable.
- Template or tool pages: useful standalone value, not thin lead magnets.
- Docs: fast, indexable, clear code examples, versioned when needed.
- Resource hubs: topical authority, not tag spam.

### AI search visibility

Apply normal SEO fundamentals with extra attention to clarity, evidence, and entity consistency.

Rules:

- Make important content indexable and snippet-eligible.
- Answer complex questions directly with clear sections.
- Include first-party data, examples, screenshots, benchmarks, or methodology where possible.
- Structure pages around entities, attributes, comparisons, and tasks.
- Keep Organization, WebSite, Product, Article, and Breadcrumb schema accurate.
- Maintain consistent company, product, author, and entity information across site, profiles, docs, and knowledge sources.
- Do not create special machine-readable files solely for AI features unless a user explicitly has a separate non-Google workflow requiring them.
- Use `nosnippet`, `data-nosnippet`, `max-snippet`, and `noindex` only when the company intentionally wants to limit previews or inclusion.

## Page-type playbooks

### Homepage

Must communicate:

- Who the company serves
- What the product does
- Primary value proposition
- Category and positioning
- Proof points
- Key product paths
- Primary conversion

SEO checks:

- Unique title that includes brand and category.
- One clear H1.
- Organization and WebSite schema.
- Crawlable links to product, use-case, pricing, docs, resources, and trust pages.
- Fast LCP hero with server-rendered text.

### Product or SaaS feature page

Must include:

- Specific feature or capability
- Target user problem
- Workflow or use case
- Screenshots or demo assets
- Integrations or technical details where relevant
- Proof and outcomes
- FAQs from real sales/support questions
- Links to docs, pricing, case studies, and related features

Next.js leverage:

- Static or ISR rendering for stable feature content.
- Dynamic OG image if pages are share targets.
- JSON-LD only when a suitable schema type is accurate.

### Blog or resource article

Must include:

- Clear intent and thesis
- Original value beyond summarizing SERPs
- Author or company expertise signal
- Dates only when meaningful
- Related articles and product paths
- Article schema where appropriate

Next.js leverage:

- `generateStaticParams` for known slugs.
- ISR or tag revalidation on CMS updates.
- `notFound()` for unpublished posts.
- Article metadata from CMS fields.

### Documentation

Must include:

- Version clarity
- Accurate code examples
- Stable headings and anchors
- Breadcrumbs
- Related guides and API references
- Search intent coverage for implementation queries

Next.js leverage:

- Static generation from MDX or docs source.
- Versioned routes if docs differ by major version.
- Fast server-rendered code content.
- Canonical policy for duplicate docs versions.

### Ecommerce or marketplace pages

Must include:

- Indexable categories with unique intro copy and useful filters
- Product detail pages with visible offer data
- Crawlable pagination or equivalent discovery path
- Controlled faceted URLs
- Product schema only for real visible product data
- Inventory and price freshness policy

Next.js leverage:

- Static or ISR for category and product pages.
- SSR only when real-time availability is essential.
- Segment filters into indexable and non-indexable groups.
- Use `dynamicParams = false` when unknown product slugs should 404.

### Local or location pages

Must include:

- Unique local information
- Address, phone, hours, service area
- Staff, photos, reviews, local proof where legitimate
- LocalBusiness schema when data is visible and accurate
- Links to nearby locations and services

Avoid:

- City-name swapped doorway pages.
- Thin location pages without distinct local value.

## Prioritization

Score every recommendation:

`priority_score = impact * confidence * urgency / effort`

Use 1-5 scales.

Impact dimensions:

- Indexation impact
- Traffic opportunity
- Revenue relevance
- Page-type scalability
- Risk reduction
- Engineering leverage

Default priority order:

1. Search visibility blockers: robots, noindex, 5xx, auth, canonical conflicts, rendering failures.
2. Large-scale template issues: metadata, canonicals, status codes, sitemap, hreflang, structured data.
3. High-value page quality gaps.
4. Internal-link architecture and orphan pages.
5. Performance issues affecting priority templates.
6. SERP CTR improvements.
7. Content expansion and new page creation.
8. Nice-to-have schema or social metadata.

## Output formats

### Full SEO audit

Use this structure:

```markdown
# SEO Audit: [Company / Domain]

## Executive summary

[3-6 bullets: biggest blockers, biggest opportunities, expected business relevance]

## Current state

- Domain:
- Framework:
- Router:
- Page types reviewed:
- Data sources used:
- Known limits:

## Priority roadmap

| Priority | Issue | Affected pages/templates | Impact | Confidence | Effort | Owner | Fix |
| -------- | ----- | -----------------------: | -----: | ---------: | -----: | ----- | --- |

## Technical SEO findings

[Grouped by indexability, crawlability, rendering, canonicals, metadata, sitemap, robots, schema, performance]

## Next.js implementation plan

[Files, functions, route patterns, examples]

## Content and IA findings

[Intent, page gaps, internal links, content quality]

## Measurement plan

[Baseline, KPIs, validation steps, follow-up windows]

## Appendix

[URLs sampled, evidence, assumptions]
```

### Next.js implementation plan

Use this structure:

```markdown
# Next.js SEO Implementation Plan

## Scope

[Routes/templates affected]

## Files to change

| File | Change | Reason | Risk |
| ---- | ------ | ------ | ---- |

## Metadata changes

[Static metadata, generateMetadata, metadataBase, canonical, OG/Twitter]

## Sitemap and robots changes

[Implementation details]

## Structured data changes

[Schema graph and validation]

## Rendering and performance changes

[SSR/SSG/ISR/RSC/client boundaries/scripts/images/fonts]

## Validation checklist

- Run build.
- Inspect source HTML for title, description, canonical, robots, schema, and main content.
- Validate status codes.
- Validate sitemap and robots.
- Test Rich Results where schema applies.
- Test mobile rendering.
- Re-run performance checks.
```

### Page SEO spec

Use this structure:

```markdown
# Page SEO Spec: [URL or route]

- Route:
- Canonical URL:
- Index policy:
- Rendering strategy:
- Search intent:
- Primary query cluster:
- Secondary query cluster:
- Target audience:
- Conversion:

## Metadata

- Title:
- Meta description:
- H1:
- Open Graph title:
- Open Graph description:
- OG image:
- Robots:

## Content requirements

[Sections, proof, examples, media, FAQs]

## Internal links

- Inbound links needed:
- Outbound internal links:
- Breadcrumbs:

## Structured data

[Type, required fields, data source]

## Validation

[How to confirm]
```

### PR review

Use this structure:

```markdown
# SEO PR Review

## Blocking issues

[Issues that can harm indexing, rendering, canonicals, metadata, schema, or performance]

## Non-blocking improvements

[Recommended refinements]

## Verified good changes

[What is correct]

## Required tests

[Build, HTML inspection, crawler, schema, performance]
```

### Content brief

Use this structure:

```markdown
# SEO Content Brief: [Topic]

## Audience and intent

[Who searches, why, stage]

## Search opportunity

[Query clusters, SERP format, competitor bar]

## Required original value

[First-party data, examples, screenshots, expert commentary, methodology]

## Outline

[H1, H2s, H3s]

## Evidence requirements

[Sources, product proof, demos, case studies]

## Conversion path

[CTA and related product links]

## Metadata

[Title, description, slug]

## Internal links

[In/out]

## Schema

[If applicable]
```

## Validation procedures

### Public-only validation

When code access is unavailable:

- Inspect live HTML and rendered page.
- Check robots.txt and sitemaps.
- Sample priority URLs across templates.
- Compare source HTML and rendered DOM where tooling allows.
- Validate structured data with public validators.
- Use public performance tools.
- Use SERP and competitor research.
- State any assumptions caused by missing code, analytics, Search Console, or logs.

### Code-level validation

When repo access is available:

- Run typecheck, lint, tests, and build where feasible.
- Inspect generated metadata behavior per route.
- Confirm dynamic routes return 404 for invalid slugs.
- Confirm sitemap excludes non-indexable URLs.
- Confirm robots allows public pages and blocks only intended paths.
- Confirm structured data output is valid JSON-LD.
- Confirm Client Components do not wrap entire indexable templates without need.
- Confirm dynamic APIs are not forcing request-time rendering unnecessarily.
- Confirm `next/image`, `next/font`, and `next/script` are used intentionally.

Example commands, adapt to the project:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npx next info
```

### Search Console validation

When Search Console data is available:

- Review Performance by page, query, country, device, and search appearance.
- Compare branded and non-branded traffic.
- Segment priority templates.
- Review indexing report for errors and excluded URLs.
- Use URL Inspection for representative page types.
- Review sitemap ingestion and discovered URL counts.
- Review Core Web Vitals report.
- Review manual actions and security issues.
- Use date comparisons for changed pages after deployment.

## Measurement plan

Track:

- Indexable URL count by template
- Indexed canonical URL count
- Sitemap submitted vs indexed
- Impressions by page type
- Clicks by page type
- CTR by page type and query class
- Average position by query cluster
- Non-branded qualified traffic
- Organic conversions
- Assisted conversions
- Core Web Vitals pass rate
- Crawl errors
- Structured data valid item count

Set expectations:

- Technical fixes can be validated quickly through crawling and inspection.
- Search performance effects require recrawl, reprocessing, and enough impression volume.
- Content changes should be evaluated by page cluster and query intent, not by one vanity ranking.
- Use annotations for deployments and content publishes.

## Migration and redesign playbook

For a redesign, domain move, CMS migration, or Next.js migration:

1. Crawl the old site.
2. Export top landing pages from Search Console and analytics.
3. Map every valuable old URL to an equivalent new URL.
4. Preserve or improve titles, descriptions, canonicals, headings, schema, internal links, and main content.
5. Implement 301 redirects server-side.
6. Avoid redirect chains.
7. Generate new sitemap with final canonical URLs.
8. Keep old sitemap temporarily if useful for discovery of redirects.
9. Validate staging behind authentication, not public indexable routes.
10. Crawl staging with robots and auth assumptions mirrored.
11. Launch with monitoring for 404s, 5xx, redirect errors, noindex, canonical mismatches, and traffic drops.
12. Use Search Console change-of-address tools for domain moves where applicable.

## Common Next.js anti-patterns

Flag these strongly:

- Entire page marked `use client` for mostly static marketing content.
- SEO content fetched only inside `useEffect`.
- Generic metadata inherited by many dynamic pages.
- Missing `metadataBase`, causing incorrect social or canonical URLs.
- Canonicals generated from raw request URLs with tracking parameters.
- Sitemaps generated from all CMS entries without indexability filters.
- Draft, preview, or unpublished content exposed in sitemap.
- Soft 404s for missing dynamic routes.
- Unknown dynamic slugs rendered as empty pages.
- Faceted pages indexable without a strategy.
- Query parameters creating duplicate pages.
- Internal links implemented as buttons or click handlers only.
- Cookie banners causing layout shift or blocking main content.
- Hero images lazy-loaded or missing dimensions.
- Many analytics, chat, heatmap, and ad scripts loaded eagerly.
- Rewrites that mask duplicate content under many URLs.
- Client-side canonical changes.
- Inconsistent trailing slash or host handling.
- Localized routes canonicalized to the wrong language.

## Response style

- Start with the highest-leverage conclusion.
- Separate findings from recommendations.
- Include evidence for each important claim.
- Give concrete code or file-level changes when possible.
- Use tables for backlogs and template audits.
- Use checklists for validation.
- State uncertainty clearly when data is missing.
- Avoid vague advice such as "improve content" without specifying page, intent, section, proof, and expected outcome.
- Keep implementation advice aligned with the user's Next.js version and router.

## Source references to consult when current precision matters

Use current official docs when making claims that can change.

- Google Search Essentials: https://developers.google.com/search/docs/essentials
- Google SEO Starter Guide: https://developers.google.com/search/docs/fundamentals/seo-starter-guide
- Google helpful content guidance: https://developers.google.com/search/docs/fundamentals/creating-helpful-content
- Google canonicalization: https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls
- Google robots.txt guide: https://developers.google.com/search/docs/crawling-indexing/robots/intro
- Google robots meta and X-Robots-Tag: https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag
- Google link best practices: https://developers.google.com/search/docs/crawling-indexing/links-crawlable
- Google structured data intro: https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data
- Google AI features and websites: https://developers.google.com/search/docs/appearance/ai-overviews
- Google Core Web Vitals in Search: https://developers.google.com/search/docs/appearance/core-web-vitals
- Google Search Console getting started: https://developers.google.com/search/docs/monitor-debug/search-console-start
- Next.js App Router docs: https://nextjs.org/docs/app
- Next.js metadata API: https://nextjs.org/docs/app/api-reference/functions/generate-metadata
- Next.js metadata files: https://nextjs.org/docs/app/api-reference/file-conventions/metadata
- Next.js sitemap files: https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap
- Next.js robots files: https://nextjs.org/docs/app/api-reference/file-conventions/metadata/robots
- Next.js Server and Client Components: https://nextjs.org/docs/app/building-your-application/rendering/server-components
- Next.js generateStaticParams: https://nextjs.org/docs/app/api-reference/functions/generate-static-params
- Next.js route segment config: https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config
- Next.js caching and revalidating: https://nextjs.org/docs/app/getting-started/caching-and-revalidating
- Next.js Image component: https://nextjs.org/docs/app/api-reference/components/image
- Next.js Link component: https://nextjs.org/docs/app/api-reference/components/link
- Next.js Script component: https://nextjs.org/docs/app/api-reference/components/script
- Next.js font optimization: https://nextjs.org/docs/app/getting-started/fonts
