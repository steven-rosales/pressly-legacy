import { useState, type FormEvent } from 'react';
import { IconLock, IconShieldCheck } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Field,
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

export function AuthenticationView({
  mode,
  busy,
  error,
  onLogin,
  onCompleteMfa,
  onRestart,
}: {
  mode: 'login' | 'mfa';
  busy: boolean;
  error: string | null;
  onLogin: (input: { email: string; password: string }) => Promise<void>;
  onCompleteMfa: (input: {
    method: 'totp' | 'recovery';
    code: string;
  }) => Promise<void>;
  onRestart: () => void;
}) {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [method, setMethod] = useState<'totp' | 'recovery'>('totp');
  const [code, setCode] = useState('');
  const invalidCode =
    code.length > 0 &&
    (method === 'totp' ? !/^\d{6}$/.test(code) : code.length < 16);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (mode === 'login') void onLogin({ email, password });
    else void onCompleteMfa({ method, code });
  };

  return (
    <main className="bg-muted/30 grid min-h-screen place-items-center px-4 py-10">
      <Card className="bg-background w-full max-w-md">
        <CardHeader>
          <div className="bg-foreground text-background mb-3 grid size-10 place-items-center rounded-lg">
            {mode === 'login' ? <IconLock /> : <IconShieldCheck />}
          </div>
          <CardTitle role="heading" aria-level={1}>
            {mode === 'login'
              ? t('authentication.title.signIn')
              : t('authentication.title.verify')}
          </CardTitle>
          <CardDescription>
            {mode === 'login'
              ? t('authentication.description.signIn')
              : t('authentication.description.verify')}
          </CardDescription>
        </CardHeader>
        <form onSubmit={submit}>
          <CardContent className="pb-(--card-spacing)">
            <FieldGroup>
              {error !== null && (
                <Alert variant="destructive" role="alert">
                  <AlertTitle>{t('authentication.attention')}</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              {mode === 'login' ? (
                <>
                  <Field>
                    <FieldLabel htmlFor="control-email">
                      {t('authentication.email')}
                    </FieldLabel>
                    <Input
                      id="control-email"
                      type="email"
                      autoComplete="username"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      required
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="control-password">
                      {t('authentication.password')}
                    </FieldLabel>
                    <Input
                      id="control-password"
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
                  <Field>
                    <FieldLabel htmlFor="control-mfa-method">
                      {t('authentication.verificationMethod')}
                    </FieldLabel>
                    <Select
                      value={method}
                      onValueChange={(value) => {
                        setMethod(value as 'totp' | 'recovery');
                        setCode('');
                      }}
                    >
                      <SelectTrigger id="control-mfa-method">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="totp">
                            {t('authentication.authenticatorCode')}
                          </SelectItem>
                          <SelectItem value="recovery">
                            {t('authentication.recoveryCode')}
                          </SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field data-invalid={invalidCode}>
                    <FieldLabel htmlFor="control-mfa-code">
                      {method === 'totp'
                        ? t('authentication.sixDigitCode')
                        : t('authentication.recoveryCode')}
                    </FieldLabel>
                    {method === 'totp' ? (
                      <InputOTP
                        id="control-mfa-code"
                        maxLength={6}
                        value={code}
                        onChange={setCode}
                        aria-invalid={invalidCode}
                      >
                        <InputOTPGroup>
                          {[0, 1, 2, 3, 4, 5].map((index) => (
                            <InputOTPSlot key={index} index={index} />
                          ))}
                        </InputOTPGroup>
                      </InputOTP>
                    ) : (
                      <Input
                        id="control-mfa-code"
                        autoComplete="one-time-code"
                        value={code}
                        onChange={(event) => setCode(event.target.value)}
                        aria-invalid={invalidCode}
                      />
                    )}
                    {invalidCode && (
                      <FieldError>
                        {method === 'totp'
                          ? t('authentication.invalidSixDigitCode')
                          : t('authentication.invalidRecoveryCode')}
                      </FieldError>
                    )}
                  </Field>
                </>
              )}
            </FieldGroup>
          </CardContent>
          <CardFooter className="flex-col gap-2">
            <Button
              type="submit"
              className="w-full"
              disabled={
                busy ||
                (mode === 'login'
                  ? email.length === 0 || password.length < 8
                  : code.length === 0 || invalidCode)
              }
            >
              {busy && <Spinner data-icon="inline-start" />}
              {mode === 'login'
                ? t('authentication.actions.signIn')
                : t('authentication.actions.verifyAndContinue')}
            </Button>
            {mode === 'mfa' && (
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                disabled={busy}
                onClick={onRestart}
              >
                {t('authentication.actions.backToSignIn')}
              </Button>
            )}
          </CardFooter>
        </form>
      </Card>
    </main>
  );
}
