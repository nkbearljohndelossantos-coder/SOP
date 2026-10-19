import { Request, Response } from 'express';
import { z } from 'zod';
import {
  getVersionSignatures,
  revokeSignature,
  signDocumentVersion,
  savePdfDraftAnnotations,
} from '../services/electronicSignatureService';

const signDocumentSchema = z.object({
  signatureMethod: z.enum(['DRAWN', 'TYPED']),
  signatureData: z.string().min(2, 'Signature visual data is required'),
  declarationText: z.string().min(10, 'A valid legal declaration statement is required'),
  password: z.string().optional(),
  departmentId: z.string().optional(),
  workflowStep: z.string().optional(),
  metadata: z.string().optional(),
  placement: z
    .object({
      pageNumber: z.number().int().min(1),
      x: z.number().min(0).max(1),
      y: z.number().min(0).max(1),
      width: z.number().min(0.01).max(1),
      height: z.number().min(0.01).max(1),
    })
    .optional(),
  annotations: z
    .array(
      z.object({
        type: z.enum(['text', 'date']),
        pageNumber: z.number().int().min(1),
        x: z.number().min(0).max(1),
        y: z.number().min(0).max(1),
        text: z.string().min(1),
        fontSize: z.number().optional(),
      })
    )
    .optional(),
});

const editPdfSchema = z.object({
  annotations: z
    .array(
      z.object({
        type: z.enum(['text', 'date']),
        pageNumber: z.number().int().min(1),
        x: z.number().min(0).max(1),
        y: z.number().min(0).max(1),
        text: z.string().min(1),
        fontSize: z.number().optional(),
      })
    )
    .min(1, 'At least one annotation is required'),
});

const revokeSignatureSchema = z.object({
  reason: z.string().min(5, 'A clear reason is required to revoke an electronic signature'),
});

export async function handleSignDocument(req: Request, res: Response) {
  const { versionId } = req.params;
  const input = signDocumentSchema.parse(req.body);

  const result = await signDocumentVersion(
    versionId,
    req.user!.id,
    input,
    req.ip,
    req.headers['user-agent']
  );

  return res.status(201).json({
    success: true,
    message: 'Document successfully signed electronically with verified audit record and embedded PDF bytes.',
    data: result,
  });
}

export async function handleEditPdfDocument(req: Request, res: Response) {
  const { versionId } = req.params;
  const { annotations } = editPdfSchema.parse(req.body);

  const result = await savePdfDraftAnnotations(
    versionId,
    req.user!.id,
    annotations,
    req.ip
  );

  return res.json({
    success: true,
    message: 'PDF annotations successfully embedded into document draft.',
    data: result,
  });
}

export async function handleGetVersionSignatures(req: Request, res: Response) {
  const { versionId } = req.params;
  const signatures = await getVersionSignatures(versionId);

  return res.json({
    success: true,
    data: signatures,
    count: signatures.length,
  });
}

export async function handleRevokeSignature(req: Request, res: Response) {
  const { signatureId } = req.params;
  const { reason } = revokeSignatureSchema.parse(req.body);

  const revoked = await revokeSignature(signatureId, req.user!.id, reason, req.ip);

  return res.json({
    success: true,
    message: 'Electronic signature successfully revoked.',
    data: revoked,
  });
}
