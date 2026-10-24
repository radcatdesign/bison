import "server-only";
// QR codes for the kiosk's join screen, drawn as one SVG path from the code's
// modules. Only the path's numbers reach the browser, never markup.
import QRCode from "qrcode";

export type Qr = { size: number; path: string };

export function qrFor(text: string): Qr {
  const code = QRCode.create(text, { errorCorrectionLevel: "M" });
  const { size, data } = code.modules;
  const parts: string[] = [];
  for (let y = 0; y < size; y++) {
    let x = 0;
    while (x < size) {
      if (!data[y * size + x]) {
        x++;
        continue;
      }
      let run = 1;
      while (x + run < size && data[y * size + x + run]) run++;
      parts.push(`M${x} ${y}h${run}v1h-${run}z`);
      x += run;
    }
  }
  return { size, path: parts.join("") };
}
