import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  isControlApiError,
  type ControlAuthenticationApi,
} from './control-api';
import type { ControlAuthenticatedSession } from './control-session';
import { controlErrorMessage } from '@/i18n/control-error-message';

type AuthenticationState =
  | Readonly<{ status: 'restoring'; error: string | null }>
  | Readonly<{ status: 'unauthenticated'; error: string | null }>
  | Readonly<{ status: 'mfa'; error: string | null }>
  | Readonly<{
      status: 'authenticated';
      error: string | null;
      session: ControlAuthenticatedSession;
    }>;

const maximumTimeoutMilliseconds = 2_147_000_000;

export function useAuthentication(api: ControlAuthenticationApi) {
  const { t } = useTranslation();
  const [state, setState] = useState<AuthenticationState>({
    status: 'restoring',
    error: null,
  });
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    api
      .restore()
      .then((session) => {
        if (active) setState({ status: 'authenticated', error: null, session });
      })
      .catch((error: unknown) => {
        if (!active) return;
        setState({
          status: 'unauthenticated',
          error:
            isControlApiError(error) && error.status === 401
              ? null
              : controlErrorMessage(
                  error,
                  t,
                  t('authentication.errors.restore'),
                ),
        });
      });
    return () => {
      active = false;
    };
  }, [api, t]);

  useEffect(() => {
    if (state.status !== 'authenticated') return;
    const remaining = Date.parse(state.session.expiresAt) - Date.now();
    const timeout = window.setTimeout(
      () =>
        setState({
          status: 'unauthenticated',
          error: t('authentication.errors.sessionExpired'),
        }),
      Math.max(0, Math.min(remaining, maximumTimeoutMilliseconds)),
    );
    return () => window.clearTimeout(timeout);
  }, [state, t]);

  const login = useCallback(
    async (credentials: { email: string; password: string }) => {
      setBusy(true);
      setState({ status: 'unauthenticated', error: null });
      try {
        const result = await api.login(credentials);
        if (!mounted.current) return;
        setState(
          result.status === 'authenticated'
            ? { status: 'authenticated', error: null, session: result }
            : { status: 'mfa', error: null },
        );
      } catch (error) {
        if (!mounted.current) return;
        setState({
          status: 'unauthenticated',
          error: controlErrorMessage(
            error,
            t,
            t('authentication.errors.signIn'),
          ),
        });
      } finally {
        if (mounted.current) setBusy(false);
      }
    },
    [api, t],
  );

  const completeMfa = useCallback(
    async (input: { method: 'totp' | 'recovery'; code: string }) => {
      setBusy(true);
      setState({ status: 'mfa', error: null });
      try {
        const session = await api.completeMfa(input);
        if (mounted.current)
          setState({ status: 'authenticated', error: null, session });
      } catch (error) {
        if (mounted.current)
          setState({
            status: 'mfa',
            error: controlErrorMessage(
              error,
              t,
              t('authentication.errors.verifyCode'),
            ),
          });
      } finally {
        if (mounted.current) setBusy(false);
      }
    },
    [api, t],
  );

  const logout = useCallback(async () => {
    setBusy(true);
    try {
      await api.logout();
      if (mounted.current) setState({ status: 'unauthenticated', error: null });
    } catch (error) {
      if (mounted.current && state.status === 'authenticated')
        setState({
          ...state,
          error: controlErrorMessage(
            error,
            t,
            t('authentication.errors.signOut'),
          ),
        });
    } finally {
      if (mounted.current) setBusy(false);
    }
  }, [api, state, t]);

  const refreshSession = useCallback(async () => {
    const session = await api.restore();
    if (mounted.current)
      setState({ status: 'authenticated', error: null, session });
  }, [api]);

  return {
    state,
    busy,
    login,
    completeMfa,
    logout,
    refreshSession,
    restart: () => setState({ status: 'unauthenticated', error: null }),
  };
}
