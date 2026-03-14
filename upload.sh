#!/bin/bash
# Upload PDFs to EC2 server

HOST="ubuntu@18.194.120.153"
KEY="-i openclaw.pem"
REMOTE_DIR="/home/ubuntu/nigents/src/dashboard/public/materials"

echo "=========================================="
echo "  UPLOADING PDFs TO EC2"
echo "=========================================="
echo "Target: $HOST"
echo ""

# Check if key file exists
if [ ! -f "openclaw.pem" ]; then
    echo "❌ ERROR: openclaw.pem not found in current directory!"
    echo "Please ensure openclaw.pem is in: $(pwd)"
    exit 1
fi

# Check if PDFs exist
echo "Checking local PDFs..."
for pdf in px_fullstack_30day.pdf px_backend_30day.pdf "problemx_30day_plan (2).pdf" px_qa_30day.pdf; do
    if [ -f "$pdf" ]; then
        echo "  ✓ $pdf"
    else
        echo "  ✗ $pdf NOT FOUND"
    fi
done

echo ""
echo "Creating remote directory..."
ssh $KEY $HOST "mkdir -p $REMOTE_DIR"

echo ""
echo "Uploading files..."

scp $KEY px_fullstack_30day.pdf $HOST:$REMOTE_DIR/fullstack-roadmap.pdf
if [ $? -eq 0 ]; then
    echo "  ✓ Fullstack roadmap uploaded"
else
    echo "  ✗ Fullstack upload failed"
fi

scp $KEY px_backend_30day.pdf $HOST:$REMOTE_DIR/backend-roadmap.pdf
if [ $? -eq 0 ]; then
    echo "  ✓ Backend roadmap uploaded"
else
    echo "  ✗ Backend upload failed"
fi

scp $KEY "problemx_30day_plan (2).pdf" $HOST:$REMOTE_DIR/frontend-roadmap.pdf
if [ $? -eq 0 ]; then
    echo "  ✓ Frontend roadmap uploaded"
else
    echo "  ✗ Frontend upload failed"
fi

scp $KEY px_qa_30day.pdf $HOST:$REMOTE_DIR/qa-roadmap.pdf
if [ $? -eq 0 ]; then
    echo "  ✓ QA roadmap uploaded"
else
    echo "  ✗ QA upload failed"
fi

echo ""
echo "=========================================="
echo "  VERIFYING UPLOAD"
echo "=========================================="
ssh $KEY $HOST "ls -lh $REMOTE_DIR/"

echo ""
echo "=========================================="
echo "  UPLOAD COMPLETE!"
echo "=========================================="
echo ""
echo "PDF URLs:"
echo "  https://nigents.com/materials/fullstack-roadmap.pdf"
echo "  https://nigents.com/materials/backend-roadmap.pdf"
echo "  https://nigents.com/materials/frontend-roadmap.pdf"
echo "  https://nigents.com/materials/qa-roadmap.pdf"
