/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Primary — DialDesk Navy
        primary: {
          50:  '#e8f2f7',
          100: '#d0e5ef',
          200: '#a1cce0',
          300: '#72b2d0',
          400: '#4399c1',
          500: '#007fa3',
          600: '#005872',
          700: '#004058',
          800: '#002d3f',
          900: '#001a26',
          950: '#000e15',
        },
        // Brand Red — DialDesk Red
        brand: {
          50:  '#fff0f2',
          100: '#ffe0e5',
          200: '#ffc2cb',
          300: '#ff91a0',
          400: '#ff4d63',
          500: '#e30023',
          600: '#cc001f',
          700: '#a8001a',
          800: '#880015',
          900: '#6b0010',
        },
        // Gold accent
        gold: {
          50:  '#fffce6',
          100: '#fff9cc',
          200: '#fff399',
          300: '#ffec66',
          400: '#ffe033',
          500: '#ffcd00',
          600: '#e6b800',
          700: '#cc9f00',
          800: '#b38700',
        },
        // Sage green
        sage: {
          50:  '#f2f6e8',
          100: '#e5ecd1',
          200: '#cbda9f',
          300: '#b1c86e',
          400: '#a6b957',
          500: '#779520',
          600: '#5d741a',
          700: '#445413',
        },
        // Sidebar surfaces (navy scale)
        navy: {
          900: '#002233',
          800: '#003347',
          700: '#004058',
          600: '#005872',
          500: '#007fa3',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        '2xs': ['0.65rem', '0.9rem'],
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.25rem',
      },
      boxShadow: {
        'card': '0 1px 3px 0 rgb(0 0 0 / 0.06), 0 1px 2px -1px rgb(0 0 0 / 0.04)',
        'card-md': '0 4px 12px -2px rgb(0 0 0 / 0.08), 0 2px 4px -2px rgb(0 0 0 / 0.04)',
        'card-lg': '0 12px 32px -4px rgb(0 0 0 / 0.12), 0 4px 8px -4px rgb(0 0 0 / 0.06)',
        'brand': '0 4px 14px 0 rgb(227 0 35 / 0.25)',
        'navy': '0 4px 14px 0 rgb(0 64 88 / 0.25)',
        'glow-brand': '0 0 0 3px rgb(227 0 35 / 0.15)',
        'glow-navy': '0 0 0 3px rgb(0 64 88 / 0.15)',
      },
      animation: {
        'slide-in': 'slideIn 0.2s ease-out',
        'slide-up': 'slideUp 0.2s ease-out',
        'fade-in': 'fadeIn 0.15s ease-out',
        'scale-in': 'scaleIn 0.15s ease-out',
        'shimmer': 'shimmer 1.5s infinite',
      },
      keyframes: {
        slideIn: {
          '0%': { transform: 'translateX(100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(8px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        scaleIn: {
          '0%': { transform: 'scale(0.95)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
    },
  },
  plugins: [],
}
