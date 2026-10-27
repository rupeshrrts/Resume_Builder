declare module "fontkit" {
  export function openSync(path: string): { hasGlyphForCodePoint(codePoint: number): boolean; numGlyphs: number };
}
