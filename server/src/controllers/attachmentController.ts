import crypto from 'crypto';
import { Request, Response } from 'express';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import { env } from '../config/env';
import { prisma } from '../prisma/client';
import { logAudit } from '../services/auditService';

export function computeFileHash(filePath: string): string {
  const buffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

// Ensure upload directory exists
const uploadDir = path.resolve(env.UPLOAD_DIR);
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

const ALLOWED_EXTENSIONS = new Set(['.pdf', '.docx', '.xlsx', '.jpg', '.jpeg', '.png', '.webp']);

export interface StagedAttachmentRecord {
  id: string;
  originalFilename: string;
  storedFilename: string;
  mimeType: string;
  fileSize: number;
  uploadedById: string;
  fileHash: string;
  createdAt: Date;
}

// In-memory registry for files staged prior to SOP creation
export const stagedAttachments = new Map<string, StagedAttachmentRecord>();

export function consumeStagedAttachment(id: string): StagedAttachmentRecord | undefined {
  const record = stagedAttachments.get(id);
  if (record) {
    stagedAttachments.delete(id);
  }
  return record;
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `sop-att-${uniqueSuffix}${ext}`);
  },
});

export const uploadMiddleware = multer({
  storage,
  limits: { fileSize: env.MAX_UPLOAD_SIZE },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_MIME_TYPES.has(file.mimetype) || !ALLOWED_EXTENSIONS.has(ext)) {
      return cb(
        new Error('Invalid file type. Only PDF, DOCX, XLSX, JPG, and PNG files are permitted.')
      );
    }
    cb(null, true);
  },
});

export const uploadMultipleMiddleware = uploadMiddleware.array('files', 10);

export async function stageAttachment(req: Request, res: Response) {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No file uploaded.' });
  }

  const fileHash = computeFileHash(req.file.path);
  const stagedId = `staged-${Date.now()}-${Math.round(Math.random() * 1e9)}`;

  const record: StagedAttachmentRecord = {
    id: stagedId,
    originalFilename: req.file.originalname,
    storedFilename: req.file.filename,
    mimeType: req.file.mimetype,
    fileSize: req.file.size,
    uploadedById: req.user!.id,
    fileHash,
    createdAt: new Date(),
  };

  stagedAttachments.set(stagedId, record);

  await logAudit({
    userId: req.user?.id,
    action: 'ATTACHMENT_STAGED',
    entity: 'SOPAttachment',
    entityId: stagedId,
    newValue: { filename: record.originalFilename, size: record.fileSize, hash: fileHash },
    ipAddress: req.ip,
  });

  return res.status(201).json({
    success: true,
    data: {
      id: stagedId,
      originalFilename: record.originalFilename,
      storedFilename: record.storedFilename,
      mimeType: record.mimeType,
      fileSize: record.fileSize,
      documentHash: fileHash,
      isStaged: true,
      downloadUrl: `/api/attachments/${stagedId}/download`,
    },
  });
}

export async function uploadMultipleAttachments(req: Request, res: Response) {
  const { versionId } = req.params;
  const files = (req.files as Express.Multer.File[]) || [];

  if (!files || files.length === 0) {
    return res.status(400).json({ success: false, message: 'No files uploaded.' });
  }

  const version = await prisma.sOPVersion.findUnique({ where: { id: versionId } });
  if (!version) {
    files.forEach((f) => fs.existsSync(f.path) && fs.unlinkSync(f.path));
    return res.status(404).json({ success: false, message: 'SOP version not found.' });
  }

  if (version.isFinalized) {
    files.forEach((f) => fs.existsSync(f.path) && fs.unlinkSync(f.path));
    return res.status(400).json({ success: false, message: 'Cannot add attachments to finalized SOP.' });
  }

  const createdAttachments = [];
  for (const file of files) {
    const attachment = await prisma.sOPAttachment.create({
      data: {
        sopVersionId: versionId,
        originalFilename: file.originalname,
        storedFilename: file.filename,
        mimeType: file.mimetype,
        fileSize: file.size,
        uploadedById: req.user!.id,
      },
      include: {
        uploadedBy: { select: { id: true, fullName: true } },
      },
    });

    await logAudit({
      userId: req.user?.id,
      action: 'ATTACHMENT_UPLOADED',
      entity: 'SOPAttachment',
      entityId: attachment.id,
      newValue: { filename: attachment.originalFilename, size: attachment.fileSize },
      ipAddress: req.ip,
    });

    createdAttachments.push(attachment);
  }

  // If the version doesn't have a primary attachment yet, associate the first eligible procedure document
  const primaryCandidate = createdAttachments.find((att) => {
    const ext = path.extname(att.originalFilename).toLowerCase();
    return ['.pdf', '.docx', '.png', '.jpg', '.jpeg', '.webp', '.doc'].includes(ext);
  });
  if (primaryCandidate && !version.primaryAttachmentId) {
    const filePath = path.join(uploadDir, primaryCandidate.storedFilename);
    const hash = fs.existsSync(filePath) ? computeFileHash(filePath) : null;
    await prisma.sOPVersion.update({
      where: { id: versionId },
      data: {
        primaryAttachmentId: primaryCandidate.id,
        ...(hash ? { documentHash: hash } : {}),
      },
    });
  }

  return res.status(201).json({
    success: true,
    data: createdAttachments,
    attachments: createdAttachments,
    count: createdAttachments.length,
  });
}

export async function uploadAttachment(req: Request, res: Response) {
  const { versionId } = req.params;

  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No file uploaded.' });
  }

  const version = await prisma.sOPVersion.findUnique({
    where: { id: versionId },
    include: {
      signatures: {
        where: { status: 'VALID' },
      },
    },
  });
  if (!version) {
    fs.unlinkSync(req.file.path);
    return res.status(404).json({ success: false, message: 'SOP version not found.' });
  }

  if (version.isFinalized) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ success: false, message: 'Cannot add attachments to finalized SOP.' });
  }

  if (version.signatures.length > 0) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({
      success: false,
      message: 'Cannot upload or replace documents on an electronically signed SOP version. Revoke existing signatures first or initiate a new revision.',
    });
  }

  const fileHash = computeFileHash(req.file.path);

  const attachment = await prisma.sOPAttachment.create({
    data: {
      sopVersionId: versionId,
      originalFilename: req.file.originalname,
      storedFilename: req.file.filename,
      mimeType: req.file.mimetype,
      fileSize: req.file.size,
      uploadedById: req.user!.id,
    },
    include: {
      uploadedBy: { select: { id: true, fullName: true } },
    },
  });

  // If this attachment is a primary procedure document, associate with version
  const ext = path.extname(req.file.originalname).toLowerCase();
  if (['.pdf', '.docx', '.png', '.jpg', '.jpeg', '.doc'].includes(ext)) {
    await prisma.sOPVersion.update({
      where: { id: versionId },
      data: {
        primaryAttachmentId: attachment.id,
        documentHash: fileHash,
      },
    });
  }

  await logAudit({
    userId: req.user?.id,
    action: 'ATTACHMENT_UPLOADED',
    entity: 'SOPAttachment',
    entityId: attachment.id,
    newValue: { filename: attachment.originalFilename, size: attachment.fileSize, hash: fileHash },
    ipAddress: req.ip,
  });

  return res.status(201).json({
    success: true,
    data: { ...attachment, documentHash: fileHash },
  });
}

export async function downloadAttachment(req: Request, res: Response) {
  const { id } = req.params;

  let filePath: string | null = null;
  let originalFilename = 'document';
  let mimeType = 'application/octet-stream';

  if (id.startsWith('staged-')) {
    const staged = stagedAttachments.get(id);
    if (!staged) {
      return res.status(404).json({ success: false, message: 'Staged attachment expired or not found.' });
    }
    filePath = path.join(uploadDir, staged.storedFilename);
    originalFilename = staged.originalFilename;
    mimeType = staged.mimeType;
  } else {
    const attachment = await prisma.sOPAttachment.findUnique({ where: { id } });
    if (!attachment) {
      return res.status(404).json({ success: false, message: 'Attachment not found.' });
    }
    filePath = path.join(uploadDir, attachment.storedFilename);
    originalFilename = attachment.originalFilename;
    mimeType = attachment.mimeType;
  }

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, message: 'File not found on server storage.' });
  }

  const isInline = req.query.inline === 'true';
  const disposition = isInline ? 'inline' : 'attachment';

  res.setHeader('Content-Type', mimeType);
  res.setHeader(
    'Content-Disposition',
    `${disposition}; filename="${encodeURIComponent(originalFilename)}"`
  );

  const stream = fs.createReadStream(filePath);
  return stream.pipe(res);
}

export async function getAttachmentInfo(req: Request, res: Response) {
  const { id } = req.params;

  if (id.startsWith('staged-')) {
    const staged = stagedAttachments.get(id);
    if (!staged) {
      return res.status(404).json({ success: false, message: 'Staged attachment expired or not found.' });
    }
    const filePath = path.join(uploadDir, staged.storedFilename);
    return res.json({
      success: true,
      data: {
        id: staged.id,
        originalFilename: staged.originalFilename,
        storedFilename: staged.storedFilename,
        mimeType: staged.mimeType,
        fileSize: staged.fileSize,
        documentHash: staged.fileHash,
        isStaged: true,
        existsOnDisk: fs.existsSync(filePath),
      },
    });
  }

  const attachment = await prisma.sOPAttachment.findUnique({
    where: { id },
    include: { uploadedBy: { select: { id: true, fullName: true } } },
  });
  if (!attachment) {
    return res.status(404).json({ success: false, message: 'Attachment not found.' });
  }

  const filePath = path.join(uploadDir, attachment.storedFilename);
  const fileHash = fs.existsSync(filePath) ? computeFileHash(filePath) : null;

  return res.json({
    success: true,
    data: {
      ...attachment,
      documentHash: fileHash,
      existsOnDisk: fs.existsSync(filePath),
    },
  });
}

export async function deleteAttachment(req: Request, res: Response) {
  const { id } = req.params;

  const attachment = await prisma.sOPAttachment.findUnique({
    where: { id },
    include: {
      sopVersion: {
        include: {
          signatures: {
            where: { status: 'VALID' },
          },
        },
      },
    },
  });

  if (!attachment) {
    return res.status(404).json({ success: false, message: 'Attachment not found.' });
  }

  if (attachment.sopVersion.isFinalized) {
    return res.status(400).json({ success: false, message: 'Cannot delete attachments from a finalized SOP.' });
  }

  if (attachment.sopVersion.signatures.length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Cannot delete document attachments from an electronically signed SOP version. Revoke existing signatures first or initiate a new revision.',
    });
  }

  const filePath = path.join(uploadDir, attachment.storedFilename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }

  await prisma.sOPAttachment.delete({ where: { id } });

  await logAudit({
    userId: req.user?.id,
    action: 'ATTACHMENT_DELETED',
    entity: 'SOPAttachment',
    entityId: id,
    oldValue: { filename: attachment.originalFilename },
    ipAddress: req.ip,
  });

  return res.json({ success: true, message: 'Attachment deleted successfully.' });
}
