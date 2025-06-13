import { ProjectInvitationWithDetails } from "@/lib/projectAPI/TypeDefinitions";
import { Project } from "@/lib/projectAPI/TypeDefinitions";
import { InvitationItem } from "./InvitationItem";

interface InvitationListProps {
    invitations: ProjectInvitationWithDetails[];
    userId: string;
    onInvitationAccepted: (projectId: string, projectData?: { project: Project; role: string }) => void;
    onRefreshData: () => void;
    theme: string;
  }
  
export function InvitationList({ 
    invitations, 
    userId, 
    onInvitationAccepted, 
    onRefreshData, 
    theme 
  }: InvitationListProps) {
    return (
      <div>
        {invitations.map((invitation) => (
          <InvitationItem
            key={invitation.invitation_id}
            invitation={invitation}
            userId={userId}
            onAccepted={onInvitationAccepted}
            onRefreshData={onRefreshData}
            theme={theme}
          />
        ))}
      </div>
    );
  }

  