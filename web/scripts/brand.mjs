// One-off: turn the white-on-black mark into a transparent-background logo
// (luminance becomes alpha, so the antialiased ring stays clean on any
// surface), then build the favicon and the OG preview banner from it.
import sharp from "sharp";
import { mkdir } from "node:fs/promises";

const SRC = "C:/Users/Galih Putra/Downloads/Future Stocks Logo.png";
const PUB = "C:/Users/Galih Putra/futurestocks/web/public";
const APP = "C:/Users/Galih Putra/futurestocks/web/app";

await mkdir(PUB, { recursive: true });

// --- transparent white mark ---------------------------------------------
async function whiteMark(size) {
  const alpha = await sharp(SRC).resize(size, size, { fit: "contain", background: "#000" })
    .greyscale().toColourspace("b-w").raw().toBuffer();
  return sharp({ create: { width: size, height: size, channels: 3, background: "#ffffff" } })
    .joinChannel(alpha, { raw: { width: size, height: size, channels: 1 } }).png();
}

await (await whiteMark(512)).toFile(`${PUB}/logo.png`);
await (await whiteMark(512)).toFile(`${APP}/icon.png`);
console.log("logo.png + icon.png written");

// --- OG banner: 1200x630, black, mark + wordmark + tagline ---------------
const W = 1200, H = 630;
const markSize = 150;
const markBuf = await (await whiteMark(markSize)).toBuffer();

const text = Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="g" cx="50%" cy="112%" r="75%">
      <stop offset="0%" stop-color="#c4d0e4" stop-opacity="0.20"/>
      <stop offset="55%" stop-color="#c4d0e4" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="chrome" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#c3cad5"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="#000000"/>
  <rect width="${W}" height="${H}" fill="url(#g)"/>
  <text x="330" y="300" font-family="Inter, Arial, sans-serif" font-size="60" font-weight="700" letter-spacing="-2" fill="#ffffff">FutureStocks</text>
  <text x="333" y="352" font-family="Inter, Arial, sans-serif" font-size="26" font-weight="500" fill="#9a9a9a">The order desk for tokenized stocks</text>
  <rect x="333" y="392" width="470" height="1" fill="#262a31"/>
  <text x="333" y="440" font-family="Inter, Arial, sans-serif" font-size="20" font-weight="500" fill="url(#chrome)">Limit · Stop · DCA · Bracket — escrowed on-chain</text>
</svg>`);

await sharp({ create: { width: W, height: H, channels: 4, background: "#000000" } })
  .composite([
    { input: text, top: 0, left: 0 },
    { input: markBuf, top: Math.round((300 - markSize / 2) - 20), left: 150 },
  ])
  .png()
  .toFile(`${APP}/opengraph-image.png`);
console.log("opengraph-image.png written");
