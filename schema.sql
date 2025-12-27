-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

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