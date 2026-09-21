import { Readable } from 'stream';
import { Router, type IRouter, type Request, type Response } from 'express';
import { z } from 'zod';
import { db, documentsTable, ficaDocumentsTable, knowledgeItemsTable, mattersTable } from '@workspace/db';
import { eq, inArray } from 'drizzle-orm';
import { getCurrentUser, logAudit } from '../lib/context';

import {
  ObjectNotFoundError,
  ObjectStorageService,
} from '../lib/objectStorage';
import { PARTNER_ROLES } from '../lib/permissions';

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();
const RequestUploadUrlBody = z.object({
  name: z.string().min(1).max(255),
  size: z.number().int().positive().max(25 * 1024 * 1024),
  contentType: z.enum([
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/rtf',
    'text/plain',
    'application/vnd.oasis.opendocument.text',
    'image/jpeg',
    'image/png',
    'image/webp',
  ]),
});

/**
 * POST /storage/uploads/request-url
 *
 * Request a presigned URL for file upload.
 * The client sends JSON metadata (name, size, contentType) — NOT the file.
 * Then uploads the file directly to the returned presigned URL.
 * Requires auth middleware so public callers cannot mint write-capable URLs.
 */
router.post(
  '/storage/uploads/request-url',
  async (req: Request, res: Response) => {
    if (!(await getCurrentUser(req))) {
      res.status(401).json({ error: 'Unauthorized' });

      return;
    }

    const parsed = RequestUploadUrlBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Missing or invalid required fields' });
      return;
    }

    try {
       const { name, size, contentType } = parsed.data;

       const uploadURL = await objectStorageService.getObjectEntityUploadURL(contentType);
       const objectPath =
         objectStorageService.normalizeObjectEntityPath(uploadURL);

       res.json({ uploadURL, objectPath, metadata: { name, size, contentType } });
    } catch (error) {
      req.log.error({ err: error }, 'Error generating upload URL');
      res.status(500).json({ error: 'Failed to generate upload URL' });
    }
  },
);

/**
 * GET /storage/public-objects/*
 *
 * Serve public assets from PUBLIC_OBJECT_SEARCH_PATHS.
 * These are unconditionally public — no authentication or ACL checks.
 * IMPORTANT: Always provide this endpoint when object storage is set up.
 */
router.get(
  '/storage/public-objects/*filePath',
  async (req: Request, res: Response) => {
    try {
      const raw = req.params.filePath;
      const filePath = Array.isArray(raw) ? raw.join('/') : raw;
      const file = await objectStorageService.searchPublicObject(filePath);
      if (!file) {
        res.status(404).json({ error: 'File not found' });
        return;
      }

      const response = await objectStorageService.downloadObject(file);

      res.status(response.status);
      response.headers.forEach((value, key) => res.setHeader(key, value));

      if (response.body) {
        const nodeStream = Readable.fromWeb(
          response.body as ReadableStream<Uint8Array>,
        );
        nodeStream.pipe(res);
      } else {
        res.end();
      }
    } catch (error) {
      req.log.error({ err: error }, 'Error serving public object');
      res.status(500).json({ error: 'Failed to serve public object' });
    }
  },
);

/**
 * GET /storage/objects/*
 *
 * Serve object entities from PRIVATE_OBJECT_DIR.
 * These are served from a separate path from /public-objects and can optionally
 * be protected with authentication or ACL checks based on the use case.
 */
router.get('/storage/objects/*path', async (req: Request, res: Response) => {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join('/') : raw;
    const objectPath = `/objects/${wildcardPath}`;
    const documents = await db.select({
      id: documentsTable.id,
      matterId: documentsTable.matterId,
      title: documentsTable.title,
      originalFilename: documentsTable.originalFilename,
    }).from(documentsTable).where(eq(documentsTable.fileObjectPath, objectPath));
    const matterIds = documents.map((document) => document.matterId);
    const matters = matterIds.length ? await db.select({
      id: mattersTable.id,
      assignedToId: mattersTable.assignedToId,
    }).from(mattersTable).where(inArray(mattersTable.id, matterIds)) : [];
    const document = documents.find((candidate) => {
      const matter = matters.find((entry) => entry.id === candidate.matterId);
      return !matter || !['candidate_attorney', 'paralegal', 'secretary', 'legal_secretary'].includes(user.role) || matter.assignedToId === user.id;
    });
    const ficaDocuments = await db.select({
      id: ficaDocumentsTable.id,
      clientId: ficaDocumentsTable.clientId,
      originalFilename: ficaDocumentsTable.originalFilename,
    }).from(ficaDocumentsTable).where(eq(ficaDocumentsTable.fileObjectPath, objectPath));
    const ficaDocument = ficaDocuments[0];
    const knowledgeItems = await db.select({
      id: knowledgeItemsTable.id,
      title: knowledgeItemsTable.title,
       status: knowledgeItemsTable.status,
       authorId: knowledgeItemsTable.authorId,
    }).from(knowledgeItemsTable).where(eq(knowledgeItemsTable.fileObjectPath, objectPath));
    const knowledgeItem = knowledgeItems.find((candidate) =>
      candidate.status === 'approved' ||
      PARTNER_ROLES.includes(user.role as typeof PARTNER_ROLES[number]) ||
      candidate.authorId === user.id
    );
    if (!document && !ficaDocument && !knowledgeItem) {
      res.status(403).json({ error: 'This object is not linked to an accessible legal document.' });
      return;
    }
    await logAudit({
      action: 'document_file_accessed',
      entityType: document ? 'document' : ficaDocument ? 'fica_document' : 'knowledge',
      entityId: document?.id ?? ficaDocument?.id ?? knowledgeItem!.id,
      entityTitle: document?.title ?? ficaDocument?.originalFilename ?? knowledgeItem?.title,
      userId: user.id,
      details: document
        ? `Private file retrieved for matter ${document.matterId}.`
        : ficaDocument
          ? `Private FICA file retrieved for client ${ficaDocument.clientId}.`
          : "Private knowledge file retrieved.",
      ipAddress: req.ip,
    });
    const objectFile =
      await objectStorageService.getObjectEntityFile(objectPath);

    const response = await objectStorageService.downloadObject(objectFile);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    const originalFilename = document?.originalFilename ?? ficaDocument?.originalFilename;
    if (originalFilename) {
      const safeDownloadName = originalFilename.replace(/[\u0000-\u001f\u007f"\\]/g, "_").slice(0, 255) || "document";
      res.setHeader("Content-Disposition", `inline; filename="${safeDownloadName}"`);
    }

    if (response.body) {
      const nodeStream = Readable.fromWeb(
        response.body as ReadableStream<Uint8Array>,
      );
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      req.log.warn({ err: error }, 'Object not found');
      res.status(404).json({ error: 'Object not found' });
      return;
    }
    req.log.error({ err: error }, 'Error serving object');
    res.status(500).json({ error: 'Failed to serve object' });
  }
});

export default router;
