'use client';

import { useCallback, useRef, useState, useEffect } from 'react';

interface TouchPoint {
  x: number;
  y: number;
  id: number;
  timestamp: number;
}

interface GestureConfig {
  swipeThreshold: number;
  pinchThreshold: number;
  tapThreshold: number;
  doubleTapDelay: number;
  longPressDelay: number;
}

interface GestureCallbacks {
  onSwipe?: (direction: 'up' | 'down' | 'left' | 'right', velocity: number, distance: number) => void;
  onPinch?: (scale: number, center: { x: number; y: number }) => void;
  onRotate?: (angle: number, center: { x: number; y: number }) => void;
  onTap?: (point: { x: number; y: number }) => void;
  onDoubleTap?: (point: { x: number; y: number }) => void;
  onLongPress?: (point: { x: number; y: number }) => void;
  onDrag?: (delta: { x: number; y: number }, point: { x: number; y: number }) => void;
  onDragEnd?: (velocity: { x: number; y: number }) => void;
}

const defaultConfig: GestureConfig = {
  swipeThreshold: 50,
  pinchThreshold: 0.1,
  tapThreshold: 10,
  doubleTapDelay: 300,
  longPressDelay: 500,
};

export const useTouchGestures = (
  callbacks: GestureCallbacks = {},
  config: Partial<GestureConfig> = {}
) => {
  const finalConfig = { ...defaultConfig, ...config };
  const touchesRef = useRef<TouchPoint[]>([]);
  const lastTapRef = useRef<{ timestamp: number; point: { x: number; y: number } } | null>(null);
  const longPressTimerRef = useRef<NodeJS.Timeout>();
  const initialDistanceRef = useRef<number>(0);
  const initialAngleRef = useRef<number>(0);
  const dragStartRef = useRef<TouchPoint | null>(null);
  const velocityRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  
  const [isGestureActive, setIsGestureActive] = useState(false);

  const getDistance = useCallback((touch1: TouchPoint, touch2: TouchPoint): number => {
    const dx = touch1.x - touch2.x;
    const dy = touch1.y - touch2.y;
    return Math.sqrt(dx * dx + dy * dy);
  }, []);

  const getAngle = useCallback((touch1: TouchPoint, touch2: TouchPoint): number => {
    return Math.atan2(touch2.y - touch1.y, touch2.x - touch1.x) * 180 / Math.PI;
  }, []);

  const getCenter = useCallback((touch1: TouchPoint, touch2: TouchPoint) => {
    return {
      x: (touch1.x + touch2.x) / 2,
      y: (touch1.y + touch2.y) / 2,
    };
  }, []);

  const handleTouchStart = useCallback((event: React.TouchEvent) => {
    const touches = Array.from(event.touches).map((touch, index) => ({
      x: touch.clientX,
      y: touch.clientY,
      id: touch.identifier,
      timestamp: Date.now(),
    }));

    touchesRef.current = touches;
    setIsGestureActive(true);

    // Single touch - start long press timer and drag detection
    if (touches.length === 1) {
      const touch = touches[0];
      dragStartRef.current = touch;
      
      longPressTimerRef.current = setTimeout(() => {
        if (touchesRef.current.length === 1) {
          callbacks.onLongPress?.(touch);
        }
      }, finalConfig.longPressDelay);
    }

    // Two touches - initialize pinch/rotate gestures
    if (touches.length === 2) {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
      
      initialDistanceRef.current = getDistance(touches[0], touches[1]);
      initialAngleRef.current = getAngle(touches[0], touches[1]);
    }
  }, [callbacks, finalConfig, getDistance, getAngle]);

  const handleTouchMove = useCallback((event: React.TouchEvent) => {
    event.preventDefault(); // Prevent scrolling
    
    const touches = Array.from(event.touches).map(touch => ({
      x: touch.clientX,
      y: touch.clientY,
      id: touch.identifier,
      timestamp: Date.now(),
    }));

    const prevTouches = touchesRef.current;
    touchesRef.current = touches;

    // Single touch - handle drag
    if (touches.length === 1 && prevTouches.length === 1) {
      const currentTouch = touches[0];
      const prevTouch = prevTouches[0];
      
      const delta = {
        x: currentTouch.x - prevTouch.x,
        y: currentTouch.y - prevTouch.y,
      };

      // Calculate velocity
      const timeDelta = currentTouch.timestamp - prevTouch.timestamp;
      if (timeDelta > 0) {
        velocityRef.current = {
          x: delta.x / timeDelta,
          y: delta.y / timeDelta,
        };
      }

      // Check if movement exceeds tap threshold (cancel long press)
      if (dragStartRef.current) {
        const totalDistance = getDistance(currentTouch, dragStartRef.current);
        if (totalDistance > finalConfig.tapThreshold && longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
        }
      }

      callbacks.onDrag?.(delta, currentTouch);
    }

    // Two touches - handle pinch and rotate
    if (touches.length === 2 && prevTouches.length === 2) {
      const currentDistance = getDistance(touches[0], touches[1]);
      const currentAngle = getAngle(touches[0], touches[1]);
      const center = getCenter(touches[0], touches[1]);

      // Pinch detection
      if (initialDistanceRef.current > 0) {
        const scale = currentDistance / initialDistanceRef.current;
        if (Math.abs(scale - 1) > finalConfig.pinchThreshold) {
          callbacks.onPinch?.(scale, center);
        }
      }

      // Rotation detection
      const angleDiff = currentAngle - initialAngleRef.current;
      if (Math.abs(angleDiff) > 5) { // 5 degrees threshold
        callbacks.onRotate?.(angleDiff, center);
      }
    }
  }, [callbacks, finalConfig, getDistance, getAngle, getCenter]);

  const handleTouchEnd = useCallback((event: React.TouchEvent) => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
    }

    const remainingTouches = Array.from(event.touches).map(touch => ({
      x: touch.clientX,
      y: touch.clientY,
      id: touch.identifier,
      timestamp: Date.now(),
    }));

    // If no touches remain, handle end gestures
    if (remainingTouches.length === 0) {
      setIsGestureActive(false);
      
      const lastTouches = touchesRef.current;
      
      // Single touch ended - check for tap, double tap, or swipe
      if (lastTouches.length === 1) {
        const touch = lastTouches[0];
        const now = Date.now();
        
        // Check for swipe
        if (dragStartRef.current) {
          const distance = getDistance(touch, dragStartRef.current);
          const timeDelta = touch.timestamp - dragStartRef.current.timestamp;
          
          if (distance > finalConfig.swipeThreshold && timeDelta > 0) {
            const dx = touch.x - dragStartRef.current.x;
            const dy = touch.y - dragStartRef.current.y;
            const velocity = distance / timeDelta;
            
            let direction: 'up' | 'down' | 'left' | 'right';
            if (Math.abs(dx) > Math.abs(dy)) {
              direction = dx > 0 ? 'right' : 'left';
            } else {
              direction = dy > 0 ? 'down' : 'up';
            }
            
            callbacks.onSwipe?.(direction, velocity, distance);
          } else if (distance <= finalConfig.tapThreshold) {
            // Check for double tap
            if (lastTapRef.current && 
                now - lastTapRef.current.timestamp < finalConfig.doubleTapDelay) {
              callbacks.onDoubleTap?.(touch);
              lastTapRef.current = null;
            } else {
              callbacks.onTap?.(touch);
              lastTapRef.current = { timestamp: now, point: touch };
            }
          }
        }

        // Call drag end with velocity
        callbacks.onDragEnd?.(velocityRef.current);
        
        dragStartRef.current = null;
        velocityRef.current = { x: 0, y: 0 };
      }
    }

    touchesRef.current = remainingTouches;
  }, [callbacks, finalConfig, getDistance]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  return {
    onTouchStart: handleTouchStart,
    onTouchMove: handleTouchMove,
    onTouchEnd: handleTouchEnd,
    isGestureActive,
  };
};