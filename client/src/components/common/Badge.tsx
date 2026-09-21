import React from 'react';
import { SOPStatus, SOPStatuses, ParticipationType, ParticipationTypes, ParticipantStatus } from '../../types';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'gray';
  size?: 'sm' | 'md';
}

export const Badge: React.FC<BadgeProps> = ({ children, variant = 'default', size = 'md' }) => {
  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs font-semibold';

  const variantClasses = {
    default: 'bg-slate-100 text-slate-700 border border-slate-200',
    primary: 'bg-blue-50 text-blue-700 border border-blue-200',
    success: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    warning: 'bg-amber-50 text-amber-800 border border-amber-200',
    danger: 'bg-rose-50 text-rose-700 border border-rose-200',
    info: 'bg-sky-50 text-sky-700 border border-sky-200',
    gray: 'bg-gray-100 text-gray-500 border border-gray-200',
  };

  return (
    <span className={`inline-flex items-center rounded-full ${sizeClasses} ${variantClasses[variant]}`}>
      {children}
    </span>
  );
};

export const SOPStatusBadge: React.FC<{ status: SOPStatus }> = ({ status }) => {
  switch (status) {
    case SOPStatuses.DRAFT:
    case SOPStatuses.REVISION_DRAFT:
      return <Badge variant="gray">Draft</Badge>;
    case SOPStatuses.UNDER_REVIEW:
      return <Badge variant="info">Under Review</Badge>;
    case SOPStatuses.DEPARTMENT_DISCUSSION:
      return <Badge variant="primary">Dept Discussion</Badge>;
    case SOPStatuses.REMARKS_CONSOLIDATION:
      return <Badge variant="warning">Consolidating Remarks</Badge>;
    case SOPStatuses.PENDING_DEPARTMENT_APPROVAL:
      return <Badge variant="warning">Awaiting Approvals</Badge>;
    case SOPStatuses.PENDING_FINAL_REVIEW:
      return <Badge variant="primary">Final Verification</Badge>;
    case SOPStatuses.FINALIZED:
      return <Badge variant="success">Finalized & Effective</Badge>;
    case SOPStatuses.CHANGES_REQUESTED:
      return <Badge variant="danger">Changes Requested</Badge>;
    case SOPStatuses.OBSOLETE:
      return <Badge variant="gray">Obsolete</Badge>;
    default:
      return <Badge>{status}</Badge>;
  }
};

export const ParticipationBadge: React.FC<{ type: ParticipationType }> = ({ type }) => {
  switch (type) {
    case ParticipationTypes.REQUIRED_APPROVER:
      return <Badge variant="danger" size="sm">Required Approver</Badge>;
    case ParticipationTypes.REQUIRED_REVIEWER:
      return <Badge variant="info" size="sm">Required Reviewer</Badge>;
    case ParticipationTypes.CONSULTED:
      return <Badge variant="primary" size="sm">Consulted</Badge>;
    case ParticipationTypes.NOT_INVOLVED:
      return <Badge variant="gray" size="sm">N/A (Not Involved)</Badge>;
    default:
      return <Badge size="sm">{type}</Badge>;
  }
};

export const ParticipantStatusBadge: React.FC<{ status: ParticipantStatus; agreementConfirmed?: boolean }> = ({
  status,
  agreementConfirmed,
}) => {
  if (status === 'N/A') {
    return <span className="text-slate-400 font-medium text-xs">N/A</span>;
  }
  if (status === 'APPROVED') {
    return <Badge variant="success" size="sm">Approved</Badge>;
  }
  if (status === 'CHANGES_REQUESTED' || status === 'REJECTED') {
    return <Badge variant="danger" size="sm">Changes Requested</Badge>;
  }
  if (status === 'AGREED' || agreementConfirmed) {
    return <Badge variant="primary" size="sm">Agreement Confirmed</Badge>;
  }
  if (status === 'REVIEWED') {
    return <Badge variant="info" size="sm">Review Completed</Badge>;
  }
  return <Badge variant="warning" size="sm">Pending</Badge>;
};
