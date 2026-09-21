import { ObjectStorageService } from "./objectStorage";

export interface ExtractedDocument {
  text: string;
  metadata: {
    mimeType: string;
    originalFilename: string;
    fileSize: number;
    pageCount?: number;
    extractionMethod: string;
    extractionError?: string;
    matterId?: number;
  };
}

export async function extractTextFromObject(objectPath: string, mimeType: string, originalFilename: string, matterId?: number): Promise<ExtractedDocument> {
  const objectStorage = new ObjectStorageService();
  const file = await objectStorage.getObjectEntityFile(objectPath);
  const [buffer] = await file.download();

  if (mimeType === "text/plain") {
    return {
      text: buffer.toString("utf-8"),
      metadata: { mimeType, originalFilename, fileSize: buffer.length, extractionMethod: "plain_text", matterId },
    };
  }

  if (mimeType === "application/pdf") {
    return extractPdf(buffer, mimeType, originalFilename, matterId);
  }

  if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    return extractDocx(buffer, mimeType, originalFilename, matterId);
  }

  if (mimeType === "application/msword") {
    return extractDoc(buffer, mimeType, originalFilename, matterId);
  }

  if (mimeType === "application/rtf") {
    return extractRtf(buffer, mimeType, originalFilename, matterId);
  }

  return {
    text: buffer.toString("utf-8"),
    metadata: { mimeType, originalFilename, fileSize: buffer.length, extractionMethod: "fallback_utf8", matterId },
  };
}

async function extractPdf(buffer: Buffer, mimeType: string, originalFilename: string, matterId?: number): Promise<ExtractedDocument> {
  try {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: Array.from(buffer) });
    const result = await parser.getText();
    return {
      text: result.text || "",
      metadata: { mimeType, originalFilename, fileSize: buffer.length, extractionMethod: "pdf_parse", matterId },
    };
  } catch {
    return {
      text: "",
      metadata: { mimeType, originalFilename, fileSize: buffer.length, extractionMethod: "pdf_failed", extractionError: "PDF parsing failed", matterId },
    };
  }
}

async function extractDocx(buffer: Buffer, mimeType: string, originalFilename: string, matterId?: number): Promise<ExtractedDocument> {
  try {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return {
      text: result.value || "",
      metadata: { mimeType, originalFilename, fileSize: buffer.length, extractionMethod: "mammoth", matterId },
    };
  } catch {
    return {
      text: "",
      metadata: { mimeType, originalFilename, fileSize: buffer.length, extractionMethod: "docx_failed", extractionError: "DOCX parsing failed", matterId },
    };
  }
}

async function extractDoc(buffer: Buffer, mimeType: string, originalFilename: string, matterId?: number): Promise<ExtractedDocument> {
  try {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return {
      text: result.value || "",
      metadata: { mimeType, originalFilename, fileSize: buffer.length, extractionMethod: "mammoth_doc", matterId },
    };
  } catch {
    return {
      text: "",
      metadata: { mimeType, originalFilename, fileSize: buffer.length, extractionMethod: "doc_failed", extractionError: "DOC parsing failed", matterId },
    };
  }
}

async function extractRtf(buffer: Buffer, mimeType: string, originalFilename: string, matterId?: number): Promise<ExtractedDocument> {
  const text = buffer.toString("utf-8").replace(/\\par\b/g, "\n").replace(/[{}\\]/g, "").trim();
  return {
    text,
    metadata: { mimeType, originalFilename, fileSize: buffer.length, extractionMethod: "rtf_strip", matterId },
  };
}
