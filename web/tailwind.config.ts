import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#120819',
          900: '#1d0f2a',
          800: '#2b1840',
        },
        paper: '#f7f2ff',
        accent: '#c084fc',
        accentSoft: '#ddd6fe',
      },
      boxShadow: {
        manuscript: '0 24px 80px rgba(20, 8, 34, 0.45)',
      },
      backgroundImage: {
        'paper-noise':
          'radial-gradient(circle at top left, rgba(230,214,255,0.2), transparent 38%), radial-gradient(circle at bottom right, rgba(192,132,252,0.22), transparent 34%)',
      },
      fontFamily: {
        serif: ['Playfair Display', 'Georgia', 'Times New Roman', 'serif'],
        sans: ['Source Sans 3', 'Segoe UI', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config;
