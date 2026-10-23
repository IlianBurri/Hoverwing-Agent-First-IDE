// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Markdown } from './Markdown';

afterEach(cleanup);

describe('Markdown', () => {
  it('renders formatting', () => {
    const { container } = render(<Markdown text={'**bold** and `code`\n\n- a\n- b'} />);
    expect(container.querySelector('strong')?.textContent).toBe('bold');
    expect(container.querySelectorAll('li')).toHaveLength(2);
  });

  it('never renders raw HTML from the agent', () => {
    const { container } = render(
      <Markdown text={'<img src=x onerror="alert(1)"><script>alert(1)</script>'} />,
    );
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
  });

  it('drops dangerous link targets', () => {
    const { container } = render(
      <Markdown text="[click](javascript:alert(1)) [docs](https://example.com)" />,
    );
    const links = [...container.querySelectorAll('a')].map((link) => link.getAttribute('href'));
    expect(links).toEqual(['', 'https://example.com']);
  });
});
