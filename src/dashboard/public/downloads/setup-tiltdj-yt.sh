#!/bin/bash
#
# TiltDJ Setup Script
# Comprehensive installer for yt-dlp on macOS (Apple Silicon & Intel)
#

set -e

echo "🎵 TiltDJ Setup - Installing yt-dlp for YouTube downloads"
echo "=========================================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Function to print colored output
print_info() {
    echo -e "${CYAN}ℹ️  $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Detect architecture
ARCH=$(uname -m)
print_info "Detected architecture: $ARCH"

if [[ "$ARCH" == "arm64" ]]; then
    print_info "Apple Silicon (M1/M2/M3) detected"
    HOMEBREW_PREFIX="/opt/homebrew"
else
    print_info "Intel Mac detected"
    HOMEBREW_PREFIX="/usr/local"
fi

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to check if yt-dlp exists
check_ytdlp() {
    if command_exists yt-dlp; then
        return 0
    fi
    
    # Check common locations
    if [[ -f "$HOMEBREW_PREFIX/bin/yt-dlp" ]]; then
        return 0
    fi
    
    if [[ -f "/usr/local/bin/yt-dlp" ]]; then
        return 0
    fi
    
    return 1
}

# Step 1: Check if yt-dlp already installed
if check_ytdlp; then
    print_success "yt-dlp is already installed!"
    YTDLP_PATH=$(which yt-dlp 2>/dev/null || echo "$HOMEBREW_PREFIX/bin/yt-dlp")
    print_info "Location: $YTDLP_PATH"
    exit 0
fi

print_warning "yt-dlp not found. Starting installation..."
echo ""

# Step 2: Check for Homebrew
install_homebrew() {
    print_warning "Homebrew not found. Installing Homebrew first..."
    echo ""
    echo "This is a one-time installation. It may take a few minutes."
    echo ""
    
    # Install Homebrew with architecture-specific command
    if [[ "$ARCH" == "arm64" ]]; then
        print_info "Installing Homebrew for Apple Silicon..."
        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
        
        # Add Homebrew to PATH for Apple Silicon
        print_info "Adding Homebrew to PATH..."
        echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
        eval "$(/opt/homebrew/bin/brew shellenv)"
    else
        print_info "Installing Homebrew for Intel..."
        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    fi
    
    if command_exists brew; then
        print_success "Homebrew installed successfully!"
    else
        print_error "Homebrew installation failed"
        return 1
    fi
}

if ! command_exists brew; then
    install_homebrew || {
        print_error "Could not install Homebrew. Trying alternative method..."
    }
fi

# Step 3: Install yt-dlp using Homebrew (preferred method)
install_with_brew() {
    print_info "Installing yt-dlp using Homebrew..."
    
    # Update Homebrew
    brew update
    
    # Install yt-dlp
    if brew install yt-dlp; then
        print_success "yt-dlp installed via Homebrew!"
        return 0
    else
        print_error "Homebrew install failed"
        return 1
    fi
}

# Step 4: Install yt-dlp directly (fallback method)
install_direct() {
    print_warning "Trying direct installation..."
    print_info "Downloading yt-dlp binary..."
    
    # Create directory
    sudo mkdir -p /usr/local/bin
    
    # Download appropriate binary
    if [[ "$ARCH" == "arm64" ]]; then
        YTDLP_URL="https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos"
    else
        YTDLP_URL="https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos_legacy"
    fi
    
    print_info "Downloading from: $YTDLP_URL"
    
    # Download with sudo
    if sudo curl -L "$YTDLP_URL" -o /usr/local/bin/yt-dlp; then
        sudo chmod +x /usr/local/bin/yt-dlp
        print_success "yt-dlp downloaded and installed!"
        return 0
    else
        print_error "Direct download failed"
        return 1
    fi
}

# Step 5: Install using Python pip (last resort)
install_with_pip() {
    print_warning "Trying Python pip installation..."
    
    if ! command_exists python3; then
        print_error "Python3 not found. Cannot use pip method."
        return 1
    fi
    
    print_info "Installing yt-dlp via pip..."
    python3 -m pip install --user yt-dlp
    
    # Add to PATH
    PIP_BIN="$HOME/.local/bin"
    if [[ -d "$PIP_BIN" ]]; then
        export PATH="$PIP_BIN:$PATH"
        # Add to shell profile
        if ! grep -q "$PIP_BIN" ~/.zshrc 2>/dev/null; then
            echo "export PATH=\"$PIP_BIN:\$PATH\"" >> ~/.zshrc
        fi
    fi
    
    if check_ytdlp; then
        print_success "yt-dlp installed via pip!"
        return 0
    else
        return 1
    fi
}

# Main installation logic
MAIN_SUCCESS=false

# Try Homebrew first (best method)
if command_exists brew; then
    if install_with_brew; then
        MAIN_SUCCESS=true
    fi
fi

# Try direct download
if [[ "$MAIN_SUCCESS" == false ]]; then
    if install_direct; then
        MAIN_SUCCESS=true
    fi
fi

# Try pip as last resort
if [[ "$MAIN_SUCCESS" == false ]]; then
    if install_with_pip; then
        MAIN_SUCCESS=true
    fi
fi

# Verify installation
echo ""
echo "=========================================================="
if check_ytdlp; then
    print_success "yt-dlp installed successfully!"
    YTDLP_VERSION=$(yt-dlp --version 2>/dev/null || echo "unknown")
    print_info "Version: $YTDLP_VERSION"
    YTDLP_PATH=$(which yt-dlp 2>/dev/null || echo "$HOMEBREW_PREFIX/bin/yt-dlp")
    print_info "Location: $YTDLP_PATH"
    echo ""
    print_success "You can now use YouTube downloads in TiltDJ!"
    echo ""
    echo "Next steps:"
    echo "  1. Close this window"
    echo "  2. Restart TiltDJ"
    echo "  3. Try downloading a YouTube video!"
    exit 0
else
    print_error "Installation failed"
    echo ""
    echo "Please try installing manually:"
    echo "  1. Open Terminal"
    echo "  2. For Apple Silicon Macs:"
    echo "     arch -arm64 brew install yt-dlp"
    echo "  3. For Intel Macs:"
    echo "     brew install yt-dlp"
    echo ""
    echo "Or download manually from:"
    echo "  https://github.com/yt-dlp/yt-dlp/releases"
    exit 1
fi
