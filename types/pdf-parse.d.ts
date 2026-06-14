// Type declarations for pdf-parse (CommonJS, no built-in types)
declare module 'pdf-parse' {
  function pdfParse(dataBuffer: Buffer, options?: any): Promise<{
    text: string;
    numpages: number;
    numrender: number;
    info: any;
    metadata: any;
    version: string;
  }>;
  export default pdfParse;
}