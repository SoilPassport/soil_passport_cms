/** @type {import('tailwindcss').Config} */
export default { content: ['./index.html','./src/**/*.{ts,tsx}'], theme: { extend: { colors: { brand: { 50:'#f6f1e7', 100:'#ece2cc', 500:'#a6572a', 600:'#8d4822', 700:'#6f391b' }, ink: '#14110d' }, fontFamily: { sans: ['Inter','system-ui','sans-serif'] } } }, plugins: [] };
