import { Skeleton } from "@/components/ui/skeleton";
import { ProjectWithRole, User } from "@/lib/projectAPI/TypeDefinitions";
import { useRoles } from "@/context/RolesContext";

interface ProjectListProps {
  projects: ProjectWithRole[];
  loadingProjects: boolean;
  rolesLoading: boolean;
  projectsError: string | null;
  user: User;
  onOpenProject: (project: ProjectWithRole) => void;
  onDeleteProject: (projectId: string) => void;
  onNewProject: () => void;
  theme: string;
  cardBgClass: string;
  borderClass: string;
  buttonClass: string;
  projectItemClass: string;
}

export function ProjectList({ 
  projects, 
  loadingProjects, 
  rolesLoading, 
  projectsError, 
  user, 
  onOpenProject, 
  onDeleteProject, 
  onNewProject, 
  theme, 
  cardBgClass, 
  borderClass, 
  buttonClass, 
  projectItemClass 
}: ProjectListProps) {
  const { getRoleNameById } = useRoles();

  if (loadingProjects || rolesLoading) {
    return (
      <div className={`w-full ${cardBgClass} rounded-2xl shadow-lg p-4 md:p-6 overflow-y-auto max-h-[60vh] md:max-h-[70vh] border ${borderClass}`}>
        <ul className="space-y-2">
          {[...Array(5)].map((_, index) => (
            <li key={index} className={`flex items-center gap-4 p-4 rounded-full ${projectItemClass}`}>
              <Skeleton className="h-8 w-8 rounded-full" />
              <Skeleton className="h-4 w-3/4 rounded" />
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (projectsError) {
    return (
      <div className={`w-full ${cardBgClass} rounded-2xl shadow-lg p-4 md:p-6 overflow-y-auto max-h-[60vh] md:max-h-[70vh] border ${borderClass}`}>
        <div className="text-center py-8">
          <p className="text-red-500 mb-4">{projectsError}</p>
          <button onClick={() => window.location.reload()} className={`px-4 py-2 ${buttonClass} rounded-lg text-sm`}>Retry</button>
        </div>
      </div>
    );
  }

  if (projects?.length === 0) {
    return (
      <div className={`w-full ${cardBgClass} rounded-2xl shadow-lg p-4 md:p-6 overflow-y-auto max-h-[60vh] md:max-h-[70vh] border ${borderClass}`}>
        <div className="text-center py-8 text-gray-500">
          <p className="mb-4">No projects found</p>
          <button onClick={onNewProject} className={`px-4 py-2 ${buttonClass} rounded-lg text-sm`}>Create Your First Project</button>
        </div>
      </div>
    );
  }

  return (
    <div className={`w-full ${cardBgClass} rounded-2xl shadow-lg p-4 md:p-6 overflow-y-auto max-h-[60vh] md:max-h-[70vh] border ${borderClass}`}>
      <div className="space-y-6">
        {projects?.map((project) => {
          if (!project?.project_id || !project?.role_id) {
            console.warn('Invalid project data:', project);
            return null;
          }
          
          return (
            <div key={project.project_id} className={`flex items-center gap-4 p-4 rounded-full ${projectItemClass} transition-colors cursor-pointer group`} onClick={() => onOpenProject(project)}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${theme === "dark" ? "bg-indigo-500/30 text-indigo-200" : "bg-indigo-100 text-indigo-700"}`}>
                {(project.project_name || 'Untitled').charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <span className="truncate block font-medium">{project.project_name || 'Untitled Project'}</span>
                <span className="text-xs opacity-70">
                  Role: {project.role_id === 'unknown' ? 'Unknown Role' : getRoleNameById(project.role_id)} • 
                  Last modified: {new Date(project.modified_at || project.created_at).toLocaleDateString()}
                </span>
              </div>
              {/* Only show delete button for owners */}
              {project.owner_id === user.user_id && (
                <button 
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    onDeleteProject(project.project_id); 
                  }} 
                  className={`opacity-0 group-hover:opacity-100 transition-opacity p-2 rounded-full ${theme === "dark" ? "hover:bg-red-900/30 text-red-400" : "hover:bg-red-100 text-red-600"}`} 
                  title="Delete project"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}