import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppShell } from './app-shell';

describe('AppShell', () => {
  const renderShell = (current: 'home' | 'orders') => (
    <AppShell
      current={current}
      onNavigate={vi.fn()}
      title={current === 'home' ? 'Home' : 'Orders'}
      description="Daily work"
      locationName="Laundry Production"
      timezone="America/New_York"
      principalName="Olivia Press"
      capabilities={[
        'processor:view',
        'production:read',
        'production:intake',
        'production:admission',
        'production:stage',
        'production:schedule',
        'production:accept',
        'production:override',
        'production:resources',
      ]}
      logoutBusy={false}
      onLogout={vi.fn()}
    >
      <div>Workspace content</div>
    </AppShell>
  );

  it('keeps the workspace inside a viewport-sized vertical scroll region', () => {
    const { container } = render(renderShell('home'));

    expect(container.firstElementChild).toHaveClass(
      'h-dvh',
      'min-h-0',
      'overflow-hidden',
    );
    expect(
      container.querySelector('[data-slot="workspace-scroll-region"]'),
    ).toHaveClass('min-h-0', 'flex-1', 'overflow-y-auto');
    expect(container.querySelector('header')).toHaveClass('shrink-0');
  });

  it('starts a newly selected workspace at the top', () => {
    const { container, rerender } = render(renderShell('home'));
    const firstScrollRegion = container.querySelector<HTMLElement>(
      '[data-slot="workspace-scroll-region"]',
    );

    expect(firstScrollRegion).not.toBeNull();
    if (firstScrollRegion === null) return;
    firstScrollRegion.scrollTop = 200;

    rerender(renderShell('orders'));

    const nextScrollRegion = container.querySelector<HTMLElement>(
      '[data-slot="workspace-scroll-region"]',
    );
    expect(nextScrollRegion).not.toBe(firstScrollRegion);
    expect(nextScrollRegion).toHaveProperty('scrollTop', 0);
  });
});
