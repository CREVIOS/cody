#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_header() {
    echo -e "\n${BLUE}================================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}================================================${NC}\n"
}

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to setup Python environment
setup_python_env() {
    print_header "Setting up Python Backend Environment"
    
    cd Backend || {
        print_error "Backend directory not found!"
        return 1
    }
    
    # Check if Python is installed
    if ! command_exists python3; then
        print_error "Python 3 is not installed. Please install Python 3.8 or higher."
        return 1
    fi
    
    print_status "Python version: $(python3 --version)"
    
    # Create virtual environment if it doesn't exist
    if [ ! -d "venv" ]; then
        print_status "Creating Python virtual environment..."
        python3 -m venv venv
        if [ $? -ne 0 ]; then
            print_error "Failed to create virtual environment"
            return 1
        fi
        print_success "Virtual environment created"
    else
        print_status "Virtual environment already exists"
    fi
    
    # Activate virtual environment
    print_status "Activating virtual environment..."
    source venv/bin/activate
    
    # Upgrade pip
    print_status "Upgrading pip..."
    pip install --upgrade pip
    
    # Install dependencies
    print_status "Installing Python dependencies..."
    pip install -r requirements.txt
    if [ $? -ne 0 ]; then
        print_error "Failed to install Python dependencies"
        return 1
    fi
    
    print_success "Python environment setup complete"
    cd ..
    return 0
}

# Function to setup Node.js environment
setup_node_env() {
    print_header "Setting up Node.js SBackend Environment"
    
    cd SBackend || {
        print_error "SBackend directory not found!"
        return 1
    }
    
    # Check if Node.js is installed
    if ! command_exists node; then
        print_error "Node.js is not installed. Please install Node.js 16 or higher."
        return 1
    fi
    
    print_status "Node.js version: $(node --version)"
    
    # Check if npm is installed
    if ! command_exists npm; then
        print_error "npm is not installed. Please install npm."
        return 1
    fi
    
    print_status "npm version: $(npm --version)"
    
    # Install dependencies
    print_status "Installing Node.js dependencies..."
    npm install
    if [ $? -ne 0 ]; then
        print_error "Failed to install Node.js dependencies"
        return 1
    fi
    
    print_success "Node.js environment setup complete"
    cd ..
    return 0
}

# Function to run Python tests
run_python_tests() {
    print_header "Running Python Backend Tests"
    
    cd Backend || {
        print_error "Backend directory not found!"
        return 1
    }
    
    # Activate virtual environment
    source venv/bin/activate
    
    # Set test environment variables
    export TESTING=true
    export DATABASE_URL="sqlite:///./test.db"
    
    print_status "Running pytest with coverage..."
    pytest --cov=. --cov-report=term-missing --cov-report=html:htmlcov -v
    PYTHON_EXIT_CODE=$?
    
    if [ $PYTHON_EXIT_CODE -eq 0 ]; then
        print_success "Python tests completed successfully"
        print_status "Coverage report generated in Backend/htmlcov/index.html"
    else
        print_error "Python tests failed with exit code $PYTHON_EXIT_CODE"
    fi
    
    cd ..
    return $PYTHON_EXIT_CODE
}

# Function to run Node.js tests
run_node_tests() {
    print_header "Running Node.js SBackend Tests"
    
    cd SBackend || {
        print_error "SBackend directory not found!"
        return 1
    }
    
    print_status "Running Jest tests with coverage..."
    npm run test:coverage
    NODE_EXIT_CODE=$?
    
    if [ $NODE_EXIT_CODE -eq 0 ]; then
        print_success "Node.js tests completed successfully"
        print_status "Coverage report generated in SBackend/coverage/lcov-report/index.html"
    else
        print_error "Node.js tests failed with exit code $NODE_EXIT_CODE"
    fi
    
    cd ..
    return $NODE_EXIT_CODE
}

# Function to generate combined test report
generate_report() {
    print_header "Test Execution Summary"
    
    echo "Backend Tests: $([ $1 -eq 0 ] && echo -e "${GREEN}PASSED${NC}" || echo -e "${RED}FAILED${NC}")"
    echo "SBackend Tests: $([ $2 -eq 0 ] && echo -e "${GREEN}PASSED${NC}" || echo -e "${RED}FAILED${NC}")"
    echo ""
    
    if [ $1 -eq 0 ] && [ $2 -eq 0 ]; then
        print_success "All tests passed successfully! 🎉"
        echo ""
        echo "Coverage Reports:"
        echo "  - Backend: file://$(pwd)/Backend/htmlcov/index.html"
        echo "  - SBackend: file://$(pwd)/SBackend/coverage/lcov-report/index.html"
        return 0
    else
        print_error "Some tests failed. Please check the output above."
        return 1
    fi
}

# Function to clean up test artifacts
cleanup() {
    print_status "Cleaning up test artifacts..."
    
    # Clean Python test artifacts
    if [ -d "Backend" ]; then
        cd Backend
        rm -f test.db test.db-* .coverage
        find . -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null || true
        find . -name "*.pyc" -delete 2>/dev/null || true
        cd ..
    fi
    
    # Clean Node.js test artifacts
    if [ -d "SBackend" ]; then
        cd SBackend
        rm -rf coverage/.nyc_output 2>/dev/null || true
        cd ..
    fi
    
    print_success "Cleanup completed"
}

# Main execution
main() {
    print_header "Automated Test Runner for Backend & SBackend"
    
    # Check if we're in the right directory
    if [ ! -d "Backend" ] || [ ! -d "SBackend" ]; then
        print_error "Please run this script from the project root directory containing Backend and SBackend folders"
        exit 1
    fi
    
    # Parse command line arguments
    SKIP_SETUP=false
    CLEANUP_ONLY=false
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            --skip-setup)
                SKIP_SETUP=true
                shift
                ;;
            --cleanup-only)
                CLEANUP_ONLY=true
                shift
                ;;
            --help)
                echo "Usage: $0 [OPTIONS]"
                echo ""
                echo "OPTIONS:"
                echo "  --skip-setup     Skip environment setup (faster if already set up)"
                echo "  --cleanup-only   Only clean up test artifacts and exit"
                echo "  --help          Show this help message"
                exit 0
                ;;
            *)
                print_error "Unknown option: $1"
                echo "Use --help for usage information"
                exit 1
                ;;
        esac
    done
    
    # Handle cleanup-only mode
    if [ "$CLEANUP_ONLY" = true ]; then
        cleanup
        exit 0
    fi
    
    # Setup environments (unless skipped)
    if [ "$SKIP_SETUP" = false ]; then
        setup_python_env
        PYTHON_SETUP_EXIT=$?
        
        setup_node_env
        NODE_SETUP_EXIT=$?
        
        if [ $PYTHON_SETUP_EXIT -ne 0 ] || [ $NODE_SETUP_EXIT -ne 0 ]; then
            print_error "Environment setup failed. Exiting."
            exit 1
        fi
    else
        print_warning "Skipping environment setup as requested"
    fi
    
    # Run tests
    run_python_tests
    PYTHON_TEST_EXIT=$?
    
    run_node_tests
    NODE_TEST_EXIT=$?
    
    # Generate report
    generate_report $PYTHON_TEST_EXIT $NODE_TEST_EXIT
    REPORT_EXIT=$?
    
    # Overall exit code
    if [ $PYTHON_TEST_EXIT -eq 0 ] && [ $NODE_TEST_EXIT -eq 0 ]; then
        exit 0
    else
        exit 1
    fi
}

# Trap to ensure cleanup on script exit
trap cleanup EXIT

# Run main function
main "$@" 