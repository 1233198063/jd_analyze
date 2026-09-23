/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        // Handwritten accent for journal-style dates and stamp captions.
        hand: ['Caveat', 'Segoe Script', 'Bradley Hand', 'cursive'],
      },
      colors: {
        brand: {
          50: "#eff6ff",
          500: "#3b82f6",
          600: "#2563eb",
          700: "#1d4ed8",
        },
        // "Petrol x Bubblegum" palette — deep petrol blue-green as the base, a
        // bubblegum pink accent for hover/highlight moments. Rolling out page
        // by page; see index.css for the shared component classes built on it.
        canvas: "#F2F6F6",
        ink: {
          DEFAULT: "#173A3E",
        },
        petrol: {
          50: "#EAF2F2",
          100: "#D7ECEB",
          200: "#B6DBD9",
          300: "#7FB9B8",
          400: "#3E8285",
          500: "#185257",
          600: "#123F42",
          700: "#0D2E30",
          800: "#0A2224",
        },
        bubblegum: {
          100: "#FDE6EC",
          200: "#FBC9D6",
          300: "#F8B4C6",
          400: "#F5A0B7",
          500: "#EE7C99",
          600: "#E65C82",
        },
        mist: "#D7ECEB",

        // Functional/status colors (score tiers, sponsor badges, application stages) — muted to
        // sit in the same "designer" register as the brand palette instead of stock Tailwind
        // candy-reds/greens. Meaning is unchanged, just less jarring next to petrol/ink/bubblegum.
        sage: {
          50: "#F1F8F4",
          100: "#E1F0E7",
          200: "#C3E1D1",
          300: "#9BC9B0",
          400: "#6FA88A",
          500: "#4B8A6A",
          600: "#2F6B4E",
          700: "#1F5C42",
        },
        coral: {
          50: "#FBEFEC",
          100: "#F7E1DC",
          200: "#EFC3B9",
          300: "#E6A091",
          400: "#D97C66",
          500: "#C9654C",
          600: "#B85239",
          700: "#A8402B",
        },
        gold: {
          50: "#FBF4E3",
          100: "#F7ECD2",
          200: "#EFD9A5",
          300: "#E5C37A",
          400: "#D4A74B",
          500: "#B98B2A",
          600: "#9C7318",
          700: "#8A6111",
        },
        clay: {
          50: "#FBEFE2",
          100: "#F6E0CB",
          200: "#EDC197",
          300: "#E3A56F",
          400: "#D08A4E",
          500: "#BE7535",
          600: "#AD6423",
          700: "#9C5518",
        },
        plum: {
          50: "#F5EDF4",
          100: "#EEE1EF",
          200: "#DDC3DF",
          300: "#C7A2C7",
          400: "#AD7EAA",
          500: "#94608E",
          600: "#7C4574",
          700: "#6B3766",
        },
      },
    },
  },
  plugins: [],
};
