import {
  IconAlertTriangle,
  IconFilter,
  IconInfoCircle,
  IconPackageImport,
  IconRefresh,
  IconSearch,
} from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { SectionHeading } from '@/components/layout/workspace-primitives';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DelayedLoadingRows } from '@/components/ui/delayed-loading-rows';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { Spinner } from '@/components/ui/spinner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  useIntakeModel,
  type IntakeFilters,
  type IntakeModelInput,
  type IntakeTab,
} from './intake.model';
import {
  presentIntakeCustomer,
  presentIntakeOrderNumber,
} from './intake.presenter';
import { IntakeQueue } from './intake-queue.view';

const tabItems: readonly Readonly<{
  value: IntakeTab;
  labelKey: 'intake.forecastOnly' | 'intake.needsIntake' | 'intake.ready';
  mobileLabelKey:
    | 'intake.forecastShort'
    | 'intake.needsIntakeShort'
    | 'intake.ready';
  count: (model: ReturnType<typeof useIntakeModel>) => number;
}>[] = [
  {
    value: 'needs_intake',
    labelKey: 'intake.needsIntake',
    mobileLabelKey: 'intake.needsIntakeShort',
    count: (model) => model.counts.needsIntake,
  },
  {
    value: 'forecast_only',
    labelKey: 'intake.forecastOnly',
    mobileLabelKey: 'intake.forecastShort',
    count: (model) => model.counts.forecastOnly,
  },
  {
    value: 'ready',
    labelKey: 'intake.ready',
    mobileLabelKey: 'intake.ready',
    count: (model) => model.counts.ready,
  },
];

function IntakeFilterSelect<TValue extends string>({
  id,
  label,
  value,
  options,
  onValueChange,
}: Readonly<{
  id: string;
  label: string;
  value: TValue;
  options: readonly Readonly<{ value: TValue; label: string }>[];
  onValueChange: (value: TValue) => void;
}>) {
  return (
    <NativeSelect
      id={id}
      aria-label={label}
      className="min-w-36 flex-1 sm:flex-none [&_[data-slot=native-select]]:h-11"
      value={value}
      onChange={(event) => onValueChange(event.target.value as TValue)}
    >
      {options.map((option) => (
        <NativeSelectOption key={option.value} value={option.value}>
          {option.label}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );
}

export function IntakeWorkspace(input: IntakeModelInput) {
  const { t } = useTranslation();
  const model = useIntakeModel(input);
  const updateFilter = <TKey extends keyof IntakeFilters>(
    key: TKey,
    value: IntakeFilters[TKey],
  ) => model.setFilters({ ...model.filters, [key]: value });
  const decisionOrderNumber =
    model.decision === null
      ? null
      : presentIntakeOrderNumber(model.decision.item);
  const decisionCustomer =
    model.decision === null
      ? null
      : presentIntakeCustomer(model.decision.item, t).name;

  return (
    <div
      className="flex flex-col gap-6"
      aria-busy={model.loading || model.refreshing}
    >
      <SectionHeading
        title={t('intake.workspaceTitle')}
        description={t('intake.workspaceDescription')}
        action={
          <div
            role={model.refreshing ? 'status' : undefined}
            className="flex h-8 items-center gap-2 text-xs whitespace-nowrap text-muted-foreground"
          >
            {model.refreshing && (
              <Spinner className="size-3.5" aria-hidden="true" />
            )}
            {model.refreshing
              ? t('intake.updating')
              : t('intake.updatedAt', { asOf: model.asOfLabel })}
          </div>
        }
      />

      {model.error !== null && (
        <Alert variant="destructive" role="alert">
          <IconAlertTriangle />
          <AlertTitle>{t('intake.attention')}</AlertTitle>
          <AlertDescription>{model.error}</AlertDescription>
        </Alert>
      )}

      <Tabs
        value={model.tab}
        onValueChange={(value) => model.setTab(value as IntakeTab)}
        className="gap-6"
      >
        <TabsList
          aria-label={t('intake.tabsLabel')}
          className="grid h-11 w-full grid-cols-3 sm:w-fit sm:min-w-lg"
        >
          {tabItems.map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              aria-label={t('intake.tabLabel', {
                label: t(tab.labelKey),
                count: tab.count(model),
              })}
              className="min-w-0 gap-1 px-1 sm:px-2"
            >
              <span className="sm:hidden">{t(tab.mobileLabelKey)}</span>
              <span className="hidden sm:inline">{t(tab.labelKey)}</span>
              <Badge
                variant={model.tab === tab.value ? 'secondary' : 'outline'}
                className="min-w-5 shrink-0 px-1 tabular-nums"
              >
                {tab.count(model)}
              </Badge>
            </TabsTrigger>
          ))}
        </TabsList>

        {model.tab !== 'needs_intake' && (
          <Alert>
            <IconInfoCircle />
            <AlertDescription>
              <span className="font-medium text-foreground">
                {t('intake.presslyDecisionTitle')}
              </span>
              {' · '}
              {t('intake.presslyDecisionDescription')}
            </AlertDescription>
          </Alert>
        )}

        <Card className="gap-4 bg-background py-4">
          <CardContent className="flex flex-col gap-3 px-4 sm:flex-row sm:items-center">
            <InputGroup className="h-11 min-w-0 flex-1 sm:max-w-md">
              <InputGroupAddon>
                <IconSearch />
              </InputGroupAddon>
              <InputGroupInput
                type="search"
                aria-label={t('intake.search')}
                placeholder={t('intake.searchPlaceholder')}
                value={model.filters.query}
                onChange={(event) => updateFilter('query', event.target.value)}
              />
            </InputGroup>
            <div className="flex flex-wrap gap-2 sm:ml-auto">
              <IntakeFilterSelect
                id="intake-due-filter"
                label={t('intake.dueFilter')}
                value={model.filters.due}
                options={[
                  { value: 'all', label: t('intake.anyDueDate') },
                  { value: 'overdue', label: t('common.due.overdue') },
                  { value: 'today', label: t('common.due.today') },
                  { value: 'tomorrow', label: t('common.due.tomorrow') },
                  { value: 'later', label: t('common.due.later') },
                ]}
                onValueChange={(value) => updateFilter('due', value)}
              />
              <IntakeFilterSelect
                id="intake-priority-filter"
                label={t('intake.priorityFilter')}
                value={model.filters.priority}
                options={[
                  { value: 'all', label: t('intake.anyPriority') },
                  { value: 'priority', label: t('intake.priorityOnly') },
                  { value: 'standard', label: t('intake.standardOnly') },
                ]}
                onValueChange={(value) => updateFilter('priority', value)}
              />
              {model.filterCount > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  className="h-11"
                  onClick={model.clearFilters}
                >
                  <IconFilter data-icon="inline-start" />
                  {t('intake.clearCount', { count: model.filterCount })}
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                className="h-11"
                aria-label={t('common.refresh')}
                disabled={model.loading || model.refreshing}
                onClick={() => void model.refresh()}
              >
                {model.refreshing ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <IconRefresh data-icon="inline-start" />
                )}
                {t('common.refresh')}
              </Button>
            </div>
          </CardContent>
        </Card>

        <TabsContent value={model.tab} className="mt-0">
          {model.loading && !model.hasLoaded ? (
            <DelayedLoadingRows label={t('intake.loading')} />
          ) : model.items.length === 0 ? (
            <Empty className="min-h-72 border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <IconPackageImport />
                </EmptyMedia>
                <EmptyTitle role="heading" aria-level={3}>
                  {model.filterCount > 0
                    ? t('intake.emptyFilteredTitle')
                    : t('intake.emptyTitle')}
                </EmptyTitle>
                <EmptyDescription>
                  {model.filterCount > 0
                    ? t('intake.emptyFilteredDescription')
                    : t('intake.emptyDescription')}
                </EmptyDescription>
              </EmptyHeader>
              {model.filterCount > 0 && (
                <EmptyContent>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11"
                    onClick={model.clearFilters}
                  >
                    {t('intake.clearFilters')}
                  </Button>
                </EmptyContent>
              )}
            </Empty>
          ) : (
            <IntakeQueue
              items={model.items}
              bagCounts={model.bagCounts}
              priorities={model.priorities}
              busyOrderId={model.busyOrderId}
              onBagCountChange={model.setBagCount}
              onPriorityChange={model.setPriority}
              onRecord={model.record}
              onDecision={(item, target) => model.setDecision({ item, target })}
            />
          )}
        </TabsContent>
      </Tabs>

      <AlertDialog
        open={model.decision !== null}
        onOpenChange={(open) => {
          if (!open) model.setDecision(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <IconPackageImport />
            </AlertDialogMedia>
            <AlertDialogTitle>
              {t('intake.releaseTitle', {
                orderId: decisionOrderNumber,
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('intake.releaseDescription', {
                customer: decisionCustomer,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              disabled={model.busyOrderId !== null}
              onClick={(event) => {
                event.preventDefault();
                void model.confirmAdmission();
              }}
            >
              {model.busyOrderId !== null && (
                <Spinner data-icon="inline-start" />
              )}
              {t('intake.confirmRelease')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
