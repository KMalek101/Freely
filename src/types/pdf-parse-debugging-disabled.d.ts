declare module "pdf-parse-debugging-disabled" {
  interface PdfResult {
    text: string;
    numpages: number;
    info: Record<string, unknown>;
  }
  function pdfParse(dataBuffer: Buffer): Promise<PdfResult>;
  export default pdfParse;
}
