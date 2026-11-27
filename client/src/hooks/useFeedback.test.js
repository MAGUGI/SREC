import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FEEDBACK_TIMEOUT_MS, useFeedback } from './useFeedback';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('useFeedback', () => {
  // FAILS BEFORE (BUG-14): the 1st message's timer clears the 2nd one.
  it('mensagens em sequência não se atropelam', () => {
    const { result } = renderHook(() => useFeedback());

    act(() => result.current.showFeedback('primeira'));
    act(() => vi.advanceTimersByTime(3000));
    act(() => result.current.showFeedback('segunda'));

    // At second 4 the OLD timer would fire and clear 'segunda'.
    act(() => vi.advanceTimersByTime(1500));
    expect(result.current.message.text).toBe('segunda');

    // 'segunda' only goes away 4 s after it was shown.
    act(() => vi.advanceTimersByTime(FEEDBACK_TIMEOUT_MS));
    expect(result.current.message.text).toBe('');
  });

  // FAILS BEFORE (BUG-14): the timer outlives the unmount and calls setState.
  it('limpa o timer pendente no desmonte', () => {
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout');
    const { result, unmount } = renderHook(() => useFeedback());

    act(() => result.current.showFeedback('vai desmontar'));
    expect(vi.getTimerCount()).toBe(1);

    unmount();
    expect(clearSpy).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('esconde a mensagem depois de 4 s', () => {
    const { result } = renderHook(() => useFeedback());
    act(() => result.current.showFeedback('ok'));
    expect(result.current.message).toEqual({ text: 'ok', type: 'success' });
    act(() => vi.advanceTimersByTime(FEEDBACK_TIMEOUT_MS));
    expect(result.current.message.text).toBe('');
  });

  it('vinte mensagens seguidas deixam no máximo um timer pendente', () => {
    const { result } = renderHook(() => useFeedback());
    for (let i = 0; i < 20; i += 1) {
      act(() => result.current.showFeedback(`msg ${i}`));
    }
    expect(vi.getTimerCount()).toBe(1); // BEFORE: 20
  });
});
