### API Template Method Refactor – Before vs After

#### Before: Ad‑hoc per‑function `fetch` logic

**Structure**

- **Per-module duplication**:
  - Each API module (`ProjectAPI`, `UserAPI`, `RoleAPI`, `InvitationAPI`, `ProjectMembersAPI`, `NotificationsAPI`, `PermissionsAPI`, `FileTypeAPI`, `FileVersionsAPI`, `UtilityFunctions`) implemented:
    - Direct `fetch` / `fetchWithRetry` usage.
    - Inline URL construction with `API_BASE_URL`.
    - Repeated `if (!response.ok) { ... }` branches.
    - Local `response.json()` / `response.text()` parsing.
    - Local `try/catch` blocks for:
      - Network errors (e.g. “backend not running on 8000”).
      - Fallback behavior (`[]`, `null`, etc.).

- **Examples (conceptual)**:
  - `getRoles`:
    - `fetch(API_BASE_URL + "/api/v1/roles")`
    - `if (!res.ok) { const msg = await getErrorMessage(res); throw new Error(msg); }`
    - `return (await res.json()).items || []`
  - `getProjectInvitations`:
    - `fetchWithRetry(...)` in `try/catch`.
    - On `NetworkError`, log and return `[]` instead of throwing.
  - `createUser` / `createInvitation`:
    - Ad-hoc debug logging around failed POSTs.

**Characteristics**

- **Duplication**:
  - The same error-handling pattern was repeated in many functions.
  - Patterns diverged slightly (some used `getErrorMessage`, some built messages from `status`/`text` directly).

- **Inconsistency**:
  - Some list endpoints failed **loudly** (threw), others failed **silently** (returned `[]`/`null`) on network errors.
  - Different wording and formatting for similar errors.

- **Tight coupling to configuration**:
  - Multiple functions referenced `API_BASE_URL` directly and needed to remember to import it.
  - User-id wiring (`user_id` in body or query) was done ad-hoc per function.

- **Difficult to evolve**:
  - Changing retry behavior, error shaping, or logging required touching many functions across files.
  - Adding cross-cutting concerns (metrics, tracing, etc.) meant editing many call sites.

---

#### After: Template Method + Small Concrete Subclasses

**Core abstractions**

- `BaseAPITemplate<TResponse>`
  - Implements the **Template Method** (`execute`) that defines the algorithm:
    1. `buildURL()` – subclass constructs the endpoint URL.
    2. `buildOptions()` – subclass defines HTTP method, headers, body, etc.
    3. `performRequest(url, options)` – default: `fetchWithRetry`.
    4. If `!response.ok`:
       - Resolve error message via `getErrorMessage(response)` (default: shared `getErrorMessageFromResponse`).
       - Call `onError(message, response)` hook.
       - Throw `new Error(message)`.
    5. `parseResponse(response)` – hook (default: `response.json()`).
    6. `onSuccess(parsed, response)` – hook (default: no-op).
    7. Return parsed value.
  - Handles:
    - `NetworkError` from `fetchWithRetry` and raw `TypeError: Failed to fetch` with consistent, friendly messages.
    - Shared helpers:
      - `getBaseURL()` → wraps `API_BASE_URL`.
      - `invalidateCache(urlPattern)` → wraps the in-memory request cache invalidation.

- `BaseAPITemplateWithUser<TResponse>` (extends `BaseAPITemplate<TResponse>`)
  - Adds `userId` field.
  - Overrides `performRequest` to call `fetchWithUserId` so user context is threaded automatically.

- `BaseAPITemplateSilentFail<TResponse>` (extends `BaseAPITemplate<TResponse>`)  
  - Overrides `execute()`:
    - Catches `NetworkError` (and other errors) and returns a fallback `getFallbackValue()` instead of throwing.
    - Logs at debug/error level before returning fallback.
  - Used where “backend down” should not break the UI (e.g. invitations list, project members list, file types, health check).

**Per-call subclasses (pattern)**

- Each exported API function now has a corresponding small subclass + thin wrapper:

  - Example: **Projects**
    - `GetProjectsCall extends BaseAPITemplate<Project[]>`
      - `buildURL()` builds `/api/v1/projects?skip=&limit=&owner_id=...`.
      - `buildOptions()` returns `{ method: "GET" }`.
      - `parseResponse()` reads `PaginatedResponse<Project>` and returns `items || []`.
      - `onError()` logs a tagged error.
    - `getProjects(...)` simply returns `new GetProjectsCall(...).execute()`.

  - Example: **User projects transform**
    - `GetUserProjectsCall extends BaseAPITemplate<UserProjectsResponse>`
      - `buildURL()` → `/api/v1/users/{userId}/all-projects`.
      - `getErrorMessage()` overrides to keep `HTTP error! status: ...`.
      - `parseResponse()`:
        - Accepts the raw `owned_projects` + `member_projects` structure.
        - Merges into a flat list with `role_id` resolved from `roles` (captured from outer scope).
        - Returns a `UserProjectsResponse` with items + paging info.

  - Example: **Silent-fail lists**
    - `GetProjectInvitationsCall extends BaseAPITemplateSilentFail<ProjectInvitation[]>`
    - `GetProjectMembersCall extends BaseAPITemplateSilentFail<ProjectMemberWithDetails[]>`
    - `GetAllFileTypesCall extends BaseAPITemplateSilentFail<FileType[]>`
      - `getFallbackValue()` returns `[]` or `null`.
      - `onSuccess()` can write to cache (e.g. `fileTypesCache`).

  - Example: **File versions with custom error text**
    - `SaveFileContentCall extends BaseAPITemplate<FileVersionResponse>`
      - `getErrorMessage()` builds `Failed to save file: <status> <text>`.
    - `GetFileVersionContentCall`, `ListFileVersionsCall` override `getErrorMessage()` similarly.

- **Wrapper functions remain unchanged**
  - Public API of modules (`getRoles`, `getUser`, `getUserProjects`, `createInvitation`, etc.) still expose the same function names and signatures.
  - Callers do not know about the template classes; they only see a `Promise<...>` from `.execute()`.

---

### Benefits of the Template Method Refactor

**1. Centralized error handling**

- All non-OK HTTP responses are processed in **one place** (`BaseAPITemplate.execute`), with:
  - Shared `getErrorMessageFromResponse` helper by default.
  - A controlled escape hatch (`getErrorMessage` override) for endpoints that need text-based messages.
  - Consistent network error translation (`NetworkError` and `TypeError: Failed to fetch`).
- Concrete classes use `onError(message, response)` only for **contextual logging**, not to re-implement throw logic.

**2. Clear separation of concerns**

- **Base classes**:
  - Own the algorithm skeleton: URL → options → request → error handling → parsing → success hook → result.
  - Encapsulate cross-cutting concerns:
    - Retries and timeouts (`fetchWithRetry`).
    - Cache invalidation.
    - User-id injection (`BaseAPITemplateWithUser`).
    - Silent-fail behavior (`BaseAPITemplateSilentFail`).

- **Subclasses**:
  - Own only endpoint-specific details:
    - URL construction.
    - Request options.
    - Domain-specific parsing / shaping (e.g. mapping `PaginatedResponse<T>` to arrays, transforming user-projects).
    - Tag-specific logging in hooks.

**3. Reduced duplication & easier maintenance**

- Shared patterns (non-OK handling, JSON parsing, text-based errors) live in **one** place.
- Adding a new API call now means:
  - Creating a small subclass with `buildURL` + `buildOptions` (+ optional parsing/hooks).
  - Exporting a thin wrapper that calls `.execute()`.
- Changes to:
  - Retry behavior.
  - Network error messages.
  - Generic logging/metrics/tracing.
  can be made in the base template without touching every function.

**4. Safer configuration usage**

- URL building uses `this.getBaseURL()` instead of direct `API_BASE_URL` references:
  - Avoids runtime `ReferenceError` when imports are forgotten.
  - Keeps all API-base configuration in `APIConfiguration.tsx`.

**5. Explicit modeling of “silent fail vs hard fail”**

- By distinguishing `BaseAPITemplate` (hard fail) from `BaseAPITemplateSilentFail` (fallback) the code **documents intent**:
  - “This list should return `[]` if the backend is unavailable.”
  - “This mutation must fail loudly.”
- This replaces scattered try/catch and ad-hoc `return []` code paths with a dedicated, testable abstraction.


