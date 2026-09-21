import { RoleType, Roles } from '../types';

export const Permissions = {
  // System Administration
  SYSTEM_MANAGE: 'system:manage',
  USERS_MANAGE: 'users:manage',
  DEPARTMENTS_MANAGE: 'departments:manage',
  AUDIT_VIEW: 'audit:view',
  REPORTS_VIEW: 'reports:view',

  // SOP Authoring
  SOP_CREATE: 'sop:create',
  SOP_EDIT_DRAFT: 'sop:edit_draft',
  SOP_SUBMIT: 'sop:submit',
  SOP_REVISE: 'sop:revise',
  SOP_ARCHIVE: 'sop:archive',
  SOP_FINALIZE: 'sop:finalize',

  // Review & Collaboration
  SOP_REVIEW: 'sop:review',
  MEETING_MANAGE: 'meeting:manage',
  REMARKS_ADD: 'remarks:add',
  REMARKS_RESOLVE: 'remarks:resolve',
  AGREEMENT_CONFIRM: 'agreement:confirm',

  // Formal Approval
  DEPARTMENT_APPROVE: 'department:approve',

  // Viewing
  SOP_VIEW: 'sop:view',
} as const;

export type Permission = (typeof Permissions)[keyof typeof Permissions];

export const RolePermissions: Record<RoleType, Permission[]> = {
  [Roles.SUPER_ADMIN]: Object.values(Permissions),
  [Roles.ADMIN]: [
    Permissions.USERS_MANAGE,
    Permissions.DEPARTMENTS_MANAGE,
    Permissions.AUDIT_VIEW,
    Permissions.REPORTS_VIEW,
    Permissions.SOP_VIEW,
    Permissions.SOP_ARCHIVE,
  ],
  [Roles.SOP_CREATOR]: [
    Permissions.SOP_CREATE,
    Permissions.SOP_EDIT_DRAFT,
    Permissions.SOP_SUBMIT,
    Permissions.SOP_REVISE,
    Permissions.SOP_FINALIZE,
    Permissions.SOP_VIEW,
    Permissions.REMARKS_ADD,
    Permissions.REMARKS_RESOLVE,
    Permissions.REPORTS_VIEW,
  ],
  [Roles.DEPARTMENT_HEAD]: [
    Permissions.SOP_VIEW,
    Permissions.SOP_REVIEW,
    Permissions.MEETING_MANAGE,
    Permissions.REMARKS_ADD,
    Permissions.REMARKS_RESOLVE,
    Permissions.AGREEMENT_CONFIRM,
    Permissions.DEPARTMENT_APPROVE,
    Permissions.REPORTS_VIEW,
  ],
  [Roles.DEPARTMENT_REPRESENTATIVE]: [
    Permissions.SOP_VIEW,
    Permissions.SOP_REVIEW,
    Permissions.MEETING_MANAGE,
    Permissions.REMARKS_ADD,
    Permissions.REMARKS_RESOLVE,
    Permissions.AGREEMENT_CONFIRM,
    Permissions.DEPARTMENT_APPROVE,
    Permissions.REPORTS_VIEW,
  ],
  [Roles.REVIEWER]: [
    Permissions.SOP_VIEW,
    Permissions.SOP_REVIEW,
    Permissions.REMARKS_ADD,
    Permissions.REMARKS_RESOLVE,
    Permissions.REPORTS_VIEW,
  ],
  [Roles.APPROVER]: [
    Permissions.SOP_VIEW,
    Permissions.AGREEMENT_CONFIRM,
    Permissions.DEPARTMENT_APPROVE,
    Permissions.REMARKS_ADD,
    Permissions.REPORTS_VIEW,
  ],
  [Roles.READ_ONLY]: [
    Permissions.SOP_VIEW,
    Permissions.REPORTS_VIEW,
  ],
};

export function hasPermission(role: RoleType, permission: Permission): boolean {
  return RolePermissions[role]?.includes(permission) ?? false;
}
