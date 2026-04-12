#!/bin/bash
# Easy wrapper for collect-emails.js

cd /home/ubuntu/nigents

echo "=========================================="
echo "  EMAIL COLLECTOR"
echo "=========================================="

if [ -z "$1" ]; then
    echo ""
    echo "Usage: ./collect-emails.sh [command]"
    echo ""
    echo "Commands:"
    echo "  list           - Show all subscribers"
    echo "  stats          - Show statistics"
    echo "  export-csv     - Export to CSV"
    echo "  export-emails  - Export emails only"
    echo "  count          - Show count only"
    echo ""
    echo "Examples:"
    echo "  ./collect-emails.sh list"
    echo "  ./collect-emails.sh stats"
    echo "  ./collect-emails.sh export-csv"
    exit 0
fi

node scripts/collect-emails.js "$1"

echo ""
echo "=========================================="
echo "  Files location: /home/ubuntu/nigents/data/"
echo "=========================================="
