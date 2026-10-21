/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: [
    './index.html',
    './src/**/*.{ts,tsx,js,jsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        // ShiftTrack strict monochrome palette
        brand: {
          50:  '#fafafa',
          100: '#f4f4f5',
          200: '#e4e4e7',
          300: '#d4d4d8',
          400: '#a1a1aa',
          500: '#71717a',
          600: '#52525b',
          700: '#3f3f46',
          800: '#27272a',
          900: '#18181b',
          950: '#09090b',
        },
        sidebar: {
          DEFAULT:  '#111111',
          hover:    '#1f1f1f',
          active:   '#2a2a2a',
          text:     '#a3a3a3',
          heading:  '#737373',
          border:   '#262626',
        },
        surface: {
          DEFAULT: '#ffffff',
          muted:   '#f8f9fa',
          subtle:  '#f1f3f5',
          border:  '#e5e7eb',
          dark:    '#121212',
        },
      },
      borderRadius: {
        lg: '0.625rem',
        md: '0.5rem',
        sm: '0.375rem',
      },
      boxShadow: {
        card: '0 1px 3px 0 rgb(0 0 0 / 0.07), 0 1px 2px -1px rgb(0 0 0 / 0.07)',
        'card-hover': '0 4px 12px 0 rgb(0 0 0 / 0.10)',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in': {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(0)' },
        },
        'pulse-dot': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.4' },
        },
        // Splash Screen animations
        'logo-appear': {
          '0%': { opacity: '0', transform: 'scale(0.75)' },
          '60%': { opacity: '1', transform: 'scale(1.04)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'float': {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        'text-up': {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        // Login Page animations
        'slow-zoom': {
          '0%': { transform: 'scale(1)' },
          '100%': { transform: 'scale(1.08)' },
        },
        'glow-pulse': {
          '0%, 100%': { boxShadow: '0 0 20px rgba(255,255,255,0.1)' },
          '50%': { boxShadow: '0 0 40px rgba(255,255,255,0.25)' },
        },
        'badge-in': {
          '0%': { opacity: '0', transform: 'translateY(12px) scale(0.95)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'form-in': {
          '0%': { opacity: '0', transform: 'translateY(24px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'splash-bg-shift': {
          '0%': { backgroundPosition: '50% 40%' },
          '50%': { backgroundPosition: '52% 44%' },
          '100%': { backgroundPosition: '50% 40%' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.3s ease-out',
        'slide-in': 'slide-in 0.25s ease-out',
        'pulse-dot': 'pulse-dot 1.5s ease-in-out infinite',
        // Splash
        'logo-appear': 'logo-appear 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) both',
        'float': 'float 4s ease-in-out infinite',
        'text-up': 'text-up 0.5s ease-out both',
        // Login
        'slow-zoom': 'slow-zoom 20s ease-in-out infinite alternate',
        'glow-pulse': 'glow-pulse 3s ease-in-out infinite',
        'badge-in': 'badge-in 0.4s ease-out both',
        'form-in': 'form-in 0.55s ease-out both',
        'splash-bg-shift': 'splash-bg-shift 12s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
