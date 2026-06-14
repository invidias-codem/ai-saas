// Type declarations for packages without built-in types

// pdf-parse (CommonJS, no built-in types)
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

// mammoth (DOCX parser, has types but sometimes not detected)
declare module 'mammoth' {
  export interface MammothOptions {
    path?: string;
    arrayBuffer?: ArrayBuffer;
  }
  export interface MammothResult {
    value: string;
    messages: Array<{ type: string; message: string }>;
  }
  export function extractRawText(options: MammothOptions): Promise<MammothResult>;
  
  export interface ConvertToHtmlOptions {
    path?: string;
    arrayBuffer?: ArrayBuffer;
    styleMap?: string[];
    ignoreEmptyParagraphs?: boolean;
    idPrefix?: string;
    transformDocument?: (document: any) => any;
  }
  export interface ConvertToHtmlResult {
    value: string;
    messages: Array<{ type: string; message: string }>;
  }
  export function convertToHtml(options: ConvertToHtmlOptions): Promise<ConvertToHtmlResult>;
  
  export default {
    extractRawText,
    convertToHtml,
  };
}

// xlsx (SheetJS, often missing types in some environments)
declare module 'xlsx' {
  export interface WorkBook {
    SheetNames: string[];
    Sheets: Record<string, WorkSheet>;
    Props?: any;
    Custprops?: any;
    Workbook?: any;
  }
  export interface WorkSheet {
    [cell: string]: CellObject;
    '!ref'?: string;
    '!cols'?: ColInfo[];
    '!rows'?: RowInfo[];
    '!merges'?: Range[];
    '!protect'?: any;
  }
  export interface CellObject {
    v?: any;
    w?: string;
    t?: string;
    f?: string;
    r?: string[];
    h?: string;
    c?: Comment[];
    z?: string;
    l?: string;
    s?: any;
  }
  export interface ColInfo { wch?: number; width?: number; wpx?: number; hidden?: boolean; }
  export interface RowInfo { hpt?: number; hpx?: number; hidden?: boolean; level?: number; }
  export interface Range { s: { c: number; r: number }; e: { c: number; r: number }; }
  export interface Comment { a: string; t: string; r?: string[]; }
  
  export function readFile(filename: string, options?: any): WorkBook;
  export function read(data: any, options?: any): WorkBook;
  export function writeFile(workbook: WorkBook, filename: string, options?: any): void;
  export function write(workbook: WorkBook, options?: any): any;
  export const utils: {
    sheet_to_csv(sheet: WorkSheet, options?: any): string;
    sheet_to_json(sheet: WorkSheet, options?: any): any[];
    sheet_to_formulae(sheet: WorkSheet): string[];
    encode_cell(cell: { c: number; r: number }): string;
    decode_cell(addr: string): { c: number; r: number };
    encode_range(range: Range): string;
    decode_range(range: string): Range;
  };
  export default {
    readFile,
    read,
    writeFile,
    write,
    utils,
  };
}