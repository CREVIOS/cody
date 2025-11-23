-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.directories (
  directory_id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  directory_name text NOT NULL,
  parent_directory_id uuid,
  materialized_path text,
  depth_level integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  modified_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  created_by uuid NOT NULL,
  CONSTRAINT directories_pkey PRIMARY KEY (directory_id),
  CONSTRAINT directories_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(project_id),
  CONSTRAINT directories_parent_directory_id_fkey FOREIGN KEY (parent_directory_id) REFERENCES public.directories(directory_id),
  CONSTRAINT directories_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(user_id)
);
CREATE TABLE public.execution_environments (
  environment_id uuid NOT NULL DEFAULT gen_random_uuid(),
  environment_name text NOT NULL,
  language text NOT NULL,
  version text,
  docker_image text,
  base_packages jsonb,
  setup_commands jsonb,
  run_command_template text,
  timeout_seconds integer DEFAULT 30,
  persistent_storage boolean DEFAULT false,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT execution_environments_pkey PRIMARY KEY (environment_id)
);
CREATE TABLE public.file_lock_requests (
  request_id uuid NOT NULL,
  file_id uuid NOT NULL,
  requester_user_id uuid NOT NULL,
  requested_at timestamp with time zone DEFAULT now(),
  granted boolean,
  CONSTRAINT file_lock_requests_pkey PRIMARY KEY (request_id),
  CONSTRAINT file_lock_requests_requester_user_id_fkey FOREIGN KEY (requester_user_id) REFERENCES public.users(user_id)
);
CREATE TABLE public.file_locks (
  file_id uuid NOT NULL,
  holder_user_id uuid,
  expires_at timestamp with time zone,
  state character varying,
  updated_at timestamp with time zone,
  CONSTRAINT file_locks_pkey PRIMARY KEY (file_id),
  CONSTRAINT file_locks_holder_user_id_fkey FOREIGN KEY (holder_user_id) REFERENCES public.users(user_id)
);
CREATE TABLE public.file_types (
  file_type_id uuid NOT NULL DEFAULT gen_random_uuid(),
  type_name text NOT NULL UNIQUE,
  extension text NOT NULL,
  mime_type text NOT NULL,
  icon_class text,
  syntax_mode text,
  is_executable boolean DEFAULT false,
  is_binary boolean DEFAULT false,
  default_content text,
  CONSTRAINT file_types_pkey PRIMARY KEY (file_type_id)
);
CREATE TABLE public.file_versions (
  version_id uuid NOT NULL DEFAULT gen_random_uuid(),
  file_id uuid NOT NULL,
  version_number integer NOT NULL,
  version_link text,
  size_in_bytes integer NOT NULL,
  created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  created_by uuid NOT NULL,
  parent_version_id uuid,
  CONSTRAINT file_versions_pkey PRIMARY KEY (version_id),
  CONSTRAINT file_versions_file_id_fkey FOREIGN KEY (file_id) REFERENCES public.files(file_id),
  CONSTRAINT file_versions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(user_id),
  CONSTRAINT file_versions_parent_version_id_fkey FOREIGN KEY (parent_version_id) REFERENCES public.file_versions(version_id)
);
CREATE TABLE public.files (
  file_id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  file_name text NOT NULL,
  file_type_id uuid,
  directory_id uuid NOT NULL,
  size_in_bytes integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  modified_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  created_by uuid NOT NULL,
  last_modified_by uuid NOT NULL,
  storage_link text,
  CONSTRAINT files_pkey PRIMARY KEY (file_id),
  CONSTRAINT files_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(project_id),
  CONSTRAINT files_directory_id_fkey FOREIGN KEY (directory_id) REFERENCES public.directories(directory_id),
  CONSTRAINT files_file_type_id_fkey FOREIGN KEY (file_type_id) REFERENCES public.file_types(file_type_id),
  CONSTRAINT files_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(user_id)
);
CREATE TABLE public.notifications (
  notification_id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  project_id uuid,
  notification_type text NOT NULL CHECK (notification_type = ANY (ARRAY['invitation'::text, 'file_change'::text, 'member_added'::text, 'deployment'::text, 'mention'::text])),
  title text NOT NULL,
  is_read boolean DEFAULT false,
  message text,
  created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  reference_id uuid,
  payload jsonb DEFAULT '{}'::jsonb,
  CONSTRAINT notifications_pkey PRIMARY KEY (notification_id),
  CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id),
  CONSTRAINT notifications_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(project_id)
);
CREATE TABLE public.project_invitations (
  invitation_id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  email text NOT NULL,
  user_id uuid,
  role_id uuid NOT NULL,
  invited_by uuid NOT NULL,
  token text NOT NULL UNIQUE,
  status text DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'accepted'::text, 'declined'::text, 'expired'::text])),
  created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  expires_at timestamp with time zone NOT NULL,
  accepted_at timestamp with time zone,
  CONSTRAINT project_invitations_pkey PRIMARY KEY (invitation_id),
  CONSTRAINT project_invitations_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(project_id),
  CONSTRAINT project_invitations_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(role_id),
  CONSTRAINT project_invitations_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES public.users(user_id)
);
CREATE TABLE public.project_members (
  project_member_id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role_id uuid NOT NULL,
  invited_by uuid,
  joined_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  last_activity timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  is_active boolean DEFAULT true,
  CONSTRAINT project_members_pkey PRIMARY KEY (project_member_id),
  CONSTRAINT project_members_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(project_id),
  CONSTRAINT project_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id),
  CONSTRAINT project_members_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(role_id),
  CONSTRAINT project_members_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES public.users(user_id)
);
CREATE TABLE public.projects (
  project_id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_name text NOT NULL,
  description text,
  visibility text DEFAULT 'private'::text CHECK (visibility = ANY (ARRAY['public'::text, 'private'::text, 'team'::text])),
  created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  modified_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  owner_id uuid NOT NULL,
  is_active boolean DEFAULT true,
  project_settings jsonb DEFAULT '{}'::jsonb,
  CONSTRAINT projects_pkey PRIMARY KEY (project_id),
  CONSTRAINT projects_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.users(user_id)
);
CREATE TABLE public.roles (
  role_id uuid NOT NULL DEFAULT gen_random_uuid(),
  role_name text NOT NULL UNIQUE,
  description text,
  permissions jsonb NOT NULL,
  CONSTRAINT roles_pkey PRIMARY KEY (role_id)
);
CREATE TABLE public.terminal_environments (
  terminal_id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  user_id uuid NOT NULL,
  environment_id uuid NOT NULL,
  container_id text NOT NULL,
  websocket_id text NOT NULL,
  is_active boolean DEFAULT true,
  CONSTRAINT terminal_environments_pkey PRIMARY KEY (terminal_id),
  CONSTRAINT terminal_environments_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(project_id),
  CONSTRAINT terminal_environments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id),
  CONSTRAINT terminal_environments_environment_id_fkey FOREIGN KEY (environment_id) REFERENCES public.execution_environments(environment_id)
);
CREATE TABLE public.users (
  user_id uuid NOT NULL DEFAULT gen_random_uuid(),
  username text NOT NULL UNIQUE,
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  full_name text,
  avatar_url text,
  status text DEFAULT 'active'::text CHECK (status = ANY (ARRAY['active'::text, 'inactive'::text, 'suspended'::text])),
  created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  last_login_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT users_pkey PRIMARY KEY (user_id)
);
CREATE TABLE public.websocket_connections (
  connection_id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  websocket_id text NOT NULL UNIQUE,
  project_id uuid,
  connection_type text DEFAULT 'editor'::text CHECK (connection_type = ANY (ARRAY['editor'::text, 'terminal'::text, 'preview'::text])),
  connected_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  last_ping timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  is_active boolean DEFAULT true,
  client_info jsonb,
  CONSTRAINT websocket_connections_pkey PRIMARY KEY (connection_id),
  CONSTRAINT websocket_connections_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id),
  CONSTRAINT websocket_connections_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(project_id)
);