import { createHash, randomUUID } from 'crypto';
import { Readable } from 'stream';
import {
  S3Client,
  HeadObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  GetObjectCommandOutput,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  canAccessObject,
  getObjectAclPolicy,
  ObjectAclPolicy,
  ObjectPermission,
  setObjectAclPolicy,
  type StorageFile,
  ACL_POLICY_METADATA_KEY,
} from './objectAcl';

function createS3Client() {
  const endpoint = process.env.S3_ENDPOINT || 'http://127.0.0.1:9000';
  const accessKeyId = process.env.S3_ACCESS_KEY || 'minioadmin';
  const secretAccessKey = process.env.S3_SECRET_KEY || 'minioadmin';
  const region = process.env.S3_REGION || 'us-east-1';
  return new S3Client({
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
    region,
    forcePathStyle: true,
  });
}

function createPublicS3Client(): S3Client {
  const endpoint = process.env.PUBLIC_S3_ENDPOINT || process.env.S3_ENDPOINT || 'http://127.0.0.1:9000';
  const accessKeyId = process.env.S3_ACCESS_KEY || 'minioadmin';
  const secretAccessKey = process.env.S3_SECRET_KEY || 'minioadmin';
  const region = process.env.S3_REGION || 'us-east-1';
  return new S3Client({
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
    region,
    forcePathStyle: true,
  });
}

export const s3Client = createS3Client();
export const publicS3Client = createPublicS3Client();

/**
 * Environment variables that MUST be present in production for object storage
 * to function. The S3_* credentials are deliberately NOT hard-coded here;
 * they are injected by the deployment secret store (see deploy/.env.production).
 */
const PRODUCTION_REQUIRED_STORAGE_VARS: ReadonlyArray<string> = [
  'S3_ENDPOINT',
  'S3_BUCKET',
  'S3_ACCESS_KEY',
  'S3_SECRET_KEY',
  'PRIVATE_OBJECT_DIR',
  'PUBLIC_OBJECT_SEARCH_PATHS',
];

export interface StorageEnvStatus {
  ok: boolean;
  missing: string[];
  error?: string;
}

/**
 * Inspects the environment for the mandatory production object-storage
 * configuration. Returns the list of missing variables (if any) plus a single
 * aggregated error message so callers can fail fast instead of letting
 * individual requests surface opaque 500s.
 */
export function getStorageEnvStatus(): StorageEnvStatus {
  const missing = PRODUCTION_REQUIRED_STORAGE_VARS.filter((name) => !process.env[name]);
  if (missing.length === 0) {
    return { ok: true, missing: [] };
  }
  const error =
    'Production object storage is not configured. The following environment variables are required but were not set: ' +
    missing.join(', ') +
    '. Define PRIVATE_OBJECT_DIR, PUBLIC_OBJECT_SEARCH_PATHS, and S3_* in your deployment environment ' +
    '(see deploy/.env.production and deploy/.env.production.example). ' +
    'Object-storage credentials (S3_ACCESS_KEY/S3_SECRET_KEY) must be injected by your secret store and must never be hard-coded in source.';
  return { ok: false, missing, error };
}

/**
 * Throws a clear, aggregated error listing every missing production storage
 * variable. Intended to be called at startup so the process exits (and the
 * container fails its healthcheck) instead of serving 500s to users.
 */
export function assertProductionStorageConfigured(): void {
  const status = getStorageEnvStatus();
  if (!status.ok) {
    throw new Error(status.error!);
  }
}

export class ObjectNotFoundError extends Error {
  constructor() {
    super('Object not found');
    this.name = 'ObjectNotFoundError';
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

class S3Object implements StorageFile {
  constructor(
    private bucketName: string,
    private objectName: string,
  ) {}

  async exists(): Promise<[boolean]> {
    try {
      await s3Client.send(
        new HeadObjectCommand({ Bucket: this.bucketName, Key: this.objectName }),
      );
      return [true];
    } catch (err: any) {
      if (err?.name === 'NotFound' || err?.name === 'NoSuchKey' || err?.$metadata?.httpStatusCode === 404) {
        return [false];
      }
      throw err;
    }
  }

  async getMetadata(): Promise<[Record<string, unknown>]> {
    try {
      const res = await s3Client.send(
        new HeadObjectCommand({ Bucket: this.bucketName, Key: this.objectName }),
      );
      const metadata: Record<string, unknown> = {
        contentType: res.ContentType,
        contentEncoding: res.ContentEncoding,
        size: res.ContentLength,
        metadata: res.Metadata || {},
        cacheControl: res.CacheControl,
        contentDisposition: res.ContentDisposition,
        etag: res.ETag,
        lastModified: res.LastModified,
      };
      return [metadata];
    } catch (err: any) {
      if (err?.name === 'NotFound' || err?.name === 'NoSuchKey' || err?.$metadata?.httpStatusCode === 404) {
        throw new ObjectNotFoundError();
      }
      throw err;
    }
  }

  async createReadStream(): Promise<Readable> {
    const res = await s3Client.send(
      new GetObjectCommand({ Bucket: this.bucketName, Key: this.objectName }),
    );
    if (!res.Body) {
      throw new ObjectNotFoundError();
    }

    const body = res.Body as GetObjectCommandOutput['Body'];
    if (typeof (body as any).pipe === 'function') {
      return body as unknown as Readable;
    }

    const webStream = (body as any).transformToWebStream?.() ?? (body as any);
    return Readable.fromWeb(webStream as ReadableStream<Uint8Array>);
  }

  async setMetadata(metadata: { Metadata?: Record<string, string> }): Promise<unknown> {
    await s3Client.send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: this.objectName,
        Metadata: metadata.Metadata,
      }),
    );
    return undefined;
  }

  async download(): Promise<[Buffer]> {
    const res = await s3Client.send(
      new GetObjectCommand({ Bucket: this.bucketName, Key: this.objectName }),
    );
    const body = res.Body;
    if (!body) {
      throw new ObjectNotFoundError();
    }

    const chunks: Buffer[] = [];
    if (typeof (body as any).transformToByteArray === 'function') {
      const arr = await (body as any).transformToByteArray();
      return [Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength)];
    }
    if (typeof (body as any).transformToWebStream === 'function') {
      const webStream = (body as any).transformToWebStream();
      const reader = webStream.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(Buffer.from(value));
      }
      return [Buffer.concat(chunks)];
    }
    if (typeof (body as any).pipe === 'function') {
      return new Promise((resolve, reject) => {
        const result: Buffer[] = [];
        (body as any)
          .on('data', (chunk: Buffer) => result.push(chunk))
          .on('end', () => resolve([Buffer.concat(result)]))
          .on('error', reject);
      });
    }
    if (typeof body === 'string') {
      return [Buffer.from(body)];
    }
    if (Buffer.isBuffer(body)) {
      return [body];
    }
    if (body instanceof Blob) {
      const arrayBuffer = await body.arrayBuffer();
      return [Buffer.from(arrayBuffer)];
    }
    return [Buffer.from(await (body as any).text?.() ?? '')];
  }
}

export class ObjectStorageService {
  constructor() {}

  getPublicObjectSearchPaths(): Array<string> {
    const pathsStr = process.env.PUBLIC_OBJECT_SEARCH_PATHS || '';
    const paths = Array.from(
      new Set(
        pathsStr
          .split(',')
          .map((path) => path.trim())
          .filter((path) => path.length > 0),
      ),
    );
    if (paths.length === 0) {
      throw new Error(
        "PUBLIC_OBJECT_SEARCH_PATHS not set. Set it to your MinIO public search paths (comma-separated, format: bucketName/prefix).",
      );
    }
    return paths;
  }

  getPrivateObjectDir(): string {
    const dir = process.env.PRIVATE_OBJECT_DIR || '';
    if (!dir) {
      throw new Error(
        "PRIVATE_OBJECT_DIR not set. Set it to your MinIO private object directory (format: bucketName/prefix).",
      );
    }
    return dir;
  }

  async searchPublicObject(filePath: string): Promise<StorageFile | null> {
    for (const searchPath of this.getPublicObjectSearchPaths()) {
      const fullPath = `${searchPath}/${filePath}`;

      const { bucketName, objectName } = parseObjectPath(fullPath);
      const s3Object = new S3Object(bucketName, objectName);

      const [exists] = await s3Object.exists();
      if (exists) {
        return s3Object;
      }
    }

    return null;
  }

  async downloadObject(
    object: StorageFile,
    cacheTtlSec: number = 3600,
  ): Promise<Response> {
    const [metadata] = await object.getMetadata();
    const aclPolicy = await getObjectAclPolicy(object);
    const isPublic = aclPolicy?.visibility === 'public';

    const nodeStream = await object.createReadStream();
    const webStream = Readable.toWeb(nodeStream) as ReadableStream;

    const headers: Record<string, string> = {
      'Content-Type':
        (metadata.contentType as string) || 'application/octet-stream',
      'Cache-Control': `${isPublic ? 'public' : 'private'}, max-age=${cacheTtlSec}`,
    };
    if (metadata.size) {
      headers['Content-Length'] = String(metadata.size);
    }

    return new Response(webStream, { headers });
  }

  async getObjectEntityUploadURL(contentType: string): Promise<string> {
    const privateObjectDir = this.getPrivateObjectDir();
    if (!privateObjectDir) {
      throw new Error(
        "PRIVATE_OBJECT_DIR not set. Set it to your MinIO private object directory (format: bucketName/prefix).",
      );
    }

    const objectId = randomUUID();
    const fullPath = `${privateObjectDir}/uploads/${objectId}`;

    const { bucketName, objectName } = parseObjectPath(fullPath);

    return s3SignObjectURL({
      bucketName,
      objectName,
      contentType,
      method: 'PUT',
      ttlSec: 900,
      client: publicS3Client,
    });
  }

  async getObjectEntityFile(objectPath: string): Promise<StorageFile> {
    if (!objectPath.startsWith('/objects/')) {
      throw new ObjectNotFoundError();
    }

    const parts = objectPath.slice(1).split('/');
    if (parts.length < 2) {
      throw new ObjectNotFoundError();
    }

    const entityId = parts.slice(1).join('/');
    let entityDir = this.getPrivateObjectDir();
    if (!entityDir.endsWith('/')) {
      entityDir = `${entityDir}/`;
    }
    const objectEntityPath = `${entityDir}${entityId}`;
    const { bucketName, objectName } = parseObjectPath(objectEntityPath);
    const s3Object = new S3Object(bucketName, objectName);
    const [exists] = await s3Object.exists();
    if (!exists) {
      throw new ObjectNotFoundError();
    }
    return s3Object;
  }

  async validateObjectEntity(
    object: StorageFile,
    expected: { size: number; mimeType: string; checksum: string },
  ): Promise<void> {
    const [metadata] = await object.getMetadata();
    const actualSize = Number(metadata.size ?? -1);
    const actualType = String(metadata.contentType ?? '');
    if (actualSize !== expected.size || (actualType && actualType !== expected.mimeType)) {
      throw Object.assign(new Error('Stored file metadata does not match the submitted metadata.'), {
        code: 'FILE_METADATA_MISMATCH',
      });
    }
    const [contents] = await object.download();
    const actualChecksum = createHash('sha256').update(contents).digest('hex');
    if (actualChecksum !== expected.checksum) {
      throw Object.assign(new Error('Stored file checksum does not match the submitted checksum.'), {
        code: 'FILE_CHECKSUM_MISMATCH',
      });
    }
  }

  normalizeObjectEntityPath(rawPath: string): string {
    if (!rawPath.startsWith('http')) {
      return rawPath;
    }

    try {
      const url = new URL(rawPath);
      const rawObjectPath = url.pathname;

      let objectEntityDir = this.getPrivateObjectDir();
      if (!objectEntityDir.endsWith('/')) {
        objectEntityDir = `${objectEntityDir}/`;
      }

      if (!rawObjectPath.startsWith(`/${objectEntityDir}`)) {
        return rawObjectPath;
      }

      const entityId = rawObjectPath.slice(`/${objectEntityDir}`.length);
      return `/objects/${entityId}`;
    } catch {
      return rawPath;
    }
  }

  async trySetObjectEntityAclPolicy(
    rawPath: string,
    aclPolicy: ObjectAclPolicy,
  ): Promise<string> {
    const normalizedPath = this.normalizeObjectEntityPath(rawPath);
    if (!normalizedPath.startsWith('/')) {
      return normalizedPath;
    }

    const objectFile = await this.getObjectEntityFile(normalizedPath);
    await setObjectAclPolicy(objectFile, aclPolicy);
    return normalizedPath;
  }

  async canAccessObjectEntity({
    userId,
    objectFile,
    requestedPermission,
  }: {
    userId?: string;
    objectFile: StorageFile;
    requestedPermission?: ObjectPermission;
  }): Promise<boolean> {
    return canAccessObject({
      userId,
      objectFile,
      requestedPermission: requestedPermission ?? ObjectPermission.READ,
    });
  }
}

function parseObjectPath(path: string): { bucketName: string; objectName: string } {
  if (!path.startsWith('/')) {
    path = `/${path}`;
  }
  const pathParts = path.split('/');
  if (pathParts.length < 3) {
    throw new Error('Invalid path: must contain at least a bucket name');
  }

  const bucketName = pathParts[1];
  const objectName = pathParts.slice(2).join('/');

  return {
    bucketName,
    objectName,
  };
}

async function s3SignObjectURL({
  bucketName,
  objectName,
  contentType,
  method,
  ttlSec,
  client = s3Client,
}: {
  bucketName: string;
  objectName: string;
  contentType?: string;
  method: 'GET' | 'PUT' | 'DELETE' | 'HEAD';
  ttlSec: number;
  client?: S3Client;
}): Promise<string> {
  const command =
    method === 'PUT'
      ? new PutObjectCommand({
          Bucket: bucketName,
          Key: objectName,
          // Binding Content-Type into the signature forces the uploader to send
          // exactly this value, so the object is stored with the same type that
          // the caller declared (and that is returned in metadata.contentType).
          ContentType: contentType,
        })
      : new GetObjectCommand({ Bucket: bucketName, Key: objectName });

  const url = await getSignedUrl(client, command, {
    expiresIn: ttlSec,
  });
  return url;
}
