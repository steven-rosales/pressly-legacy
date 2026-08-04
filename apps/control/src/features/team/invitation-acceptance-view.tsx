import { useEffect, useState, type FormEvent } from 'react';
import {
  IconCircleCheck,
  IconEye,
  IconEyeOff,
  IconKey,
  IconShieldLock,
} from '@tabler/icons-react';
import {
  passwordStrengthPolicy,
  validatePasswordStrength,
} from '@pressly/auth/password-policy';
import { useTranslation } from 'react-i18next';
import { controlErrorMessage } from '@/i18n/control-error-message';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  Input,
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
} from '@/components/ui';
import type {
  ControlInvitationApi,
  InvitationAcceptanceResult,
  InvitationPreview,
} from './invitation-api';

type InvitationState =
  | { status: 'loading' }
  | { status: 'ready'; preview: InvitationPreview }
  | {
      status: 'accepted';
      preview: InvitationPreview;
      result: InvitationAcceptanceResult;
      destination?: {
        id: 'processor' | 'control';
        href: string;
      };
      sessionEstablished?: boolean;
    }
  | { status: 'error'; message: string };

const processorHref = () =>
  window.location.hostname === 'localhost' ||
  window.location.hostname === '127.0.0.1'
    ? 'http://localhost:4173/'
    : 'https://processor.trypressly.com/';

export function InvitationAcceptanceView({
  api,
  token,
  onContinueToSignIn,
}: {
  api: ControlInvitationApi;
  token: string;
  onContinueToSignIn: () => void;
}) {
  const { t } = useTranslation();
  const [state, setState] = useState<InvitationState>({ status: 'loading' });
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordsVisible, setPasswordsVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [existingMode, setExistingMode] = useState<'password' | 'mfa'>(
    'password',
  );
  const [mfaMethod, setMfaMethod] = useState<'totp' | 'recovery'>('totp');
  const [mfaCode, setMfaCode] = useState('');
  const [acceptanceIdempotencyKey] = useState(() => crypto.randomUUID());

  useEffect(() => {
    let active = true;
    api
      .preview(token)
      .then((preview) => {
        if (active) setState({ status: 'ready', preview });
      })
      .catch((error: unknown) => {
        if (active)
          setState({
            status: 'error',
            message: controlErrorMessage(
              error,
              t,
              t('team.invitationAcceptance.errors.confirm'),
            ),
          });
      });
    return () => {
      active = false;
    };
  }, [api, t, token]);

  if (state.status === 'loading')
    return (
      <main className="bg-muted/30 grid min-h-screen place-items-center p-4">
        <Empty className="bg-background max-w-lg border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Spinner />
            </EmptyMedia>
            <EmptyTitle role="heading" aria-level={1}>
              {t('team.invitationAcceptance.loading.title')}
            </EmptyTitle>
            <EmptyDescription>
              {t('team.invitationAcceptance.loading.description')}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </main>
    );

  if (state.status === 'error')
    return (
      <main className="bg-muted/30 grid min-h-screen place-items-center p-4">
        <Empty className="bg-background max-w-lg border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <IconShieldLock />
            </EmptyMedia>
            <EmptyTitle role="heading" aria-level={1}>
              {t('team.invitationAcceptance.attention')}
            </EmptyTitle>
            <EmptyDescription>{state.message}</EmptyDescription>
          </EmptyHeader>
          <Button variant="outline" onClick={onContinueToSignIn}>
            {t('team.invitationAcceptance.actions.returnToSignIn')}
          </Button>
        </Empty>
      </main>
    );

  if (state.status === 'accepted') {
    const opensControl =
      state.destination?.id === 'control' ||
      (state.destination === undefined &&
        (state.preview.intendedRole === 'owner' ||
          state.preview.intendedRole === 'manager'));
    const destinationHref =
      state.destination?.href ??
      (opensControl ? window.location.origin : processorHref());
    const nextStepCopy =
      !state.result.privilegedAccessEffective && opensControl
        ? t('team.invitationAcceptance.success.nextStep.setupMfa')
        : state.sessionEstablished
          ? t('team.invitationAcceptance.success.nextStep.controlReady')
          : state.preview.existingIdentity
            ? t('team.invitationAcceptance.success.nextStep.processorReady')
            : t('team.invitationAcceptance.success.nextStep.passwordReady');
    const intendedRole =
      state.preview.intendedRole === 'owner'
        ? t('team.rolesLower.owner')
        : state.preview.intendedRole === 'manager'
          ? t('team.rolesLower.manager')
          : t('team.rolesLower.operator');
    return (
      <main className="bg-muted/30 grid min-h-screen place-items-center p-4">
        <Empty className="bg-background max-w-lg border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <IconCircleCheck />
            </EmptyMedia>
            <EmptyTitle role="heading" aria-level={1}>
              {t('team.invitationAcceptance.success.title')}
            </EmptyTitle>
            <EmptyDescription>
              {t('team.invitationAcceptance.success.joined', {
                business: state.preview.business.name,
                role: intendedRole,
              })}{' '}
              {nextStepCopy}
            </EmptyDescription>
          </EmptyHeader>
          {opensControl ? (
            <Button onClick={onContinueToSignIn}>
              {state.sessionEstablished
                ? t('team.invitationAcceptance.actions.openControl')
                : t('team.invitationAcceptance.actions.signInToControl')}
            </Button>
          ) : (
            <Button asChild>
              <a href={destinationHref}>
                {t('team.invitationAcceptance.actions.openProcessor')}
              </a>
            </Button>
          )}
        </Empty>
      </main>
    );
  }

  const preview = state.preview;
  if (preview.existingIdentity) {
    const submitExisting = async (event: FormEvent) => {
      event.preventDefault();
      setBusy(true);
      setSubmitError(null);
      try {
        const result =
          existingMode === 'password'
            ? await api.acceptExistingPassword({
                token,
                idempotencyKey: acceptanceIdempotencyKey,
                password,
              })
            : await api.acceptExistingMfa({
                token,
                idempotencyKey: acceptanceIdempotencyKey,
                method: mfaMethod,
                code: mfaCode,
              });
        setPassword('');
        setMfaCode('');
        if (result.status === 'mfa_required') setExistingMode('mfa');
        else
          setState({
            status: 'accepted',
            preview,
            result: result.acceptance,
            destination: result.destination,
            sessionEstablished: result.session !== null,
          });
      } catch (error) {
        setPassword('');
        setMfaCode('');
        setSubmitError(
          controlErrorMessage(
            error,
            t,
            t('team.invitationAcceptance.errors.existingAccount'),
          ),
        );
      } finally {
        setBusy(false);
      }
    };
    const invalidMfaCode =
      mfaCode.length > 0 &&
      (mfaMethod === 'totp' ? !/^\d{6}$/.test(mfaCode) : mfaCode.length < 16);
    return (
      <main className="bg-muted/30 grid min-h-screen place-items-center p-4">
        <Card className="bg-background w-full max-w-lg">
          <CardHeader>
            <CardTitle role="heading" aria-level={1}>
              {t('team.invitationAcceptance.existing.title', {
                business: preview.business.name,
              })}
            </CardTitle>
            <CardDescription>
              {t('team.invitationAcceptance.existing.description', {
                email: preview.email,
              })}
            </CardDescription>
          </CardHeader>
          <form onSubmit={(event) => void submitExisting(event)}>
            <CardContent className="pb-(--card-spacing)">
              <FieldGroup>
                {submitError !== null && (
                  <Alert variant="destructive">
                    <AlertTitle>
                      {t('team.invitationAcceptance.confirmationAttention')}
                    </AlertTitle>
                    <AlertDescription>{submitError}</AlertDescription>
                  </Alert>
                )}
                {existingMode === 'password' ? (
                  <>
                    <Alert>
                      <IconKey />
                      <AlertTitle>
                        {t(
                          'team.invitationAcceptance.existing.passwordNoticeTitle',
                        )}
                      </AlertTitle>
                      <AlertDescription>
                        {t(
                          'team.invitationAcceptance.existing.passwordNoticeDescription',
                        )}
                      </AlertDescription>
                    </Alert>
                    <Field>
                      <FieldLabel htmlFor="existing-invite-password">
                        {t('team.invitationAcceptance.password')}
                      </FieldLabel>
                      <Input
                        id="existing-invite-password"
                        type="password"
                        autoComplete="current-password"
                        minLength={8}
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        required
                      />
                    </Field>
                  </>
                ) : (
                  <>
                    <Alert>
                      <IconShieldLock />
                      <AlertTitle>
                        {t('team.invitationAcceptance.existing.mfaNoticeTitle')}
                      </AlertTitle>
                      <AlertDescription>
                        {t(
                          'team.invitationAcceptance.existing.mfaNoticeDescription',
                        )}
                      </AlertDescription>
                    </Alert>
                    <Field>
                      <FieldLabel htmlFor="existing-invite-mfa-method">
                        {t('team.invitationAcceptance.verificationMethod')}
                      </FieldLabel>
                      <Select
                        value={mfaMethod}
                        onValueChange={(value) => {
                          setMfaMethod(value as 'totp' | 'recovery');
                          setMfaCode('');
                        }}
                      >
                        <SelectTrigger
                          id="existing-invite-mfa-method"
                          className="w-full"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectItem value="totp">
                              {t('team.invitationAcceptance.authenticatorCode')}
                            </SelectItem>
                            <SelectItem value="recovery">
                              {t('team.invitationAcceptance.recoveryCode')}
                            </SelectItem>
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field data-invalid={invalidMfaCode}>
                      <FieldLabel htmlFor="existing-invite-mfa-code">
                        {mfaMethod === 'totp'
                          ? t('team.invitationAcceptance.sixDigitCode')
                          : t('team.invitationAcceptance.recoveryCode')}
                      </FieldLabel>
                      {mfaMethod === 'totp' ? (
                        <InputOTP
                          id="existing-invite-mfa-code"
                          maxLength={6}
                          value={mfaCode}
                          onChange={setMfaCode}
                          aria-invalid={invalidMfaCode}
                        >
                          <InputOTPGroup>
                            {[0, 1, 2, 3, 4, 5].map((index) => (
                              <InputOTPSlot key={index} index={index} />
                            ))}
                          </InputOTPGroup>
                        </InputOTP>
                      ) : (
                        <Input
                          id="existing-invite-mfa-code"
                          autoComplete="one-time-code"
                          value={mfaCode}
                          onChange={(event) => setMfaCode(event.target.value)}
                          aria-invalid={invalidMfaCode}
                        />
                      )}
                      {invalidMfaCode && (
                        <FieldError>
                          {t(
                            'team.invitationAcceptance.errors.invalidSecurityCode',
                          )}
                        </FieldError>
                      )}
                    </Field>
                  </>
                )}
              </FieldGroup>
            </CardContent>
            <CardFooter className="justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={onContinueToSignIn}
              >
                {t('team.common.cancel')}
              </Button>
              <Button
                type="submit"
                disabled={
                  busy ||
                  (existingMode === 'password'
                    ? password.length < 8
                    : mfaCode.length === 0 || invalidMfaCode)
                }
              >
                {busy && <Spinner data-icon="inline-start" />}
                {existingMode === 'password'
                  ? t('team.invitationAcceptance.actions.confirmAccount')
                  : t('team.invitationAcceptance.actions.verifyAndJoin')}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </main>
    );
  }

  const passwordIsValid = validatePasswordStrength(password).length === 0;
  const invalidPassword = password.length > 0 && !passwordIsValid;
  const passwordsDiffer =
    confirmPassword.length > 0 && password !== confirmPassword;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!passwordIsValid || password !== confirmPassword) return;
    setBusy(true);
    setSubmitError(null);
    try {
      const result = await api.acceptNewIdentity({
        token,
        idempotencyKey: acceptanceIdempotencyKey,
        password,
      });
      setPassword('');
      setConfirmPassword('');
      setPasswordsVisible(false);
      setState({ status: 'accepted', preview, result });
    } catch (error) {
      setPassword('');
      setConfirmPassword('');
      setPasswordsVisible(false);
      setSubmitError(
        controlErrorMessage(
          error,
          t,
          t('team.invitationAcceptance.errors.accept'),
          {
            codeMessages: {
              weak_invitation_password: t(
                'team.invitationAcceptance.newIdentity.passwordRequirements',
                { count: passwordStrengthPolicy.minimumLength },
              ),
            },
          },
        ),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="bg-muted/30 grid min-h-screen place-items-center px-4 py-10">
      <Card className="bg-background w-full max-w-lg">
        <CardHeader>
          <div className="mb-2 flex items-center gap-2">
            <Badge variant="secondary">
              {preview.intendedRole === 'owner'
                ? t('team.rolesLower.owner')
                : preview.intendedRole === 'manager'
                  ? t('team.rolesLower.manager')
                  : t('team.rolesLower.operator')}
            </Badge>
            <span className="text-muted-foreground text-sm">
              {preview.business.name}
            </span>
          </div>
          <CardTitle role="heading" aria-level={1}>
            {t('team.invitationAcceptance.newIdentity.title', {
              name: preview.displayName,
            })}
          </CardTitle>
          <CardDescription>
            {t('team.invitationAcceptance.newIdentity.description', {
              email: preview.email,
            })}
          </CardDescription>
        </CardHeader>
        <form onSubmit={(event) => void submit(event)}>
          <CardContent className="pb-(--card-spacing)">
            <FieldGroup>
              {submitError !== null && (
                <Alert variant="destructive">
                  <AlertTitle>
                    {t('team.invitationAcceptance.attention')}
                  </AlertTitle>
                  <AlertDescription>{submitError}</AlertDescription>
                </Alert>
              )}
              <Field data-invalid={invalidPassword}>
                <div className="flex items-center justify-between gap-2">
                  <FieldLabel htmlFor="invite-password">
                    {t('team.invitationAcceptance.password')}
                  </FieldLabel>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-controls="invite-password invite-confirm-password"
                    aria-pressed={passwordsVisible}
                    onClick={() => setPasswordsVisible((visible) => !visible)}
                  >
                    {passwordsVisible ? (
                      <IconEyeOff data-icon="inline-start" />
                    ) : (
                      <IconEye data-icon="inline-start" />
                    )}
                    {passwordsVisible
                      ? t('team.invitationAcceptance.newIdentity.hidePasswords')
                      : t(
                          'team.invitationAcceptance.newIdentity.showPasswords',
                        )}
                  </Button>
                </div>
                <Input
                  id="invite-password"
                  type={passwordsVisible ? 'text' : 'password'}
                  autoComplete="new-password"
                  minLength={passwordStrengthPolicy.minimumLength}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  aria-invalid={invalidPassword}
                  required
                />
                <FieldDescription>
                  {t(
                    'team.invitationAcceptance.newIdentity.passwordDescription',
                    { count: passwordStrengthPolicy.minimumLength },
                  )}
                </FieldDescription>
                {invalidPassword && (
                  <FieldError>
                    {t(
                      'team.invitationAcceptance.newIdentity.passwordRequirements',
                      { count: passwordStrengthPolicy.minimumLength },
                    )}
                  </FieldError>
                )}
              </Field>
              <Field data-invalid={passwordsDiffer}>
                <FieldLabel htmlFor="invite-confirm-password">
                  {t('team.invitationAcceptance.newIdentity.confirmPassword')}
                </FieldLabel>
                <Input
                  id="invite-confirm-password"
                  type={passwordsVisible ? 'text' : 'password'}
                  autoComplete="new-password"
                  minLength={passwordStrengthPolicy.minimumLength}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  aria-invalid={passwordsDiffer}
                  required
                />
                {passwordsDiffer && (
                  <FieldError>
                    {t('team.invitationAcceptance.newIdentity.passwordsDiffer')}
                  </FieldError>
                )}
              </Field>
            </FieldGroup>
          </CardContent>
          <CardFooter className="justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={onContinueToSignIn}
            >
              {t('team.common.cancel')}
            </Button>
            <Button
              type="submit"
              disabled={
                busy || !passwordIsValid || password !== confirmPassword
              }
            >
              {busy && <Spinner data-icon="inline-start" />}
              {t('team.invitationAcceptance.actions.accept')}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </main>
  );
}
