/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // Brand palette
        brand: '#2a4cd0',
        'brand-600': '#1f38a0',
        'brand-700': '#152770',
        'brand-soft': '#e9effe',
        'brand-line': '#b3c9f0',
        'on-brand': '#ffffff',

        // Semantic colors
        amber: '#e07d24',
        'amber-soft': '#fdf2e4',

        // Neutral/Surface palette
        bg: '#f4f2ec',
        surface: '#ffffff',
        'surface-2': '#fbfaf6',
        'surface-3': '#f6f4ee',

        // Typography/Ink palette
        ink: '#1a1b21',
        'ink-2': '#4b4e59',
        'ink-3': '#82858f',
        'ink-4': '#a7a99f',

        // Line/Border palette
        line: '#e7e3d9',
        'line-2': '#efece3',
        'line-strong': '#d9d4c7',

        // Stage-specific (pre/during/post-repair)
        pre: '#c9751b',
        'pre-soft': '#fbefdd',
        'pre-line': '#f1dcb8',

        under: '#2f63cf',
        'under-soft': '#e9f0fd',
        'under-line': '#cadcf8',

        post: '#1c8f63',
        'post-soft': '#e4f4ec',
        'post-line': '#bfe6d2',

        // Status/accent colors
        violet: '#7048cf',
        'violet-soft': '#efeafb',
        'violet-line': '#ddd0f5',

        slate: '#41617f',
        'slate-soft': '#e9eef3',
        'slate-line': '#ccd8e3',

        rose: '#c33b53',
        'rose-soft': '#fbe9ec',
        'rose-line': '#f3cdd4',

        gray: '#6b6e78',
        'gray-soft': '#eeece5',
        'gray-line': '#ddd9cd',
      },
      borderRadius: {
        'xs': '8px',
        'sm': '10px',
        'md': '14px',
        'lg': '18px',
        'xl': '24px',
        'pill': '999px',
      },
      fontFamily: {
        'ui': '"Plus Jakarta Sans", system-ui, sans-serif',
        'display': '"Space Grotesk", system-ui, sans-serif',
        'mono': '"JetBrains Mono", ui-monospace, monospace',
      },
      spacing: {
        'pad': '16px',
        'gap': '12px',
      },
      boxShadow: {
        'sm': '0 1px 2px rgba(26, 27, 33, 0.05), 0 1px 1px rgba(26, 27, 33, 0.04)',
        'md': '0 4px 14px rgba(26, 27, 33, 0.07), 0 1px 3px rgba(26, 27, 33, 0.05)',
        'lg': '0 12px 34px rgba(26, 27, 33, 0.13), 0 4px 10px rgba(26, 27, 33, 0.06)',
        'brand': '0 8px 20px rgba(42, 76, 208, 0.3)',
      },
    },
  },
  plugins: [],
}
