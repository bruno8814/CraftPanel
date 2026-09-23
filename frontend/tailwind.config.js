/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Paleta personalizada "CraftPanel" — oscura y minimalista
        panel: {
          bg: '#0a0a0b',        // Fondo principal (casi negro)
          surface: '#111113',    // Tarjetas y paneles
          border: '#1e1e22',     // Bordes sutiles
          hover: '#1a1a1f',      // Hover sobre elementos
          muted: '#71717a',      // Texto secundario
          accent: '#3b82f6',     // Azul acento (botones, enlaces)
          success: '#22c55e',    // Verde (ONLINE)
          warning: '#f59e0b',    // Amarillo (STARTING)
          danger: '#ef4444',     // Rojo (OFFLINE, errores)
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
    },
  },
  plugins: [],
};
