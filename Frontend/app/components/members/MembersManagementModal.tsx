"use client";

import { useState, useEffect } from "react";
import { X, Users, AlertTriangle } from "lucide-react";
import { ProjectMemberWithDetails, Role } from "@/lib/projectAPI/TypeDefinitions";
import { getProjectMembers, updateProjectMember } from "@/lib/projectAPI/ProjectMembersAPI";
import { getRoles } from "@/lib/projectAPI/RoleAPI";
import { Theme } from "@/context/ThemeContext";
import { usePermissions } from "@/hooks/usePermissions";
import { ErrorDisplay } from "../invitation/ErrorDisplay";

interface MembersManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  projectName: string;
  userId: string;
  theme: Theme;
  onMemberUpdated?: () => void;
}

export default function MembersManagementModal({
  isOpen,
  onClose,
  projectId,
  projectName,
  userId,
  theme,
  onMemberUpdated,
}: MembersManagementModalProps) {
  const [members, setMembers] = useState<ProjectMemberWithDetails[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatingMemberId, setUpdatingMemberId] = useState<string | null>(null);
  const [selectedRoleId, setSelectedRoleId] = useState<Record<string, string>>({});

  const { hasPermission } = usePermissions({
    roleId: null,
    projectId: projectId,
    userId: userId,
  });
  const canManageMembers = hasPermission("canManageMembers");
  const canTransferOwnership = hasPermission("canTransferOwnership");

  useEffect(() => {
    if (isOpen && projectId) {
      loadData();
    }
  }, [isOpen, projectId]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [membersData, rolesData] = await Promise.all([
        getProjectMembers(projectId),
        getRoles(),
      ]);
      setMembers(membersData);
      // Filter out "Owner" role from available roles - ownership cannot be assigned via this modal
      const availableRoles = rolesData.filter(role => role.role_name.toLowerCase() !== "owner");
      setRoles(availableRoles);
      
      // Initialize selected roles
      const initialRoles: Record<string, string> = {};
      membersData.forEach((member) => {
        if (member.role_id) {
          initialRoles[member.project_member_id || member.user_id] = member.role_id;
        }
      });
      setSelectedRoleId(initialRoles);
    } catch (err) {
      console.error("Error loading members:", err);
      setError(err instanceof Error ? err.message : "Failed to load members");
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (memberId: string, newRoleId: string) => {
    if (!canManageMembers) {
      setError("You don't have permission to manage members");
      return;
    }

    // Find the member being updated
    const member = members.find(m => (m.project_member_id || m.user_id) === memberId);
    if (!member) {
      setError("Member not found");
      return;
    }

    // Prevent changing owner's role - ownership is managed separately via canTransferOwnership
    if (member.is_owner) {
      setError("Cannot change owner's role. Ownership transfer must be handled separately.");
      return;
    }

    // Find the role being assigned
    const newRole = roles.find(r => r.role_id === newRoleId);
    if (newRole && newRole.role_name.toLowerCase() === "owner") {
      setError("Cannot assign Owner role through member management. Ownership transfer must be handled separately.");
      return;
    }

    setUpdatingMemberId(memberId);
    setError(null);

    try {
      await updateProjectMember(memberId, { role_id: newRoleId }, userId);
      setSelectedRoleId((prev) => ({ ...prev, [memberId]: newRoleId }));
      if (onMemberUpdated) {
        onMemberUpdated();
      }
    } catch (err) {
      console.error("Error updating member role:", err);
      setError(err instanceof Error ? err.message : "Failed to update member role");
    } finally {
      setUpdatingMemberId(null);
    }
  };

  if (!isOpen) return null;

  const isDark = theme === "dark";
  const modalBg = isDark ? "bg-[#1E1E1E]" : "bg-white";
  const borderClass = isDark ? "border-[#3A3A3E]" : "border-gray-200";
  const textClass = isDark ? "text-[#E0E0E0]" : "text-[#2D2D2D]";
  const inputClass = isDark
    ? "bg-[#2A2A2E] border-[#3A3A3E] text-[#E0E0E0]"
    : "bg-white border-gray-300 text-[#2D2D2D]";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div
        className={`${modalBg} rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col ${borderClass} border`}
      >
        {/* Header */}
        <div className={`flex items-center justify-between p-4 border-b ${borderClass}`}>
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            <h2 className={`text-lg font-semibold ${textClass}`}>Manage Members</h2>
          </div>
          <button
            onClick={onClose}
            className={`p-1 rounded-md hover:bg-opacity-20 ${
              isDark ? "hover:bg-white" : "hover:bg-gray-200"
            } transition-colors`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Warning Message */}
        {canManageMembers && (
          <div
            className={`mx-4 mt-4 p-3 rounded-md flex items-start gap-2 ${
              isDark
                ? "bg-yellow-900/20 border border-yellow-700/50"
                : "bg-yellow-50 border border-yellow-200"
            }`}
          >
            <AlertTriangle className={`w-5 h-5 flex-shrink-0 ${
              isDark ? "text-yellow-400" : "text-yellow-600"
            }`} />
            <p className={`text-sm ${
              isDark ? "text-yellow-300" : "text-yellow-800"
            }`}>
              <strong>Warning:</strong> Changing a member's role will immediately affect their permissions in this project. 
              Please ensure you understand the implications before making changes.
            </p>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {error && <ErrorDisplay error={error} theme={theme} />}

          {loading ? (
            <div className={`text-center py-8 ${textClass}`}>
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-current mx-auto mb-2"></div>
              <p>Loading members...</p>
            </div>
          ) : members.length === 0 ? (
            <div className={`text-center py-8 ${textClass}`}>
              <p>No members found</p>
            </div>
          ) : (
            <div className="space-y-3">
              {members.map((member) => {
                const displayName =
                  member.user?.full_name ||
                  member.user?.username ||
                  member.user?.email ||
                  "Unknown User";
                const currentRoleId = selectedRoleId[member.project_member_id || member.user_id] || member.role_id;
                const isUpdating = updatingMemberId === (member.project_member_id || member.user_id);
                // CRITICAL: Check is_owner flag first - owner status is determined by project.owner_id, not role_id
                const isOwner = member.is_owner === true;

                return (
                  <div
                    key={member.project_member_id || member.user_id}
                    className={`p-3 rounded-md border ${borderClass} ${
                      isDark ? "bg-[#2A2A2E]" : "bg-gray-50"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <p className={`font-medium ${textClass}`}>{displayName}</p>
                        <p className={`text-sm mt-1 ${
                          isDark ? "text-gray-400" : "text-gray-600"
                        }`}>
                          {member.user?.email}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        {isOwner ? (
                          // Owner always shows as "Owner" - no dropdown, no role change possible
                          <span className={`px-3 py-1 rounded text-sm font-medium ${
                            isDark
                              ? "bg-indigo-900/30 text-indigo-300 border border-indigo-700/50"
                              : "bg-indigo-100 text-indigo-800 border border-indigo-300"
                          }`}>
                            Owner
                          </span>
                        ) : (
                          <select
                            value={currentRoleId || ""}
                            onChange={(e) => {
                              if (canManageMembers && !isOwner) {
                                handleRoleChange(
                                  member.project_member_id || member.user_id,
                                  e.target.value
                                );
                              }
                            }}
                            disabled={!canManageMembers || isOwner || isUpdating}
                            className={`px-3 py-1 rounded border text-sm ${inputClass} ${
                              (!canManageMembers || isOwner || isUpdating)
                                ? "opacity-50 cursor-not-allowed"
                                : "cursor-pointer"
                            }`}
                          >
                            {roles.map((role) => (
                              <option key={role.role_id} value={role.role_id}>
                                {role.role_name}
                              </option>
                            ))}
                          </select>
                        )}
                        {isUpdating && (
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current"></div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={`p-4 border-t ${borderClass} flex justify-between items-center`}>
          {/* Transfer Ownership button - only visible to owner */}
          {canTransferOwnership && (
            <button
              onClick={() => {
                // TODO: Implement transfer ownership functionality
                setError("Transfer ownership functionality coming soon");
              }}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                isDark
                  ? "bg-indigo-600 hover:bg-indigo-700 text-white"
                  : "bg-indigo-600 hover:bg-indigo-700 text-white"
              }`}
            >
              Transfer Ownership
            </button>
          )}
          <div className="flex gap-2 ml-auto">
            <button
              onClick={onClose}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                isDark
                  ? "bg-[#3A3A3E] hover:bg-[#4A4A4E] text-[#E0E0E0]"
                  : "bg-gray-200 hover:bg-gray-300 text-[#2D2D2D]"
              }`}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

