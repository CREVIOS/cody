@echo off
setlocal enabledelayedexpansion

:: Colors for output (Windows 10+ with ANSI support)
set "RED=[31m"
set "GREEN=[32m"
set "YELLOW=[33m"
set "BLUE=[34m"
set "NC=[0m"

:: Function to print colored output
goto :main

:print_status
echo %BLUE%[INFO]%NC% %~1
goto :eof

:print_success
echo %GREEN%[SUCCESS]%NC% %~1
goto :eof

:print_warning
echo %YELLOW%[WARNING]%NC% %~1
goto :eof

:print_error
echo %RED%[ERROR]%NC% %~1
goto :eof

:print_header
echo.
echo %BLUE%================================================%NC%
echo %BLUE%%~1%NC%
echo %BLUE%================================================%NC%
echo.
goto :eof

:command_exists
where %1 >nul 2>&1
goto :eof

:setup_python_env
call :print_header "Setting up Python Backend Environment"

if not exist "Backend" (
    call :print_error "Backend directory not found!"
    exit /b 1
)

cd Backend

:: Check if Python is installed
call :command_exists python
if errorlevel 1 (
    call :print_error "Python is not installed. Please install Python 3.8 or higher."
    exit /b 1
)

call :print_status "Python version:"
python --version

:: Create virtual environment if it doesn't exist
if not exist "venv" (
    call :print_status "Creating Python virtual environment..."
    python -m venv venv
    if errorlevel 1 (
        call :print_error "Failed to create virtual environment"
        exit /b 1
    )
    call :print_success "Virtual environment created"
) else (
    call :print_status "Virtual environment already exists"
)

:: Activate virtual environment
call :print_status "Activating virtual environment..."
call venv\Scripts\activate.bat

:: Upgrade pip
call :print_status "Upgrading pip..."
python -m pip install --upgrade pip

:: Install dependencies
call :print_status "Installing Python dependencies..."
pip install -r requirements.txt
if errorlevel 1 (
    call :print_error "Failed to install Python dependencies"
    exit /b 1
)

call :print_success "Python environment setup complete"
cd ..
exit /b 0

:setup_node_env
call :print_header "Setting up Node.js SBackend Environment"

if not exist "SBackend" (
    call :print_error "SBackend directory not found!"
    exit /b 1
)

cd SBackend

:: Check if Node.js is installed
call :command_exists node
if errorlevel 1 (
    call :print_error "Node.js is not installed. Please install Node.js 16 or higher."
    exit /b 1
)

call :print_status "Node.js version:"
node --version

:: Check if npm is installed
call :command_exists npm
if errorlevel 1 (
    call :print_error "npm is not installed. Please install npm."
    exit /b 1
)

call :print_status "npm version:"
npm --version

:: Install dependencies
call :print_status "Installing Node.js dependencies..."
npm install
if errorlevel 1 (
    call :print_error "Failed to install Node.js dependencies"
    exit /b 1
)

call :print_success "Node.js environment setup complete"
cd ..
exit /b 0

:run_python_tests
call :print_header "Running Python Backend Tests"

if not exist "Backend" (
    call :print_error "Backend directory not found!"
    exit /b 1
)

cd Backend

:: Activate virtual environment
call venv\Scripts\activate.bat

:: Set test environment variables
set TESTING=true
set DATABASE_URL=sqlite:///./test.db

call :print_status "Running pytest with coverage..."
pytest --cov=. --cov-report=term-missing --cov-report=html:htmlcov -v
set PYTHON_EXIT_CODE=%errorlevel%

if %PYTHON_EXIT_CODE% equ 0 (
    call :print_success "Python tests completed successfully"
    call :print_status "Coverage report generated in Backend/htmlcov/index.html"
) else (
    call :print_error "Python tests failed with exit code %PYTHON_EXIT_CODE%"
)

cd ..
exit /b %PYTHON_EXIT_CODE%

:run_node_tests
call :print_header "Running Node.js SBackend Tests"

if not exist "SBackend" (
    call :print_error "SBackend directory not found!"
    exit /b 1
)

cd SBackend

call :print_status "Running Jest tests with coverage..."
npm run test:coverage
set NODE_EXIT_CODE=%errorlevel%

if %NODE_EXIT_CODE% equ 0 (
    call :print_success "Node.js tests completed successfully"
    call :print_status "Coverage report generated in SBackend/coverage/lcov-report/index.html"
) else (
    call :print_error "Node.js tests failed with exit code %NODE_EXIT_CODE%"
)

cd ..
exit /b %NODE_EXIT_CODE%

:generate_report
call :print_header "Test Execution Summary"

if %1 equ 0 (
    echo Backend Tests: %GREEN%PASSED%NC%
) else (
    echo Backend Tests: %RED%FAILED%NC%
)

if %2 equ 0 (
    echo SBackend Tests: %GREEN%PASSED%NC%
) else (
    echo SBackend Tests: %RED%FAILED%NC%
)

echo.

if %1 equ 0 if %2 equ 0 (
    call :print_success "All tests passed successfully! 🎉"
    echo.
    echo Coverage Reports:
    echo   - Backend: file://%CD%/Backend/htmlcov/index.html
    echo   - SBackend: file://%CD%/SBackend/coverage/lcov-report/index.html
    exit /b 0
) else (
    call :print_error "Some tests failed. Please check the output above."
    exit /b 1
)

:cleanup
call :print_status "Cleaning up test artifacts..."

:: Clean Python test artifacts
if exist "Backend" (
    cd Backend
    if exist "test.db" del /f /q test.db
    if exist "test.db-journal" del /f /q test.db-journal
    if exist ".coverage" del /f /q .coverage
    for /d /r . %%d in (__pycache__) do @if exist "%%d" rd /s /q "%%d"
    for /r . %%f in (*.pyc) do @if exist "%%f" del /f /q "%%f"
    cd ..
)

:: Clean Node.js test artifacts
if exist "SBackend" (
    cd SBackend
    if exist "coverage\.nyc_output" rd /s /q coverage\.nyc_output
    cd ..
)

call :print_success "Cleanup completed"
goto :eof

:main
call :print_header "Automated Test Runner for Backend & SBackend"

:: Check if we're in the right directory
if not exist "Backend" (
    call :print_error "Please run this script from the project root directory containing Backend and SBackend folders"
    exit /b 1
)
if not exist "SBackend" (
    call :print_error "Please run this script from the project root directory containing Backend and SBackend folders"
    exit /b 1
)

:: Parse command line arguments
set SKIP_SETUP=false
set CLEANUP_ONLY=false

:parse_args
if "%~1"=="" goto :end_parse
if "%~1"=="--skip-setup" (
    set SKIP_SETUP=true
    shift
    goto :parse_args
)
if "%~1"=="--cleanup-only" (
    set CLEANUP_ONLY=true
    shift
    goto :parse_args
)
if "%~1"=="--help" (
    echo Usage: %0 [OPTIONS]
    echo.
    echo OPTIONS:
    echo   --skip-setup     Skip environment setup (faster if already set up)
    echo   --cleanup-only   Only clean up test artifacts and exit
    echo   --help          Show this help message
    exit /b 0
)
call :print_error "Unknown option: %~1"
echo Use --help for usage information
exit /b 1

:end_parse

:: Handle cleanup-only mode
if "%CLEANUP_ONLY%"=="true" (
    call :cleanup
    exit /b 0
)

:: Setup environments (unless skipped)
if "%SKIP_SETUP%"=="false" (
    call :setup_python_env
    set PYTHON_SETUP_EXIT=!errorlevel!
    
    call :setup_node_env
    set NODE_SETUP_EXIT=!errorlevel!
    
    if !PYTHON_SETUP_EXIT! neq 0 (
        call :print_error "Environment setup failed. Exiting."
        exit /b 1
    )
    if !NODE_SETUP_EXIT! neq 0 (
        call :print_error "Environment setup failed. Exiting."
        exit /b 1
    )
) else (
    call :print_warning "Skipping environment setup as requested"
)

:: Run tests
call :run_python_tests
set PYTHON_TEST_EXIT=%errorlevel%

call :run_node_tests
set NODE_TEST_EXIT=%errorlevel%

:: Generate report
call :generate_report %PYTHON_TEST_EXIT% %NODE_TEST_EXIT%
set REPORT_EXIT=%errorlevel%

:: Cleanup
call :cleanup

:: Overall exit code
if %PYTHON_TEST_EXIT% equ 0 if %NODE_TEST_EXIT% equ 0 (
    exit /b 0
) else (
    exit /b 1
) 