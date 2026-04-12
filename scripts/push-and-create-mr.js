#!/usr/bin/env node
/**
 * Push a branch to GitLab and create a merge request.
 * Use when the task branch exists locally but was not pushed (e.g. OpenHands failed).
 *
 * Usage:
 *   From the project repo (the repo you want to push):
 *     REPO_PATH=/path/to/your/repo node scripts/push-and-create-mr.js <branch> <project> [title] [description]
 *   Or from inside the project repo:
 *     node /path/to/nightowl/scripts/push-and-create-mr.js <branch> <project> [title] [description]
 *
 * Example:
 *   node scripts/push-and-create-mr.js nigents/task-1773630562584 bonyad-tech/nigents "feat: login page"
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const { execSync } = require('child_process');
const path = require('path');

const branch = process.argv[2];
const project = process.argv[3];
const title = process.argv[4] || `Merge ${branch} into main`;
const description = process.argv[5] || '';

if (!branch || !project) {
  console.error('Usage: node push-and-create-mr.js <branch> <project> [title] [description]');
  console.error('Example: node push-and-create-mr.js nigents/task-1773630562584 bonyad-tech/nigents');
  process.exit(1);
}

const repoDir = process.env.REPO_PATH || process.cwd();

async function main() {
  console.log('Pushing branch to GitLab...');
  try {
    execSync(`git push origin ${branch}`, {
      cwd: repoDir,
      stdio: 'inherit',
    });
  } catch (err) {
    console.error('Push failed. Ensure the branch exists and you have push access.');
    process.exit(1);
  }

  console.log('Creating merge request...');
  const gitlab = require(path.join(__dirname, '../src/tools/gitlab'));
  try {
    const mr = await gitlab.createMergeRequest({
      project,
      title,
      description,
      sourceBranch: branch,
      targetBranch: 'main',
    });
    console.log('Merge request created:');
    console.log(mr.url);
  } catch (err) {
    console.error('Failed to create MR:', err.message);
    process.exit(1);
  }
}

main();
