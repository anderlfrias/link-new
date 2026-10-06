// Genera frontend/public/sounds/notification.wav, el tono de "mensaje nuevo"
// (ver frontend/src/utils/notification-sound.ts).
//
// Es una síntesis propia, sin samples de terceros: un acorde de Do mayor
// (C5, E5, G5) arpegiado, con un armónico suave y decaimiento exponencial.
// Existe para que el origen y la licencia del sonido sean los del propio
// proyecto. Para regenerarlo:
//
//   node scripts/generate-notification-sound.js
const fs = require("fs");
const path = require("path");

const SAMPLE_RATE = 44100;
const DURATION_S = 1.4;
const NOTES = [
  { freq: 523.25, start: 0 }, // C5
  { freq: 659.25, start: 0.06 }, // E5
  { freq: 783.99, start: 0.12 }, // G5
];
const DECAY_PER_S = 3.2;
const ATTACK_S = 0.008;
const FADE_OUT_S = 0.05;
const PEAK = 0.6;

const totalSamples = Math.round(SAMPLE_RATE * DURATION_S);
const samples = new Float64Array(totalSamples);

for (const { freq, start } of NOTES) {
  const offset = Math.round(start * SAMPLE_RATE);
  for (let i = offset; i < totalSamples; i++) {
    const t = (i - offset) / SAMPLE_RATE;
    const envelope = Math.min(1, t / ATTACK_S) * Math.exp(-DECAY_PER_S * t);
    const tone = Math.sin(2 * Math.PI * freq * t) + 0.25 * Math.sin(2 * Math.PI * 2 * freq * t);
    samples[i] += envelope * tone;
  }
}

// Fade-out final para no cortar en seco, y normalización al pico elegido.
const fadeSamples = Math.round(FADE_OUT_S * SAMPLE_RATE);
for (let i = 0; i < fadeSamples; i++) {
  samples[totalSamples - 1 - i] *= i / fadeSamples;
}
const maxAbs = samples.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
const gain = PEAK / maxAbs;

// WAV PCM 16 bits, mono.
const dataBytes = totalSamples * 2;
const buffer = Buffer.alloc(44 + dataBytes);
buffer.write("RIFF", 0, "ascii");
buffer.writeUInt32LE(36 + dataBytes, 4);
buffer.write("WAVE", 8, "ascii");
buffer.write("fmt ", 12, "ascii");
buffer.writeUInt32LE(16, 16); // tamaño del bloque fmt
buffer.writeUInt16LE(1, 20); // PCM
buffer.writeUInt16LE(1, 22); // mono
buffer.writeUInt32LE(SAMPLE_RATE, 24);
buffer.writeUInt32LE(SAMPLE_RATE * 2, 28); // bytes por segundo
buffer.writeUInt16LE(2, 32); // bytes por muestra
buffer.writeUInt16LE(16, 34); // bits por muestra
buffer.write("data", 36, "ascii");
buffer.writeUInt32LE(dataBytes, 40);
for (let i = 0; i < totalSamples; i++) {
  const value = Math.max(-1, Math.min(1, samples[i] * gain));
  buffer.writeInt16LE(Math.round(value * 32767), 44 + i * 2);
}

const outPath = path.join(__dirname, "..", "frontend", "public", "sounds", "notification.wav");
fs.writeFileSync(outPath, buffer);
console.log(`Generado ${path.relative(process.cwd(), outPath)} (${DURATION_S}s, ${buffer.length} bytes)`);
