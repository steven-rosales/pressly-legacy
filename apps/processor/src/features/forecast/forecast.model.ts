import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type ProcessorRemainingDayForecast } from '@pressly/contracts/processor';
import { productionServiceDaySchema } from '@pressly/contracts/production';
import type { Clock } from '@pressly/time';
import type { ProductionPort } from '@/ports/production.port';
import { presentForecastError } from './forecast.error.presenter';
import { serviceDayAt } from './forecast.presenter';

export type RemainingDayForecastModel = Readonly<{
  serviceDay: string;
  forecast: ProcessorRemainingDayForecast | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  onServiceDayChange: (serviceDay: string) => void;
  refresh: () => Promise<void>;
}>;

const isAbortError = (cause: unknown): boolean =>
  cause instanceof DOMException && cause.name === 'AbortError';

export const useRemainingDayForecastModel = ({
  production,
  locationId,
  timezone,
  revision,
  now,
}: Readonly<{
  production: ProductionPort;
  locationId: string;
  timezone: string;
  revision: string;
  now: Clock['now'];
}>): RemainingDayForecastModel => {
  const { t } = useTranslation();
  const [serviceDay, setServiceDay] = useState(() =>
    serviceDayAt(now(), timezone),
  );
  const [forecast, setForecast] =
    useState<ProcessorRemainingDayForecast | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const sequence = useRef(0);
  const controller = useRef<AbortController | null>(null);

  const cancelCurrentRequest = useCallback(() => {
    sequence.current += 1;
    controller.current?.abort();
    controller.current = null;
  }, []);

  const load = useCallback(async () => {
    cancelCurrentRequest();
    const nextController = new AbortController();
    controller.current = nextController;
    const requestSequence = sequence.current;
    setLoading(true);
    setError(null);
    try {
      const value = await production.loadRemainingDayForecast({
        locationId,
        serviceDay,
        signal: nextController.signal,
      });
      if (requestSequence === sequence.current) setForecast(value);
    } catch (cause) {
      if (
        requestSequence === sequence.current &&
        !isAbortError(cause) &&
        !nextController.signal.aborted
      )
        setError(presentForecastError(cause, t));
    } finally {
      if (requestSequence === sequence.current) {
        if (controller.current === nextController) controller.current = null;
        setLoading(false);
      }
    }
  }, [cancelCurrentRequest, locationId, production, serviceDay, t]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => {
      window.clearTimeout(timeout);
      cancelCurrentRequest();
    };
  }, [cancelCurrentRequest, load, revision]);

  const onServiceDayChange = (nextServiceDay: string) => {
    if (
      nextServiceDay === serviceDay ||
      !productionServiceDaySchema.safeParse(nextServiceDay).success
    )
      return;
    cancelCurrentRequest();
    setForecast(null);
    setError(null);
    setLoading(true);
    setServiceDay(nextServiceDay);
  };

  return {
    serviceDay,
    forecast,
    loading: loading && forecast === null,
    refreshing: loading && forecast !== null,
    error,
    onServiceDayChange,
    refresh: load,
  };
};
