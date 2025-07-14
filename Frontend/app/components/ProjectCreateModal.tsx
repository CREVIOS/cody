'use client';

import { useState } from "react";
import { useTheme } from "@/context/ThemeContext";
import { useRoles } from "@/context/RolesContext";
import { createProject } from "@/lib/projectAPI/ProjectAPI";
import { createProjectMember } from "@/lib/projectAPI/ProjectMembersAPI";
import { Project, User } from "@/lib/projectAPI/TypeDefinitions";
import { Loader2, X } from "lucide-react";

interface ProjectCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProjectCreated: (project: Project) => void;
  user: User;
}

export default function ProjectCreateModal({
  isOpen,
  onClose,
  onProjectCreated,
  user,
}: ProjectCreateModalProps) {
  const { theme } = useTheme();
  const { roles } = useRoles();
  
  const [projectName, setProjectName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState("private");
  const [projectSettings, setProjectSettings] = useState<Record<string, any>>({});
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Theme classes
  const backgroundClass = theme === "dark" 
    ? "bg-[#212124] text-[#E0E0E0]" 
    : "bg-[#F5F5F0] text-[#2D2D2D]";

  const modalClass = theme === "dark"
    ? "bg-[#2A2A2E] border-[#3A3A3E]"
    : "bg-white border-gray-300";

  const inputClass = theme === "dark"
    ? "bg-[#2A2A2E] border-[#3A3A3E] focus:border-indigo-500/50 text-[#E0E0E0]"
    : "bg-white border-gray-300 focus:border-indigo-500 text-[#2D2D2D]";

  const buttonPrimaryClass = theme === "dark"
    ? "bg-indigo-500/30 text-indigo-200 hover:bg-indigo-500/40"
    : "bg-indigo-500/80 text-white hover:bg-indigo-600";

  const buttonSecondaryClass = theme === "dark"
    ? "bg-[#3A3A3E] text-[#E0E0E0] hover:bg-[#4A4A4E]"
    : "bg-gray-200 text-gray-700 hover:bg-gray-300";

  const borderClass = theme === "dark" ? "border-[#3A3A3E]" : "border-gray-200";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!projectName.trim()) {
      setError("Project name is required");
      return;
    }

    try {
      setIsCreating(true);
      setError(null);

      // Find the owner role
      const ownerRole = roles.find(role => role.role_name.toLowerCase() === 'owner');
      if (!ownerRole) {
        throw new Error('Owner role not found in the system');
      }

      // Create the project
      const projectData = {
        project_name: projectName.trim(),
        description: description.trim() || undefined,
        visibility,
        project_settings: projectSettings,
        owner_id: user.user_id,
      };

      const createdProject = await createProject(projectData);

      // Create project member entry (owner)
      const memberData = {
        project_id: createdProject.project_id,
        user_id: user.user_id,
        role_id: ownerRole.role_id,
        // invited_by is null for owner as mentioned in the requirements
      };

      await createProjectMember(memberData);

      // Reset form
      setProjectName("");
      setDescription("");
      setVisibility("private");
      setProjectSettings({});
      
      // Call success callback
      onProjectCreated(createdProject);
      onClose();
    } catch (error: any) {
      console.error('Error creating project:', error);
      setError(error.message || 'Failed to create project. Please try again.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleClose = () => {
    if (!isCreating) {
      setProjectName("");
      setDescription("");
      setVisibility("private");
      setProjectSettings({});
      setError(null);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className={`w-full max-w-md rounded-xl shadow-xl border ${modalClass}`}>
        {/* Header */}
        <div className={`flex items-center justify-between p-6 border-b ${borderClass}`}>
          <h2 className="text-xl font-semibold">Create New Project</h2>
          <button
            onClick={handleClose}
            disabled={isCreating}
            className={`p-2 rounded-full ${buttonSecondaryClass} transition-colors`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Project Name */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Project Name *
            </label>
            <input
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="Enter project name..."
              className={`w-full px-3 py-2 rounded-lg border ${inputClass} focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all`}
              disabled={isCreating}
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Enter project description (optional)..."
              rows={3}
              className={`w-full px-3 py-2 rounded-lg border ${inputClass} focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all resize-none`}
              disabled={isCreating}
            />
          </div>

          {/* Visibility */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Visibility
            </label>
            <select
              value={visibility}
              onChange={(e) => setVisibility(e.target.value)}
              className={`w-full px-3 py-2 rounded-lg border ${inputClass} focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all`}
              disabled={isCreating}
            >
              <option value="private">Private</option>
              <option value="team">Team</option>
              <option value="public">Public</option>
            </select>
          </div>

          {/* Error Message */}
          {error && (
            <div className={`p-3 rounded-lg text-sm ${
              theme === "dark" 
                ? "bg-red-900/20 text-red-400 border border-red-800/50" 
                : "bg-red-100 text-red-700"
            }`}>
              {error}
            </div>
          )}

          {/* Buttons */}
          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={handleClose}
              disabled={isCreating}
              className={`px-4 py-2 rounded-lg ${buttonSecondaryClass} transition-all text-sm font-medium`}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isCreating || !projectName.trim()}
              className={`px-4 py-2 rounded-lg ${buttonPrimaryClass} transition-all text-sm font-medium flex items-center space-x-2 ${
                (isCreating || !projectName.trim()) ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              {isCreating && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>{isCreating ? 'Creating...' : 'Create Project'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
} 