import { exec } from 'child_process';
import { promisify } from 'util';
import chalk from 'chalk';
import ora from 'ora';
import { git } from '../git.js';
import { PACKAGE_VERSION } from '../version.js';
import { handleNerdError, formatError } from '../errors.js';
import { getUpstreamInfo } from '../git-context.js';
import { sanitizeForTerminal } from '../output.js';
import { quipSpinnerText } from '../quips.js';

const execAsync = promisify(exec);

interface NpmRegistryResponse {
  version: string;
}

async function getLatestVersion(): Promise<string | null> {
  try {
    const response = await fetch('https://registry.npmjs.org/@coder11125/omg/latest');
    if (!response.ok) {
      return null;
    }
    const data = await response.json() as NpmRegistryResponse;
    return data.version;
  } catch {
    return null;
  }
}

function compareVersions(current: string, latest: string): number {
  const currentParts = current.split('.').map(Number);
  const latestParts = latest.split('.').map(Number);

  for (let i = 0; i < Math.max(currentParts.length, latestParts.length); i++) {
    const currentPart = currentParts[i] || 0;
    const latestPart = latestParts[i] || 0;

    if (currentPart > latestPart) return 1;
    if (currentPart < latestPart) return -1;
  }

  return 0;
}

async function performUpdate(version: string): Promise<void> {
  const spinner = ora(quipSpinnerText('update_run', `Updating omg to ${chalk.cyan(version)}`)).start();

  try {
    await execAsync('npm install -g @coder11125/omg');
    spinner.succeed(chalk.green(`Updated to version ${version}`));
  } catch (err) {
    spinner.fail(chalk.red('Update failed'));
    handleNerdError(err);
    process.exitCode = 1;
  }
}

export async function updateOmg(): Promise<void> {
  const currentVersion = PACKAGE_VERSION;

  const spinner = ora(quipSpinnerText('update_check', 'Checking for updates')).start();
  const latestVersion = await getLatestVersion();

  if (!latestVersion) {
    spinner.fail(chalk.red('Could not fetch latest version'));
    console.error(chalk.red('Check your internet connection and try again.'));
    process.exitCode = 1;
    return;
  }

  const comparison = compareVersions(currentVersion, latestVersion);

  if (comparison === 0) {
    spinner.succeed(chalk.green(`Already up-to-date (${currentVersion})`));
  } else if (comparison < 0) {
    spinner.stop();
    await performUpdate(latestVersion);
  } else {
    spinner.warn(chalk.yellow(`Running a newer version than published (${currentVersion} > ${latestVersion})`));
  }
}

interface ShipStatus {
  hasUncommitted: boolean;
  hasStaged: boolean;
  branch: string;
  ahead: number;
  behind: number;
  tracking: string | null;
  remoteName: string | null;
  remoteBranch: string | null;
  remoteUrl: string | null;
}

async function getShipStatus(): Promise<ShipStatus> {
  const [status, remotes] = await Promise.all([git.status(), git.getRemotes(true)]);
  const upstream = getUpstreamInfo(status);
  const selectedRemote = upstream.remoteName
    ? remotes.find(remote => remote.name === upstream.remoteName) ?? remotes[0]
    : remotes[0];
  const remoteUrl = selectedRemote ? (selectedRemote.refs.fetch || selectedRemote.refs.push) : null;

  return {
    hasUncommitted: status.modified.length > 0 || status.deleted.length > 0 || status.not_added.length > 0,
    hasStaged: status.staged.length > 0,
    branch: status.current ?? 'HEAD',
    ahead: status.ahead,
    behind: status.behind,
    tracking: status.tracking,
    remoteName: upstream.remoteName,
    remoteBranch: upstream.remoteBranch,
    remoteUrl,
  };
}

export async function shipChanges(message: string | undefined, useRebase: boolean, dryRun: boolean): Promise<void> {
  console.log(chalk.bold('\n🚢  Shipping changes...\n'));

  // Step 1: Check current status
  const spinner = ora(quipSpinnerText('ship_analyze', 'Analyzing repository state')).start();
  let shipStatus: ShipStatus;
  try {
    shipStatus = await getShipStatus();
    spinner.succeed(`On branch ${chalk.cyan(sanitizeForTerminal(shipStatus.branch))}`);
  } catch (err) {
    spinner.fail(chalk.red('Failed to analyze repository'));
    handleNerdError(err);
    process.exitCode = 1;
    return;
  }

  if (dryRun) {
    console.log(chalk.yellow('\n📋  Dry run - would perform:\n'));
  }

  // Step 2: Handle uncommitted changes
  if (shipStatus.hasUncommitted || shipStatus.hasStaged) {
    if (message) {
      // Stage and commit
      const stepSpinner = ora(quipSpinnerText('ship_commit', `${dryRun ? 'Would' : 'Staging and committing'}`)).start();
      if (!dryRun) {
        try {
          await git.add('.');
          const result = await git.commit(message, undefined, { '--': null });
          stepSpinner.succeed(`Committed: ${chalk.cyan(sanitizeForTerminal(message))}${result.commit ? ` (${result.commit.slice(0, 7)})` : ''}`);
        } catch (err) {
          stepSpinner.fail(chalk.red('Commit failed'));
          handleNerdError(err);
          process.exitCode = 1;
          return;
        }
      } else {
        stepSpinner.succeed(`Would commit: ${chalk.cyan(sanitizeForTerminal(message))}`);
      }
    } else {
      // Just stage if there are unstaged changes
      if (shipStatus.hasUncommitted) {
        const stepSpinner = ora(quipSpinnerText('ship_stage', `${dryRun ? 'Would' : 'Staging'} uncommitted changes`)).start();
        if (!dryRun) {
          try {
            await git.add('.');
            stepSpinner.succeed('Staged all changes');
          } catch (err) {
            stepSpinner.fail(chalk.red('Failed to stage'));
            handleNerdError(err);
            process.exitCode = 1;
            return;
          }
        } else {
          stepSpinner.succeed('Would stage uncommitted changes');
        }
      }
    }
  }

  // Step 3: Fetch to check sync status
  const fetchSpinner = ora(quipSpinnerText('ship_fetch', `${dryRun ? 'Would fetch' : 'Fetching'} from remote`)).start();
  if (!dryRun) {
    try {
      await git.fetch();
      // Re-check status after fetch
      shipStatus = await getShipStatus();
      fetchSpinner.succeed('Fetched latest changes');
    } catch (err) {
      fetchSpinner.fail(chalk.red('Fetch failed'));
      handleNerdError(err);
      process.exitCode = 1;
      return;
    }
  } else {
    fetchSpinner.succeed('Would fetch from remote');
  }

  // Step 4: Show sync status
  if (shipStatus.behind > 0 || shipStatus.ahead > 0) {
    const parts: string[] = [];
    if (shipStatus.behind > 0) parts.push(chalk.red(`↓ ${shipStatus.behind} behind`));
    if (shipStatus.ahead > 0) parts.push(chalk.green(`↑ ${shipStatus.ahead} ahead`));
    console.log(chalk.dim(`   Sync status: ${parts.join(', ')}`));
  }

  // Step 5: Rebase if behind
  if (shipStatus.behind > 0) {
    if (useRebase) {
      const rebaseSpinner = ora(quipSpinnerText('ship_rebase', `${dryRun ? 'Would rebase' : 'Rebasing'} onto remote`)).start();
      if (!dryRun) {
        try {
          await git.rebase([shipStatus.tracking ?? 'origin/' + shipStatus.branch]);
          rebaseSpinner.succeed(`Rebased ${shipStatus.behind} commit${shipStatus.behind > 1 ? 's' : ''}`);
        } catch (err) {
          rebaseSpinner.fail(chalk.red('Rebase failed'));
          handleNerdError(err);
          process.exitCode = 1;
          return;
        }
      } else {
        rebaseSpinner.succeed(`Would rebase ${shipStatus.behind} commit${shipStatus.behind > 1 ? 's' : ''}`);
      }
    } else {
      const mergeSpinner = ora(quipSpinnerText('ship_merge', `${dryRun ? 'Would merge' : 'Merging'} remote changes`)).start();
      if (!dryRun) {
        try {
          await git.merge([shipStatus.tracking ?? 'origin/' + shipStatus.branch]);
          mergeSpinner.succeed(`Merged ${shipStatus.behind} commit${shipStatus.behind > 1 ? 's' : ''}`);
        } catch (err) {
          mergeSpinner.fail(chalk.red('Merge failed'));
          handleNerdError(err);
          process.exitCode = 1;
          return;
        }
      } else {
        mergeSpinner.succeed(`Would merge ${shipStatus.behind} commit${shipStatus.behind > 1 ? 's' : ''}`);
      }
    }
  }

  // Step 6: Push
  const pushSpinner = ora(quipSpinnerText('ship_push', `${dryRun ? 'Would push' : 'Pushing'} to remote`)).start();
  if (!dryRun) {
    try {
      const pushOptions: string[] = [];
      const remoteName = shipStatus.remoteName ?? 'origin';
      const remoteBranch = shipStatus.remoteBranch ?? shipStatus.branch;
      if (!shipStatus.tracking) {
        pushOptions.push('-u');
      }
      await git.push(remoteName, shipStatus.branch, pushOptions);
      pushSpinner.succeed(chalk.green(`Shipped to ${chalk.cyan(sanitizeForTerminal(`${remoteName}/${remoteBranch}`))}`));
    } catch (err) {
      pushSpinner.fail(chalk.red('Push failed'));
      handleNerdError(err);
      process.exitCode = 1;
      return;
    }
  } else {
    pushSpinner.succeed('Would push to remote');
  }

  // Step 7: Show PR URL hint if GitHub remote
  if (shipStatus.remoteUrl && shipStatus.remoteUrl.includes('github.com')) {
    const match = shipStatus.remoteUrl.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
    if (match) {
      const [, owner, repo] = match;
      const prUrl = `https://github.com/${owner}/${repo}/pulls`;
      console.log(chalk.dim(`\n💡  View/create PR: ${chalk.cyan(prUrl)}`));
    }
  }

  console.log(chalk.green('\n✅  Ship complete!\n'));
}

interface SyncState {
  originalBranch: string;
  hadStash: boolean;
  stashMessage: string;
}

export async function syncWorkspace(baseBranch: string): Promise<void> {
  console.log(chalk.bold('\n🔄  Syncing workspace...\n'));

  const state: SyncState = {
    originalBranch: '',
    hadStash: false,
    stashMessage: `omg-sync-${Date.now()}`,
  };

  // Step 1: Get current branch and check status
  const checkSpinner = ora(quipSpinnerText('sync_check', 'Checking repository state')).start();
  let initialStatus: Awaited<ReturnType<typeof git.status>>;
  try {
    initialStatus = await git.status();
    state.originalBranch = initialStatus.current ?? 'HEAD';

    // Check if on a branch (not detached HEAD)
    if (state.originalBranch === 'HEAD') {
      checkSpinner.fail(chalk.red('Cannot sync in detached HEAD state'));
      console.error(chalk.red('Checkout a branch first'));
      process.exitCode = 1;
      return;
    }

    checkSpinner.succeed(`On branch ${chalk.cyan(state.originalBranch)}`);
  } catch (err) {
    checkSpinner.fail(chalk.red('Failed to check repository'));
    handleNerdError(err);
    process.exitCode = 1;
    return;
  }

  // Don't sync if already on base branch
  if (state.originalBranch === baseBranch) {
    console.log(chalk.yellow(`Already on ${baseBranch}. Just pulling updates...`));
    await pullAndPrune(baseBranch);
    return;
  }

  // Step 2: Stash if needed (reuse initial status — avoids a second git status round-trip)
  const hasChanges = initialStatus.modified.length > 0 || initialStatus.deleted.length > 0 ||
                     initialStatus.not_added.length > 0 || initialStatus.staged.length > 0;

  if (hasChanges) {
    const stashSpinner = ora(quipSpinnerText('sync_stash', 'Stashing local changes')).start();
    try {
      const stashResult = await git.stash(['save', state.stashMessage]);
      // Check if stash actually saved something (git returns "No local changes to save" if nothing to stash)
      if (stashResult && typeof stashResult === 'string' && stashResult.includes('No local changes')) {
        stashSpinner.warn('No changes to stash');
        state.hadStash = false;
      } else {
        state.hadStash = true;
        stashSpinner.succeed('Changes stashed');
      }
    } catch (err) {
      const msg = formatError(err);
      if (msg.includes('No local changes') || msg.includes('nothing to commit')) {
        stashSpinner.warn('No changes to stash');
        state.hadStash = false;
      } else {
        stashSpinner.fail(chalk.red('Failed to stash'));
        console.error(chalk.red(msg));
        process.exitCode = 1;
        return;
      }
    }
  }

  // Step 3: Checkout base branch
  const checkoutSpinner = ora(quipSpinnerText('sync_checkout_base', `Switching to ${chalk.cyan(baseBranch)}`)).start();
  try {
    await git.checkout(baseBranch);
    checkoutSpinner.succeed(`Switched to ${baseBranch}`);
  } catch (err) {
    checkoutSpinner.fail(chalk.red(`Failed to checkout ${baseBranch}`));
    const msg = formatError(err);
    if (msg.includes('did not match')) {
      console.error(chalk.red(`Branch '${baseBranch}' not found`));
      console.error(chalk.dim(`Try: omg sync -b master  (or main, develop, etc.)`));
    } else {
      console.error(chalk.red(msg));
    }
    process.exitCode = 1;
    return;
  }

  // Step 4: Pull and prune
  const success = await pullAndPrune(baseBranch);
  if (!success) {
    // Try to go back to original branch even if pull failed
    await git.checkout(state.originalBranch).catch(() => { /* ignore */ });
    if (state.hadStash) {
      await git.stash(['pop']).catch(() => { /* ignore */ });
    }
    return;
  }

  // Step 5: Go back to original branch
  const returnSpinner = ora(quipSpinnerText('sync_return', `Returning to ${chalk.cyan(state.originalBranch)}`)).start();
  try {
    await git.checkout(state.originalBranch);
    returnSpinner.succeed(`Back on ${state.originalBranch}`);
  } catch (err) {
    returnSpinner.fail(chalk.red('Failed to return to original branch'));
    handleNerdError(err);
    console.error(chalk.yellow(`You are now on ${baseBranch}. Manual recovery needed.`));
    process.exitCode = 1;
    return;
  }

  // Step 6: Pop stash
  if (state.hadStash) {
    const popSpinner = ora(quipSpinnerText('sync_pop', 'Restoring stashed changes')).start();
    try {
      await git.stash(['pop']);
      popSpinner.succeed('Changes restored');
    } catch (err) {
      popSpinner.fail(chalk.red('Failed to restore stash'));
      handleNerdError(err);
      console.error(chalk.yellow('Your changes are in the stash. Run: omg stash pop'));
      process.exitCode = 1;
      return;
    }
  }

  // Step 7: Suggest rebase if behind
  const finalStatus = await git.status();
  if (finalStatus.behind > 0) {
    console.log(chalk.dim(`\n💡  Your branch is ${finalStatus.behind} commit${finalStatus.behind > 1 ? 's' : ''} behind ${baseBranch}`));
    console.log(chalk.dim(`   Run: omg ship  (to rebase and push)`));
  }

  console.log(chalk.green('\n✅  Sync complete!\n'));
}

async function pullAndPrune(branch: string): Promise<boolean> {
  // Pull with rebase
  const pullSpinner = ora(quipSpinnerText('sync_pull', `Pulling latest ${branch}`)).start();
  try {
    await git.pull(['--rebase']);
    pullSpinner.succeed(`${branch} is up to date`);
  } catch (err) {
    pullSpinner.fail(chalk.red(`Failed to pull ${branch}`));
    const msg = formatError(err);
    if (msg.includes('conflicts')) {
      console.error(chalk.red('Merge conflicts. Resolve them and run sync again.'));
    } else {
      console.error(chalk.red(msg));
    }
    process.exitCode = 1;
    return false;
  }

  // Prune stale remote branches
  const pruneSpinner = ora(quipSpinnerText('sync_prune', 'Pruning stale remote branches')).start();
  try {
    await git.raw(['remote', 'prune', 'origin']);
    pruneSpinner.succeed('Pruned stale branches');
  } catch (err) {
    pruneSpinner.warn(chalk.yellow('Could not prune (no remote?)'));
    // Don't fail here, just warn
  }

  return true;
}

// ---------------------------------------------------------------------------
// doctor helpers
// ---------------------------------------------------------------------------
interface HealthIssue {
  severity: 'error' | 'warning' | 'info';
  message: string;
  fixable: boolean;
  autoFix?: () => Promise<boolean>;
}

export async function runDoctor(autoFix: boolean): Promise<void> {
  console.log(chalk.bold('\n🏥  Running health checks...\n'));

  const issues: HealthIssue[] = [];
  const spinner = ora(quipSpinnerText('doctor_analyze', 'Analyzing repository')).start();

  try {
    const [status, remotes, mergeHead, stashListRaw, recentFiles, gitDirOut] = await Promise.all([
      git.status(),
      git.getRemotes(),
      git.raw(['rev-parse', '--quiet', '--verify', 'MERGE_HEAD']).catch(() => ''),
      git.stash(['list']).catch(() => ''),
      git.raw(['diff-tree', '-r', '--name-only', '--no-commit-id', 'HEAD']).catch(() => ''),
      git.raw(['rev-parse', '--git-dir']).catch(() => ''),
    ]);

    // Check 1: Uncommitted changes
    if (status.modified.length > 0 || status.deleted.length > 0 || status.not_added.length > 0) {
      issues.push({
        severity: 'warning',
        message: `${status.modified.length + status.deleted.length + status.not_added.length} uncommitted file(s)`,
        fixable: true,
        autoFix: async () => {
          console.log(chalk.dim('   Staging all changes...'));
          await git.add('.');
          return true;
        },
      });
    }

    // Check 2: Staged but not committed
    if (status.staged.length > 0) {
      issues.push({
        severity: 'warning',
        message: `${status.staged.length} staged file(s) not committed`,
        fixable: false,
      });
    }

    // Check 3: Branch is behind (capture status values for autoFix closure)
    if (status.behind > 0) {
      const currentBranch = status.current;
      const trackingBranch = status.tracking;
      issues.push({
        severity: status.behind > 10 ? 'error' : 'warning',
        message: `Branch is ${status.behind} commit(s) behind remote`,
        fixable: true,
        autoFix: async () => {
          console.log(chalk.dim('   Fetching and rebasing...'));
          await git.fetch();
          const rebaseTarget = trackingBranch ?? `origin/${currentBranch}`;
          await git.rebase([rebaseTarget]);
          return true;
        },
      });
    }

    // Check 4: Branch is ahead (needs push)
    if (status.ahead > 0) {
      issues.push({
        severity: 'info',
        message: `Branch is ${status.ahead} commit(s) ahead of remote (needs push)`,
        fixable: false,
      });
    }

    // Check 5: No remote configured
    if (remotes.length === 0) {
      issues.push({
        severity: 'error',
        message: 'No remote repository configured',
        fixable: false,
      });
    }

    // Check 6: Merge in progress
    if (mergeHead.trim()) {
      issues.push({
        severity: 'error',
        message: 'Merge in progress (unresolved conflicts?)',
        fixable: false,
      });
    }

    // Check 7: Rebase in progress (simplified check using git status)
    if (status.conflicted.length > 0) {
      // Check if we're in a rebase by looking for .git/rebase-merge or .git/rebase-apply
      try {
        const { existsSync } = await import('fs');
        const { join } = await import('path');
        const gitDirPath = gitDirOut.trim();
        if (gitDirPath && (existsSync(join(gitDirPath, 'rebase-merge')) || existsSync(join(gitDirPath, 'rebase-apply')))) {
          issues.push({
            severity: 'error',
            message: 'Rebase in progress',
            fixable: false,
          });
        }
      } catch {
        // Can't determine, skip this check
      }
    }

    // Check 8: Detached HEAD
    if (!status.current) {
      issues.push({
        severity: 'error',
        message: 'In detached HEAD state',
        fixable: false,
      });
    }

    // Check 9: Large files in recent commits
    if (recentFiles.trim()) {
      const files = recentFiles.split('\n').filter(f => f.trim());
      // This is a simplified check - real implementation would check file sizes
      if (files.some(f => f.match(/\.(zip|tar|gz|exe|dll|so|dylib)$/i))) {
        issues.push({
          severity: 'warning',
          message: 'Binary files detected in recent commit (consider git-lfs)',
          fixable: false,
        });
      }
    }

    // Check 10: Old stashes
    const stashCount = stashListRaw.split('\n').filter(l => l.trim()).length;
    if (stashCount > 5) {
      issues.push({
        severity: 'warning',
        message: `${stashCount} stashes accumulating (consider cleaning up)`,
        fixable: false,
      });
    }

    spinner.succeed('Health check complete');
  } catch (err) {
    spinner.fail(chalk.red('Failed to run health checks'));
    handleNerdError(err);
    process.exitCode = 1;
    return;
  }

  // Display results
  if (issues.length === 0) {
    console.log(chalk.green('\n✅  Repository is healthy!\n'));
    return;
  }

  console.log(chalk.bold(`\nFound ${issues.length} issue(s):\n`));

  const errors = issues.filter(i => i.severity === 'error');
  const warnings = issues.filter(i => i.severity === 'warning');
  const infos = issues.filter(i => i.severity === 'info');

  for (const issue of errors) {
    console.log(`  ${chalk.red('✖')} ${issue.message}`);
    if (autoFix && issue.fixable && issue.autoFix) {
      const fixSpinner = ora(quipSpinnerText('doctor_fix', '  Attempting auto-fix...')).start();
      try {
        const fixed = await issue.autoFix();
        if (fixed) {
          fixSpinner.succeed(chalk.green('  Fixed!'));
        } else {
          fixSpinner.fail(chalk.red('  Could not auto-fix'));
        }
      } catch (fixErr) {
        fixSpinner.fail(chalk.red(`  Fix failed: ${formatError(fixErr)}`));
      }
    }
  }

  for (const issue of warnings) {
    console.log(`  ${chalk.yellow('⚠')} ${issue.message}`);
    if (autoFix && issue.fixable && issue.autoFix) {
      const fixSpinner = ora(quipSpinnerText('doctor_fix', '  Attempting auto-fix...')).start();
      try {
        const fixed = await issue.autoFix();
        if (fixed) {
          fixSpinner.succeed(chalk.green('  Fixed!'));
        } else {
          fixSpinner.fail(chalk.red('  Could not auto-fix'));
        }
      } catch (fixErr) {
        fixSpinner.fail(chalk.red(`  Fix failed: ${formatError(fixErr)}`));
      }
    }
  }

  for (const issue of infos) {
    console.log(`  ${chalk.blue('ℹ')} ${issue.message}`);
  }

  console.log('');

  // Summary
  if (errors.length > 0) {
    console.log(chalk.red(`\n⚠  ${errors.length} error(s) need attention`));
    if (!autoFix) {
      console.log(chalk.dim('   Run with --fix to attempt auto-fix where safe'));
    }
    process.exitCode = 1;
  } else if (warnings.length > 0) {
    console.log(chalk.yellow(`\n⚠  ${warnings.length} warning(s) found`));
  } else {
    console.log(chalk.green('\n✅  All clear (informational items only)'));
  }

  console.log('');
}
