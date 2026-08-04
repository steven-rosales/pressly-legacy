import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { makeControlAuthenticationApi } from '@/authentication/control-api';
import { makeControlHttpClient } from '@/api/control-http-client';
import ControlApp from '@/app/control-app';
import { ControlErrorBoundary } from '@/app/control-error-boundary';
import { ThemeProvider } from '@/app/theme-provider';
import { makeControlTeamApi } from '@/features/team/team-api';
import { makeControlSecurityApi } from '@/features/security/security-api';
import { makeControlInvitationApi } from '@/features/team/invitation-api';
import { consumeInvitationToken } from '@/features/team/invitation-bootstrap';
import { makeControlCustomerApi } from '@/features/customers/customer-api';
import { makeControlOrderApi } from '@/features/orders/order-api';
import { initializeControlLocalization } from '@/i18n';
import '@/index.css';

initializeControlLocalization(window.localStorage);

const client = makeControlHttpClient();
const runtime = {
  authentication: makeControlAuthenticationApi({ client }),
  team: makeControlTeamApi(client),
  security: makeControlSecurityApi(client),
  invitations: makeControlInvitationApi(client),
  customers: makeControlCustomerApi(client),
  orders: makeControlOrderApi(client),
  initialInvitationToken: consumeInvitationToken(
    window.location,
    window.history,
  ),
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider defaultTheme="light">
      <ControlErrorBoundary
        report={(error) => {
          globalThis.reportError?.(error);
        }}
      >
        <ControlApp runtime={runtime} />
      </ControlErrorBoundary>
    </ThemeProvider>
  </StrictMode>,
);
