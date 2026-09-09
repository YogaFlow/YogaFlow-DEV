/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        sand: 'var(--color-bg)',
        surface: 'var(--color-surface)',
        surfaceSunken: 'var(--color-surface-sunken)',
        border: 'var(--color-border)',
        borderStrong: 'var(--color-border-strong)',
        text: 'var(--color-text)',
        textMuted: 'var(--color-text-muted)',
        textSubtle: 'var(--color-text-subtle)',
        sage: {
          50: 'var(--sage-50)',
          100: 'var(--sage-100)',
          200: 'var(--sage-200)',
          300: 'var(--sage-300)',
          500: 'var(--sage-500)',
          600: 'var(--sage-600)',
          800: 'var(--sage-800)',
        },
        brand: 'var(--color-brand)',
        brandPressed: 'var(--color-brand-pressed)',
        brandSoft: 'var(--color-brand-soft)',
        brandOnSoft: 'var(--color-brand-on-soft)',
        onBrand: 'var(--color-on-brand)',
        accent: 'var(--color-accent)',
        accentSoft: 'var(--color-accent-soft)',
        success: 'var(--color-success)',
        successSoft: 'var(--color-success-soft)',
        danger: 'var(--color-danger)',
        dangerSoft: 'var(--color-danger-soft)',
      },
    },
  },
  plugins: [],
};
