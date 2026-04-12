#!/bin/bash
# Upload PDFs to EC2 server
# Run this from your local machine

if [ -z "$1" ]; then
    echo "Usage: ./upload-pdfs.sh <EC2_IP_OR_DOMAIN>"
    echo "Example: ./upload-pdfs.sh nigents.com"
    echo ""
    echo "Make sure you have:"
    echo "  1. SSH key configured for ubuntu@<EC2_IP>"
    echo "  2. The 4 PDF files in the current directory:"
    echo "     - px_fullstack_30day.pdf"
    echo "     - px_backend_30day.pdf"
    echo "     - problemx_30day_plan (2).pdf (will be renamed to frontend-roadmap.pdf)"
    echo "     - px_qa_30day.pdf"
    exit 1
fi

EC2_HOST="$1"
EC2_USER="ubuntu"
REMOTE_DIR="/home/ubuntu/nigents/src/dashboard/public/materials"

echo "=========================================="
echo "  UPLOADING PDFs TO EC2"
echo "=========================================="
echo "Target: $EC2_USER@$EC2_HOST"
echo "Remote directory: $REMOTE_DIR"
echo ""

# Check if files exist locally
echo "Checking local files..."
FILES_TO_UPLOAD=()

if [ -f "px_fullstack_30day.pdf" ]; then
    FILES_TO_UPLOAD+=("px_fullstack_30day.pdf:fullstack-roadmap.pdf")
    echo "  ✓ px_fullstack_30day.pdf -> fullstack-roadmap.pdf"
else
    echo "  ✗ px_fullstack_30day.pdf NOT FOUND"
fi

if [ -f "px_backend_30day.pdf" ]; then
    FILES_TO_UPLOAD+=("px_backend_30day.pdf:backend-roadmap.pdf")
    echo "  ✓ px_backend_30day.pdf -> backend-roadmap.pdf"
else
    echo "  ✗ px_backend_30day.pdf NOT FOUND"
fi

if [ -f "problemx_30day_plan (2).pdf" ]; then
    FILES_TO_UPLOAD+=("problemx_30day_plan (2).pdf:frontend-roadmap.pdf")
    echo "  ✓ problemx_30day_plan (2).pdf -> frontend-roadmap.pdf"
else
    echo "  ✗ problemx_30day_plan (2).pdf NOT FOUND"
fi

if [ -f "px_qa_30day.pdf" ]; then
    FILES_TO_UPLOAD+=("px_qa_30day.pdf:qa-roadmap.pdf")
    echo "  ✓ px_qa_30day.pdf -> qa-roadmap.pdf"
else
    echo "  ✗ px_qa_30day.pdf NOT FOUND"
fi

if [ ${#FILES_TO_UPLOAD[@]} -eq 0 ]; then
    echo ""
    echo "ERROR: No PDF files found to upload!"
    exit 1
fi

echo ""
echo "Creating remote directory..."
ssh "$EC2_USER@$EC2_HOST" "mkdir -p $REMOTE_DIR"

echo ""
echo "Uploading files..."
for file_mapping in "${FILES_TO_UPLOAD[@]}"; do
    local_file="${file_mapping%%:*}"
    remote_file="${file_mapping##*:}"
    
    echo ""
    echo "Uploading: $local_file -> $remote_file"
    scp "$local_file" "$EC2_USER@$EC2_HOST:$REMOTE_DIR/$remote_file"
    
    if [ $? -eq 0 ]; then
        echo "  ✓ Success"
    else
        echo "  ✗ Failed"
    fi
done

echo ""
echo "=========================================="
echo "  UPLOAD COMPLETE!"
echo "=========================================="
echo ""
echo "Verifying files on server..."
ssh "$EC2_USER@$EC2_HOST" "ls -lh $REMOTE_DIR/"

echo ""
echo "PDF URLs:"
echo "  https://$EC2_HOST/materials/fullstack-roadmap.pdf"
echo "  https://$EC2_HOST/materials/backend-roadmap.pdf"
echo "  https://$EC2_HOST/materials/frontend-roadmap.pdf"
echo "  https://$EC2_HOST/materials/qa-roadmap.pdf"
