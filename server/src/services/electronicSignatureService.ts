import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { env } from '../config/env';
import { prisma } from '../prisma/client';
import { ApprovalDecisions, ParticipantStatuses, ParticipationTypes, Roles, SOPStatuses } from '../types';
import { logAudit } from './auditService';
import { notifyConcernedUsers } from './notificationService';
import { calculateApprovalMatrix } from './sopService';
import {
  embedSignatureIntoPdf,
  embedAnnotationsIntoPdf,
  SignaturePlacement,
  PdfAnnotation,
} from './pdfEditorService';

const uploadDir = path.resolve(env.UPLOAD_DIR);

export interface SignDocumentInput {
  signatureMethod: 'DRAWN' | 'TYPED';
  signatureData: string;
  declarationText: string;
  password?: string;
  departmentId?: string;
  workflowStep?: string;
  metadata?: string;
  placement?: SignaturePlacement;
  annotations?: PdfAnnotation[];
}

export async function signDocumentVersion(
  versionId: string,
  userId: string,
  input: SignDocumentInput,
  ipAddress?: string,
  userAgent?: string
) {
  // 1. Authenticate & fetch user
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      department: true,
      headedDepartment: true,
      representativeOf: true,
    },
  });

  if (!user || !user.isActive) {
    throw new Error('User not found or account is deactivated.');
  }

  // 2. Re-authentication password verification (if provided)
  if (input.password) {
    const isPasswordValid = await bcrypt.compare(input.password, user.passwordHash);
    if (!isPasswordValid) {
      await logAudit({
        userId,
        action: 'ELECTRONIC_SIGNATURE_REAUTH_FAILED',
        entity: 'SOPElectronicSignature',
        entityId: versionId,
        oldValue: null,
        newValue: { reason: 'Incorrect password supplied during signature confirmation' },
        ipAddress,
      });
      throw new Error('Incorrect account password. Electronic signature authorization rejected.');
    }
  }

  // 3. Fetch SOP Version
  const version = await prisma.sOPVersion.findUnique({
    where: { id: versionId },
    include: {
      sop: {
        include: { ownerDept: true },
      },
      participants: {
        include: { department: true },
      },
      attachments: true,
      signatures: {
        where: { status: 'VALID' },
      },
    },
  });

  if (!version) {
    throw new Error('SOP Version not found.');
  }

  if (version.isFinalized) {
    throw new Error('Cannot sign an SOP that is already finalized.');
  }

  // 4. Calculate or verify exact document SHA-256 hash
  let actualDocumentHash = version.documentHash;
  let primaryAttachment = version.attachments.find((a) => a.id === version.primaryAttachmentId);

  if (!primaryAttachment && version.attachments.length > 0) {
    // Pick the most recent document attachment (PDF, DOCX, image)
    primaryAttachment = [...version.attachments]
      .filter((a) => a.originalFilename.match(/\.(pdf|docx|png|jpg|jpeg|doc)$/i))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  }

  if (primaryAttachment) {
    const filePath = path.join(uploadDir, primaryAttachment.storedFilename);
    if (fs.existsSync(filePath)) {
      const fileBytes = fs.readFileSync(filePath);
      actualDocumentHash = crypto.createHash('sha256').update(fileBytes).digest('hex');
    }
  }

  if (!actualDocumentHash) {
    // Fallback deterministic digest based on immutable document metadata
    actualDocumentHash = crypto
      .createHash('sha256')
      .update(`${version.sopId}:${version.versionNumber}:${version.title}:${version.createdAt.toISOString()}`)
      .digest('hex');
  }

  // Verify document integrity against any existing valid signatures
  if (version.signatures.length > 0) {
    if (version.documentHash && actualDocumentHash && version.documentHash !== actualDocumentHash) {
      throw new Error(
        'Document tampering detected: the document file hash has changed since previous valid electronic signatures were affixed.'
      );
    }
  }

  // 5. Determine signing department and role
  const targetDeptId =
    input.departmentId ||
    user.headedDepartment?.id ||
    user.departmentId ||
    version.sop.ownerDeptId;

  // Authorization check: User can sign if Admin, Creator, Dept Head, or Dept Representative
  const isAdmin = user.role === Roles.ADMIN || user.role === Roles.SUPER_ADMIN;
  const isCreator = version.createdById === user.id || version.sop.createdById === user.id;
  const isDeptHead = user.headedDepartment?.id === targetDeptId;
  const isDeptRep = user.representativeOf.some((r) => r.departmentId === targetDeptId);
  const isMemberOfDept = user.departmentId === targetDeptId;

  const canSignForDept =
    isAdmin ||
    isCreator ||
    isDeptHead ||
    isDeptRep ||
    (isMemberOfDept && ['DEPARTMENT_HEAD', 'DEPARTMENT_REPRESENTATIVE', 'APPROVER'].includes(user.role));

  if (!canSignForDept) {
    throw new Error(
      `User '${user.fullName}' is not authorized to sign on behalf of department ID '${targetDeptId}'.`
    );
  }

  // Prevent duplicate valid signature by this user on this step
  const workflowStep = input.workflowStep || 'DEPARTMENT_APPROVAL';
  const existingSig = version.signatures.find(
    (s) => s.signerUserId === user.id && s.workflowStep === workflowStep && s.status === 'VALID'
  );
  if (existingSig) {
    throw new Error('You have already applied a valid electronic signature for this workflow step.');
  }

  // 6. If primary attachment is a PDF, embed the electronic signature into the PDF file bytes
  let signedPdfAttachmentId: string | null = null;
  let signedPdfHash: string | null = null;
  let pdfPlacementMeta: any = null;
  let signedFilename: string | null = null;
  let signedBytesBuffer: Buffer | null = null;

  if (primaryAttachment && primaryAttachment.originalFilename.toLowerCase().endsWith('.pdf')) {
    const filePath = path.join(uploadDir, primaryAttachment.storedFilename);
    if (fs.existsSync(filePath)) {
      const origPdfBytes = fs.readFileSync(filePath);
      const embedResult = await embedSignatureIntoPdf(
        origPdfBytes,
        input.signatureMethod,
        input.signatureData,
        {
          name: user.fullName,
          role: user.role,
          department: user.department?.name || 'Department',
          date: new Date(),
          originalHash: actualDocumentHash!,
          workflowStep,
        },
        input.placement,
        input.annotations
      );

      signedFilename = `sop-signed-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.pdf`;
      const signedPath = path.join(uploadDir, signedFilename);
      fs.writeFileSync(signedPath, embedResult.signedBytes);

      signedBytesBuffer = embedResult.signedBytes;
      signedPdfHash = embedResult.signedHash;
      pdfPlacementMeta = {
        placement: embedResult.actualPlacement,
        originalDocumentHash: actualDocumentHash,
        signedDocumentHash: embedResult.signedHash,
        pageCount: embedResult.pageCount,
        embeddedAt: new Date().toISOString(),
      };
    }
  }

  // 7. Database Transaction
  const createdSignature = await prisma.$transaction(async (tx) => {
    let activeAttachmentId = primaryAttachment?.id || null;

    if (signedPdfHash && signedFilename && signedBytesBuffer) {
      // Create new immutable attachment record for the signed PDF artifact
      const signedAtt = await tx.sOPAttachment.create({
        data: {
          sopVersionId: version.id,
          originalFilename: primaryAttachment!.originalFilename.startsWith('Signed_')
            ? primaryAttachment!.originalFilename
            : `Signed_${primaryAttachment!.originalFilename}`,
          storedFilename: signedFilename,
          mimeType: 'application/pdf',
          fileSize: signedBytesBuffer.length,
          uploadedById: user.id,
        },
      });
      activeAttachmentId = signedAtt.id;
      signedPdfAttachmentId = signedAtt.id;
    }

    // Create the signature record
    const sig = await tx.sOPElectronicSignature.create({
      data: {
        sopVersionId: version.id,
        sopId: version.sopId,
        attachmentId: activeAttachmentId,
        signerUserId: user.id,
        signerName: user.fullName,
        signerEmail: user.email,
        signerRole: user.role,
        signerDepartment: user.department?.name || null,
        departmentId: targetDeptId,
        signatureMethod: input.signatureMethod,
        signatureData: input.signatureData,
        documentHash: actualDocumentHash!,
        declarationText:
          input.declarationText ||
          `I, ${user.fullName}, hereby confirm that I have reviewed and electronically approve SOP ${version.sop.sopNumber} (v${version.versionNumber}). This digital record constitutes my binding electronic signature.`,
        workflowStep,
        ipAddress: ipAddress || null,
        userAgent: userAgent || null,
        metadata: pdfPlacementMeta ? JSON.stringify(pdfPlacementMeta) : (input.metadata || null),
        status: 'VALID',
      },
    });

    // Update version documentHash if not already set or updated to signed hash
    await tx.sOPVersion.update({
      where: { id: version.id },
      data: {
        documentHash: signedPdfHash || actualDocumentHash,
        primaryAttachmentId: activeAttachmentId || version.primaryAttachmentId,
        signatureStatus: 'PARTIALLY_SIGNED',
      },
    });

    // If this signature corresponds to an approver department participant during an approval step, also record official approval
    const isApprovalStep = ['DEPARTMENT_APPROVAL', 'FINAL_APPROVAL'].includes(workflowStep);
    const participant = isApprovalStep ? version.participants.find((p) => p.departmentId === targetDeptId) : null;
    if (participant && participant.participationType === ParticipationTypes.REQUIRED_APPROVER) {
      await tx.sOPParticipant.update({
        where: { id: participant.id },
        data: {
          status: ParticipantStatuses.APPROVED,
          decisionUserId: user.id,
          decisionAt: new Date(),
          remarks: `[Electronically Signed]: ${sig.declarationText}`,
        },
      });

      // Avoid duplicate SOPApproval if already present
      const existingApproval = await tx.sOPApproval.findFirst({
        where: {
          sopVersionId: version.id,
          departmentId: targetDeptId,
          decision: ApprovalDecisions.APPROVED,
        },
      });

      if (!existingApproval) {
        await tx.sOPApproval.create({
          data: {
            sopVersionId: version.id,
            departmentId: targetDeptId,
            approverUserId: user.id,
            decision: ApprovalDecisions.APPROVED,
            reason: `Electronically signed and approved by ${user.fullName} (${user.role})`,
            ipAddress,
            userAgent,
          },
        });
      }
    }

    return sig;
  });

  // 7. Check if all required approvers have signed/approved
  const matrix = await calculateApprovalMatrix(version.id);
  const updatedSigStatus = matrix.canFinalize ? 'FULLY_SIGNED' : 'PARTIALLY_SIGNED';

  await prisma.sOPVersion.update({
    where: { id: version.id },
    data: {
      signatureStatus: updatedSigStatus,
      status: matrix.canFinalize ? SOPStatuses.FINAL_REVIEW : version.status,
    },
  });

  if (matrix.canFinalize) {
    await prisma.sOP.update({
      where: { id: version.sopId },
      data: { status: SOPStatuses.FINAL_REVIEW },
    });
  }

  // 8. Audit Logging
  await logAudit({
    userId,
    action: 'SOP_ELECTRONIC_SIGNATURE_CREATED',
    entity: 'SOPElectronicSignature',
    entityId: createdSignature.id,
    oldValue: null,
    newValue: {
      sopNumber: version.sop.sopNumber,
      version: version.versionNumber,
      signer: user.fullName,
      role: user.role,
      method: input.signatureMethod,
      documentHash: actualDocumentHash,
      workflowStep,
    },
    ipAddress,
  });

  // 9. Notify SOP Creator & Team
  await notifyConcernedUsers({
    departmentIds: [version.sop.ownerDeptId, targetDeptId],
    title: `SOP Electronically Signed: ${version.sop.sopNumber}`,
    message: `${user.fullName} (${user.department?.name || 'Department'}) has electronically signed SOP ${version.sop.sopNumber} (v${version.versionNumber}).`,
    type: 'SOP_SIGNED',
    link: `/sops/${version.sopId}?version=${version.versionNumber}`,
  });

  return {
    signature: createdSignature,
    signatureStatus: updatedSigStatus,
    documentHash: actualDocumentHash,
  };
}

export async function revokeSignature(
  signatureId: string,
  userId: string,
  reason: string,
  ipAddress?: string
) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error('User not found.');

  const sig = await prisma.sOPElectronicSignature.findUnique({
    where: { id: signatureId },
    include: { sopVersion: true },
  });

  if (!sig) throw new Error('Signature record not found.');
  if (sig.status === 'REVOKED') throw new Error('Signature is already revoked.');

  const isAdmin = user.role === Roles.ADMIN || user.role === Roles.SUPER_ADMIN;
  if (!isAdmin && sig.signerUserId !== user.id) {
    throw new Error('Only the original signer or a System Administrator may revoke this signature.');
  }

  if (sig.sopVersion.isFinalized) {
    throw new Error('Cannot revoke a signature on a finalized SOP.');
  }

  const revoked = await prisma.$transaction(async (tx) => {
    const updated = await tx.sOPElectronicSignature.update({
      where: { id: signatureId },
      data: {
        status: 'REVOKED',
        revokedAt: new Date(),
        revokedById: user.id,
        revokedReason: reason.trim(),
      },
    });

    // Reset signature status
    const remainingSignatures = await tx.sOPElectronicSignature.count({
      where: {
        sopVersionId: sig.sopVersionId,
        status: 'VALID',
      },
    });

    await tx.sOPVersion.update({
      where: { id: sig.sopVersionId },
      data: {
        signatureStatus: remainingSignatures > 0 ? 'PARTIALLY_SIGNED' : 'PENDING_SIGNATURE',
      },
    });

    return updated;
  });

  await logAudit({
    userId,
    action: 'SOP_ELECTRONIC_SIGNATURE_REVOKED',
    entity: 'SOPElectronicSignature',
    entityId: signatureId,
    oldValue: { status: 'VALID' },
    newValue: { status: 'REVOKED', reason: reason.trim(), revokedBy: user.fullName },
    ipAddress,
  });

  return revoked;
}

export async function getVersionSignatures(versionId: string) {
  const signatures = await prisma.sOPElectronicSignature.findMany({
    where: { sopVersionId: versionId },
    include: {
      signerUser: {
        select: { id: true, fullName: true, position: true, email: true },
      },
      revokedBy: {
        select: { id: true, fullName: true },
      },
    },
    orderBy: { signedAt: 'asc' },
  });

  return signatures;
}

/**
 * Saves draft annotations into a PDF without executing a legal electronic signature.
 */
export async function savePdfDraftAnnotations(
  versionId: string,
  userId: string,
  annotations: PdfAnnotation[],
  ipAddress?: string
) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.isActive) throw new Error('Unauthorized or inactive account.');

  const version = await prisma.sOPVersion.findUnique({
    where: { id: versionId },
    include: { attachments: true, sop: true },
  });
  if (!version) throw new Error('SOP Version not found.');
  if (version.isFinalized) throw new Error('Cannot edit a finalized SOP.');

  let primaryAttachment = version.attachments.find((a) => a.id === version.primaryAttachmentId);
  if (!primaryAttachment) {
    primaryAttachment = [...version.attachments]
      .filter((a) => a.originalFilename.toLowerCase().endsWith('.pdf'))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  }

  if (!primaryAttachment || !primaryAttachment.originalFilename.toLowerCase().endsWith('.pdf')) {
    throw new Error('SOP Version does not have a primary PDF document to annotate.');
  }

  const filePath = path.join(uploadDir, primaryAttachment.storedFilename);
  if (!fs.existsSync(filePath)) {
    throw new Error('PDF file not found in storage.');
  }

  const pdfBytes = fs.readFileSync(filePath);
  const result = await embedAnnotationsIntoPdf(pdfBytes, annotations);

  const editedFilename = `sop-draft-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.pdf`;
  const editedPath = path.join(uploadDir, editedFilename);
  fs.writeFileSync(editedPath, result.editedBytes);

  const newAttachment = await prisma.$transaction(async (tx) => {
    const att = await tx.sOPAttachment.create({
      data: {
        sopVersionId: version.id,
        originalFilename: primaryAttachment!.originalFilename.startsWith('Annotated_')
          ? primaryAttachment!.originalFilename
          : `Annotated_${primaryAttachment!.originalFilename}`,
        storedFilename: editedFilename,
        mimeType: 'application/pdf',
        fileSize: result.editedBytes.length,
        uploadedById: user.id,
      },
    });

    await tx.sOPVersion.update({
      where: { id: version.id },
      data: {
        primaryAttachmentId: att.id,
        documentHash: result.editedHash,
      },
    });

    return att;
  });

  await logAudit({
    userId,
    action: 'PDF_DRAFT_ANNOTATIONS_SAVED',
    entity: 'SOPVersion',
    entityId: version.id,
    oldValue: { attachmentId: primaryAttachment.id, hash: version.documentHash },
    newValue: {
      attachmentId: newAttachment.id,
      hash: result.editedHash,
      annotationCount: annotations.length,
    },
    ipAddress,
  });

  return {
    attachment: newAttachment,
    documentHash: result.editedHash,
  };
}
