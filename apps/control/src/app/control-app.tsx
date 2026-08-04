import { useMemo, useState } from 'react';
import { BrowserRouter, useLocation, useNavigate } from 'react-router-dom';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Button,
  Spinner,
  WorkspaceShell,
} from '@/components/ui';
import { IconRouteOff, IconShieldLock } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { AuthenticationView } from '@/authentication/authentication-view';
import type { ControlAuthenticationApi } from '@/authentication/control-api';
import { useAuthentication } from '@/authentication/use-authentication';
import type { ControlTeamApi } from '@/features/team/team-api';
import type { ControlSecurityApi } from '@/features/security/security-api';
import type { ControlInvitationApi } from '@/features/team/invitation-api';
import type { ControlCustomerApi } from '@/features/customers/customer-api';
import type { ControlOrderApi } from '@/features/orders/order-api';
import { InvitationAcceptanceView } from '@/features/team/invitation-acceptance-view';
import {
  controlHomeNavigation,
  controlViewFromPath,
  controlWorkspaceCopyKeys,
  mayOpenControlView,
  navigationForCapabilities,
  pathForControlView,
  type ControlView,
} from './control-navigation';
import { localizeApplicationDestination } from './application-destinations';
import { WorkspaceContent } from './workspace-content';

export type ControlRuntime = Readonly<{
  authentication: ControlAuthenticationApi;
  team: ControlTeamApi;
  security: ControlSecurityApi;
  invitations: ControlInvitationApi;
  customers: ControlCustomerApi;
  orders: ControlOrderApi;
  initialInvitationToken: string | null;
}>;

function RestoringSession() {
  const { t } = useTranslation();

  return (
    <main className="bg-muted/30 grid min-h-screen place-items-center p-4">
      <Empty className="bg-background max-w-lg border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Spinner />
          </EmptyMedia>
          <EmptyTitle>{t('workspace.restoring.title')}</EmptyTitle>
          <EmptyDescription>
            {t('workspace.restoring.description')}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </main>
  );
}

function ControlWorkspace({
  session,
  logoutBusy,
  onLogout,
  runtime,
  onSessionRefresh,
}: {
  session: NonNullable<
    Extract<
      ReturnType<typeof useAuthentication>['state'],
      { status: 'authenticated' }
    >['session']
  >;
  logoutBusy: boolean;
  onLogout: () => void;
  runtime: ControlRuntime;
  onSessionRefresh: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const requestedView = controlViewFromPath(location.pathname);
  const sections = useMemo(() => {
    const sectionLabels: Readonly<Record<string, string>> = {
      business: t('navigation.sections.business'),
      peopleAccess: t('navigation.sections.peopleAccess'),
      system: t('navigation.sections.system'),
    };
    const itemLabels: Readonly<Record<ControlView, string>> = {
      home: t('navigation.home'),
      orders: t('navigation.orders'),
      customers: t('navigation.customers'),
      team: t('navigation.team'),
      security: t('navigation.security'),
      configuration: t('navigation.configuration'),
    };

    return navigationForCapabilities(session.access.capabilities).map(
      (section) => ({
        ...section,
        label: sectionLabels[section.id] ?? section.label,
        items: section.items.map((item) => ({
          ...item,
          label: itemLabels[item.id],
        })),
      }),
    );
  }, [session.access.capabilities, t]);

  const canOpen =
    requestedView !== null &&
    mayOpenControlView(requestedView, session.access.capabilities);
  const copy =
    requestedView === null
      ? {
          title: t('workspace.notFound.title'),
          description: t('workspace.notFound.description'),
        }
      : {
          title: t(controlWorkspaceCopyKeys[requestedView].title),
          description: t(controlWorkspaceCopyKeys[requestedView].description),
        };
  const selectedLocation = session.access.locations.find(
    ({ id }) => id === session.access.selectedLocationId,
  );

  const navigateTo = (next: ControlView) => {
    navigate(pathForControlView(next));
  };
  const applications = session.access.applications.map((application) =>
    localizeApplicationDestination(application, {
      processor: {
        label: t('applications.processor.label'),
        description: t('applications.processor.description'),
      },
      control: {
        label: t('applications.control.label'),
        description: t('applications.control.description'),
      },
    }),
  );

  return (
    <WorkspaceShell
      current={requestedView}
      onNavigate={navigateTo}
      title={copy.title}
      description={copy.description}
      currentApplicationId="control"
      applicationName={t('common.appName')}
      applications={applications}
      applicationsLabel={t('navigation.applications')}
      switchApplicationLabel={t('navigation.switchApplication', {
        application: t('common.appName'),
      })}
      home={{ ...controlHomeNavigation, label: t('navigation.home') }}
      sections={sections}
      navigationLabel={t('navigation.label')}
      navigationDialogTitle={t('navigation.dialogTitle')}
      navigationDialogDescription={t('navigation.dialogDescription')}
      openNavigationLabel={t('navigation.open')}
      skipToContentLabel={t('navigation.skipToContent')}
      closeLabel={t('common.close')}
      signedInLabel={t('navigation.signedInAs', {
        name: session.principal.displayName,
      })}
      signOutLabel={t('navigation.signOut')}
      principalName={session.principal.displayName}
      logoutBusy={logoutBusy}
      onLogout={onLogout}
      footer={
        <>
          <p className="text-foreground font-medium">
            {session.access.business.name}
          </p>
          <p className="mt-1">
            {selectedLocation === undefined
              ? t('navigation.businessAccess')
              : t('navigation.locationAndTimezone', {
                  location: selectedLocation.name,
                  timezone: selectedLocation.timezone,
                })}
          </p>
        </>
      }
    >
      {requestedView === null ? (
        <Empty className="min-h-80 border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <IconRouteOff />
            </EmptyMedia>
            <EmptyTitle>{t('workspace.notFound.title')}</EmptyTitle>
            <EmptyDescription>
              {t('workspace.notFound.description')}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button
              type="button"
              variant="outline"
              onClick={() => navigateTo('home')}
            >
              {t('common.returnHome')}
            </Button>
          </EmptyContent>
        </Empty>
      ) : canOpen ? (
        <WorkspaceContent
          view={requestedView}
          runtime={runtime}
          session={session}
          onSessionRefresh={onSessionRefresh}
          sections={sections}
          onNavigate={navigateTo}
        />
      ) : (
        <Empty className="min-h-80 border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <IconShieldLock />
            </EmptyMedia>
            <EmptyTitle>{t('workspace.accessDenied.title')}</EmptyTitle>
            <EmptyDescription>
              {t('workspace.accessDenied.description')}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button
              type="button"
              variant="outline"
              onClick={() => navigateTo('home')}
            >
              {t('common.returnHome')}
            </Button>
          </EmptyContent>
        </Empty>
      )}
    </WorkspaceShell>
  );
}

function ControlRoute({ runtime }: { runtime: ControlRuntime }) {
  const authentication = useAuthentication(runtime.authentication);

  if (authentication.state.status === 'restoring') return <RestoringSession />;
  if (
    authentication.state.status === 'unauthenticated' ||
    authentication.state.status === 'mfa'
  )
    return (
      <AuthenticationView
        mode={authentication.state.status === 'mfa' ? 'mfa' : 'login'}
        busy={authentication.busy}
        error={authentication.state.error}
        onLogin={authentication.login}
        onCompleteMfa={authentication.completeMfa}
        onRestart={authentication.restart}
      />
    );

  return (
    <ControlWorkspace
      session={authentication.state.session}
      logoutBusy={authentication.busy}
      onLogout={() => void authentication.logout()}
      runtime={runtime}
      onSessionRefresh={authentication.refreshSession}
    />
  );
}

export default function ControlApp({ runtime }: { runtime: ControlRuntime }) {
  const [invitationToken, setInvitationToken] = useState(
    runtime.initialInvitationToken,
  );

  if (invitationToken !== null)
    return (
      <InvitationAcceptanceView
        api={runtime.invitations}
        token={invitationToken}
        onContinueToSignIn={() => setInvitationToken(null)}
      />
    );

  return (
    <BrowserRouter>
      <ControlRoute runtime={runtime} />
    </BrowserRouter>
  );
}
