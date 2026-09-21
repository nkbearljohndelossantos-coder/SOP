export const Roles = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMIN: 'ADMIN',
  SOP_CREATOR: 'SOP_CREATOR',
  DEPARTMENT_HEAD: 'DEPARTMENT_HEAD',
  DEPARTMENT_REPRESENTATIVE: 'DEPARTMENT_REPRESENTATIVE',
  REVIEWER: 'REVIEWER',
  APPROVER: 'APPROVER',
  READ_ONLY: 'READ_ONLY',
} as const;

export type RoleType = (typeof Roles)[keyof typeof Roles];

export const SOPStatuses = {
  DRAFT: 'DRAFT',
  INITIAL_REVIEW: 'INITIAL_REVIEW',
  UNDER_REVIEW: 'UNDER_REVIEW',
  DISCUSSION: 'DISCUSSION',
  AGREEMENT_PENDING: 'AGREEMENT_PENDING',
  DEPARTMENT_APPROVAL: 'DEPARTMENT_APPROVAL',
  CHANGES_REQUESTED: 'CHANGES_REQUESTED',
  RETURNED_TO_CREATOR: 'RETURNED_TO_CREATOR',
  FINAL_REVIEW: 'FINAL_REVIEW',
  APPROVED: 'APPROVED',
  FINALIZED: 'FINALIZED',
  ARCHIVED: 'ARCHIVED',
} as const;

export type SOPStatusType = (typeof SOPStatuses)[keyof typeof SOPStatuses];

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
  CHANGES_REQUESTED: 'CHANGES_REQUESTED',
  NA: 'NA',
} as const;

export type ParticipantStatusType = (typeof ParticipantStatuses)[keyof typeof ParticipantStatuses];

export const ApprovalDecisions = {
  APPROVED: 'APPROVED',
  CHANGES_REQUESTED: 'CHANGES_REQUESTED',
  REJECTED: 'REJECTED',
} as const;

export type ApprovalDecisionType = (typeof ApprovalDecisions)[keyof typeof ApprovalDecisions];

export const RemarkStatuses = {
  OPEN: 'OPEN',
  RESOLVED: 'RESOLVED',
} as const;

export type RemarkStatusType = (typeof RemarkStatuses)[keyof typeof RemarkStatuses];

export const MeetingStatuses = {
  SCHEDULED: 'SCHEDULED',
  IN_PROGRESS: 'IN_PROGRESS',
  CONCLUDED: 'CONCLUDED',
} as const;

export type MeetingStatusType = (typeof MeetingStatuses)[keyof typeof MeetingStatuses];

export interface AuthUser {
  id: string;
  employeeId: string;
  username: string;
  email: string;
  fullName: string;
  role: RoleType;
  departmentId: string | null;
  position: string | null;
  isDemoUser: boolean;
}
