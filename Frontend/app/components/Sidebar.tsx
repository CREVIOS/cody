"use client";

import EnhancedFileTree from './filetree/EnhancedFileTree';
import { User } from '@/lib/projectAPI/TypeDefinitions';

interface SidebarProps {
  user?: User;
  userRoleId?: string | null;
}

export default function Sidebar({ user, userRoleId }: SidebarProps) {
  return (
    <div className="h-full">
      <EnhancedFileTree user={user} userRoleId={userRoleId} />
    </div>
  );
}
