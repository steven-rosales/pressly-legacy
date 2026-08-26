import {
  createCustomerWebClientExperience,
  type CustomerWebClientExperience,
} from '@pressly/experience-customer/web-client';
import type { WebCore, WebCorePorts } from '@pressly/experience-customer/web';

export const customerWebClient: CustomerWebClientExperience =
  createCustomerWebClientExperience();

export type { CustomerBrowserCapabilities } from '@pressly/experience-customer/web-client';

export const createCustomerWebClientRuntime = (input: WebCorePorts): WebCore =>
  customerWebClient.createCore(input);
