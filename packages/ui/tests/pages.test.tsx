/**
 * UI Page Rendering Tests
 *
 * Ensures each page renders without crashing
 * Note: Full integration tests with API mocking should be done in E2E tests
 */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import SessionList from '../src/pages/SessionList';
import Analytics from '../src/pages/Analytics';
import Topology from '../src/pages/Topology';

// =============================================================================
// Basic Smoke Tests
// =============================================================================

describe('Page Rendering Smoke Tests', () => {
  it('should render SessionList page without crashing', () => {
    const { container } = render(
      <BrowserRouter>
        <SessionList />
      </BrowserRouter>
    );
    expect(container).toBeTruthy();
  });

  it('should render Analytics page without crashing', () => {
    const { container } = render(
      <BrowserRouter>
        <Analytics />
      </BrowserRouter>
    );
    expect(container).toBeTruthy();
  });

  it('should render Topology page without crashing', () => {
    const { container } = render(
      <BrowserRouter>
        <Topology />
      </BrowserRouter>
    );
    expect(container).toBeTruthy();
  });

  it('should render all pages in router context', () => {
    const pages = [
      <SessionList key="sessions" />,
      <Analytics key="analytics" />,
      <Topology key="topology" />,
    ];

    pages.forEach((page) => {
      const { container, unmount } = render(<BrowserRouter>{page}</BrowserRouter>);
      expect(container).toBeTruthy();
      expect(container.innerHTML).not.toBe('');
      unmount();
    });
  });
});
