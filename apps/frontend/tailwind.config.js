// @type {import('tailwindcss').Config}
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      screens: {
        // Standard Tailwind breakpoints
        sm: "640px",   // Small devices (phones)
        md: "768px",   // Medium devices (tablets)
        lg: "1024px",  // Large devices (desktops)
        xl: "1280px",  // Extra large devices
        "2xl": "1536px", // 2X Extra large devices
      },
    },
  },
  plugins: [],
};
