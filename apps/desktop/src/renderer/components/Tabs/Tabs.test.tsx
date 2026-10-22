// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { Tabs } from './Tabs';

afterEach(cleanup);

const items = [
  { id: 'a', label: 'Alpha' },
  { id: 'b', label: 'Beta' },
  { id: 'c', label: 'Gamma' },
] as const;

function Harness() {
  const [value, setValue] = useState<'a' | 'b' | 'c'>('a');
  return (
    <Tabs label="Demo" idPrefix="demo" items={items} value={value} onChange={setValue}>
      content {value}
    </Tabs>
  );
}

describe('Tabs', () => {
  it('links the selected tab to its panel', () => {
    render(<Harness />);
    const tab = screen.getByRole('tab', { name: 'Alpha' });
    expect(tab.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tabpanel', { name: 'Alpha' }).textContent).toBe('content a');
  });

  it('moves with arrow keys and wraps around', () => {
    render(<Harness />);
    const list = screen.getByRole('tablist', { name: 'Demo' });
    fireEvent.keyDown(list, { key: 'ArrowLeft' });
    expect(screen.getByRole('tab', { name: 'Gamma' }).getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Gamma' }));
    fireEvent.keyDown(list, { key: 'Home' });
    expect(screen.getByRole('tab', { name: 'Alpha' }).getAttribute('aria-selected')).toBe('true');
  });
});
