import { useCallback, useState } from 'react';

export function useFeedback() {
  const [message, setMessage] = useState({ text: '', type: '' });

  // TODO(FE-04): the timeout is never cleared (BUG-14). Kept on purpose:
  // FE-01 is a behavior-preserving refactor.
  const showFeedback = useCallback((text, type = 'success') => {
    setMessage({ text, type });
    setTimeout(() => setMessage({ text: '', type: '' }), 4000);
  }, []);

  return { message, showFeedback };
}
