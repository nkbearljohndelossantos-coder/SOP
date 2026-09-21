import { Request, Response } from 'express';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import { env } from '../config/env';
import { prisma } from '../prisma/client';
import { logAudit } from '../services/auditService';

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
]);

const ALLOWED_EXTENSIONS = new Set(['.pdf', '.docx', '.xlsx', '.jpg', '.jpeg', '.png']);

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

export async function uploadAttachment(req: Request, res: Response) {
  const { versionId } = req.params;

  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No file uploaded.' });
  }

  const version = await prisma.sOPVersion.findUnique({ where: { id: versionId } });
  if (!version) {
    fs.unlinkSync(req.file.path);
    return res.status(404).json({ success: false, message: 'SOP version not found.' });
  }

  if (version.isFinalized) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ success: false, message: 'Cannot add attachments to finalized SOP.' });
  }

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

  await logAudit({
    userId: req.user?.id,
    action: 'ATTACHMENT_UPLOADED',
    entity: 'SOPAttachment',
    entityId: attachment.id,
    newValue: { filename: attachment.originalFilename, size: attachment.fileSize },
    ipAddress: req.ip,
  });

  return res.status(201).json({ success: true, data: attachment });
}

export async function downloadAttachment(req: Request, res: Response) {
  const { id } = req.params;

  const attachment = await prisma.sOPAttachment.findUnique({ where: { id } });
  if (!attachment) {
    return res.status(404).json({ success: false, message: 'Attachment not found.' });
  }

  const filePath = path.join(uploadDir, attachment.storedFilename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, message: 'File not found on server storage.' });
  }

  res.setHeader('Content-Type', attachment.mimeType);
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${encodeURIComponent(attachment.originalFilename)}"`
  );

  const stream = fs.createReadStream(filePath);
  return stream.pipe(res);
}

export async function deleteAttachment(req: Request, res: Response) {
  const { id } = req.params;

  const attachment = await prisma.sOPAttachment.findUnique({
    where: { id },
    include: { sopVersion: true },
  });

  if (!attachment) {
    return res.status(404).json({ success: false, message: 'Attachment not found.' });
  }

  if (attachment.sopVersion.isFinalized) {
    return res.status(400).json({ success: false, message: 'Cannot delete attachments from a finalized SOP.' });
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
