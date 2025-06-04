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

# Test marking notification as read
echo -e "\n${GREEN}Testing notification read status...${NC}"
curl -s -X PUT "${BASE_URL}/notifications/${NOTIFICATION_ID}/mark-read" | jq

# Test marking all notifications as read
echo -e "\nMarking all notifications as read..."
curl -s -X PUT "${BASE_URL}/notifications/user/${USER_ID}/mark-all-read" | jq

# Cleanup
echo -e "\n${GREEN}Cleaning up test data...${NC}"

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