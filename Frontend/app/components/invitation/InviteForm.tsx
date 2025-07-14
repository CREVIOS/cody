import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Role } from "@/lib/projectAPI/TypeDefinitions";
import { createInvitation } from "@/lib/projectAPI/InvitationAPI";
import { findUserByEmail } from "@/lib/projectAPI/UserAPI";
import { ErrorDisplay } from "./ErrorDisplay";
import { Theme } from "@/context/ThemeContext";

interface InviteFormProps {
  projectId: string;
  projectName: string;
  roles: Role[];
  selectedRoleId: string;
  onRoleChange: (roleId: string) => void;
  onInviteSent: () => void;
  theme: Theme;
  user: { user_id: string };
}

export function InviteForm({ 
  projectId, 
  projectName, 
  roles, 
  selectedRoleId, 
  onRoleChange, 
  onInviteSent, 
  theme, 
  user 
}: InviteFormProps) {
  const [email, setEmail] = useState("");
  const [sendingInvitation, setSendingInvitation] = useState(false);
  const [invitationError, setInvitationError] = useState<string | null>(null);

  const inputClass = `
    w-full px-3 py-2 rounded-md border text-sm
    ${theme === "dark"
      ? "bg-[#2A2A2E] border-[#3A3A3E] focus:border-indigo-500 text-[#E0E0E0] placeholder-gray-500"
      : "bg-white border-gray-300 focus:border-indigo-500 text-[#2D2D2D] placeholder-gray-400"
    }
    focus:outline-none focus:ring-1 focus:ring-indigo-500/50
  `;

  const buttonClass = `
    px-4 py-2 rounded-md text-sm font-medium transition-colors
    ${theme === "dark"
      ? "bg-indigo-600 hover:bg-indigo-700 text-white"
      : "bg-indigo-600 hover:bg-indigo-700 text-white"
    }
  `;

  const handleSendInvitation = async () => {
    if (!email.trim() || !selectedRoleId || !projectId || !user?.user_id) return;

    try {
      setSendingInvitation(true);
      setInvitationError(null);

      const invitationData = {
        project_id: projectId,
        email: email.trim().toLowerCase(),
        role_id: selectedRoleId,
        invited_by: user.user_id
      };
      
      console.log('Sending invitation with data:', invitationData);
      
      if (!projectId) {
        throw new Error('Project ID is required');
      }
      if (!selectedRoleId) {
        throw new Error('Role ID is required');
      }
      if (!invitationData.invited_by) {
        throw new Error('Current user information is missing');
      }

      const existingUser = await findUserByEmail(invitationData.email);
      console.log('Existing user check:', existingUser);

      if (!existingUser) {
        setInvitationError('User with this email does not exist in the system');
        return;
      }

      await createInvitation(invitationData);
      setEmail("");

      if (onInviteSent) {
        onInviteSent();
      }
    } catch (err: Error | unknown) {
      console.error('Error sending invitation:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to send invitation. Please try again.';
      setInvitationError(errorMessage);
    } finally {
      setSendingInvitation(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Project Name Display */}
      <div>
        <label className={`block text-sm font-medium mb-2 
          ${theme === "dark" ? "text-gray-300" : "text-gray-700"}`}>
          Project
        </label>
        <div className={`px-3 py-2 rounded-md border text-sm font-medium
          ${theme === "dark"
            ? "bg-[#2A2A2E] border-[#3A3A3E] text-[#E0E0E0]"
            : "bg-gray-50 border-gray-300 text-[#2D2D2D]"
          }`}>
          {projectName}
        </div>
      </div>

      {/* Email Input */}
      <div>
        <label className={`block text-sm font-medium mb-2 
          ${theme === "dark" ? "text-gray-300" : "text-gray-700"}`}>
          Email Address
        </label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Enter email address"
          className={inputClass}
        />
      </div>

      {/* Role Selection */}
      <div>
        <label className={`block text-sm font-medium mb-2 
          ${theme === "dark" ? "text-gray-300" : "text-gray-700"}`}>
          Role
        </label>
        {roles.length > 0 ? (
          <select
            value={selectedRoleId}
            onChange={(e) => onRoleChange(e.target.value)}
            className={inputClass}
          >
            {roles.map(role => (
              <option key={role.role_id} value={role.role_id}>
                {role.role_name}
              </option>
            ))}
          </select>
        ) : (
          <div className={`text-sm ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
            No roles available
          </div>
        )}
      </div>

      {/* Error Message */}
      {invitationError && (
        <ErrorDisplay error={invitationError} theme={theme} />
      )}

      {/* Send Button */}
      <button
        onClick={handleSendInvitation}
        disabled={!email.trim() || !selectedRoleId || sendingInvitation}
        className={`${buttonClass} ${(!email.trim() || !selectedRoleId || sendingInvitation) ? 'opacity-50 cursor-not-allowed' : ''} flex items-center justify-center`}
      >
        {sendingInvitation ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
            Sending...
          </>
        ) : (
          'Send Invitation'
        )}
      </button>
    </div>
  );
}