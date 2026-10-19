import { Request, Response } from 'express';
import { z } from 'zod';
import {
  getVersionSignatures,
  revokeSignature,
  signDocumentVersion,
} from '../services/electronicSignatureService';

const signDocumentSchema = z.object({
  signatureMethod: z.enum(['DRAWN', 'TYPED']),
  signatureData: z.string().min(2, 'Signature visual data is required'),
  declarationText: z.string().min(10, 'A valid legal declaration statement is required'),
  password: z.string().optional(),
  departmentId: z.string().optional(),
  workflowStep: z.string().optional(),
  metadata: z.string().optional(),
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
    message: 'Document successfully signed electronically with verified audit record.',
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
