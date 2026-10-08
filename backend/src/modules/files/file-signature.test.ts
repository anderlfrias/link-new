import { describe, expect, it } from "vitest";
import { areCompatible, detectMimeFromSignature } from "./file-signature";

const bytes = (...values: number[]) => Buffer.from(values);
const ascii = (text: string) => Buffer.from(text, "latin1");
/// Cabecera RIFF: "RIFF" + tamaño (4 bytes) + tipo (WEBP, WAVE, ...).
const riff = (type: string) => Buffer.concat([ascii("RIFF"), Buffer.alloc(4), ascii(type), Buffer.alloc(8)]);
/// Caja ISO-BMFF: tamaño (4 bytes) + "ftyp" + marca.
const ftyp = (brand: string) => Buffer.concat([bytes(0, 0, 0, 0x18), ascii("ftyp"), ascii(brand), Buffer.alloc(8)]);

describe("detectMimeFromSignature", () => {
  it.each([
    ["ejecutable de Windows (MZ)", ascii("MZ\x90\x00\x03"), "application/x-msdownload"],
    ["ELF", bytes(0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01), "application/x-elf"],
    ["Mach-O de 64 bits", bytes(0xcf, 0xfa, 0xed, 0xfe, 0x07), "application/x-mach-binary"],
    ["Mach-O universal", bytes(0xca, 0xfe, 0xba, 0xbe, 0x00), "application/x-mach-binary"],
    ["PNG", bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00), "image/png"],
    ["JPEG", bytes(0xff, 0xd8, 0xff, 0xe0, 0x00), "image/jpeg"],
    ["GIF87a", ascii("GIF87a\x01\x00"), "image/gif"],
    ["GIF89a", ascii("GIF89a\x01\x00"), "image/gif"],
    ["WebP", riff("WEBP"), "image/webp"],
    ["WAV", riff("WAVE"), "audio/wav"],
    ["PDF", ascii("%PDF-1.7\n"), "application/pdf"],
    ["ZIP", bytes(0x50, 0x4b, 0x03, 0x04, 0x14), "application/zip"],
    ["ZIP vacío", bytes(0x50, 0x4b, 0x05, 0x06, 0x00), "application/zip"],
    ["gzip", bytes(0x1f, 0x8b, 0x08, 0x00), "application/gzip"],
    ["7z", bytes(0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c, 0x00), "application/x-7z-compressed"],
    ["RAR", Buffer.concat([ascii("Rar!"), bytes(0x1a, 0x07, 0x00)]), "application/vnd.rar"],
    ["MP4", ftyp("isom"), "video/mp4"],
    ["QuickTime", ftyp("qt  "), "video/mp4"],
    ["WebM / Matroska", bytes(0x1a, 0x45, 0xdf, 0xa3, 0x9f), "video/webm"],
    ["OGG", ascii("OggS\x00\x02"), "application/ogg"],
    ["FLAC", ascii("fLaC\x00"), "audio/flac"],
    ["MP3 con etiqueta ID3", ascii("ID3\x04\x00"), "audio/mpeg"],
    ["MP3 sin etiqueta (sincronía de frame)", bytes(0xff, 0xfb, 0x90, 0x00), "audio/mpeg"],
  ])("reconoce %s", (_name, head, expected) => {
    expect(detectMimeFromSignature(head)).toBe(expected);
  });

  it("devuelve null para texto plano", () => {
    expect(detectMimeFromSignature(ascii("hola, esto es un archivo de texto\n"))).toBeNull();
    expect(detectMimeFromSignature(ascii("nombre,correo\nAna,ana@example.com\n"))).toBeNull();
    expect(detectMimeFromSignature(ascii("@echo off\r\ndel /q *.*\r\n"))).toBeNull();
  });

  it("devuelve null para un buffer vacío o más corto que cualquier firma", () => {
    expect(detectMimeFromSignature(Buffer.alloc(0))).toBeNull();
    expect(detectMimeFromSignature(bytes(0x4d))).toBeNull();
  });

  it("devuelve null para un RIFF que no es WebP ni WAV", () => {
    expect(detectMimeFromSignature(riff("AVI "))).toBeNull();
  });

  it("no confunde un JPEG ni un AAC (ADTS) con un MP3", () => {
    expect(detectMimeFromSignature(bytes(0xff, 0xd8, 0xff, 0xdb))).toBe("image/jpeg");
    // ADTS: sincronía 0xFFF con capa 00.
    expect(detectMimeFromSignature(bytes(0xff, 0xf1, 0x50, 0x80))).toBeNull();
  });
});

describe("areCompatible", () => {
  it("el mismo tipo es compatible, ignorando parámetros y mayúsculas", () => {
    expect(areCompatible("application/pdf", "application/pdf")).toBe(true);
    expect(areCompatible("audio/webm;codecs=opus", "audio/webm")).toBe(true);
    expect(areCompatible("Image/PNG", "image/png")).toBe(true);
  });

  it("un docx, un odt o un jar declarados son compatibles con una firma ZIP", () => {
    const zip = "application/zip";
    expect(areCompatible("application/vnd.openxmlformats-officedocument.wordprocessingml.document", zip)).toBe(true);
    expect(areCompatible("application/vnd.oasis.opendocument.text", zip)).toBe(true);
    expect(areCompatible("application/java-archive", zip)).toBe(true);
    expect(areCompatible("application/epub+zip", zip)).toBe(true);
    expect(areCompatible("application/x-zip-compressed", zip)).toBe(true);
  });

  it("audio/webm y video/webm son el mismo contenedor", () => {
    expect(areCompatible("audio/webm", "video/webm")).toBe(true);
    expect(areCompatible("video/x-matroska", "video/webm")).toBe(true);
  });

  it("los tipos de audio y video de un contenedor MP4 y las fotos HEIC son compatibles con ftyp", () => {
    const mp4 = "video/mp4";
    for (const declared of ["audio/mp4", "audio/x-m4a", "video/quicktime", "image/heic", "image/heif", "image/avif"]) {
      expect(areCompatible(declared, mp4), declared).toBe(true);
    }
  });

  it("audio/ogg, audio/wav y audio/mp3 son compatibles con sus contenedores", () => {
    expect(areCompatible("audio/ogg", "application/ogg")).toBe(true);
    expect(areCompatible("audio/x-wav", "audio/wav")).toBe(true);
    expect(areCompatible("audio/mp3", "audio/mpeg")).toBe(true);
  });

  it("un PDF declarado sobre un ejecutable no es compatible", () => {
    expect(areCompatible("application/pdf", "application/x-msdownload")).toBe(false);
    expect(areCompatible("image/png", "application/x-msdownload")).toBe(false);
  });

  it("un tipo genérico o de otra familia no es compatible", () => {
    expect(areCompatible("application/octet-stream", "application/pdf")).toBe(false);
    expect(areCompatible("image/png", "image/jpeg")).toBe(false);
    expect(areCompatible("application/zip", "application/pdf")).toBe(false);
    expect(areCompatible("text/plain", "application/zip")).toBe(false);
  });
});
