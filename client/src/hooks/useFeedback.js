import { useCallback, useEffect, useRef, useState } from 'react';

export const FEEDBACK_TIMEOUT_MS = 4000;

export function useFeedback() {
  const [message, setMessage] = useState({ text: '', type: '' });
  const timeoutRef = useRef(null);

  const clear = useCallback(() => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const showFeedback = useCallback(
    (text, type = 'success') => {
      // Cancel the previous message's timer: without this, two messages in a
      // row overlap and the second one disappears before 4 s (BUG-14).
      clear();
      setMessage({ text, type });
      timeoutRef.current = setTimeout(() => {
        timeoutRef.current = null;
        setMessage({ text: '', type: '' });
      }, FEEDBACK_TIMEOUT_MS);
    },
    [clear]
  );

  const dismissFeedback = useCallback(() => {
    clear();
    setMessage({ text: '', type: '' });
  }, [clear]);

  // Clear the pending timer on unmount: without this, setState runs on an
  // unmounted component (BUG-14).
  useEffect(() => clear, [clear]);

  return { message, showFeedback, dismissFeedback };
}
