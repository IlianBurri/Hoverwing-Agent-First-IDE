// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SegmentedControl } from './SegmentedControl';

afterEach(cleanup);

const options = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
] as const;

describe('SegmentedControl', () => {
  it('marks the selected option for assistive technology', () => {
    render(<SegmentedControl label="Theme" options={options} value="dark" onChange={vi.fn()} />);
    expect(screen.getByRole('radiogroup', { name: 'Theme' })).toBeDefined();
    expect(screen.getByRole('radio', { name: 'Dark' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: 'Light' }).getAttribute('aria-checked')).toBe('false');
  });

  it('reports the clicked value', () => {
    const onChange = vi.fn();
    render(<SegmentedControl label="Theme" options={options} value="dark" onChange={onChange} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Light' }));
    expect(onChange).toHaveBeenCalledWith('light');
  });
});
