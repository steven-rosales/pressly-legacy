import AboutPage, {
  metadata as aboutMetadata,
} from './web/app/(marketing)/about/page.tsx';
import CareersPage, {
  metadata as careersMetadata,
} from './web/app/(marketing)/careers/page.tsx';
import CommercialPage, {
  metadata as commercialMetadata,
} from './web/app/(marketing)/commercial/page.tsx';
import ContactPage, {
  metadata as contactMetadata,
} from './web/app/(marketing)/contact/page.tsx';
import FaqsPage, {
  metadata as faqsMetadata,
} from './web/app/(marketing)/faqs/page.tsx';
import MarketingLayout from './web/app/(marketing)/layout.tsx';
import {
  generateMetadata as generateCityServiceMetadata,
  generateStaticParams as generateCityServiceStaticParams,
  renderCityServicePage,
} from './web/app/(marketing)/new-jersey/[county]/[slug]/page.tsx';
import {
  generateMetadata as generateCountyMetadata,
  generateStaticParams as generateCountyStaticParams,
  renderCountyPage,
} from './web/app/(marketing)/new-jersey/[county]/page.tsx';
import { renderNewJerseyPage } from './web/app/(marketing)/new-jersey/page.tsx';
import { newJerseyMetadata } from './web/app/(marketing)/new-jersey/seo.ts';
import HomePage, {
  metadata as homeMetadata,
} from './web/app/(marketing)/page.tsx';
import PrivacyPage, {
  metadata as privacyMetadata,
} from './web/app/(marketing)/privacy/page.tsx';
import {
  metadata as dryCleaningMetadata,
  renderDryCleaningPage,
} from './web/app/(marketing)/services-pricing/dry-cleaning/page.tsx';
import ServicesPricingLayout from './web/app/(marketing)/services-pricing/layout.tsx';
import ServicesPricingPage, {
  metadata as servicesPricingMetadata,
} from './web/app/(marketing)/services-pricing/page.tsx';
import {
  metadata as washFoldMetadata,
  renderWashFoldPage,
} from './web/app/(marketing)/services-pricing/wash-fold/page.tsx';
import TermsPage, {
  metadata as termsMetadata,
} from './web/app/(marketing)/terms/page.tsx';
import AccountRedirectPage, {
  metadata as accountMetadata,
} from './web/app/account/[[...path]]/page.tsx';
import {
  CustomerRootContent,
  customerRootMetadata,
} from './web/app/layout.tsx';
import LoginRedirectPage, {
  metadata as loginMetadata,
} from './web/app/login/page.tsx';
import LogoutRedirectPage, {
  metadata as logoutMetadata,
} from './web/app/logout/page.tsx';
import NotFoundPage from './web/app/not-found.tsx';
import OptInRedirectPage, {
  metadata as optInMetadata,
} from './web/app/opt-in/page.tsx';
import ResetPasswordRedirectPage, {
  metadata as resetPasswordMetadata,
} from './web/app/reset-password/page.tsx';
import robots from './web/app/robots.ts';
import SchedulePage, {
  metadata as scheduleMetadata,
  viewport as scheduleViewport,
} from './web/app/schedule/page.tsx';
import SignupRedirectPage, {
  metadata as signupMetadata,
} from './web/app/signup/[[...path]]/page.tsx';
import sitemap from './web/app/sitemap.ts';
import { createWebCore } from './web/composition/model/core.ts';
import {
  loadPricingCatalogViewModel,
  makePricingQueries,
} from './web/features/pricing/queries.ts';

export type { WebCore } from './web/composition/model/core.ts';
export type { WebCorePorts } from './web/composition/model/ports.ts';
export type {
  RequestClient,
  RequestInput,
} from './web/transport/model/request-client.ts';
export type { PricingCatalogLoader } from './web/features/pricing/model.ts';

export const createCustomerWebExperience = () =>
  Object.freeze({
    createCore: createWebCore,
    pricing: Object.freeze({
      loadCatalogViewModel: loadPricingCatalogViewModel,
      makeQueries: makePricingQueries,
    }),
    root: Object.freeze({
      Content: CustomerRootContent,
      metadata: customerRootMetadata,
    }),
    marketing: Object.freeze({ Layout: MarketingLayout }),
    home: Object.freeze({ Page: HomePage, metadata: homeMetadata }),
    about: Object.freeze({ Page: AboutPage, metadata: aboutMetadata }),
    careers: Object.freeze({ Page: CareersPage, metadata: careersMetadata }),
    commercial: Object.freeze({
      Page: CommercialPage,
      metadata: commercialMetadata,
    }),
    contact: Object.freeze({ Page: ContactPage, metadata: contactMetadata }),
    faqs: Object.freeze({ Page: FaqsPage, metadata: faqsMetadata }),
    privacy: Object.freeze({ Page: PrivacyPage, metadata: privacyMetadata }),
    terms: Object.freeze({ Page: TermsPage, metadata: termsMetadata }),
    newJersey: Object.freeze({
      metadata: newJerseyMetadata,
      render: renderNewJerseyPage,
    }),
    county: Object.freeze({
      generateMetadata: generateCountyMetadata,
      generateStaticParams: generateCountyStaticParams,
      render: renderCountyPage,
    }),
    cityService: Object.freeze({
      generateMetadata: generateCityServiceMetadata,
      generateStaticParams: generateCityServiceStaticParams,
      render: renderCityServicePage,
    }),
    servicesPricing: Object.freeze({
      Layout: ServicesPricingLayout,
      Page: ServicesPricingPage,
      metadata: servicesPricingMetadata,
    }),
    washFold: Object.freeze({
      metadata: washFoldMetadata,
      render: renderWashFoldPage,
    }),
    dryCleaning: Object.freeze({
      metadata: dryCleaningMetadata,
      render: renderDryCleaningPage,
    }),
    schedule: Object.freeze({
      Page: SchedulePage,
      metadata: scheduleMetadata,
      viewport: scheduleViewport,
    }),
    account: Object.freeze({
      Page: AccountRedirectPage,
      metadata: accountMetadata,
    }),
    login: Object.freeze({ Page: LoginRedirectPage, metadata: loginMetadata }),
    logout: Object.freeze({
      Page: LogoutRedirectPage,
      metadata: logoutMetadata,
    }),
    optIn: Object.freeze({ Page: OptInRedirectPage, metadata: optInMetadata }),
    resetPassword: Object.freeze({
      Page: ResetPasswordRedirectPage,
      metadata: resetPasswordMetadata,
    }),
    signup: Object.freeze({
      Page: SignupRedirectPage,
      metadata: signupMetadata,
    }),
    notFound: Object.freeze({ Page: NotFoundPage }),
    robots,
    sitemap,
  });

export type CustomerWebExperience = ReturnType<
  typeof createCustomerWebExperience
>;
