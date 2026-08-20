declare module 'pdfjs-dist/build/pdf.min.mjs' {
  export interface PDFDocumentProxy {
    numPages: number;
    getPage(pageNumber: number): Promise<PDFPageProxy>;
  }

  export interface PDFPageProxy {
    getTextContent(): Promise<PDFTextContent>;
  }

  export interface PDFTextContent {
    items: Array<{ str?: string; [key: string]: unknown }>;
  }

  export interface GlobalWorkerOptions {
    workerSrc: string;
  }

  export function getDocument(data: { data: Uint8Array }): {
    promise: Promise<PDFDocumentProxy>;
  };

  export const GlobalWorkerOptions: GlobalWorkerOptions;
}
