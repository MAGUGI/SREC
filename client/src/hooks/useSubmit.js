import { useCallback, useRef, useState } from 'react';

// Ties the lock to the request lifecycle (BUG-13): true before the await,
// false in `finally`, so the button comes back even when the request fails.
export function useSubmit(handler) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  // State only updates on the next render; the ref blocks a second event
  // that arrives before it (a fast double click).
  const inFlight = useRef(false);

  const submit = useCallback(
    async (event) => {
      event?.preventDefault();
      if (inFlight.current) return;
      inFlight.current = true;
      setIsSubmitting(true);
      try {
        await handler();
      } finally {
        inFlight.current = false;
        setIsSubmitting(false);
      }
    },
    [handler]
  );

  return { isSubmitting, submit };
}
