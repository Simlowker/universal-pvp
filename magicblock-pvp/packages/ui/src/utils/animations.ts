import { Variants } from 'framer-motion';

export const fadeIn: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

export const slideUp: Variants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -20 },
};

export const slideDown: Variants = {
  initial: { opacity: 0, y: -20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 20 },
};

export const scaleIn: Variants = {
  initial: { opacity: 0, scale: 0.9 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.9 },
};

export const slideInFromLeft: Variants = {
  initial: { opacity: 0, x: -50 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -50 },
};

export const slideInFromRight: Variants = {
  initial: { opacity: 0, x: 50 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: 50 },
};

export const staggerChildren = {
  animate: {
    transition: {
      staggerChildren: 0.1,
    },
  },
};

export const staggerItem: Variants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
};

// Gaming-specific animations
export const battleShake: Variants = {
  animate: {
    x: [-2, 2, -2, 2, 0],
    transition: {
      duration: 0.4,
      ease: 'easeInOut',
    },
  },
};

export const powerUp: Variants = {
  animate: {
    scale: [1, 1.1, 1],
    boxShadow: [
      '0 0 0px rgba(139, 92, 246, 0.5)',
      '0 0 20px rgba(139, 92, 246, 0.8)',
      '0 0 0px rgba(139, 92, 246, 0.5)',
    ],
    transition: {
      duration: 0.6,
      ease: 'easeInOut',
    },
  },
};

export const criticalHit: Variants = {
  animate: {
    scale: [1, 1.2, 1],
    rotate: [0, -5, 5, 0],
    transition: {
      duration: 0.3,
      ease: 'easeInOut',
    },
  },
};