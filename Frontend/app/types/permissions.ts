export type Permission = 
  | 'read'
  | 'write'
  | 'delete'
  | 'invite'
  | 'deploy'
  | 'manage_members'
  | 'delete_project';

export interface Permissions {
  read: boolean;
  write: boolean;
  delete: boolean;
  invite: boolean;
  deploy: boolean;
  manage_members: boolean;
  delete_project: boolean;
}

export const DEFAULT_PERMISSIONS: Permissions = {
  read: false,
  write: false,
  delete: false,
  invite: false,
  deploy: false,
  manage_members: false,
  delete_project: false,
};

export const PERMISSION_LABELS: Record<Permission, string> = {
  read: 'Read Files',
  write: 'Write Files',
  delete: 'Delete Files',
  invite: 'Invite Users',
  deploy: 'Deploy Project',
  manage_members: 'Manage Members',
  delete_project: 'Delete Project',
}; 