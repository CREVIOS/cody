// Project Persistence Service
"use client";

export interface ProjectSession {
  projectId: string;
  projectName: string;
  lastAccessed: string;
  openFiles: string[];
  selectedFile: string | null;
  expandedFolders: string[];
}

export class ProjectPersistenceService {
  private static readonly STORAGE_KEY = 'vscode-projects';
  private static readonly CURRENT_PROJECT_KEY = 'vscode-current-project';
  private static readonly MAX_RECENT_PROJECTS = 10;

  // Save project session
  static saveProjectSession(session: ProjectSession): void {
    try {
      const sessions = this.getAllSessions();
      const existingIndex = sessions.findIndex(s => s.projectId === session.projectId);
      
      if (existingIndex >= 0) {
        sessions[existingIndex] = session;
      } else {
        sessions.unshift(session);
      }

      // Limit to max recent projects
      if (sessions.length > this.MAX_RECENT_PROJECTS) {
        sessions.splice(this.MAX_RECENT_PROJECTS);
      }

      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(sessions));
      localStorage.setItem(this.CURRENT_PROJECT_KEY, session.projectId);
    } catch (error) {
      console.error('Failed to save project session:', error);
    }
  }

  // Load project session
  static loadProjectSession(projectId: string): ProjectSession | null {
    try {
      const sessions = this.getAllSessions();
      return sessions.find(s => s.projectId === projectId) || null;
    } catch (error) {
      console.error('Failed to load project session:', error);
      return null;
    }
  }

  // Get all saved sessions
  static getAllSessions(): ProjectSession[] {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Failed to load sessions:', error);
      return [];
    }
  }

  // Get current project ID
  static getCurrentProjectId(): string | null {
    try {
      return localStorage.getItem(this.CURRENT_PROJECT_KEY);
    } catch (error) {
      console.error('Failed to get current project:', error);
      return null;
    }
  }

  // Set current project ID
  static setCurrentProjectId(projectId: string): void {
    try {
      localStorage.setItem(this.CURRENT_PROJECT_KEY, projectId);
    } catch (error) {
      console.error('Failed to set current project:', error);
    }
  }

  // Remove project session
  static removeProjectSession(projectId: string): void {
    try {
      const sessions = this.getAllSessions();
      const filtered = sessions.filter(s => s.projectId !== projectId);
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(filtered));
      
      if (this.getCurrentProjectId() === projectId) {
        localStorage.removeItem(this.CURRENT_PROJECT_KEY);
      }
    } catch (error) {
      console.error('Failed to remove project session:', error);
    }
  }

  // Clear all sessions
  static clearAllSessions(): void {
    try {
      localStorage.removeItem(this.STORAGE_KEY);
      localStorage.removeItem(this.CURRENT_PROJECT_KEY);
    } catch (error) {
      console.error('Failed to clear sessions:', error);
    }
  }

  // Save file state (open files, selected file, etc.)
  static saveFileState(projectId: string, openFiles: string[], selectedFile: string | null, expandedFolders: string[]): void {
    try {
      const session = this.loadProjectSession(projectId);
      if (session) {
        session.openFiles = openFiles;
        session.selectedFile = selectedFile;
        session.expandedFolders = expandedFolders;
        session.lastAccessed = new Date().toISOString();
        this.saveProjectSession(session);
      }
    } catch (error) {
      console.error('Failed to save file state:', error);
    }
  }

  // Auto-save functionality
  static setupAutoSave(projectId: string, getState: () => { openFiles: string[]; selectedFile: string | null; expandedFolders: string[] }): () => void {
    const interval = setInterval(() => {
      const state = getState();
      this.saveFileState(projectId, state.openFiles, state.selectedFile, state.expandedFolders);
    }, 30000); // Auto-save every 30 seconds

    return () => clearInterval(interval);
  }
}
