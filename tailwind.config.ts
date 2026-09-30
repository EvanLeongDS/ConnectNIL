import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    /* lib/ holds shared className strings — profileInputClass, dealFormUi, the
     * matchScore badge colours. Tailwind only emits utilities it literally sees in a
     * scanned file, so leaving lib/ out meant every class in those strings that was not
     * ALSO written out somewhere in app/ or components/ compiled to nothing.
     *
     * That is why the profile editors rendered as white pills on the dark card:
     * `bg-white` exists everywhere so it shipped, but `dark:bg-[#0f1623]`,
     * `dark:placeholder-white/25` and `dark:[color-scheme:dark]` appear nowhere else in
     * the codebase and were never generated — so there was no dark rule to override the
     * light one. The deal forms only escaped because DealRespondButtons.tsx happens to
     * duplicate the same string inline.
     */
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      /* Tailwind resolves a `/n` colour modifier against theme.opacity, whose default scale
       * is multiples of 5. The design uses a finer low end — 2%/3% tints and 6%/8%/12%
       * hairlines — and every one of those utilities was compiling to NOTHING, silently:
       * no error, no warning, just a missing declaration.
       *
       * The damage was invisible for borders only, because globals.css `* { @apply
       * border-border }` supplies a fallback colour. Backgrounds have no such safety net, so
       * `bg-black/2 dark:bg-white/3` really did render nothing — which is why every contract
       * section header sits flush against its body, every progress-bar track is missing, and
       * several hover states never fire.
       *
       * Extending the scale is the whole fix: `extend` merges, so 0/5/10/15/… are untouched,
       * and Tailwind is JIT so unused steps emit no CSS. Rewriting 276 call sites to the
       * nearest valid step would instead change the design — /2 -> /5 is a 2.5x tint.
       */
      opacity: {
        2: "0.02",
        3: "0.03",
        6: "0.06",
        8: "0.08",
        12: "0.12",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.22s ease-out",
        "accordion-up": "accordion-up 0.18s ease-out",
      },
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        border: "var(--border)",
        input: "var(--input)",
        ring: "var(--ring)",
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
        },
        muted: {
          DEFAULT: "var(--muted)",
          foreground: "var(--muted-foreground)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          foreground: "var(--accent-foreground)",
        },
        popover: {
          DEFAULT: "var(--popover)",
          foreground: "var(--popover-foreground)",
        },
        card: {
          DEFAULT: "var(--card)",
          foreground: "var(--card-foreground)",
        },
      },
    },
  },
  plugins: [],
};

export default config;
