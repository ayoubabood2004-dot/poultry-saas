// Tailwind 3 بالذات (^3.4): Tailwind 4 ياخذ الإعداد من CSS، و`dark:` بيه يتبع النظام مو صنف .dark،
// فالرموز المنسوخة من doctorVet (darkMode: "class" و<alpha-value>) تنحرف بصمت.
// ui-guard يقرا هذا الملف ويرفض أي صنف ما ينولّد منه (زاوية، ظلّ، مقاس، درجة لون).

const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: token('surface'),
          1: token('surface-1'),
          2: token('surface-2'),
          3: token('surface-3'),
        },
        ink: {
          DEFAULT: token('ink'),
          muted: token('ink-muted'),
          subtle: token('ink-subtle'),
        },
        line: {
          DEFAULT: token('line'),
          strong: token('line-strong'),
        },
        focus: token('ring'),
        // brand-600 من doctorVet (#1266d8)، والباقي مشتقّ منه (docs/DECISIONS.md).
        brand: {
          50: '#eef5ff',
          100: '#d9e8ff',
          200: '#bcd7fe',
          300: '#8ebffc',
          400: '#5a9cf7',
          500: '#337ff0',
          600: '#1266d8',
          700: '#0f52b3',
          800: '#124592',
          900: '#143b76',
          950: '#0f254a',
        },
        // سلالم المعاني كاملة لـ950: بـdoctorVet توكف عند 700، و٩٨ موضع text-warn-800 ما إلها CSS.
        success: {
          50: '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3d0',
          300: '#6ee7b7',
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
          700: '#047857',
          800: '#065f46',
          900: '#064e3b',
          950: '#022c22',
        },
        warn: {
          50: '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
          800: '#92400e',
          900: '#78350f',
          950: '#451a03',
        },
        danger: {
          50: '#fef2f2',
          100: '#fee2e2',
          200: '#fecaca',
          300: '#fca5a5',
          400: '#f87171',
          500: '#ef4444',
          600: '#dc2626',
          700: '#b91c1c',
          800: '#991b1b',
          900: '#7f1d1d',
          950: '#450a0a',
        },
        accent: {
          50: '#fff4f1',
          100: '#ffe6df',
          200: '#ffcfc2',
          300: '#ffad97',
          400: '#ff8463',
          500: '#f9623d',
          600: '#e6461f',
          700: '#c13617',
          800: '#9f2f18',
          900: '#832c1a',
          950: '#481209',
        },
      },
      // زوايا وظلال doctorVet كما هي. بلاها rounded-t-4xl ما ينولّد والورقة تطلع بزوايا مربّعة.
      borderRadius: { lg: '0.85rem', xl: '1.1rem', '2xl': '1.5rem', '3xl': '2rem', '4xl': '2.75rem' },
      boxShadow: {
        soft: '0 6px 24px -10px rgb(var(--shadow) / 0.22)',
        card: '0 2px 16px -6px rgb(var(--shadow) / 0.12)',
        raised: '0 18px 48px -16px rgb(var(--shadow) / 0.28)',
        glow: '0 0 0 4px rgb(var(--ring) / 0.16)',
      },
      fontSize: { '2xs': ['0.6875rem', { lineHeight: '1rem' }] },
      // سلّم Tailwind 3 ما بيه 13، فـh-13 للزرّ الكبير ما ينولّد بلا هذا السطر.
      spacing: { 13: '3.25rem', 19: '4.75rem' },
      fontFamily: {
        sans: ['Inter', '"IBM Plex Sans Arabic"', 'system-ui', '-apple-system', '"Segoe UI"', 'Tahoma', 'sans-serif'],
      },
      // سلّم z-index مسمّى: الشريط، النافذة، الورقة، والتنبيه فوك الكل.
      zIndex: { bar: '30', dialog: '40', sheet: '50', toast: '60' },
      maxHeight: { sheet: '92vh' },
      keyframes: {
        'sheet-in': { from: { transform: 'translateY(100%)' }, to: { transform: 'translateY(0)' } },
        'dialog-in': { from: { opacity: '0', transform: 'scale(0.97)' }, to: { opacity: '1', transform: 'scale(1)' } },
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'toast-in': { from: { opacity: '0', transform: 'translateY(-0.5rem)' }, to: { opacity: '1', transform: 'translateY(0)' } },
      },
      animation: {
        'sheet-in': 'sheet-in 220ms cubic-bezier(0.2, 0.8, 0.2, 1)',
        'dialog-in': 'dialog-in 160ms ease-out',
        'fade-in': 'fade-in 160ms ease-out',
        'toast-in': 'toast-in 180ms ease-out',
      },
    },
  },
  plugins: [],
};
