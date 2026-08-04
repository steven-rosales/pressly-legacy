import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  WorkspaceShell,
  type WorkspaceApplicationDestination,
} from '@/components/layout/workspace-shell';
import type { ProcessorCapability } from '@pressly/contracts/auth';
import {
  workspaceHomeNavigation,
  visibleWorkspaceNavigationSections,
  type WorkspaceView,
} from './app.navigation';

export function AppShell({
  current,
  onNavigate,
  title,
  description,
  actions,
  locationName,
  timezone,
  principalName,
  capabilities,
  applications = [],
  logoutBusy,
  onLogout,
  children,
}: {
  current: WorkspaceView;
  onNavigate: (view: WorkspaceView) => void;
  title: string;
  description: string;
  actions?: ReactNode;
  locationName: string;
  timezone: string;
  principalName: string;
  capabilities: readonly ProcessorCapability[];
  applications?: readonly WorkspaceApplicationDestination[];
  logoutBusy: boolean;
  onLogout: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();

  const localizedApplications = applications.map((application) => {
    if (application.id === 'processor')
      return {
        ...application,
        label: t('applications.processor.label'),
        description: t('applications.processor.description'),
      };

    if (application.id === 'control')
      return {
        ...application,
        label: t('applications.control.label'),
        description: t('applications.control.description'),
      };

    return application;
  });

  return (
    <WorkspaceShell
      current={current}
      onNavigate={onNavigate}
      title={title}
      description={description}
      actions={actions}
      currentApplicationId="processor"
      applicationName={t('common.appName')}
      applications={localizedApplications}
      applicationsLabel={t('navigation.applications')}
      switchApplicationLabel={t('navigation.switchApplication', {
        application: t('common.appName'),
      })}
      home={{
        ...workspaceHomeNavigation,
        label: t(workspaceHomeNavigation.labelKey),
      }}
      sections={visibleWorkspaceNavigationSections(capabilities).map(
        (section) => ({
          id: section.id,
          label: t(section.labelKey),
          items: section.items.map((item) => ({
            ...item,
            label: t(item.labelKey),
          })),
        }),
      )}
      navigationLabel={t('navigation.label')}
      navigationDialogTitle={t('navigation.dialogTitle')}
      navigationDialogDescription={t('navigation.dialogDescription')}
      openNavigationLabel={t('navigation.open')}
      skipToContentLabel={t('navigation.skipToContent')}
      closeLabel={t('common.close')}
      signedInLabel={t('navigation.signedInAs', { name: principalName })}
      signOutLabel={t('navigation.lockAndSwitch')}
      principalName={principalName}
      logoutBusy={logoutBusy}
      onLogout={onLogout}
      footer={
        <>
          <p className="font-medium text-foreground">
            {t('navigation.laundryProduction')}
          </p>
          <p className="mt-1">
            {t('navigation.locationAndTimezone', {
              location: locationName,
              timezone,
            })}
          </p>
        </>
      }
    >
      {children}
    </WorkspaceShell>
  );
}
