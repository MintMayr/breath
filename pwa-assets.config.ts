import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

// Erzeugt die App-Icons aus public/favicon.svg: `npm run icons`, Ergebnis wird eingecheckt.
// Maskierbare und Apple-Icons ohne Rand, damit das Wasser bis an die Kante reicht; die
// runden Ecken des SVG füllt die Farbe der Wassersäule. Die Blasen liegen in der Safe Zone.
const background = '#0f3546';

export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, padding: 0, resizeOptions: { background } },
    apple: { ...minimal2023Preset.apple, padding: 0, resizeOptions: { background } },
  },
  images: ['public/favicon.svg'],
});
