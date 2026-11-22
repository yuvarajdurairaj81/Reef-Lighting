export const PERMISSIONS = {
  'org:manage': 'Rename organization, manage settings',
  'users:manage': 'Invite users and change roles',
  'site:manage': 'Create, rename and delete sites',
  'tank:read': 'View tanks',
  'tank:manage': 'Create, rename and delete tanks',
  'device:read': 'View controllers and status',
  'device:manage': 'Onboard, rename, assign and remove controllers',
  'device:apply': 'Apply lighting configuration to controllers',
  'device:wattage': 'Configure per-channel maximum wattage',
  'profile:read': 'View lighting profiles',
  'profile:write': 'Create and edit lighting profiles',
  'alert:read': 'View alerts',
  'alert:manage': 'Acknowledge and resolve alerts',
  'audit:read': 'View audit logs',
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;
export type Role = 'OWNER' | 'ADMIN' | 'OPERATOR' | 'VIEWER';

const ALL = Object.keys(PERMISSIONS) as PermissionKey[];

export const ROLE_PERMISSIONS: Record<Role, PermissionKey[]> = {
  OWNER: ALL,
  ADMIN: ALL,
  OPERATOR: ['tank:read', 'device:read', 'device:apply', 'profile:read', 'profile:write', 'alert:read', 'alert:manage'],
  VIEWER: ['tank:read', 'device:read', 'profile:read', 'alert:read'],
};

export const hasPermission = (role: Role, perm: PermissionKey) => ROLE_PERMISSIONS[role].includes(perm);
