export const Roles = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMIN: 'ADMIN',
  DEPARTMENT_HEAD: 'DEPARTMENT_HEAD',
  DEPARTMENT_REPRESENTATIVE: 'DEPARTMENT_REPRESENTATIVE',
  SOP_CREATOR: 'SOP_CREATOR',
  CREATOR: 'CREATOR',
  REVIEWER: 'REVIEWER',
  APPROVER: 'APPROVER',
  READ_ONLY: 'READ_ONLY',
  VIEWER: 'VIEWER',
} as const;

export type Role = (typeof Roles)[keyof typeof Roles];

export const SOPStatuses = {
  DRAFT: 'DRAFT',
  UNDER_REVIEW: 'UNDER_REVIEW',
  DEPARTMENT_DISCUSSION: 'DEPARTMENT_DISCUSSION',
  REMARKS_CONSOLIDATION: 'REMARKS_CONSOLIDATION',
  PENDING_DEPARTMENT_APPROVAL: 'PENDING_DEPARTMENT_APPROVAL',
  PENDING_FINAL_REVIEW: 'PENDING_FINAL_REVIEW',
  FINALIZED: 'FINALIZED',
  CHANGES_REQUESTED: 'CHANGES_REQUESTED',
  REVISION_DRAFT: 'REVISION_DRAFT',
  OBSOLETE: 'OBSOLETE',
} as const;

export type SOPStatus = (typeof SOPStatuses)[keyof typeof SOPStatuses];

export const ParticipationTypes = {
  REQUIRED_APPROVER: 'REQUIRED_APPROVER',
  REQUIRED_REVIEWER: 'REQUIRED_REVIEWER',
  CONSULTED: 'CONSULTED',
  NOT_INVOLVED: 'NOT_INVOLVED',
} as const;

export type ParticipationType = (typeof ParticipationTypes)[keyof typeof ParticipationTypes];

export const ParticipantStatuses = {
  PENDING: 'PENDING',
  REVIEWED: 'REVIEWED',
  AGREED: 'AGREED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  CHANGES_REQUESTED: 'CHANGES_REQUESTED',
  NA: 'N/A',
} as const;

export type ParticipantStatus = (typeof ParticipantStatuses)[keyof typeof ParticipantStatuses];

export interface User {
  id: string;
  email: string;
  username?: string;
  firstName: string;
  lastName: string;
  fullName?: string;
  employeeId?: string | null;
  role: Role;
  departmentId?: string | null;
  department?: Department | null;
  isActive: boolean;
  createdAt: string;
}

export interface Department {
  id: string;
  name: string;
  code: string;
  description?: string | null;
  headId?: string | null;
  headUserId?: string | null;
  head?: User | null;
  representatives?: {
    id: string;
    userId: string;
    user: User;
    isActive: boolean;
  }[];
  _count?: {
    users: number;
    ownedSOPs: number;
  };
}

export interface SOPAttachment {
  id: string;
  fileName?: string;
  originalFilename?: string;
  fileSize: number;
  mimeType: string;
  filePath?: string;
  storedFilename?: string;
  createdAt: string;
  uploadedBy?: {
    id: string;
    fullName?: string;
    firstName?: string;
    lastName?: string;
    email?: string;
  };
}

export interface SOPParticipant {
  id: string;
  departmentId: string;
  department: Department;
  participationType: ParticipationType;
  status: ParticipantStatus;
  agreementConfirmed: boolean;
  decisionUserId?: string | null;
  decisionUser?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
  decisionAt?: string | null;
  remarks?: string | null;
}

export interface SOPReviewMeeting {
  id: string;
  meetingDate: string;
  meetingMode: string;
  minutesOfMeeting: string;
  attendees: string;
  decisions: string;
  recordedById: string;
  recordedBy: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  createdAt: string;
}

export interface SOPRemark {
  id: string;
  departmentId: string;
  department: Department;
  authorId: string;
  author: {
    id: string;
    firstName: string;
    lastName: string;
    role: string;
    email: string;
  };
  stepReference?: string | null;
  comment: string;
  recommendation?: string | null;
  isAddressed: boolean;
  resolutionNote?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SOPApproval {
  id: string;
  departmentId: string;
  department: Department;
  approvedById: string;
  approvedBy: {
    id: string;
    firstName: string;
    lastName: string;
    role: string;
    email: string;
  };
  decision: 'APPROVED' | 'CHANGES_REQUESTED' | 'REJECTED';
  signatureToken: string;
  reason?: string | null;
  createdAt: string;
}

export interface SOPVersion {
  id: string;
  sopId: string;
  versionNumber: string;
  versionInt: number;
  status: SOPStatus;
  title: string;
  purpose: string;
  scope: string;
  responsibilities: string;
  procedure: string;
  relatedForms?: string | null;
  references?: string | null;
  effectiveDate?: string | null;
  reviewDate?: string | null;
  revisionReason?: string | null;
  changeSummary?: string | null;
  createdById: string;
  createdBy: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  finalizedAt?: string | null;
  finalizedById?: string | null;
  finalizedBy?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
  lockVersion: number;
  createdAt: string;
  updatedAt: string;
  participants: SOPParticipant[];
  meetings?: SOPReviewMeeting[];
  remarks?: SOPRemark[];
  approvals?: SOPApproval[];
  attachments?: SOPAttachment[];
}

export interface SOP {
  id: string;
  sopNumber: string;
  title: string;
  departmentId: string;
  department: Department;
  currentVersionNumber: string;
  status: SOPStatus;
  createdById: string;
  createdBy: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  createdAt: string;
  updatedAt: string;
  versions?: SOPVersion[];
  currentVersion?: SOPVersion;
}

export interface AuditLog {
  id: string;
  userId?: string | null;
  user?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
  action: string;
  entity: string;
  entityId: string;
  oldValue?: any;
  newValue?: any;
  ipAddress?: string | null;
  createdAt: string;
}

export interface NotificationItem {
  id: string;
  userId: string;
  title: string;
  message: string;
  link?: string | null;
  isRead: boolean;
  createdAt: string;
}
