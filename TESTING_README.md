# Automated Testing Suite

This repository contains comprehensive unit tests for both the **Backend** (Python FastAPI) and **SBackend** (Node.js Express) applications, with automated scripts to run all tests with a single command.

## 🚀 Quick Start

### Prerequisites

Before running the tests, ensure you have the following installed:

**For Backend (Python):**

- Python 3.8 or higher
- pip (Python package manager)

**For SBackend (Node.js):**

- Node.js 16 or higher
- npm (Node package manager)

### One-Command Test Execution

#### On macOS/Linux:

```bash
# Make the script executable (first time only)
chmod +x run_all_tests.sh

# Run all tests with automatic environment setup
./run_all_tests.sh
```

#### On Windows:

```cmd
# Run all tests with automatic environment setup
run_all_tests.bat
```

## 📋 Test Suite Overview

### Backend (Python FastAPI) - 31 Tests ✅

- **Database Tests**: Connection, health checks, transaction handling
- **User Management**: CRUD operations, validation, authentication, pagination
- **Project Management**: CRUD operations, user associations, permissions
- **Role Management**: Role assignments, permissions, validation
- **Error Handling**: Input validation, database errors, edge cases

### SBackend (Node.js Express) - 58 Tests ✅

- **FileSystemService Tests**: MinIO operations, file management, project structure
- **API Endpoint Tests**: All REST endpoints, request/response validation
- **Error Handling**: Connection failures, validation errors, edge cases
- **File Operations**: Create, read, update, delete files and folders

## 🛠️ Manual Test Execution

If you prefer to run tests manually for each service:

### Backend (Python)

```bash
cd Backend

# Create virtual environment (first time only)
python3 -m venv venv

# Activate virtual environment
source venv/bin/activate  # On macOS/Linux
# OR
venv\Scripts\activate.bat  # On Windows

# Install dependencies
pip install -r requirements.txt

# Run tests
pytest                           # Basic test run
pytest -v                        # Verbose output
pytest --cov=.                   # With coverage
pytest --cov=. --cov-report=html # HTML coverage report
```

### SBackend (Node.js)

```bash
cd SBackend

# Install dependencies
npm install

# Run tests
npm test                    # Basic test run
npm run test:watch         # Watch mode
npm run test:coverage      # With coverage report
```

## 📊 Coverage Reports

After running tests, coverage reports are generated:

- **Backend**: `Backend/htmlcov/index.html`
- **SBackend**: `SBackend/coverage/lcov-report/index.html`

Open these files in your browser to view detailed coverage information.

## 🎯 Script Options

Both `run_all_tests.sh` and `run_all_tests.bat` support the following options:

### `--skip-setup`

Skip environment setup for faster execution (use when environments are already configured):

```bash
./run_all_tests.sh --skip-setup
```

### `--cleanup-only`

Only clean up test artifacts without running tests:

```bash
./run_all_tests.sh --cleanup-only
```

### `--help`

Show usage information:

```bash
./run_all_tests.sh --help
```

## 🔧 What the Automated Script Does

1. **Environment Validation**: Checks for Python 3.8+, Node.js 16+, pip, and npm
2. **Python Setup**:
   - Creates virtual environment if needed
   - Activates virtual environment
   - Upgrades pip
   - Installs Python dependencies from `requirements.txt`
3. **Node.js Setup**:
   - Installs Node.js dependencies from `package.json`
4. **Test Execution**:
   - Runs Python tests with coverage reporting
   - Runs Node.js tests with coverage reporting
5. **Report Generation**:
   - Creates HTML coverage reports
   - Provides summary of test results
6. **Cleanup**: Removes temporary test files and artifacts

## 🐛 Troubleshooting

### Common Issues

**Python virtual environment activation fails:**

```bash
# Ensure you're in the Backend directory
cd Backend
# Try creating a new virtual environment
rm -rf venv
python3 -m venv venv
```

**Node.js dependency installation fails:**

```bash
# Clear npm cache and reinstall
cd SBackend
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

**Tests fail due to missing dependencies:**

```bash
# For Python
cd Backend
source venv/bin/activate
pip install -r requirements.txt

# For Node.js
cd SBackend
npm install
```

### Environment Variables

The scripts automatically set the following environment variables:

**Backend:**

- `TESTING=true`
- `DATABASE_URL=sqlite:///./test.db`

**SBackend:**

- Node environment is automatically configured by Jest

## 🚦 Continuous Integration

These scripts are designed to work in CI/CD environments. The exit codes are:

- `0`: All tests passed
- `1`: Some tests failed or environment setup failed

Example for GitHub Actions:

```yaml
name: Test Suite
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Run All Tests
        run: ./run_all_tests.sh
```

## 📁 Test File Structure

```
├── Backend/
│   ├── tests/
│   │   ├── conftest.py           # Test configuration
│   │   ├── test_db.py           # Database tests
│   │   ├── test_users.py        # User management tests
│   │   ├── test_projects.py     # Project management tests
│   │   └── test_roles.py        # Role management tests
│   └── htmlcov/                 # Coverage reports (generated)
├── SBackend/
│   ├── tests/
│   │   ├── fileSystemService.test.js  # Service layer tests
│   │   └── server.test.js             # API endpoint tests
│   └── coverage/                      # Coverage reports (generated)
├── run_all_tests.sh            # Unix/Linux/macOS script
├── run_all_tests.bat           # Windows script
└── TESTING_README.md           # This file
```

## 🎉 Success Output

When all tests pass, you'll see:

```
================================================
Test Execution Summary
================================================

Backend Tests: PASSED
SBackend Tests: PASSED

All tests passed successfully! 🎉

Coverage Reports:
  - Backend: file:///path/to/Backend/htmlcov/index.html
  - SBackend: file:///path/to/SBackend/coverage/lcov-report/index.html
```

## 📝 Adding New Tests

### Backend (Python)

1. Create test files in `Backend/tests/`
2. Use the existing fixtures from `conftest.py`
3. Follow the naming convention: `test_*.py`
4. Use pytest assertions and async test patterns

### SBackend (Node.js)

1. Create test files in `SBackend/tests/`
2. Use Jest testing framework
3. Follow the naming convention: `*.test.js`
4. Mock external dependencies (MinIO, etc.)

## 🔍 Test Quality Guidelines

- **Isolation**: Each test should be independent
- **Mocking**: External dependencies should be mocked
- **Coverage**: Aim for comprehensive test coverage
- **Error Cases**: Test both success and failure scenarios
- **Edge Cases**: Test boundary conditions and edge cases

---

**Happy Testing! 🧪**
