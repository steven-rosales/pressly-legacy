'use client';

import { render, screen } from '@testing-library/react';
import { makeTestWebCore } from '../../testing/make-test-web-core';
import { InjectedWebCoreProvider, useWebCore } from './web-core-context';

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
      <InjectedWebCoreProvider core={core}>
        <Consumer />
      </InjectedWebCoreProvider>,
    );

    expect(screen.getByText('/test-route')).toBeInTheDocument();
  });

  it('throws outside a provider', () => {
    expect(() => render(<Consumer />)).toThrow(
      'useWebCore must be used inside WebCoreProvider.',
    );
  });
});
