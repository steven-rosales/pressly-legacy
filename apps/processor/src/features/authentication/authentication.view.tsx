import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { IconLock, IconShieldCheck } from '@tabler/icons-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '@/components/ui/input-otp';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';

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

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (mode === 'login') void onLogin({ email, password });
    else void onCompleteMfa({ method, code });
  };

  const invalidCode =
    code.length > 0 &&
    (method === 'totp' ? !/^\d{6}$/.test(code) : code.length < 16);

  return (
    <main className="grid min-h-screen place-items-center bg-muted/30 px-4 py-10">
      <Card className="w-full max-w-md bg-background">
        <CardHeader>
          <div className="mb-3 grid size-10 place-items-center rounded-lg bg-foreground text-background">
            {mode === 'login' ? <IconLock /> : <IconShieldCheck />}
          </div>
          <CardTitle role="heading" aria-level={1}>
            {mode === 'login'
              ? t('authentication.signInTitle')
              : t('authentication.verifyTitle')}
          </CardTitle>
          <CardDescription>
            {mode === 'login'
              ? t('authentication.signInDescription')
              : t('authentication.verifyDescription')}
          </CardDescription>
        </CardHeader>
        <form onSubmit={submit}>
          <CardContent className="pb-(--card-spacing)">
            <FieldGroup>
              {error !== null && (
                <Alert variant="destructive" role="alert">
                  <AlertTitle>{t('authentication.failed')}</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              {mode === 'login' ? (
                <>
                  <Field>
                    <FieldLabel htmlFor="processor-email">
                      {t('authentication.email')}
                    </FieldLabel>
                    <Input
                      id="processor-email"
                      type="email"
                      autoComplete="username"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      required
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="processor-password">
                      {t('authentication.password')}
                    </FieldLabel>
                    <Input
                      id="processor-password"
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
                    <FieldLabel htmlFor="mfa-method">
                      {t('authentication.verificationMethod')}
                    </FieldLabel>
                    <Select
                      value={method}
                      onValueChange={(value) => {
                        setMethod(value as 'totp' | 'recovery');
                        setCode('');
                      }}
                    >
                      <SelectTrigger id="mfa-method">
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
                    <FieldLabel htmlFor="processor-mfa-code">
                      {method === 'totp'
                        ? t('authentication.sixDigitCode')
                        : t('authentication.recoveryCode')}
                    </FieldLabel>
                    {method === 'totp' ? (
                      <InputOTP
                        id="processor-mfa-code"
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
                        id="processor-mfa-code"
                        autoComplete="one-time-code"
                        value={code}
                        onChange={(event) => setCode(event.target.value)}
                        aria-invalid={invalidCode}
                      />
                    )}
                    {invalidCode && (
                      <FieldError>
                        {t('authentication.invalidCode', {
                          kind:
                            method === 'totp'
                              ? t('authentication.sixDigit')
                              : t('authentication.recovery'),
                        })}
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
                ? t('authentication.signIn')
                : t('authentication.verifyAndContinue')}
            </Button>
            {mode === 'mfa' && (
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                disabled={busy}
                onClick={onRestart}
              >
                {t('authentication.backToSignIn')}
              </Button>
            )}
          </CardFooter>
        </form>
      </Card>
    </main>
  );
}
