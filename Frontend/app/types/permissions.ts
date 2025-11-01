export type Permission =
  | 'canView'
  | 'canEdit'
  | 'canLock'
  | 'canInvite'
  | 'canApproveLock'
  | 'canRequestLock'
  | 'canDeleteProject'
  | 'canManageMembers';

export interface Permissions {
  canView: boolean;
  canEdit: boolean;
  canLock: boolean;
  canInvite: boolean;
  canApproveLock: boolean;
  canRequestLock: boolean;
  canDeleteProject: boolean;
  canManageMembers: boolean;
}

export const CANONICAL_PERMISSIONS: Permission[] = [
  'canView',
  'canEdit',
  'canLock',
  'canInvite',
  'canApproveLock',
  'canRequestLock',
  'canDeleteProject',
  'canManageMembers',
];

export const DEFAULT_PERMISSIONS: Permissions = CANONICAL_PERMISSIONS.reduce(
  (acc, permission) => {
    acc[permission] = false;
    return acc;
  },
  {} as Permissions
);

export const PERMISSION_LABELS: Record<Permission, string> = {
  canView: 'View Project',
  canEdit: 'Edit Files',
  canLock: 'Manage Locks',
  canInvite: 'Invite Users',
  canApproveLock: 'Approve Lock Requests',
  canRequestLock: 'Request Locks',
  canDeleteProject: 'Delete Project',
  canManageMembers: 'Manage Members',
};