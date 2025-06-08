#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Base URL
BASE_URL="http://localhost:8000/api/v1"

# Check if jq is installed
if ! command -v jq &> /dev/null; then
    echo -e "${RED}Error: jq is not installed. Please install it first.${NC}"
    echo "For macOS: brew install jq"
    echo "For Ubuntu/Debian: sudo apt-get install jq"
    exit 1
fi

echo -e "\n${GREEN}Starting API Tests...${NC}\n"

# Create a test user
echo "Creating test user..."
USER_RESPONSE=$(curl -s -X POST "${BASE_URL}/users/" \
    -H "Content-Type: application/json" \
    -d "{
        \"username\": \"testuser $(date +%s)\",
        \"email\": \"test$(date +%s)@example.com\",
        \"password\": \"testpass123\"
    }")

USER_ID=$(echo $USER_RESPONSE | jq -r '.user_id')
if [ -z "$USER_ID" ] || [ "$USER_ID" == "null" ]; then
    echo -e "${RED}Failed to create user. Response:${NC}"
    echo $USER_RESPONSE
    exit 1
fi
echo -e "${GREEN}User created with ID: $USER_ID${NC}"

# Create a test role
echo -e "\nCreating test role..."
ROLE_RESPONSE=$(curl -s -X POST "${BASE_URL}/roles/" \
    -H "Content-Type: application/json" \
    -d "{
        \"role_name\": \"Test Role $(date +%s)\",
        \"description\": \"A test role\",
        \"permissions\": {
            \"read\": true,
            \"write\": true,
            \"execute\": false
        }
    }")

ROLE_ID=$(echo $ROLE_RESPONSE | jq -r '.role_id')
if [ -z "$ROLE_ID" ] || [ "$ROLE_ID" == "null" ]; then
    echo -e "${RED}Failed to create role. Response:${NC}"
    echo $ROLE_RESPONSE
    exit 1
fi
echo -e "${GREEN}Role created with ID: $ROLE_ID${NC}"

# Create a test project
echo -e "\nCreating test project..."
PROJECT_RESPONSE=$(curl -s -X POST "${BASE_URL}/projects/" \
    -H "Content-Type: application/json" \
    -d "{
        \"project_name\": \"Test Project $(date +%s)\",
        \"description\": \"A test project\",
        \"owner_id\": \"$USER_ID\",
        \"visibility\": \"private\"
    }")

echo -e "\nProject creation response:"
echo $PROJECT_RESPONSE | jq

PROJECT_ID=$(echo $PROJECT_RESPONSE | jq -r '.project_id')
if [ -z "$PROJECT_ID" ] || [ "$PROJECT_ID" == "null" ]; then
    echo -e "${RED}Failed to create project. Response:${NC}"
    echo $PROJECT_RESPONSE
    exit 1
fi
echo -e "${GREEN}Project created with ID: $PROJECT_ID${NC}"

# Add user as project member
echo -e "\nAdding user as project member..."
PROJECT_MEMBER_RESPONSE=$(curl -s -X POST "${BASE_URL}/project-members/" \
    -H "Content-Type: application/json" \
    -d "{
        \"project_id\": \"$PROJECT_ID\",
        \"user_id\": \"$USER_ID\",
        \"role_id\": \"$ROLE_ID\"
    }")

echo -e "\nProject member creation response:"
echo "$PROJECT_MEMBER_RESPONSE" | jq '.'

# Extract project member ID from response
PROJECT_MEMBER_ID=$(echo "$PROJECT_MEMBER_RESPONSE" | jq -r '.project_member_id')
if [ -z "$PROJECT_MEMBER_ID" ] || [ "$PROJECT_MEMBER_ID" = "null" ]; then
    echo -e "${RED}Failed to add project member. Response:${NC}"
    echo "$PROJECT_MEMBER_RESPONSE"
    exit 1
fi
echo -e "${GREEN}Project member added successfully with ID: $PROJECT_MEMBER_ID${NC}"

# Create a second test user for invitation testing
echo -e "\nCreating second test user for invitations..."
INVITEE_RESPONSE=$(curl -s -X POST "${BASE_URL}/users/" \
    -H "Content-Type: application/json" \
    -d "{
        \"username\": \"invitee$(date +%s)\",
        \"email\": \"invitee$(date +%s)@example.com\",
        \"password\": \"testpass123\"
    }")

INVITEE_ID=$(echo $INVITEE_RESPONSE | jq -r '.user_id')
INVITEE_EMAIL=$(echo $INVITEE_RESPONSE | jq -r '.email')
if [ -z "$INVITEE_ID" ] || [ "$INVITEE_ID" == "null" ]; then
    echo -e "${RED}Failed to create invitee user. Response:${NC}"
    echo $INVITEE_RESPONSE
    exit 1
fi
echo -e "${GREEN}Invitee user created with ID: $INVITEE_ID, Email: $INVITEE_EMAIL${NC}"

# Test Project Invitations CRUD
echo -e "\n${GREEN}Testing Project Invitations CRUD...${NC}"

# Create a test project invitation
echo -e "\nCreating test project invitation..."
# Create expires_at date (7 days from now) - compatible with both macOS and Linux
if date -v+7d >/dev/null 2>&1; then
    # macOS
    EXPIRES_AT=$(date -v+7d -u +"%Y-%m-%dT%H:%M:%SZ")
else
    # Linux
    EXPIRES_AT=$(date -d '+7 days' -u +"%Y-%m-%dT%H:%M:%SZ")
fi

INVITATION_RESPONSE=$(curl -s -X POST "${BASE_URL}/project-invitations/" \
    -H "Content-Type: application/json" \
    -d "{
        \"project_id\": \"$PROJECT_ID\",
        \"email\": \"$INVITEE_EMAIL\",
        \"role_id\": \"$ROLE_ID\",
        \"invited_by\": \"$USER_ID\",
        \"expires_at\": \"$EXPIRES_AT\"
    }")

echo -e "\nProject invitation creation response:"
echo "$INVITATION_RESPONSE" | jq '.'

INVITATION_ID=$(echo "$INVITATION_RESPONSE" | jq -r '.invitation_id')
INVITATION_TOKEN=$(echo "$INVITATION_RESPONSE" | jq -r '.token')
if [ -z "$INVITATION_ID" ] || [ "$INVITATION_ID" = "null" ]; then
    echo -e "${RED}Failed to create project invitation. Response:${NC}"
    echo "$INVITATION_RESPONSE"
    exit 1
fi
echo -e "${GREEN}Project invitation created with ID: $INVITATION_ID, Token: $INVITATION_TOKEN${NC}"

# Create a second invitation for testing decline
echo -e "\nCreating second test project invitation (for decline test)..."
INVITATION2_RESPONSE=$(curl -s -X POST "${BASE_URL}/project-invitations/" \
    -H "Content-Type: application/json" \
    -d "{
        \"project_id\": \"$PROJECT_ID\",
        \"email\": \"decline_test_$(date +%s)@example.com\",
        \"role_id\": \"$ROLE_ID\",
        \"invited_by\": \"$USER_ID\",
        \"expires_at\": \"$EXPIRES_AT\"
    }")

INVITATION2_ID=$(echo "$INVITATION2_RESPONSE" | jq -r '.invitation_id')
if [ -z "$INVITATION2_ID" ] || [ "$INVITATION2_ID" = "null" ]; then
    echo -e "${RED}Failed to create second project invitation. Response:${NC}"
    echo "$INVITATION2_RESPONSE"
    exit 1
fi
echo -e "${GREEN}Second project invitation created with ID: $INVITATION2_ID${NC}"

# Test getting all invitations with pagination
echo -e "\nTesting GET all invitations with pagination..."
curl -s "${BASE_URL}/project-invitations/?skip=0&limit=10" | jq '.'

# Test filtering invitations by project
echo -e "\nTesting GET invitations filtered by project..."
curl -s "${BASE_URL}/project-invitations/?project_id=${PROJECT_ID}&skip=0&limit=10" | jq '.'

# Test filtering invitations by status
echo -e "\nTesting GET invitations filtered by status..."
curl -s "${BASE_URL}/project-invitations/?status=pending&skip=0&limit=10" | jq '.'

# Test getting invitation by ID
echo -e "\nTesting GET invitation by ID..."
curl -s "${BASE_URL}/project-invitations/${INVITATION_ID}" | jq '.'

# Test getting invitation by token
echo -e "\nTesting GET invitation by token..."
curl -s "${BASE_URL}/project-invitations/by-token/${INVITATION_TOKEN}" | jq '.'

# Test getting invitations by project
echo -e "\nTesting GET invitations by project..."
curl -s "${BASE_URL}/project-invitations/by-project/${PROJECT_ID}" | jq '.'

# Test getting invitations by email
echo -e "\nTesting GET invitations by email..."
curl -s "${BASE_URL}/project-invitations/by-email/${INVITEE_EMAIL}" | jq '.'

# Test getting pending invitations for email
echo -e "\nTesting GET pending invitations for email..."
curl -s "${BASE_URL}/project-invitations/by-email/${INVITEE_EMAIL}?pending_only=true" | jq '.'

# Test declining an invitation
echo -e "\nTesting declining project invitation..."
curl -s -X POST "${BASE_URL}/project-invitations/${INVITATION2_ID}/decline" | jq '.'

# Test accepting an invitation
echo -e "\nTesting accepting project invitation..."
ACCEPT_RESPONSE=$(curl -s -X POST "${BASE_URL}/project-invitations/${INVITATION_ID}/accept?accepting_user_id=${INVITEE_ID}")
echo "$ACCEPT_RESPONSE" | jq '.'

# Check if the invitation was accepted and member was created
ACCEPTED_MEMBER_ID=$(echo "$ACCEPT_RESPONSE" | jq -r '.project_member_id')
if [ -z "$ACCEPTED_MEMBER_ID" ] || [ "$ACCEPTED_MEMBER_ID" = "null" ]; then
    echo -e "${RED}Failed to accept invitation or create member. Response:${NC}"
    echo "$ACCEPT_RESPONSE"
else
    echo -e "${GREEN}Invitation accepted successfully, new member ID: $ACCEPTED_MEMBER_ID${NC}"
fi

# Test updating invitation status
echo -e "\nTesting updating invitation status..."
curl -s -X PUT "${BASE_URL}/project-invitations/${INVITATION2_ID}" \
    -H "Content-Type: application/json" \
    -d "{\"status\": \"expired\"}" | jq '.'

# Test trying to accept an already declined invitation (should fail)
echo -e "\nTesting accepting declined invitation (should fail)..."
curl -s -X POST "${BASE_URL}/project-invitations/${INVITATION2_ID}/accept?accepting_user_id=${USER_ID}" | jq '.'

# Create a test directory
echo -e "\nCreating test directory..."
echo -e "Using Project ID: $PROJECT_ID"
echo -e "Using User ID: $USER_ID"

DIRECTORY_RESPONSE=$(curl -s -X POST "${BASE_URL}/directories/" \
    -H "Content-Type: application/json" \
    -d "{
        \"directory_name\": \"Test Directory $(date +%s)\",
        \"project_id\": \"$PROJECT_ID\",
        \"created_by\": \"$USER_ID\"
    }")

echo -e "\nDirectory creation response:"
echo "$DIRECTORY_RESPONSE" | jq '.'

DIRECTORY_ID=$(echo "$DIRECTORY_RESPONSE" | jq -r '.directory_id')
if [ -z "$DIRECTORY_ID" ] || [ "$DIRECTORY_ID" = "null" ]; then
    echo -e "${RED}Failed to create directory. Response:${NC}"
    echo "$DIRECTORY_RESPONSE"
    exit 1
fi
echo -e "${GREEN}Directory created with ID: $DIRECTORY_ID${NC}"

# Create a test file type
echo -e "\nCreating test file type..."
FILE_TYPE_RESPONSE=$(curl -s -X POST "${BASE_URL}/file-types/" \
    -H "Content-Type: application/json" \
    -d "{
        \"type_name\": \"Test Type $(date +%s)\",
        \"extension\": \".test\",
        \"mime_type\": \"text/plain\",
        \"description\": \"A test file type\"
    }")

FILE_TYPE_ID=$(echo $FILE_TYPE_RESPONSE | jq -r '.file_type_id')
if [ -z "$FILE_TYPE_ID" ] || [ "$FILE_TYPE_ID" == "null" ]; then
    echo -e "${RED}Failed to create file type. Response:${NC}"
    echo $FILE_TYPE_RESPONSE
    exit 1
fi
echo -e "${GREEN}File type created with ID: $FILE_TYPE_ID${NC}"

# Create a test file
echo -e "\nCreating test file..."
FILE_RESPONSE=$(curl -s -X POST "${BASE_URL}/files/" \
    -H "Content-Type: application/json" \
    -d '{
        "file_name": "test1749040126.txt",
        "project_id": "'"${PROJECT_ID}"'",
        "directory_id": "'"${DIRECTORY_ID}"'",
        "file_type_id": "'"${FILE_TYPE_ID}"'",
        "created_by": "'"${USER_ID}"'",
        "last_modified_by": "'"${USER_ID}"'",
        "content": "Test content"
    }')

FILE_ID=$(echo $FILE_RESPONSE | jq -r '.file_id')
if [ -z "$FILE_ID" ] || [ "$FILE_ID" == "null" ]; then
    echo -e "${RED}Failed to create file. Response:${NC}"
    echo $FILE_RESPONSE
    exit 1
fi
echo -e "${GREEN}File created with ID: $FILE_ID${NC}"

# Create a test file version
echo -e "\nCreating test file version..."
VERSION_RESPONSE=$(curl -s -X POST "${BASE_URL}/file-versions/" \
    -H "Content-Type: application/json" \
    -d "{
        \"file_id\": \"$FILE_ID\",
        \"version_number\": 1,
        \"version_link\": \"https://example.com/versions/test.txt\",
        \"size_in_bytes\": 1024,
        \"created_by\": \"$USER_ID\"
    }")

VERSION_ID=$(echo $VERSION_RESPONSE | jq -r '.version_id')
if [ -z "$VERSION_ID" ] || [ "$VERSION_ID" == "null" ]; then
    echo -e "${RED}Failed to create file version. Response:${NC}"
    echo $VERSION_RESPONSE
    exit 1
fi
echo -e "${GREEN}File version created with ID: $VERSION_ID${NC}"

# Create a test notification
echo -e "\nCreating test notification..."
NOTIFICATION_RESPONSE=$(curl -s -X POST "${BASE_URL}/notifications/" \
    -H "Content-Type: application/json" \
    -d "{
        \"user_id\": \"$USER_ID\",
        \"title\": \"Test Notification $(date +%s)\",
        \"message\": \"This is a test notification\",
        \"notification_type\": \"file_change\",
        \"is_read\": false
    }")

NOTIFICATION_ID=$(echo $NOTIFICATION_RESPONSE | jq -r '.notification_id')
if [ -z "$NOTIFICATION_ID" ] || [ "$NOTIFICATION_ID" == "null" ]; then
    echo -e "${RED}Failed to create notification. Response:${NC}"
    echo $NOTIFICATION_RESPONSE
    exit 1
fi
echo -e "${GREEN}Notification created with ID: $NOTIFICATION_ID${NC}"

# Test GET endpoints
echo -e "\n${GREEN}Testing GET endpoints...${NC}"

echo -e "\nGetting all users..."
curl -s "${BASE_URL}/users/" | jq

echo -e "\nGetting all projects..."
curl -s "${BASE_URL}/projects/" | jq

echo -e "\nGetting all roles..."
curl -s "${BASE_URL}/roles/" | jq

echo -e "\nGetting all directories..."
curl -s "${BASE_URL}/directories/" | jq

echo -e "\nGetting all file types..."
curl -s "${BASE_URL}/file-types/" | jq

echo -e "\nGetting all files..."
curl -s "${BASE_URL}/files/" | jq

echo -e "\nGetting all file versions..."
curl -s "${BASE_URL}/file-versions/" | jq

echo -e "\nGetting all execution environments..."
curl -s "${BASE_URL}/execution-environments/" | jq

echo -e "\nGetting all terminal environments..."
curl -s "${BASE_URL}/terminal-environments/" | jq

echo -e "\nGetting all notifications..."
curl -s "${BASE_URL}/notifications/" | jq

echo -e "\nGetting all project members..."
curl -s "${BASE_URL}/project-members/" | jq

echo -e "\nGetting all project invitations..."
curl -s "${BASE_URL}/project-invitations/" | jq

# Test marking notification as read
echo -e "\n${GREEN}Testing notification read status...${NC}"
curl -s -X PUT "${BASE_URL}/notifications/${NOTIFICATION_ID}/mark-read" | jq

# Test marking all notifications as read
echo -e "\nMarking all notifications as read..."
curl -s -X PUT "${BASE_URL}/notifications/user/${USER_ID}/mark-all-read" | jq

# Cleanup
echo -e "\n${GREEN}Cleaning up test data...${NC}"

# Delete accepted project member (if created)
if [ ! -z "$ACCEPTED_MEMBER_ID" ] && [ "$ACCEPTED_MEMBER_ID" != "null" ]; then
    echo -e "\nDeleting accepted project member..."
    curl -s -X DELETE "${BASE_URL}/project-members/${ACCEPTED_MEMBER_ID}"
fi

# Delete project invitations
echo -e "\nDeleting project invitations..."
curl -s -X DELETE "${BASE_URL}/project-invitations/${INVITATION_ID}"
curl -s -X DELETE "${BASE_URL}/project-invitations/${INVITATION2_ID}"

# Delete invitee user
echo -e "\nDeleting invitee user..."
curl -s -X DELETE "${BASE_URL}/users/${INVITEE_ID}"

echo -e "\nDeleting file version..."
curl -s -X DELETE "${BASE_URL}/file-versions/${VERSION_ID}"

echo -e "\nDeleting file..."
curl -s -X DELETE "${BASE_URL}/files/${FILE_ID}"

echo -e "\nDeleting file type..."
curl -s -X DELETE "${BASE_URL}/file-types/${FILE_TYPE_ID}"

echo -e "\nDeleting directory..."
curl -s -X DELETE "${BASE_URL}/directories/${DIRECTORY_ID}"

echo -e "\nDeleting notification..."
curl -s -X DELETE "${BASE_URL}/notifications/${NOTIFICATION_ID}"

echo -e "\nDeleting role..."
curl -s -X DELETE "${BASE_URL}/roles/${ROLE_ID}"

echo -e "\nDeleting project..."
curl -s -X DELETE "${BASE_URL}/projects/${PROJECT_ID}"

echo -e "\nDeleting user..."
curl -s -X DELETE "${BASE_URL}/users/${USER_ID}"

echo -e "\n${GREEN}Test completed!${NC}"