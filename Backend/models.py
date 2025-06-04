import uuid
from datetime import datetime
from sqlalchemy import (
    Column, String, Text, Integer, Boolean, DateTime, ForeignKey,
    func, UniqueConstraint, Index, CheckConstraint
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from db import Base

# Users Model
class User(Base):
    __tablename__ = "users"

    user_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    username = Column(String(50), nullable=False, unique=True)
    email = Column(String(255), nullable=False, unique=True, index=True)
    password_hash = Column(String(255), nullable=False)
    full_name = Column(String(255))
    avatar_url = Column(Text)
    status = Column(String(20), default="active")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_login_at = Column(DateTime(timezone=True))

    # Relationships
    owned_projects = relationship("Project", back_populates="owner", cascade="all, delete-orphan")
    memberships = relationship("ProjectMember", back_populates="user", foreign_keys="ProjectMember.user_id")
    terminals = relationship("TerminalEnvironment", back_populates="user")
    notifications = relationship("Notification", back_populates="user")
    websocket_conns = relationship("WebSocketConnection", back_populates="user")

    __table_args__ = (
        CheckConstraint("status IN ('active', 'inactive', 'suspended')", name="check_user_status"),
        Index("idx_email", "email"),
        Index("idx_status", "status"),
    )

# Projects Model
class Project(Base):
    __tablename__ = "projects"

    project_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_name = Column(String(120), nullable=False)
    description = Column(Text)
    visibility = Column(String(20), default="private")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    modified_at = Column(DateTime(timezone=True), onupdate=func.now())
    owner_id = Column(UUID(as_uuid=True), ForeignKey("users.user_id"), nullable=False)
    is_active = Column(Boolean, default=True)
    # FIXED: Use lambda for JSONB default to avoid serialization issues
    project_settings = Column(JSONB, default=lambda: {})

    # Relationships
    owner = relationship("User", back_populates="owned_projects")
    members = relationship("ProjectMember", back_populates="project", cascade="all, delete-orphan")
    invitations = relationship("ProjectInvitation", back_populates="project", cascade="all, delete-orphan")
    directories = relationship("Directory", back_populates="project", cascade="all, delete-orphan")
    files = relationship("File", back_populates="project", cascade="all, delete-orphan")
    terminals = relationship("TerminalEnvironment", back_populates="project")
    notifications = relationship("Notification", back_populates="project")

    __table_args__ = (
        CheckConstraint("visibility IN ('public', 'private', 'team')", name="check_project_visibility"),
        Index("idx_owner", "owner_id"),
        Index("idx_visibility", "visibility"),
        Index("idx_modified", "modified_at"),
    )

# Roles Model
class Role(Base):
    __tablename__ = "roles"

    role_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    role_name = Column(String(50), nullable=False, unique=True)
    description = Column(Text)
    # FIXED: Use lambda for JSONB default
    permissions = Column(JSONB, nullable=False, default=lambda: {})

    # Relationships
    members = relationship("ProjectMember", back_populates="role")
    invitations = relationship("ProjectInvitation", back_populates="role")

# Project Members Model
class ProjectMember(Base):
    __tablename__ = "project_members"

    project_member_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.project_id"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.user_id"), nullable=False)
    role_id = Column(UUID(as_uuid=True), ForeignKey("roles.role_id"), nullable=False)
    invited_by = Column(UUID(as_uuid=True), ForeignKey("users.user_id"))
    joined_at = Column(DateTime(timezone=True), server_default=func.now())
    last_activity = Column(DateTime(timezone=True))
    is_active = Column(Boolean, default=True)

    # Relationships
    project = relationship("Project", back_populates="members")
    user = relationship("User", back_populates="memberships", foreign_keys=[user_id])
    role = relationship("Role", back_populates="members")
    inviter = relationship("User", foreign_keys=[invited_by])

    __table_args__ = (
        UniqueConstraint("project_id", "user_id", name="uq_member_once_per_project"),
        Index("idx_project", "project_id"),
        Index("idx_role", "role_id"),
        Index("idx_activity", "last_activity"),
    )

# Project Invitations Model
class ProjectInvitation(Base):
    __tablename__ = "project_invitations"

    invitation_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.project_id"), nullable=False)
    email = Column(String(255), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.user_id"))
    role_id = Column(UUID(as_uuid=True), ForeignKey("roles.role_id"), nullable=False)
    invited_by = Column(UUID(as_uuid=True), ForeignKey("users.user_id"), nullable=False)
    token = Column(String(255), nullable=False, unique=True)
    status = Column(String(20), default="pending")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    expires_at = Column(DateTime(timezone=True), nullable=False)
    accepted_at = Column(DateTime(timezone=True))

    # Relationships
    project = relationship("Project", back_populates="invitations")
    role = relationship("Role", back_populates="invitations")
    inviter = relationship("User", foreign_keys=[invited_by])
    user = relationship("User", foreign_keys=[user_id])

    __table_args__ = (
        CheckConstraint("status IN ('pending', 'accepted', 'declined', 'expired')", name="check_invitation_status"),
        Index("idx_project", "project_id"),
        Index("idx_token", "token"),
    )

# Directories Model
class Directory(Base):
    __tablename__ = "directories"

    directory_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.project_id"), nullable=False)
    directory_name = Column(String(120), nullable=False)
    parent_directory_id = Column(UUID(as_uuid=True), ForeignKey("directories.directory_id"))
    materialized_path = Column(Text)
    depth_level = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    modified_at = Column(DateTime(timezone=True), onupdate=func.now())
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.user_id"), nullable=False)

    # Relationships
    project = relationship("Project", back_populates="directories")
    creator = relationship("User")
    parent = relationship("Directory", remote_side=[directory_id], backref="children")
    files = relationship("File", back_populates="directory", cascade="all, delete-orphan")

    __table_args__ = (
        Index("idx_project", "project_id"),
        Index("idx_parent", "parent_directory_id"),
        Index("idx_path", "materialized_path"),
    )

# File Types Model
class FileType(Base):
    __tablename__ = "file_types"

    file_type_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    type_name = Column(String(80), nullable=False, unique=True)
    extension = Column(String(20), nullable=False)
    mime_type = Column(String(120), nullable=False)
    icon_class = Column(String(120))
    syntax_mode = Column(String(80))
    is_executable = Column(Boolean, default=False)
    is_binary = Column(Boolean, default=False)
    default_content = Column(Text)

    # Relationships
    files = relationship("File", back_populates="file_type")

    __table_args__ = (
        Index("idx_extension", "extension"),
    )

# Files Model
class File(Base):
    __tablename__ = "files"

    file_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.project_id"), nullable=False)
    file_name = Column(String(255), nullable=False)
    file_type_id = Column(UUID(as_uuid=True), ForeignKey("file_types.file_type_id"))
    directory_id = Column(UUID(as_uuid=True), ForeignKey("directories.directory_id"), nullable=False)
    size_in_bytes = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    modified_at = Column(DateTime(timezone=True), onupdate=func.now())
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.user_id"), nullable=False)
    last_modified_by = Column(UUID(as_uuid=True), ForeignKey("users.user_id"), nullable=False)
    storage_link = Column(Text)

    # Relationships
    project = relationship("Project", back_populates="files")
    directory = relationship("Directory", back_populates="files")
    file_type = relationship("FileType", back_populates="files")
    creator = relationship("User", foreign_keys=[created_by])
    modifier = relationship("User", foreign_keys=[last_modified_by])
    versions = relationship("FileVersion", back_populates="file", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("directory_id", "file_name", name="uq_file_name_in_directory"),
        Index("idx_project", "project_id"),
        Index("idx_directory", "directory_id"),
    )

# File Versions Model
class FileVersion(Base):
    __tablename__ = "file_versions"

    version_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    file_id = Column(UUID(as_uuid=True), ForeignKey("files.file_id", ondelete="CASCADE"), nullable=False)
    version_number = Column(Integer, nullable=False)
    version_link = Column(String)
    size_in_bytes = Column(Integer, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.user_id"), nullable=False)
    parent_version_id = Column(UUID(as_uuid=True), ForeignKey("file_versions.version_id"))

    # Relationships
    file = relationship("File", back_populates="versions")
    creator = relationship("User", foreign_keys=[created_by])
    parent_version = relationship("FileVersion", remote_side=[version_id], backref="child_versions")

    __table_args__ = (
        UniqueConstraint("file_id", "version_number", name="uq_version_per_file"),
        Index("idx_file_version", "file_id", "version_number"),
    )

# Execution Environments Model
class ExecutionEnvironment(Base):
    __tablename__ = "execution_environments"

    environment_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    environment_name = Column(String(120), nullable=False)
    language = Column(String(40), nullable=False)
    version = Column(String(40))
    docker_image = Column(String(255))
    # FIXED: Use lambda for JSONB defaults
    base_packages = Column(JSONB, default=lambda: [])
    setup_commands = Column(JSONB, default=lambda: [])
    run_command_template = Column(String(255))
    timeout_seconds = Column(Integer, default=30)
    persistent_storage = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    terminals = relationship("TerminalEnvironment", back_populates="environment")

    __table_args__ = (
        Index("idx_language", "language"),
    )

# Terminal Environments Model
class TerminalEnvironment(Base):
    __tablename__ = "terminal_environments"

    terminal_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.project_id"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.user_id"), nullable=False)
    environment_id = Column(UUID(as_uuid=True), ForeignKey("execution_environments.environment_id"), nullable=False)
    container_id = Column(String(100), nullable=False)
    websocket_id = Column(String(100), nullable=False)
    is_active = Column(Boolean, default=True)

    # Relationships
    project = relationship("Project", back_populates="terminals")
    user = relationship("User", back_populates="terminals")
    environment = relationship("ExecutionEnvironment", back_populates="terminals")

    __table_args__ = (
        Index("idx_project", "project_id"),
    )

# Notifications Model
class Notification(Base):
    __tablename__ = "notifications"

    notification_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.user_id"), nullable=False)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.project_id"))
    notification_type = Column(String(50), nullable=False)
    title = Column(String(255), nullable=False)
    message = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    user = relationship("User", back_populates="notifications")
    project = relationship("Project", back_populates="notifications")

    __table_args__ = (
        CheckConstraint("notification_type IN ('invitation', 'file_change', 'member_added', 'deployment', 'mention')", 
                       name="check_notification_type"),
    )

# WebSocket Connections Model
class WebSocketConnection(Base):
    __tablename__ = "websocket_connections"

    connection_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.user_id"), nullable=False)
    websocket_id = Column(String(100), nullable=False, unique=True)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.project_id"))
    connection_type = Column(String(50), default="editor")
    connected_at = Column(DateTime(timezone=True), server_default=func.now())
    last_ping = Column(DateTime(timezone=True))
    is_active = Column(Boolean, default=True)
    # FIXED: Use lambda for JSONB default
    client_info = Column(JSONB, default=lambda: {})

    # Relationships
    user = relationship("User", back_populates="websocket_conns")
    project = relationship("Project")

    __table_args__ = (
        CheckConstraint("connection_type IN ('editor', 'terminal', 'preview')", name="check_connection_type"),
        Index("idx_user", "user_id"),
    )

