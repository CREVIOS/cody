-- Enable UUID extension (required for gen_random_uuid())
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE Users (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name TEXT,
    avatar_url TEXT,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    last_login_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT check_user_status CHECK (status IN ('active', 'inactive', 'suspended'))
);

-- Create indexes for Users
CREATE INDEX idx_users_email ON Users (email);
CREATE INDEX idx_users_status ON Users (status);

-- Project organization and management
CREATE TABLE Projects (
    project_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_name TEXT NOT NULL,
    description TEXT,
    visibility TEXT DEFAULT 'private',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    modified_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    owner_id UUID NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    project_settings JSONB DEFAULT '{}',
    CONSTRAINT check_project_visibility CHECK (visibility IN ('public', 'private', 'team')),
    FOREIGN KEY (owner_id) REFERENCES Users(user_id) ON DELETE CASCADE
);

-- Create indexes for Projects
CREATE INDEX idx_projects_owner ON Projects (owner_id);
CREATE INDEX idx_projects_visibility ON Projects (visibility);
CREATE INDEX idx_projects_modified ON Projects (modified_at);

-- Fixed role system
CREATE TABLE Roles (
    role_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_name TEXT NOT NULL UNIQUE,
    description TEXT,
    permissions JSONB NOT NULL
);

-- Project membership with role-based access
CREATE TABLE Project_Members (
    project_member_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL,
    user_id UUID NOT NULL,
    role_id UUID NOT NULL,
    invited_by UUID,
    joined_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    last_activity TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    UNIQUE (project_id, user_id),
    FOREIGN KEY (project_id) REFERENCES Projects(project_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES Users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (role_id) REFERENCES Roles(role_id),
    FOREIGN KEY (invited_by) REFERENCES Users(user_id)
);

-- Create indexes for Project_Members
CREATE INDEX idx_project_members_project ON Project_Members (project_id);
CREATE INDEX idx_project_members_role ON Project_Members (role_id);
CREATE INDEX idx_project_members_activity ON Project_Members (last_activity);

-- Invitation system for project collaboration
CREATE TABLE Project_Invitations (
    invitation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL,
    email TEXT NOT NULL,
    user_id UUID,
    role_id UUID NOT NULL,
    invited_by UUID NOT NULL,
    token TEXT NOT NULL UNIQUE,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ NOT NULL,
    accepted_at TIMESTAMPTZ,
    CONSTRAINT check_invitation_status CHECK (status IN ('pending', 'accepted', 'declined', 'expired')),
    FOREIGN KEY (project_id) REFERENCES Projects(project_id) ON DELETE CASCADE,
    FOREIGN KEY (role_id) REFERENCES Roles(role_id),
    FOREIGN KEY (invited_by) REFERENCES Users(user_id)
);

-- Create indexes for Project_Invitations
CREATE INDEX idx_project_invitations_project ON Project_Invitations (project_id);
CREATE INDEX idx_project_invitations_token ON Project_Invitations (token);

-- Hierarchical directory structure
CREATE TABLE Directories (
    directory_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL,
    directory_name TEXT NOT NULL,
    parent_directory_id UUID,
    materialized_path TEXT,
    depth_level INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    modified_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_by UUID NOT NULL,
    FOREIGN KEY (project_id) REFERENCES Projects(project_id) ON DELETE CASCADE,
    FOREIGN KEY (parent_directory_id) REFERENCES Directories(directory_id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES Users(user_id)
);

-- Create indexes for Directories
CREATE INDEX idx_directories_project ON Directories (project_id);
CREATE INDEX idx_directories_parent ON Directories (parent_directory_id);
CREATE INDEX idx_directories_path ON Directories (materialized_path);

-- File type definitions
CREATE TABLE File_Types (
    file_type_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type_name TEXT UNIQUE NOT NULL,
    extension TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    icon_class TEXT,
    syntax_mode TEXT,
    is_executable BOOLEAN DEFAULT FALSE,
    is_binary BOOLEAN DEFAULT FALSE,
    default_content TEXT
);

-- Create index for File_Types
CREATE INDEX idx_file_types_extension ON File_Types (extension);

-- File management
CREATE TABLE Files (
    file_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL,
    file_name TEXT NOT NULL,
    file_type_id UUID,
    directory_id UUID NOT NULL,
    size_in_bytes INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    modified_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_by UUID NOT NULL,
    last_modified_by UUID NOT NULL,
    storage_link TEXT,
    UNIQUE (directory_id, file_name),
    FOREIGN KEY (project_id) REFERENCES Projects(project_id) ON DELETE CASCADE,
    FOREIGN KEY (directory_id) REFERENCES Directories(directory_id) ON DELETE CASCADE,
    FOREIGN KEY (file_type_id) REFERENCES File_Types(file_type_id),
    FOREIGN KEY (created_by) REFERENCES Users(user_id)
);

-- Create indexes for Files
CREATE INDEX idx_files_project ON Files (project_id);
CREATE INDEX idx_files_directory ON Files (directory_id);

-- Version control system
CREATE TABLE File_Versions (
    version_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id UUID NOT NULL,
    version_number INTEGER NOT NULL,
    version_link TEXT,
    size_in_bytes INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_by UUID NOT NULL,
    parent_version_id UUID,
    UNIQUE (file_id, version_number),
    FOREIGN KEY (file_id) REFERENCES Files(file_id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES Users(user_id),
    FOREIGN KEY (parent_version_id) REFERENCES File_Versions(version_id)
);

-- Create index for File_Versions
CREATE INDEX idx_file_versions_file_version ON File_Versions (file_id, version_number);

-- Code execution environments
CREATE TABLE Execution_Environments (
    environment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    environment_name TEXT NOT NULL,
    language TEXT NOT NULL,
    version TEXT,
    docker_image TEXT,
    base_packages JSONB,
    setup_commands JSONB,
    run_command_template TEXT,
    timeout_seconds INTEGER DEFAULT 30,
    persistent_storage BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Create index for Execution_Environments
CREATE INDEX idx_execution_environments_language ON Execution_Environments (language);

-- Terminal sessions
CREATE TABLE Terminal_Environments (
    terminal_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL,
    user_id UUID NOT NULL,
    environment_id UUID NOT NULL,
    container_id TEXT NOT NULL,
    websocket_id TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (project_id) REFERENCES Projects(project_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES Users(user_id),
    FOREIGN KEY (environment_id) REFERENCES Execution_Environments(environment_id)
);

-- Create index for Terminal_Environments
CREATE INDEX idx_terminal_environments_project ON Terminal_Environments (project_id);

-- User notifications
CREATE TABLE Notifications (
    notification_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    project_id UUID,
    notification_type TEXT NOT NULL,
    title TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    message TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT check_notification_type CHECK (notification_type IN ('invitation', 'file_change', 'member_added', 'deployment', 'mention')),
    FOREIGN KEY (user_id) REFERENCES Users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (project_id) REFERENCES Projects(project_id) ON DELETE CASCADE
);

-- Create index for Notifications
CREATE INDEX idx_notifications_user_read ON Notifications (user_id, is_read);

-- WebSocket connections
CREATE TABLE WebSocket_Connections (
    connection_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    websocket_id TEXT UNIQUE NOT NULL,
    project_id UUID,
    connection_type TEXT DEFAULT 'editor',
    connected_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    last_ping TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    client_info JSONB,
    CONSTRAINT check_connection_type CHECK (connection_type IN ('editor', 'terminal', 'preview')),
    FOREIGN KEY (user_id) REFERENCES Users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (project_id) REFERENCES Projects(project_id) ON DELETE SET NULL
);

-- Create index for WebSocket_Connections
CREATE INDEX idx_websocket_connections_user ON WebSocket_Connections (user_id);