// @vitest-environment jsdom
// Copy as image: the pure parts (pixel-ratio cap, capture filter, wrap slack) and the button's ✓ / ! states. The
// real rendering and clipboard are tested in a browser (e2e/copy.spec.ts).

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { capturePixelRatio, COPY_PIXEL_RATIO, keepInCapture, MAX_CANVAS_SIDE, slackWrappingRows, WRAP_SLACK } from '../src/components/copyAsImage';
import { COPY_FEEDBACK_MS, CopyButton } from '../src/components/CopyButton';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('capturePixelRatio', () => {
  it('is 4 while the canvas stays under 16000 px a side', () => {
    expect(COPY_PIXEL_RATIO).toBe(4);
    expect(capturePixelRatio(1840, 1048, 4)).toBe(4);
    expect(capturePixelRatio(4000, 10, 4)).toBe(4);
  });
  it('lowers the density for huge nodes so the largest side is 16000 px', () => {
    expect(MAX_CANVAS_SIDE).toBe(16000);
    expect(capturePixelRatio(960, 8000, 4)).toBe(2);
    expect(capturePixelRatio(20000, 500, 4)).toBe(0.8);
    expect(capturePixelRatio(0, 0, 4)).toBe(4);
  });
});

describe('keepInCapture', () => {
  it('drops elements tagged data-capture-exclude="true" and keeps everything else', () => {
    const tagged = document.createElement('button');
    tagged.dataset.captureExclude = 'true';
    const other = document.createElement('span');
    other.dataset.captureExclude = 'false';
    expect(keepInCapture(tagged)).toBe(false);
    expect(keepInCapture(other)).toBe(true);
    expect(keepInCapture(document.createElement('div'))).toBe(true);
    expect(keepInCapture(document.createTextNode('LAL'))).toBe(true);
  });
});

describe('slackWrappingRows', () => {
  it('widens wrapping flex rows inside the node (not the node itself) and undoes it', () => {
    const root = document.createElement('div');
    root.style.cssText = 'display:flex;flex-wrap:wrap;width:300px';
    const row = document.createElement('span');
    row.style.cssText = 'display:inline-flex;flex-wrap:wrap;width:120.5px';
    const plain = document.createElement('span');
    plain.style.cssText = 'display:flex;width:50px';
    root.append(row, plain);
    document.body.append(root);
    const undo = slackWrappingRows(root);
    expect(parseFloat(row.style.width)).toBeCloseTo(120.5 + WRAP_SLACK);
    expect(plain.style.width).toBe('50px');
    expect(root.style.width).toBe('300px');
    undo();
    expect(row.style.width).toBe('120.5px');
    root.remove();
  });
});

describe('CopyButton', () => {
  it('is excluded from images, has no text, and shows ✓ then idle after 1.5 s', async () => {
    vi.useFakeTimers();
    const copy = vi.fn(() => Promise.resolve());
    render(<CopyButton label="Copy day as image" copy={copy} />);
    const b = screen.getByRole('button', { name: 'Copy day as image' });
    expect(b.dataset.captureExclude).toBe('true');
    expect(b.textContent).toBe('');
    expect(b.dataset.state).toBe('idle');
    await act(async () => fireEvent.click(b));
    expect(copy).toHaveBeenCalledWith(b);
    expect(b.dataset.state).toBe('copied');
    await act(async () => vi.advanceTimersByTime(COPY_FEEDBACK_MS - 1));
    expect(b.dataset.state).toBe('copied');
    await act(async () => vi.advanceTimersByTime(1));
    expect(b.dataset.state).toBe('idle');
  });

  it('shows ! and logs the error when the copy fails', async () => {
    vi.useFakeTimers();
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<CopyButton label="Copy game as image" copy={() => Promise.reject(new Error('boom'))} />);
    const b = screen.getByRole('button');
    await act(async () => fireEvent.click(b));
    expect(b.dataset.state).toBe('error');
    expect(err).toHaveBeenCalledWith('Copy game as image failed', expect.any(Error));
    await act(async () => vi.advanceTimersByTime(COPY_FEEDBACK_MS));
    expect(b.dataset.state).toBe('idle');
    err.mockRestore();
  });

  it('does not pass the click on (a phone team-calendar cell would select its game)', async () => {
    const outer = vi.fn();
    render(
      <div onClick={outer}>
        <CopyButton label="Copy day as image" copy={() => Promise.resolve()} />
      </div>,
    );
    await act(async () => fireEvent.click(screen.getByRole('button')));
    expect(outer).not.toHaveBeenCalled();
  });
});
