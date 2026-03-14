#!/bin/bash
# Test GitLab API integration

echo "=== Testing GitLab API ==="
echo ""

# Test 1: Config API
echo "Test 1: /api/gitlab/config"
curl -s http://localhost:4000/api/gitlab/config | jq .
echo ""

# Test 2: Repos API  
echo "Test 2: /api/gitlab/repos"
curl -s http://localhost:4000/api/gitlab/repos | jq .
echo ""

# Test 3: Direct GitLab API test (bypass our server)
echo "Test 3: Direct GitLab API (requires token)"
TOKEN=$(grep GITLAB_TOKEN /home/ubuntu/nigents/.env | cut -d'=' -f2)
if [ -n "$TOKEN" ]; then
  curl -s -H "PRIVATE-TOKEN: $TOKEN" \
    "https://gitlab.com/api/v4/projects?membership=true&per_page=5" | jq '.[].name'
else
  echo "No token found in .env"
fi
