from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, update, delete
from sqlalchemy.orm import selectinload
from typing import Optional, List, Type, TypeVar, Generic, Dict, Any, Union
from uuid import UUID
from pydantic import BaseModel
import models
import schema as schemas

ModelType = TypeVar("ModelType", bound=models.Base)
CreateSchemaType = TypeVar("CreateSchemaType", bound=BaseModel)
UpdateSchemaType = TypeVar("UpdateSchemaType", bound=BaseModel)

class CRUDBase(Generic[ModelType, CreateSchemaType, UpdateSchemaType]):
    def __init__(self, model: Type[ModelType]):
        self.model = model

    def _get_id_field(self):
        """Get the primary key field name for the model"""
        # Map model class names to their ID field names
        id_mapping = {
            'User': 'user_id',
            'Project': 'project_id', 
            'Role': 'role_id',
            'ProjectMember': 'project_member_id',
            'FileType': 'file_type_id',
            'Directory': 'directory_id',
            'File': 'file_id',
            'FileVersion': 'version_id',
            'ExecutionEnvironment': 'environment_id',
            'TerminalEnvironment': 'terminal_id',
            'Notification': 'notification_id',
            'WebSocketConnection': 'connection_id',
            'ProjectInvitation': 'invitation_id'
        }
        return id_mapping.get(self.model.__name__, 'id')

    async def get(self, db: AsyncSession, id: UUID) -> Optional[ModelType]:
        id_field = self._get_id_field()
        result = await db.execute(
            select(self.model).where(getattr(self.model, id_field) == id)
        )
        return result.scalar_one_or_none()

    async def get_by_project_and_user(self, db: AsyncSession, *, project_id: UUID, user_id: UUID) -> Optional[ModelType]:
        """Get a project member by project ID and user ID"""
        result = await db.execute(
            select(self.model)
            .where(self.model.project_id == project_id)
            .where(self.model.user_id == user_id)
        )
        return result.scalar_one_or_none()

    async def get_multi(
        self, 
        db: AsyncSession, 
        *, 
        skip: int = 0, 
        limit: int = 100,
        **filters
    ) -> List[ModelType]:
        query = select(self.model)
        
        # Apply filters
        for key, value in filters.items():
            if hasattr(self.model, key) and value is not None:
                query = query.where(getattr(self.model, key) == value)
        
        query = query.offset(skip).limit(limit)
        result = await db.execute(query)
        return result.scalars().all()

    async def create(self, db: AsyncSession, *, obj_in: Union[CreateSchemaType, Dict[str, Any]]) -> ModelType:
        if isinstance(obj_in, dict):
            obj_data = obj_in
        else:
            obj_data = obj_in.model_dump()
        db_obj = self.model(**obj_data)
        db.add(db_obj)
        await db.commit()
        
        # Try to refresh the object, but if it fails, reload it from the database
        try:
            await db.refresh(db_obj)
            return db_obj
        except Exception:
            # If refresh fails, reload the object from the database
            id_field = self._get_id_field()
            obj_id = getattr(db_obj, id_field)
            refreshed_obj = await self.get(db, id=obj_id)
            return refreshed_obj if refreshed_obj else db_obj

    async def update(
        self, 
        db: AsyncSession, 
        *, 
        db_obj: ModelType, 
        obj_in: UpdateSchemaType
    ) -> ModelType:
        obj_data = obj_in.model_dump(exclude_unset=True)
        for field, value in obj_data.items():
            setattr(db_obj, field, value)
        
        db.add(db_obj)
        await db.commit()
        
        # Try to refresh the object, but if it fails, reload it from the database
        try:
            await db.refresh(db_obj)
            return db_obj
        except Exception:
            # If refresh fails, reload the object from the database
            id_field = self._get_id_field()
            obj_id = getattr(db_obj, id_field)
            refreshed_obj = await self.get(db, id=obj_id)
            return refreshed_obj if refreshed_obj else db_obj

    async def remove(self, db: AsyncSession, *, id: UUID) -> Optional[ModelType]:
        obj = await self.get(db, id)
        if obj:
            await db.delete(obj)
            await db.commit()
        return obj

    async def count(self, db: AsyncSession, **filters) -> int:
        query = select(func.count()).select_from(self.model)
        
        # Apply filters
        for key, value in filters.items():
            if hasattr(self.model, key) and value is not None:
                query = query.where(getattr(self.model, key) == value)
        
        result = await db.execute(query)
        return result.scalar()

# Specific CRUD classes
class CRUDUser(CRUDBase[models.User, schemas.UserCreate, schemas.UserUpdate]):
    async def get_by_email(self, db: AsyncSession, *, email: str) -> Optional[models.User]:
        result = await db.execute(select(self.model).where(self.model.email == email))
        return result.scalar_one_or_none()

    async def get_by_username(self, db: AsyncSession, *, username: str) -> Optional[models.User]:
        result = await db.execute(select(self.model).where(self.model.username == username))
        return result.scalar_one_or_none()

class CRUDProject(CRUDBase[models.Project, schemas.ProjectCreate, schemas.ProjectUpdate]):
    async def get_by_owner(self, db: AsyncSession, *, owner_id: UUID) -> List[models.Project]:
        result = await db.execute(
            select(self.model)
            .where(self.model.owner_id == owner_id)
            .options(selectinload(self.model.owner))
        )
        return result.scalars().all()

class CRUDRole(CRUDBase[models.Role, schemas.RoleCreate, schemas.RoleUpdate]):
    async def get_by_name(self, db: AsyncSession, *, role_name: str) -> Optional[models.Role]:
        result = await db.execute(select(self.model).where(self.model.role_name == role_name))
        return result.scalar_one_or_none()

class CRUDFileType(CRUDBase[models.FileType, schemas.FileTypeCreate, schemas.FileTypeUpdate]):
    async def get_by_name(self, db: AsyncSession, *, type_name: str) -> Optional[models.FileType]:
        result = await db.execute(select(self.model).where(self.model.type_name == type_name))
        return result.scalar_one_or_none()

class CRUDFileVersion(CRUDBase[models.FileVersion, schemas.FileVersionCreate, schemas.FileVersionUpdate]):
    pass

class CRUDProjectMember(CRUDBase[models.ProjectMember, schemas.ProjectMemberCreate, schemas.ProjectMemberUpdate]):
    async def get_by_user(self, db: AsyncSession, *, user_id: UUID) -> List[models.ProjectMember]:
        result = await db.execute(
            select(self.model)
            .where(self.model.user_id == user_id)
            .where(self.model.is_active == True)
            .options(selectinload(self.model.project), selectinload(self.model.role))
        )
        return result.scalars().all()

class CRUDProjectInvitation(CRUDBase[models.ProjectInvitation, schemas.ProjectInvitationCreate, schemas.ProjectInvitationUpdate]):
    async def get_by_token(self, db: AsyncSession, *, token: str) -> Optional[models.ProjectInvitation]:
        result = await db.execute(
            select(self.model)
            .where(self.model.token == token)
            .options(
                selectinload(self.model.project),
                selectinload(self.model.role),
                selectinload(self.model.inviter)
            )
        )
        return result.scalar_one_or_none()

    async def get_by_project(self, db: AsyncSession, *, project_id: UUID) -> List[models.ProjectInvitation]:
        result = await db.execute(
            select(self.model)
            .where(self.model.project_id == project_id)
            .options(
                selectinload(self.model.project),
                selectinload(self.model.role),
                selectinload(self.model.inviter)
            )
        )
        return result.scalars().all()

    async def get_by_email(self, db: AsyncSession, *, email: str) -> List[models.ProjectInvitation]:
        result = await db.execute(
            select(self.model)
            .where(self.model.email == email)
            .options(
                selectinload(self.model.project),
                selectinload(self.model.role),
                selectinload(self.model.inviter)
            )
        )
        return result.scalars().all()

    async def get_pending_for_email(self, db: AsyncSession, *, email: str) -> List[models.ProjectInvitation]:
        from datetime import datetime
        
        result = await db.execute(
            select(self.model)
            .where(self.model.email == email)
            .where(self.model.status == 'pending')
            .where(self.model.expires_at >= datetime.utcnow())  # Only non-expired invitations
            .options(
                selectinload(self.model.project).selectinload(models.Project.owner),
                selectinload(self.model.role),
                selectinload(self.model.inviter)
            )
        )
        return result.scalars().all()

    async def get_by_email_and_project(self, db: AsyncSession, *, email: str, project_id: UUID) -> Optional[models.ProjectInvitation]:
        result = await db.execute(
            select(self.model)
            .where(self.model.email == email)
            .where(self.model.project_id == project_id)
            .where(self.model.status == "pending")
        )
        return result.scalar_one_or_none()

    async def create_with_token(self, db: AsyncSession, *, obj_in: Union[schemas.ProjectInvitationCreate, Dict[str, Any]]) -> models.ProjectInvitation:
        import secrets
        import string
        
        if isinstance(obj_in, dict):
            obj_data = obj_in
        else:
            obj_data = obj_in.model_dump()
        
        # Generate token if not provided
        if not obj_data.get('token'):
            token = ''.join(secrets.choice(string.ascii_letters + string.digits) for _ in range(32))
            obj_data['token'] = token
        
        db_obj = self.model(**obj_data)
        db.add(db_obj)
        await db.commit()
        await db.refresh(db_obj)
        return db_obj

# Create CRUD instances
crud_user = CRUDUser(models.User)
crud_project = CRUDProject(models.Project)
crud_role = CRUDRole(models.Role)
crud_project_member = CRUDProjectMember(models.ProjectMember)
crud_file_type = CRUDFileType(models.FileType)
crud_directory = CRUDBase[models.Directory, schemas.DirectoryCreate, schemas.DirectoryUpdate](models.Directory)
crud_file = CRUDBase[models.File, schemas.FileCreate, schemas.FileUpdate](models.File)
crud_file_version = CRUDFileVersion(models.FileVersion)
crud_project_invitation = CRUDProjectInvitation(models.ProjectInvitation)
crud_notification = CRUDBase[models.Notification, schemas.NotificationCreate, schemas.NotificationUpdate](models.Notification)

# User CRUD functions
async def create_user(db: AsyncSession, user_in: schemas.UserCreate) -> models.User:
    return await crud_user.create(db, obj_in=user_in)

async def get_user(db: AsyncSession, user_id: UUID) -> Optional[models.User]:
    return await crud_user.get(db, id=user_id)

async def get_user_by_email(db: AsyncSession, email: str) -> Optional[models.User]:
    return await crud_user.get_by_email(db, email=email)

async def get_user_by_username(db: AsyncSession, username: str) -> Optional[models.User]:
    return await crud_user.get_by_username(db, username=username)

async def get_multi_users(db: AsyncSession, skip: int = 0, limit: int = 100) -> List[models.User]:
    return await crud_user.get_multi(db, skip=skip, limit=limit)

async def update_user(db: AsyncSession, user_id: UUID, user_in: schemas.UserUpdate) -> Optional[models.User]:
    user = await get_user(db, user_id)
    if user:
        return await crud_user.update(db, db_obj=user, obj_in=user_in)
    return None

async def remove_user(db: AsyncSession, user_id: UUID) -> Optional[models.User]:
    return await crud_user.remove(db, id=user_id)

async def count_users(db: AsyncSession) -> int:
    return await crud_user.count(db)

# Project CRUD functions
async def create_project(db: AsyncSession, project_in: schemas.ProjectCreate) -> models.Project:
    return await crud_project.create(db, obj_in=project_in)

async def get_project(db: AsyncSession, project_id: UUID) -> Optional[models.Project]:
    return await crud_project.get(db, id=project_id)

async def get_multi_projects(db: AsyncSession, skip: int = 0, limit: int = 100) -> List[models.Project]:
    return await crud_project.get_multi(db, skip=skip, limit=limit)

async def update_project(db: AsyncSession, project_id: UUID, project_in: schemas.ProjectUpdate) -> Optional[models.Project]:
    project = await get_project(db, project_id)
    if project:
        return await crud_project.update(db, db_obj=project, obj_in=project_in)
    return None

async def remove_project(db: AsyncSession, project_id: UUID) -> Optional[models.Project]:
    return await crud_project.remove(db, id=project_id)

async def count_projects(db: AsyncSession) -> int:
    return await crud_project.count(db)

# Project Invitation CRUD functions
async def create_project_invitation(db: AsyncSession, invitation_in: schemas.ProjectInvitationCreate) -> models.ProjectInvitation:
    return await crud_project_invitation.create_with_token(db, obj_in=invitation_in)

async def get_project_invitation(db: AsyncSession, invitation_id: UUID) -> Optional[models.ProjectInvitation]:
    return await crud_project_invitation.get(db, id=invitation_id)

async def get_project_invitation_by_token(db: AsyncSession, token: str) -> Optional[models.ProjectInvitation]:
    return await crud_project_invitation.get_by_token(db, token=token)

async def get_invitations_by_project(db: AsyncSession, project_id: UUID) -> List[models.ProjectInvitation]:
    return await crud_project_invitation.get_by_project(db, project_id=project_id)

async def get_invitations_by_email(db: AsyncSession, email: str) -> List[models.ProjectInvitation]:
    return await crud_project_invitation.get_by_email(db, email=email)

async def get_pending_invitations_for_email(db: AsyncSession, email: str) -> List[models.ProjectInvitation]:
    return await crud_project_invitation.get_pending_for_email(db, email=email)

async def get_multi_project_invitations(db: AsyncSession, skip: int = 0, limit: int = 100, **filters) -> List[models.ProjectInvitation]:
    return await crud_project_invitation.get_multi(db, skip=skip, limit=limit, **filters)

async def update_project_invitation(db: AsyncSession, invitation_id: UUID, invitation_in: schemas.ProjectInvitationUpdate) -> Optional[models.ProjectInvitation]:
    invitation = await get_project_invitation(db, invitation_id)
    if invitation:
        return await crud_project_invitation.update(db, db_obj=invitation, obj_in=invitation_in)
    return None

async def remove_project_invitation(db: AsyncSession, invitation_id: UUID) -> Optional[models.ProjectInvitation]:
    return await crud_project_invitation.remove(db, id=invitation_id)

async def count_project_invitations(db: AsyncSession, **filters) -> int:
    return await crud_project_invitation.count(db, **filters)

