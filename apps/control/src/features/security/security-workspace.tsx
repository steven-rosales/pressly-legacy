import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  IconCopy,
  IconDeviceMobile,
  IconKey,
  IconLockCheck,
  IconShieldCheck,
  IconShieldOff,
  IconTimelineEvent,
} from '@tabler/icons-react';
import {
  Alert,
  AlertDescription,
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  Input,
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  WorkspaceSectionHeading,
} from '@/components/ui';
import type { ControlAuthenticatedSession } from '@/authentication/control-session';
import { controlErrorMessage } from '@/i18n/control-error-message';
import type {
  ControlSecurityApi,
  MfaEnrollment,
  SecurityEvent,
} from './security-api';

const dateLocale = (language: string) =>
  language.toLowerCase().startsWith('es') ? 'es-US' : 'en-US';

const formatDate = (value: string, locale: 'en-US' | 'es-US') =>
  new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));

const eventLabel = (eventType: string) =>
  eventType
    .replace(/^auth[._]/, '')
    .split(/[._]/)
    .filter((part) => part.length > 0)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');

const eventTranslationKey = (eventType: string) =>
  eventType.replace(/^auth[._]/, '').replaceAll('.', '_');

const resourceTranslationKey = (resourceType: string) => {
  if (resourceType.includes('invitation')) return 'invitation';
  if (resourceType.includes('membership')) return 'membership';
  if (resourceType.includes('grant')) return 'grant';
  if (resourceType.includes('session')) return 'session';
  if (resourceType.includes('identity')) return 'identity';
  return 'accountSecurity';
};

function RecoveryCodesSheet({
  codes,
  onClose,
}: {
  codes: readonly string[] | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (codes === null) return;
    await navigator.clipboard.writeText(codes.join('\n'));
    setCopied(true);
  };

  return (
    <Sheet
      open={codes !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{t('security.recoveryCodes.title')}</SheetTitle>
          <SheetDescription>
            {t('security.recoveryCodes.description')}
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          <Alert>
            <IconKey />
            <AlertTitle>
              {t('security.recoveryCodes.credentialsTitle')}
            </AlertTitle>
            <AlertDescription>
              {t('security.recoveryCodes.credentialsDescription')}
            </AlertDescription>
          </Alert>
          <div
            className="bg-muted/40 mt-4 grid grid-cols-1 gap-2 rounded-lg border p-4 font-mono text-sm sm:grid-cols-2"
            aria-label={t('security.recoveryCodes.ariaLabel')}
          >
            {(codes ?? []).map((code) => (
              <code key={code}>{code}</code>
            ))}
          </div>
        </div>
        <SheetFooter>
          <Button onClick={() => void copy()}>
            <IconCopy data-icon="inline-start" />
            {copied
              ? t('security.common.copied')
              : t('security.recoveryCodes.copyAll')}
          </Button>
          <Button variant="outline" onClick={onClose}>
            {t('security.recoveryCodes.saved')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function MfaEnrollmentSheet({
  api,
  open,
  onClose,
  onComplete,
}: {
  api: ControlSecurityApi;
  open: boolean;
  onClose: () => void;
  onComplete: (codes: readonly string[]) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [enrollment, setEnrollment] = useState<MfaEnrollment | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const reset = () => {
    setEnrollment(null);
    setCode('');
    setError(null);
    setCopied(false);
  };

  const close = () => {
    reset();
    onClose();
  };

  const begin = async () => {
    setBusy(true);
    setError(null);
    try {
      setEnrollment(await api.beginMfaEnrollment());
    } catch (beginError) {
      setError(
        controlErrorMessage(beginError, t, t('security.errors.beginMfa')),
      );
    } finally {
      setBusy(false);
    }
  };

  const confirm = async (event: FormEvent) => {
    event.preventDefault();
    if (!/^\d{6}$/.test(code)) return;
    setBusy(true);
    setError(null);
    try {
      const codes = await api.confirmMfaEnrollment(code);
      reset();
      await onComplete(codes);
    } catch (confirmError) {
      setCode('');
      setError(
        controlErrorMessage(
          confirmError,
          t,
          t('security.errors.confirmAuthenticator'),
        ),
      );
    } finally {
      setBusy(false);
    }
  };

  const setupKey =
    enrollment === null
      ? null
      : new URL(enrollment.enrollmentUri).searchParams.get('secret');

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{t('security.mfaSetup.title')}</SheetTitle>
          <SheetDescription>
            {t('security.mfaSetup.description')}
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          {error !== null && (
            <Alert variant="destructive" className="mb-4">
              <AlertTitle>{t('security.mfaSetup.attention')}</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {enrollment === null ? (
            <div className="flex flex-col gap-4">
              <Alert>
                <IconDeviceMobile />
                <AlertTitle>{t('security.mfaSetup.readyTitle')}</AlertTitle>
                <AlertDescription>
                  {t('security.mfaSetup.readyDescription')}
                </AlertDescription>
              </Alert>
              <Button onClick={() => void begin()} disabled={busy}>
                {busy && <Spinner data-icon="inline-start" />}
                {t('security.mfaSetup.showKey')}
              </Button>
            </div>
          ) : (
            <form onSubmit={(event) => void confirm(event)}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="mfa-setup-key">
                    {t('security.mfaSetup.setupKey')}
                  </FieldLabel>
                  <div className="flex gap-2">
                    <Input
                      id="mfa-setup-key"
                      value={setupKey ?? ''}
                      readOnly
                      className="font-mono"
                      onFocus={(event) => event.currentTarget.select()}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      aria-label={t('security.mfaSetup.copyKeyAria')}
                      onClick={() => {
                        if (setupKey === null) return;
                        void navigator.clipboard
                          .writeText(setupKey)
                          .then(() => setCopied(true));
                      }}
                    >
                      <IconCopy />
                      {copied
                        ? t('security.common.copied')
                        : t('security.common.copy')}
                    </Button>
                  </div>
                  <FieldDescription>
                    {t('security.mfaSetup.keyDescription')}
                  </FieldDescription>
                </Field>
                <Field data-invalid={code.length > 0 && !/^\d{6}$/.test(code)}>
                  <FieldLabel htmlFor="mfa-confirm-code">
                    {t('security.mfaSetup.sixDigitCode')}
                  </FieldLabel>
                  <InputOTP
                    id="mfa-confirm-code"
                    maxLength={6}
                    value={code}
                    onChange={setCode}
                    aria-invalid={code.length > 0 && !/^\d{6}$/.test(code)}
                  >
                    <InputOTPGroup>
                      {[0, 1, 2, 3, 4, 5].map((index) => (
                        <InputOTPSlot key={index} index={index} />
                      ))}
                    </InputOTPGroup>
                  </InputOTP>
                  {code.length > 0 && !/^\d{6}$/.test(code) && (
                    <FieldError>
                      {t('security.mfaSetup.enterAllDigits')}
                    </FieldError>
                  )}
                </Field>
              </FieldGroup>
              <div className="mt-5 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy}
                  onClick={close}
                >
                  {t('security.common.cancel')}
                </Button>
                <Button type="submit" disabled={busy || !/^\d{6}$/.test(code)}>
                  {busy && <Spinner data-icon="inline-start" />}
                  {t('security.mfaSetup.verifyAndEnable')}
                </Button>
              </div>
            </form>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function SecurityWorkspace({
  api,
  session,
  onSessionRefresh,
}: {
  api: ControlSecurityApi;
  session: ControlAuthenticatedSession;
  onSessionRefresh: () => Promise<void>;
}) {
  const { t, i18n } = useTranslation();
  const [enrollmentOpen, setEnrollmentOpen] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState<readonly string[] | null>(
    null,
  );
  const [confirmAction, setConfirmAction] = useState<
    'regenerate' | 'remove' | null
  >(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mayEnroll = session.access.capabilities.includes('auth:mfa:enroll');
  const mayManage = session.access.capabilities.includes('security:write');
  const mayReadSecurity = session.access.capabilities.includes('security:read');
  const [events, setEvents] = useState<readonly SecurityEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(mayReadSecurity);
  const [eventsCursor, setEventsCursor] = useState<string | null>(null);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const mfaEnabled = !mayEnroll;

  useEffect(() => {
    if (!mayReadSecurity) return;
    let active = true;
    api
      .listSecurityEvents()
      .then((page) => {
        if (active) {
          setEvents(page.events);
          setEventsCursor(page.nextCursor);
          setEventsError(null);
          setEventsLoading(false);
        }
      })
      .catch((loadError: unknown) => {
        if (active) {
          setEventsError(
            controlErrorMessage(loadError, t, t('security.errors.loadHistory')),
          );
          setEventsLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [api, mayReadSecurity, t]);

  const completeEnrollment = async (codes: readonly string[]) => {
    setEnrollmentOpen(false);
    setRecoveryCodes(codes);
    await onSessionRefresh();
  };

  const confirm = async () => {
    if (confirmAction === null) return;
    setBusy(true);
    setError(null);
    try {
      if (confirmAction === 'regenerate') {
        setRecoveryCodes(await api.regenerateRecoveryCodes());
      } else {
        await api.removeMfa();
        await onSessionRefresh();
      }
      setConfirmAction(null);
    } catch (mutationError) {
      setError(
        controlErrorMessage(
          mutationError,
          t,
          t('security.errors.completeChange'),
        ),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      className="flex flex-col gap-6"
      aria-labelledby="security-workspace-title"
    >
      <WorkspaceSectionHeading
        title={t('security.workspace.title')}
        titleId="security-workspace-title"
        description={t('security.workspace.description')}
      />

      {error !== null && (
        <Alert variant="destructive">
          <AlertTitle>{t('security.workspace.attention')}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="mb-2 flex items-center gap-2">
              <CardTitle>{t('security.mfa.title')}</CardTitle>
              <Badge variant={mfaEnabled ? 'secondary' : 'destructive'}>
                {mfaEnabled
                  ? t('security.mfa.enabled')
                  : t('security.mfa.required')}
              </Badge>
            </div>
            <CardDescription>{t('security.mfa.description')}</CardDescription>
          </CardHeader>
          <CardContent>
            {mayEnroll ? (
              <div className="flex flex-col gap-3">
                <Alert>
                  <IconShieldOff />
                  <AlertTitle>{t('security.mfa.pausedTitle')}</AlertTitle>
                  <AlertDescription>
                    {t('security.mfa.pausedDescription')}
                  </AlertDescription>
                </Alert>
                <Button onClick={() => setEnrollmentOpen(true)}>
                  <IconShieldCheck data-icon="inline-start" />
                  {t('security.mfa.setUp')}
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <p className="inline-flex items-center gap-2 font-medium">
                  <IconLockCheck className="size-4" />
                  {t('security.mfa.verified')}
                </p>
                {mayManage && (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setConfirmAction('regenerate')}
                    >
                      {t('security.mfa.replaceRecoveryCodes')}
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => setConfirmAction('remove')}
                    >
                      {t('security.mfa.remove')}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('security.session.title')}</CardTitle>
            <CardDescription>
              {t('security.session.description')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-3 text-sm">
              <div>
                <dt className="text-muted-foreground">
                  {t('security.session.signedInAs')}
                </dt>
                <dd className="font-medium">{session.principal.displayName}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">
                  {t('security.session.expires')}
                </dt>
                <dd className="font-medium">
                  {formatDate(
                    session.expiresAt,
                    dateLocale(i18n.resolvedLanguage ?? i18n.language),
                  )}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>

      {mayReadSecurity && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CardTitle>{t('security.history.title')}</CardTitle>
              <Badge variant="outline">
                {t('security.history.auditRecord')}
              </Badge>
            </div>
            <CardDescription>
              {t('security.history.description')}
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            {eventsError !== null && (
              <Alert variant="destructive" className="mx-4 mb-4">
                <AlertTitle>{t('security.history.attention')}</AlertTitle>
                <AlertDescription>{eventsError}</AlertDescription>
              </Alert>
            )}
            {eventsLoading && events.length === 0 ? (
              <div className="grid min-h-32 place-items-center">
                <Spinner />
              </div>
            ) : events.length === 0 ? (
              <div className="grid min-h-36 place-items-center px-4 text-center">
                <div>
                  <IconTimelineEvent className="text-muted-foreground mx-auto mb-2 size-5" />
                  <p className="font-medium">
                    {t('security.history.emptyTitle')}
                  </p>
                  <p className="text-muted-foreground mt-1 text-sm">
                    {t('security.history.emptyDescription')}
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="ps-4">
                          {t('security.history.columns.change')}
                        </TableHead>
                        <TableHead>
                          {t('security.history.columns.area')}
                        </TableHead>
                        <TableHead>
                          {t('security.history.columns.actor')}
                        </TableHead>
                        <TableHead className="pe-4 text-end">
                          {t('security.history.columns.when')}
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {events.map((event) => (
                        <TableRow key={event.id}>
                          <TableCell className="ps-4 font-medium">
                            {t(
                              `security.history.eventTypes.${eventTranslationKey(event.eventType)}`,
                              { defaultValue: eventLabel(event.eventType) },
                            )}
                          </TableCell>
                          <TableCell>
                            {t(
                              `security.history.resources.${resourceTranslationKey(event.resourceType)}`,
                            )}
                          </TableCell>
                          <TableCell>
                            {event.actorDisplayName ??
                              t('security.history.presslySystem')}
                          </TableCell>
                          <TableCell className="pe-4 text-end">
                            {formatDate(
                              event.createdAt,
                              dateLocale(
                                i18n.resolvedLanguage ?? i18n.language,
                              ),
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div
                  role="list"
                  aria-label={t('security.history.title')}
                  className="grid gap-3 px-4 md:hidden"
                >
                  {events.map((event) => (
                    <div
                      key={event.id}
                      role="listitem"
                      className="rounded-lg border p-4"
                    >
                      <p className="font-medium">
                        {t(
                          `security.history.eventTypes.${eventTranslationKey(event.eventType)}`,
                          { defaultValue: eventLabel(event.eventType) },
                        )}
                      </p>
                      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <dt className="text-muted-foreground">
                            {t('security.history.columns.area')}
                          </dt>
                          <dd>
                            {t(
                              `security.history.resources.${resourceTranslationKey(event.resourceType)}`,
                            )}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">
                            {t('security.history.columns.actor')}
                          </dt>
                          <dd>
                            {event.actorDisplayName ??
                              t('security.history.presslySystem')}
                          </dd>
                        </div>
                        <div className="col-span-2">
                          <dt className="text-muted-foreground">
                            {t('security.history.columns.when')}
                          </dt>
                          <dd>
                            {formatDate(
                              event.createdAt,
                              dateLocale(
                                i18n.resolvedLanguage ?? i18n.language,
                              ),
                            )}
                          </dd>
                        </div>
                      </dl>
                    </div>
                  ))}
                </div>
                {eventsCursor !== null && (
                  <div className="border-t p-4">
                    <Button
                      variant="outline"
                      disabled={eventsLoading}
                      onClick={() => {
                        const cursor = eventsCursor;
                        setEventsLoading(true);
                        api
                          .listSecurityEvents(cursor)
                          .then((page) => {
                            setEvents((current) => [
                              ...current,
                              ...page.events,
                            ]);
                            setEventsCursor(page.nextCursor);
                            setEventsError(null);
                          })
                          .catch((loadError: unknown) =>
                            setEventsError(
                              controlErrorMessage(
                                loadError,
                                t,
                                t('security.errors.loadMoreHistory'),
                              ),
                            ),
                          )
                          .finally(() => setEventsLoading(false));
                      }}
                    >
                      {eventsLoading && <Spinner data-icon="inline-start" />}
                      {t('security.history.loadOlder')}
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      <AlertDialog
        open={confirmAction !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setConfirmAction(null);
        }}
      >
        {confirmAction !== null && (
          <AlertDialogContent
            onEscapeKeyDown={(event) => {
              if (busy) event.preventDefault();
            }}
          >
            <AlertDialogHeader>
              <AlertDialogMedia>
                {confirmAction === 'remove' ? <IconShieldOff /> : <IconKey />}
              </AlertDialogMedia>
              <AlertDialogTitle>
                {confirmAction === 'remove'
                  ? t('security.confirm.removeTitle')
                  : t('security.confirm.replaceTitle')}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {confirmAction === 'remove'
                  ? t('security.confirm.removeDescription')
                  : t('security.confirm.replaceDescription')}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={busy}>
                {t('security.common.cancel')}
              </AlertDialogCancel>
              <Button
                variant={confirmAction === 'remove' ? 'destructive' : 'default'}
                disabled={busy}
                onClick={() => void confirm()}
              >
                {busy && <Spinner data-icon="inline-start" />}
                {t('security.common.confirm')}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        )}
      </AlertDialog>

      <MfaEnrollmentSheet
        api={api}
        open={enrollmentOpen}
        onClose={() => setEnrollmentOpen(false)}
        onComplete={completeEnrollment}
      />
      <RecoveryCodesSheet
        codes={recoveryCodes}
        onClose={() => setRecoveryCodes(null)}
      />
    </section>
  );
}
