import { useCallback, useEffect, useRef } from 'react';
import { Keyboard, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollView, type TextInput } from 'react-native';

import { canRevealFocusedInput, getInputRevealOffset, type WindowRect } from './keyboardGeometry';

/** Keep a focused input visible after Android resizes its scroll viewport for the keyboard. */
export function useKeyboardInputReveal(scrollRef: { current: ScrollView | null }, enabled: boolean) {
  const focusedInput = useRef<TextInput | null>(null);
  const keyboardTop = useRef<number | undefined>(undefined);
  const keyboardVisible = useRef(false);
  const scrollOffset = useRef(0);
  const animationFrames = useRef<number[]>([]);
  const generation = useRef(0);

  const cancelReveal = useCallback(() => {
    generation.current += 1;
    animationFrames.current.forEach(cancelAnimationFrame);
    animationFrames.current = [];
  }, []);

  const scheduleReveal = useCallback(() => {
    cancelReveal();
    if (!canRevealFocusedInput({
      enabled,
      keyboardVisible: keyboardVisible.current,
      focused: Boolean(focusedInput.current),
      generation: generation.current,
      requestedGeneration: generation.current,
    })) return;
    const requestedGeneration = generation.current;
    // Wait for the keyboard and any resulting viewport resize to complete layout.
    const frame = requestAnimationFrame(() => {
      const secondFrame = requestAnimationFrame(() => {
        animationFrames.current = [];
        const input = focusedInput.current;
        const viewport = scrollRef.current?.getNativeScrollRef() ?? null;
        if (!input || !canRevealFocusedInput({ enabled, keyboardVisible: keyboardVisible.current, focused: true, generation: generation.current, requestedGeneration }) || !viewport) return;
        input.measureInWindow((x, y, width, height) => {
          viewport.measureInWindow((vx, vy, vwidth, vheight) => {
            if (!canRevealFocusedInput({ enabled, keyboardVisible: keyboardVisible.current, focused: focusedInput.current === input, generation: generation.current, requestedGeneration })) return;
            const inputRect: WindowRect = { x, y, width, height };
            const viewportRect: WindowRect = { x: vx, y: vy, width: vwidth, height: vheight };
            const nextOffset = getInputRevealOffset({
              viewport: viewportRect,
              input: inputRect,
              keyboardTop: keyboardTop.current,
              currentOffset: scrollOffset.current,
            });
            if (Math.abs(nextOffset - scrollOffset.current) > 1) {
              scrollOffset.current = nextOffset;
              scrollRef.current?.scrollTo({ y: nextOffset, animated: true });
            }
          });
        });
      });
      animationFrames.current.push(secondFrame);
    });
    animationFrames.current.push(frame);
  }, [cancelReveal, enabled, scrollRef]);

  useEffect(() => {
    if (!enabled) return;
    const existingKeyboard = Keyboard.metrics();
    keyboardVisible.current = Keyboard.isVisible();
    keyboardTop.current = keyboardVisible.current ? existingKeyboard?.screenY : undefined;
    const shown = Keyboard.addListener('keyboardDidShow', (event) => {
      keyboardVisible.current = true;
      keyboardTop.current = event.endCoordinates.screenY;
      scheduleReveal();
    });
    if (keyboardVisible.current) scheduleReveal();
    const hidden = Keyboard.addListener('keyboardDidHide', () => {
      keyboardVisible.current = false;
      keyboardTop.current = undefined;
      cancelReveal();
    });
    return () => {
      shown.remove();
      hidden.remove();
      keyboardVisible.current = false;
      keyboardTop.current = undefined;
      cancelReveal();
      focusedInput.current = null;
      scrollOffset.current = 0;
    };
  }, [cancelReveal, enabled, scheduleReveal]);

  const onFocus = useCallback((input: TextInput) => {
    focusedInput.current = input;
    scheduleReveal();
  }, [scheduleReveal]);

  const onBlur = useCallback((input: TextInput) => {
    if (focusedInput.current === input) {
      focusedInput.current = null;
      cancelReveal();
    }
  }, [cancelReveal]);

  const onViewportLayout = useCallback(() => {
    scheduleReveal();
  }, [scheduleReveal]);

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const nextOffset = event.nativeEvent.contentOffset.y;
    if (Number.isFinite(nextOffset)) scrollOffset.current = Math.max(0, nextOffset);
  }, []);

  return { onFocus, onBlur, onViewportLayout, onScroll };
}
