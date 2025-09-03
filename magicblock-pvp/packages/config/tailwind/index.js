/** @type {import('tailwindcss').Config} */
const baseConfig = {
  content: [],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Base gaming theme
        game: {
          bg: '#0a0a0b',
          surface: '#1a1a1b', 
          border: '#2d2d30',
          text: '#ffffff',
          muted: '#9ca3af',
          accent: '#8b5cf6',
          success: '#10b981',
          warning: '#f59e0b',
          error: '#ef4444',
        },
        // Neon accents
        neon: {
          green: '#39ff14',
          blue: '#00bfff',
          purple: '#9400d3',
          pink: '#ff1493',
          orange: '#ff6600',
        },
      },
      fontFamily: {
        gaming: ['Orbitron', 'monospace'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      animation: {
        'pulse-glow': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'slide-in': 'slideIn 0.3s ease-out',
        'fade-in': 'fadeIn 0.2s ease-out',
        'battle-shake': 'shake 0.5s ease-in-out',
      },
      keyframes: {
        slideIn: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '10%, 30%, 50%, 70%, 90%': { transform: 'translateX(-2px)' },
          '20%, 40%, 60%, 80%': { transform: 'translateX(2px)' },
        },
      },
    },
  },
  plugins: [],
};

module.exports = baseConfig;