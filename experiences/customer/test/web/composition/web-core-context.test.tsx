'use client';

import { render, screen } from '@testing-library/react';
import {
  CustomerWebCoreProvider,
  useWebCore,
} from '#customer/composition/web-core-context';
import { makeTestWebCore } from '@test/support/make-test-web-core';

const Consumer = () => {
  const core = useWebCore();
  const context = core.context.get();

  return <div>{context.route}</div>;
};

describe('useWebCore', () => {
  it('reads the injected core', () => {
    const core = makeTestWebCore({
      route: '/test-route',
    });

    render(
      <CustomerWebCoreProvider core={core}>
        <Consumer />
      </CustomerWebCoreProvider>,
    );

    expect(screen.getByText('/test-route')).toBeInTheDocument();
  });

  it('throws outside a provider', () => {
    expect(() => render(<Consumer />)).toThrow(
      'useWebCore must be used inside CustomerWebCoreProvider.',
    );
  });
});
