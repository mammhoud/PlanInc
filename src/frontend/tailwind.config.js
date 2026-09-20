/** @type {import('tailwindcss').Config} */
const { heroui } = require("@heroui/react")
const flyonui = require("flyonui/plugin")

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
    "../node_modules/@tremor/**/*.{js,ts,jsx,tsx}",
    "../node_modules/@heroui/theme/dist/**/*.{js,ts,jsx,tsx}",
    "../node_modules/flyonui/dist/**/*.{js,ts,jsx,tsx}",
  ],
  plugins: [flyonui, require("tailwindcss-animate"), require("@headlessui/tailwindcss"), require("@tailwindcss/typography"), heroui({
    prefix: "heroui",
    addCommonColors: false,
    defaultTheme: "light",
    defaultExtendTheme: "light",
    layout: {
      radius: {
        small: "var(--pi-radius-sm)",
        medium: "var(--pi-radius-md)",
        large: "var(--pi-radius-lg)",
      },
    },
    themes: {
      light: {
        colors: {
          background: "var(--background-channels)",
          foreground: "var(--foreground-channels)",
          divider: "var(--border-channels)",
          focus: "var(--ring-channels)",
          content1: "var(--card-channels)",
          content2: "var(--secondbackground-channels)",
          content3: "var(--muted-channels)",
          content4: "var(--accent-channels)",
          primary: {
            DEFAULT: "var(--primary-channels)",
            foreground: "var(--primary-foreground-channels)",
          },
          secondary: {
            DEFAULT: "var(--secondary-channels)",
            foreground: "var(--secondary-foreground-channels)",
          },
          danger: {
            DEFAULT: "var(--destructive-channels)",
            foreground: "var(--destructive-foreground-channels)",
          },
          success: {
            DEFAULT: "var(--success-channels)",
            foreground: "var(--success-foreground-channels)",
          },
          warning: {
            DEFAULT: "var(--warning-channels)",
            foreground: "var(--warning-foreground-channels)",
          },
        },
      },
      dark: {
        colors: {
          background: "var(--background-channels)",
          foreground: "var(--foreground-channels)",
          divider: "var(--border-channels)",
          focus: "var(--ring-channels)",
          content1: "var(--card-channels)",
          content2: "var(--secondbackground-channels)",
          content3: "var(--muted-channels)",
          content4: "var(--accent-channels)",
          primary: {
            DEFAULT: "var(--primary-channels)",
            foreground: "var(--primary-foreground-channels)",
          },
          secondary: {
            DEFAULT: "var(--secondary-channels)",
            foreground: "var(--secondary-foreground-channels)",
          },
          danger: {
            DEFAULT: "var(--destructive-channels)",
            foreground: "var(--destructive-foreground-channels)",
          },
          success: {
            DEFAULT: "var(--success-channels)",
            foreground: "var(--success-foreground-channels)",
          },
          warning: {
            DEFAULT: "var(--warning-channels)",
            foreground: "var(--warning-foreground-channels)",
          },
        },
      },
    },
  }),],
  darkMode: "class",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "var(--border)",
        input: "var(--input)",
        ring: "var(--ring)",
        background: "var(--background)",
        foreground: "var(--foreground)",
        primary: {
          DEFAULT: "var(--primary)",
          foreground: "var(--primary-foreground)",
        },
        secondary: {
          DEFAULT: "var(--secondary)",
          foreground: "var(--secondary-foreground)",
        },
        destructive: {
          DEFAULT: "var(--destructive)",
          foreground: "var(--destructive-foreground)",
        },
        muted: {
          DEFAULT: "var(--muted)",
          foreground: "var(--muted-foreground)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          foreground: "var(--accent-foreground)",
        },
        card: {
          DEFAULT: "var(--card)",
          foreground: "var(--card-foreground)",
        },
        popover: {
          DEFAULT: "var(--popover)",
          foreground: "var(--popover-foreground)",
        },
        success: {
          DEFAULT: "var(--success)",
          foreground: "var(--success-foreground)",
        },
        warning: {
          DEFAULT: "var(--warning)",
          foreground: "var(--warning-foreground)",
        },
        info: {
          DEFAULT: "var(--info)",
          foreground: "var(--info-foreground)",
        },
      },
      borderRadius: {
        lg: "var(--pi-radius-lg)",
        md: "var(--pi-radius-md)",
        sm: "var(--pi-radius-sm)",
        xl: "var(--pi-radius-xl)",
        "2xl": "var(--pi-radius-2xl)",
        "3xl": "var(--pi-radius-3xl)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: 0 },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: 0 },
        },
        "fade-in": {
          from: { opacity: 0 },
          to: { opacity: 1 },
        },
        "fade-out": {
          from: { opacity: 1 },
          to: { opacity: 0 },
        },
        "zoom-in": {
          from: { transform: "scale(0.95)", opacity: 0 },
          to: { transform: "scale(1)", opacity: 1 },
        },
        "zoom-out": {
          from: { transform: "scale(1)", opacity: 1 },
          to: { transform: "scale(0.95)", opacity: 0 },
        },
        "slide-in-from-top": {
          from: { transform: "translateY(-100%)" },
          to: { transform: "translateY(0)" },
        },
        "slide-in-from-bottom": {
          from: { transform: "translateY(100%)" },
          to: { transform: "translateY(0)" },
        },
        "slide-in-from-left": {
          from: { transform: "translateX(-100%)" },
          to: { transform: "translateX(0)" },
        },
        "slide-in-from-right": {
          from: { transform: "translateX(100%)" },
          to: { transform: "translateX(0)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in var(--motion-fast) ease-out",
        "fade-out": "fade-out var(--motion-fast) ease-out",
        "zoom-in": "zoom-in var(--motion-fast) ease-out",
        "zoom-out": "zoom-out var(--motion-fast) ease-out",
        "slide-in-from-top": "slide-in-from-top var(--motion-base) ease-out",
        "slide-in-from-bottom": "slide-in-from-bottom var(--motion-base) ease-out",
        "slide-in-from-left": "slide-in-from-left var(--motion-base) ease-out",
        "slide-in-from-right": "slide-in-from-right var(--motion-base) ease-out",
      },
    },
  },
  safelist: [
    {
      pattern: /^(bg-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yelllow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|background|primary)-(?:50|100|200|300|400|500|600|700|800|900|950))$/,
      variants: ["hover", "ui-selected"],
    },
    {
      pattern: /^(bg-(?:background|primary)\/[0-9]+)$/,
      variants: ["hover"],
    },
    {
      pattern: /^(text-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:50|100|200|300|400|500|600|700|800|900|950))$/,
      variants: ["hover", "ui-selected"],
    },
    {
      pattern: /^(border-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:50|100|200|300|400|500|600|700|800|900|950))$/,
      variants: ["hover", "ui-selected"],
    },
    {
      pattern: /^(ring-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:50|100|200|300|400|500|600|700|800|900|950))$/,
    },
    {
      pattern: /^(stroke-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:50|100|200|300|400|500|600|700|800|900|950))$/,
    },
    {
      pattern: /^(fill-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:50|100|200|300|400|500|600|700|800|900|950))$/,
    },
  ],
}
