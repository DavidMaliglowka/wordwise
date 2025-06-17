import { useCallback, useRef, useEffect } from 'react';

/**
 * Custom hook for debouncing function calls
 * @param callback - Function to debounce
 * @param delay - Delay in milliseconds
 * @returns Debounced function
 */
export function useDebounce<T extends (...args: any[]) => any>(
  callback: T,
  delay: number
): T {
  const callbackRef = useRef(callback);
  const timeoutRef = useRef<NodeJS.Timeout>();

  // Update the callback ref when callback changes
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return useCallback(
    ((...args: Parameters<T>) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        callbackRef.current(...args);
      }, delay);
    }) as T,
    [delay]
  );
}

/**
 * Hook specifically for debouncing text input for grammar checking
 * @param callback - Function to call with debounced text
 * @param delay - Delay in milliseconds (default: 1000ms)
 * @param minLength - Minimum text length to trigger callback (default: 3)
 * @returns Object with debounced trigger function and cancel function
 */
export function useGrammarDebounce(
  callback: (text: string) => void,
  delay: number = 1000,
  minLength: number = 3
) {
  const callbackRef = useRef(callback);
  const timeoutRef = useRef<NodeJS.Timeout>();
  const lastTextRef = useRef<string>('');

  // Update the callback ref when callback changes
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const trigger = useCallback(
    (text: string) => {
      console.log('🔧 Grammar debounce trigger called:');
      console.log('Text length:', text.length);
      console.log('Min length:', minLength);
      console.log('Last text:', JSON.stringify(lastTextRef.current));
      console.log('Current text:', JSON.stringify(text));
      console.log('Text unchanged?', text === lastTextRef.current);

      // Cancel previous timeout
      if (timeoutRef.current) {
        console.log('🔧 Cancelling previous timeout');
        clearTimeout(timeoutRef.current);
      }

      // Skip if text is too short or unchanged
      if (text.length < minLength) {
        console.log('🔧 Text too short, skipping');
        return;
      }

      if (text === lastTextRef.current) {
        console.log('🔧 Text unchanged, skipping');
        return;
      }

      console.log('🔧 Setting timeout for grammar check');
      timeoutRef.current = setTimeout(() => {
        console.log('🔧 Timeout fired, calling grammar check');
        lastTextRef.current = text;
        callbackRef.current(text);
      }, delay);
    },
    [delay, minLength]
  );

  const cancel = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = undefined;
    }
  }, []);

  const flush = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = undefined;
      // Trigger immediately with last text
      if (lastTextRef.current && lastTextRef.current.length >= minLength) {
        callbackRef.current(lastTextRef.current);
      }
    }
  }, [minLength]);

  const reset = useCallback(() => {
    console.log('🔧 Resetting debounce cache');
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = undefined;
    }
    lastTextRef.current = '';
  }, []);

  return {
    trigger,
    cancel,
    flush,
    reset,
    isActive: () => timeoutRef.current !== undefined
  };
}

export default useDebounce;
