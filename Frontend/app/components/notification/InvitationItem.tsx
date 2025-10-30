import { useState } from "react";
import { InvitationNotification } from "@/lib/projectAPI/TypeDefinitions";
import { Loader2 } from "lucide-react";
import { acceptInvitation, declineInvitation } from "@/lib/projectAPI/InvitationAPI";

interface InvitationItemProps {
  notification: InvitationNotification;
  userId: string;
  onAccepted: () => Promise<void> | void;
  onRefreshData: () => void;
  theme: string;
}

export function InvitationItem({
  notification,
  userId,
  onAccepted,
  onRefreshData,
  theme
}: InvitationItemProps) {
  const initialStatus = (notification.payload?.status ?? "pending").toLowerCase();
  const [currentStatus, setCurrentStatus] = useState<string>(initialStatus);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  const invitationId = notification.payload?.invitation_id as string | undefined;
  const projectName = notification.payload?.project_name || "Unknown Project";
  const roleName = notification.payload?.role_name || "Unknown Role";
  const inviterName = notification.payload?.invited_by_name || "Unknown User";
  const expiresAt = notification.payload?.expires_at;

  const isPending = currentStatus === "pending";

  const formatDate = (dateString?: string) => {
    if (!dateString) return "Unknown date";
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const handleAccept = async () => {
    if (!invitationId || !isPending || isProcessing) return;

    try {
      setIsProcessing(true);
      await acceptInvitation(invitationId, userId);
      setCurrentStatus("accepted");
      onRefreshData();
      await onAccepted();
    } catch (err) {
      console.error("Error accepting invitation:", err);
      alert("Failed to accept invitation. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDecline = async () => {
    if (!invitationId || !isPending || isProcessing) return;

    try {
      setIsProcessing(true);
      await declineInvitation(invitationId);
      setCurrentStatus("declined");
      onRefreshData();
    } catch (err) {
      console.error("Error declining invitation:", err);
      alert("Failed to decline invitation. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  const actionButtonClass = (variant: "accept" | "decline") => {
    const baseClass = "px-3 py-1.5 rounded-md text-sm font-medium transition-colors";

    if (!isPending) {
      return `${baseClass} cursor-not-allowed ${
        theme === "dark"
          ? "bg-transparent border border-gray-600 text-gray-400"
          : "bg-transparent border border-gray-300 text-gray-500"
      }`;
    }

    if (variant === "accept") {
      return `${baseClass} ${
        theme === "dark"
          ? "bg-indigo-600 hover:bg-indigo-700 text-white"
          : "bg-indigo-600 hover:bg-indigo-700 text-white"
      }`;
    }

    return `${baseClass} ${
      theme === "dark"
        ? "bg-transparent border border-gray-600 hover:bg-[#3A3A3E] text-gray-200"
        : "bg-transparent border border-gray-300 hover:bg-gray-100 text-gray-700"
    }`;
  };

  const statusBadge = () => {
    if (isPending) return null;

    const badgeClass =
      theme === "dark"
        ? "px-2 py-0.5 rounded-full text-xs font-semibold bg-[#3A3A3E] text-gray-100"
        : "px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-200 text-gray-700";

    const label = currentStatus === "accepted"
      ? "Accepted"
      : currentStatus === "declined"
      ? "Declined"
      : currentStatus === "expired"
      ? "Expired"
      : "Handled";

    return <span className={badgeClass}>{label}</span>;
  };

  const invitationItemClass = `
    p-4 border-b last:border-b-0
    ${theme === "dark" ? "border-[#3A3A3E] hover:bg-[#2A2A2E]" : "border-gray-100 hover:bg-gray-50"}
    transition-colors
  `;

  return (
    <div className={invitationItemClass}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-medium text-sm truncate">{projectName}</h3>
            {statusBadge()}
          </div>
          <p
            className={`text-xs mb-1 ${
              theme === "dark" ? "text-gray-300" : "text-gray-600"
            }`}
          >
            Role: <span className="font-medium">{roleName}</span>
          </p>
          <p
            className={`text-xs ${
              theme === "dark" ? "text-gray-400" : "text-gray-500"
            }`}
          >
            Invited by {inviterName} • Sent {formatDate(notification.created_at)}
          </p>
          {expiresAt && (
            <p
              className={`text-xs mt-1 ${
                theme === "dark" ? "text-gray-500" : "text-gray-500"
              }`}
            >
              Expires on {formatDate(expiresAt)}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <button
            onClick={handleAccept}
            className={actionButtonClass("accept")}
            disabled={!isPending || isProcessing}
          >
            {isProcessing && isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              "Accept"
            )}
          </button>
          <button
            onClick={handleDecline}
            className={actionButtonClass("decline")}
            disabled={!isPending || isProcessing}
          >
            {isProcessing && isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              "Decline"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
