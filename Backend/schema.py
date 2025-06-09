from pydantic import BaseModel, EmailStr, ConfigDict, field_validator, Field
from typing import Optional, List, Dict, Any, TypeVar, Generic, Union
from datetime import datetime
from uuid import UUID

# Base schemas
class BaseSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

# Generic type for paginated items
T = TypeVar('T')

# User Schemas
class UserBase(BaseSchema):
    username: str
    email: EmailStr
    full_name: Optional[str] = None
    avatar_url: Optional[str] = None
    status: str = "active"

class UserCreate(BaseSchema):
    username: str
    email: EmailStr
    password: str
    full_name: Optional[str] = None
    avatar_url: Optional[str] = None
    status: str = "active"

class UserUpdate(BaseSchema):
    username: Optional[str] = None
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    avatar_url: Optional[str] = None
    status: Optional[str] = None

class User(UserBase):
    user_id: UUID
    created_at: datetime
    last_login_at: Optional[datetime] = None

class UserWithProjects(User):
    owned_projects: List['Project'] = []

# Project Schemas
class ProjectBase(BaseSchema):
    project_name: str
    description: Optional[str] = None
    visibility: str = "private"
    project_settings: Dict[str, Any] = {}

class ProjectCreate(ProjectBase):
    owner_id: UUID

class ProjectUpdate(BaseSchema):
    project_name: Optional[str] = None
    description: Optional[str] = None
    visibility: Optional[str] = None
    project_settings: Optional[Dict[str, Any]] = None

class Project(ProjectBase):
    project_id: UUID
    owner_id: UUID
    is_active: bool
    created_at: datetime
    modified_at: Optional[datetime] = None

class ProjectWithOwner(Project):
    owner: User

# Role Schemas
class RoleBase(BaseSchema):
    role_name: str
    description: Optional[str] = None
    permissions: Union[List[str], Dict[str, Any]]

    @field_validator('permissions')
    @classmethod
    def convert_permissions_to_dict(cls, v):
        if isinstance(v, list):
            # Convert list of permissions to dictionary with True values
            return {perm: True for perm in v}
        return v

class RoleCreate(RoleBase):
    pass

class RoleUpdate(BaseSchema):
    role_name: Optional[str] = None
    description: Optional[str] = None
    permissions: Optional[Union[List[str], Dict[str, Any]]] = None

class Role(RoleBase):
    role_id: UUID

# Project Member Schemas
class ProjectMemberBase(BaseSchema):
    project_id: UUID
    user_id: UUID
    role_id: UUID
    invited_by: Optional[UUID] = None

class ProjectMemberCreate(ProjectMemberBase):
    pass

class ProjectMemberUpdate(BaseSchema):
    role_id: Optional[UUID] = None
    is_active: Optional[bool] = None

class ProjectMember(ProjectMemberBase):
    project_member_id: UUID
    joined_at: datetime
    last_activity: Optional[datetime] = None
    is_active: bool

# File Type Schemas
class FileTypeBase(BaseSchema):
    type_name: str
    extension: str
    mime_type: str
    icon_class: Optional[str] = None
    syntax_mode: Optional[str] = None
    is_executable: bool = False
    is_binary: bool = False
    default_content: Optional[str] = None

class FileTypeCreate(FileTypeBase):
    pass

class FileTypeUpdate(BaseSchema):
    type_name: Optional[str] = None
    extension: Optional[str] = None
    mime_type: Optional[str] = None
    icon_class: Optional[str] = None
    syntax_mode: Optional[str] = None
    is_executable: Optional[bool] = None
    is_binary: Optional[bool] = None
    default_content: Optional[str] = None

class FileType(FileTypeBase):
    file_type_id: UUID

# Directory Schemas
class DirectoryBase(BaseSchema):
    project_id: UUID
    directory_name: str
    parent_directory_id: Optional[UUID] = None
    materialized_path: Optional[str] = None
    depth_level: int = 0

class DirectoryCreate(DirectoryBase):
    created_by: UUID

class DirectoryUpdate(BaseSchema):
    directory_name: Optional[str] = None
    parent_directory_id: Optional[UUID] = None

class Directory(DirectoryBase):
    directory_id: UUID
    created_by: UUID
    created_at: datetime
    modified_at: Optional[datetime] = None

# File Schemas
class FileBase(BaseSchema):
    project_id: UUID
    file_name: str
    directory_id: UUID
    file_type_id: Optional[UUID] = None
    size_in_bytes: int = 0
    storage_link: Optional[str] = None

class FileCreate(FileBase):
    created_by: UUID
    last_modified_by: UUID

class FileUpdate(BaseSchema):
    file_name: Optional[str] = None
    directory_id: Optional[UUID] = None
    file_type_id: Optional[UUID] = None
    size_in_bytes: Optional[int] = None
    storage_link: Optional[str] = None
    last_modified_by: Optional[UUID] = None

class File(FileBase):
    file_id: UUID
    created_by: UUID
    last_modified_by: UUID
    created_at: datetime
    modified_at: Optional[datetime] = None

# Pagination Schema
class PaginationParams(BaseSchema):
    skip: int = 0
    limit: int = 100

class PaginatedResponse(BaseSchema, Generic[T]):
    items: List[T]
    total: int
    page: int
    size: int
    pages: int

# File Version Schemas
class FileVersionBase(BaseSchema):
    file_id: UUID
    version_number: int
    version_link: str
    size_in_bytes: int
    parent_version_id: Optional[UUID] = None

class FileVersionCreate(FileVersionBase):
    created_by: UUID

class FileVersionUpdate(BaseModel):
    file_id: Optional[UUID] = None
    version_number: Optional[int] = None
    version_link: Optional[str] = None
    size_in_bytes: Optional[int] = None
    parent_version_id: Optional[UUID] = None

class FileVersion(FileVersionBase):
    version_id: UUID
    created_at: datetime
    created_by: UUID

    class Config:
        from_attributes = True

# Notification Schemas
class NotificationBase(BaseSchema):
    user_id: UUID
    project_id: Optional[UUID] = None
    notification_type: str
    title: str
    message: Optional[str] = None

class NotificationCreate(NotificationBase):
    pass

class NotificationUpdate(BaseSchema):
    notification_type: Optional[str] = None
    title: Optional[str] = None
    message: Optional[str] = None
    is_read: Optional[bool] = None

class Notification(NotificationBase):
    notification_id: UUID
    created_at: datetime

    class Config:
        from_attributes = True

# Project Invitation Schemas
class ProjectInvitationBase(BaseSchema):
    project_id: UUID
    email: EmailStr
    role_id: UUID
    user_id: Optional[UUID] = None
    expires_at: Optional[datetime] = None

class ProjectInvitationCreate(BaseSchema):
    project_id: UUID
    email: EmailStr
    role_id: UUID
    invited_by: UUID
    user_id: Optional[UUID] = None
    token: Optional[str] = Field(None, description="Auto-generated if not provided")
    expires_at: Optional[datetime] = Field(None, description="Auto-generated if not provided")

class ProjectInvitationUpdate(BaseSchema):
    status: Optional[str] = None
    user_id: Optional[UUID] = None
    accepted_at: Optional[datetime] = None

class ProjectInvitation(ProjectInvitationBase):
    invitation_id: UUID
    invited_by: UUID
    token: str
    status: str
    created_at: datetime
    expires_at: datetime
    accepted_at: Optional[datetime] = None

class ProjectInvitationWithDetails(ProjectInvitation):
    project: Project
    role: Role
    inviter: User

class AcceptInvitationRequest(BaseSchema):
    user_id: UUID

class ProjectWithRole(BaseSchema):
    project: Project
    role: str

class UserProjectsResponse(BaseSchema):
    user: User
    owned_projects: List[Project]
    member_projects: List[ProjectWithRole]
    
    

class AcceptInvitationRequest(BaseSchema):
    user_id: UUID
    

