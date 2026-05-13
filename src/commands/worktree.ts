import chalk from 'chalk';
import ora from 'ora';
import { git, simpleGit } from '../git.js';
import { handleNerdError, formatError } from '../errors.js';
import { getUpstreamInfo } from '../git-context.js';
import { sanitizeForTerminal } from '../output.js';
import { validateConfigKey, validateNotFlag } from '../validation.js';
import { quipSpinnerText } from '../quips.js';

export async function checkoutBranch(branch: string): Promise<void> {
  validateNotFlag(branch, 'branch name');
  const safeBranch = sanitizeForTerminal(branch);
  const spinner = ora(quipSpinnerText('checkout', `Checking out ${chalk.cyan(safeBranch)}`)).start();
  try {
    await git.checkout(branch);
    spinner.succeed(chalk.green(`Switched to branch '${safeBranch}'`));
  } catch (err) {
    spinner.fail(chalk.red(`Failed to checkout '${safeBranch}'`));
    handleNerdError(err);
    process.exitCode = 1;
  }
}

export async function stageAndCommit(message: string): Promise<void> {
  const safeMessage = sanitizeForTerminal(message);
  const spinner = ora(quipSpinnerText('commit_stage', 'Staging all changes')).start();
  try {
    await git.add('.');
    spinner.text = quipSpinnerText('commit_write', `Committing with message: ${chalk.cyan(safeMessage)}`);
    const result = await git.commit(message, undefined, { '--': null });
    const sha = result.commit ? ` (${result.commit})` : '';
    spinner.succeed(chalk.green(`Committed${sha}`));
  } catch (err) {
    spinner.fail(chalk.red('Commit failed'));
    handleNerdError(err);
    process.exitCode = 1;
  }
}

export async function showStatus(): Promise<void> {
  const spinner = ora(quipSpinnerText('status', 'Analyzing repository status')).start();
  try {
    const status = await git.status();
    spinner.stop();

    console.log(chalk.bold('\n--- Repository Status ---\n'));

    // 1. Branch Information
    const branch = status.current ?? 'DETACHED';
    let syncInfo = '';
    if (status.ahead > 0 || status.behind > 0) {
      const parts = [];
      if (status.ahead > 0) parts.push(chalk.green(`↑ ${status.ahead} ahead`));
      if (status.behind > 0) parts.push(chalk.red(`↓ ${status.behind} behind`));
      syncInfo = ` (${parts.join(', ')})`;
    }
    console.log(`${chalk.bold('Branch:')} ${chalk.cyan(sanitizeForTerminal(branch))}${syncInfo}\n`);

    // 2. Changes Breakdown
    const staged = status.staged;
    const modified = status.modified.filter(f => !staged.includes(f));
    const deleted = status.deleted.filter(f => !staged.includes(f));
    const untracked = status.not_added;

    if (staged.length > 0) {
      console.log(chalk.green.bold('Staged changes:'));
      staged.forEach(f => console.log(`  ${chalk.green('+')} ${sanitizeForTerminal(f)}`));
      console.log('');
    }

    if (modified.length > 0 || deleted.length > 0) {
      console.log(chalk.yellow.bold('Unstaged changes:'));
      modified.forEach(f => console.log(`  ${chalk.yellow('M')} ${sanitizeForTerminal(f)}`));
      deleted.forEach(f => console.log(`  ${chalk.red('D')} ${sanitizeForTerminal(f)}`));
      console.log('');
    }

    if (untracked.length > 0) {
      console.log(chalk.dim.bold('Untracked files:'));
      untracked.forEach(f => console.log(`  ${chalk.dim('?')} ${sanitizeForTerminal(f)}`));
      console.log('');
    }

    if (status.isClean()) {
      console.log(chalk.green('✔ Working directory is clean.'));
    }
    console.log('');
  } catch (err) {
    spinner.fail(chalk.red('Could not fetch status'));
    handleNerdError(err);
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
// push helpers
// ---------------------------------------------------------------------------
export async function pushCommits(remote?: string, force: boolean = false, setUpstream?: string): Promise<void> {
  if (remote) validateNotFlag(remote, 'remote name');
  if (setUpstream) validateNotFlag(setUpstream, 'upstream branch');
  let spinner: ReturnType<typeof ora> | undefined;

  try {
    const status = await git.status();
    const upstream = getUpstreamInfo(status);
    const remoteName = remote || upstream.remoteName || 'origin';
    const branchName = status.current;

    if (!branchName) {
      console.error(chalk.red('Cannot push from detached HEAD'));
      process.exitCode = 1;
      return;
    }

    const targetBranch = setUpstream ?? upstream.remoteBranch ?? branchName;
    const spinnerText = setUpstream
      ? `Pushing to ${chalk.cyan(sanitizeForTerminal(`${remoteName}/${targetBranch}`))}`
      : upstream.trackingBranch
        ? `Pushing to ${chalk.cyan(sanitizeForTerminal(upstream.trackingBranch))}`
        : `Pushing to ${chalk.cyan(sanitizeForTerminal(`${remoteName}/${targetBranch}`))}`;
    spinner = ora(quipSpinnerText('push', spinnerText)).start();
    const options: string[] = [];
    if (force) options.push('--force-with-lease');

    if (setUpstream) {
      options.push('-u');
      await git.push(remoteName, `${branchName}:${targetBranch}`, options);
      spinner.succeed(chalk.green(`Pushed and set upstream to '${sanitizeForTerminal(`${remoteName}/${targetBranch}`)}'`));
    } else {
      await git.push(remoteName, branchName, options);
      const destination = upstream.trackingBranch ?? `${remoteName}/${targetBranch}`;
      spinner.succeed(chalk.green(`Pushed to ${sanitizeForTerminal(destination)}`));
    }
  } catch (err) {
    const msg = formatError(err);
    spinner?.fail(chalk.red('Push failed'));
    if (msg.includes('no upstream branch')) {
      console.error(chalk.red('No upstream configured. Use -u flag to set upstream.'));
      handleNerdError(err);
    } else {
      handleNerdError(err);
    }
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
// pull helpers
// ---------------------------------------------------------------------------
export async function pullChanges(remote?: string, rebase: boolean = false): Promise<void> {
  if (remote) validateNotFlag(remote, 'remote name');
  let spinner: ReturnType<typeof ora> | undefined;

  try {
    const status = await git.status();
    const upstream = getUpstreamInfo(status);
    const options: string[] = [];
    if (rebase) options.push('--rebase');
    const spinnerText = remote
      ? `Pulling from ${chalk.cyan(sanitizeForTerminal(remote))}`
      : upstream.trackingBranch
        ? `Pulling from ${chalk.cyan(sanitizeForTerminal(upstream.trackingBranch))}`
        : 'Pulling from upstream';
    spinner = ora(quipSpinnerText('pull', spinnerText)).start();

    if (remote) {
      if (!status.current) {
        spinner.fail(chalk.red('Cannot pull into detached HEAD'));
        process.exitCode = 1;
        return;
      }
      await git.pull(remote, status.current, options);
      spinner.succeed(chalk.green(`Pulled ${sanitizeForTerminal(remote)}/${sanitizeForTerminal(status.current)}${rebase ? ' (rebase)' : ''}`));
    } else {
      await git.pull(options);
      spinner.succeed(chalk.green(`Pulled from upstream${rebase ? ' (rebase)' : ''}`));
    }
  } catch (err) {
    spinner?.fail(chalk.red('Pull failed'));
    handleNerdError(err);
    process.exitCode = 1;
  }
}

export async function showLog(count: number, oneline: boolean): Promise<void> {
  const spinner = ora(quipSpinnerText('log', 'Fetching commit history')).start();

  try {
    const options: string[] = ['-n', String(count)];
    if (oneline) {
      options.push('--oneline', '--decorate');
    } else {
      options.push('--pretty=format:%h %s %C(dim)(%cr) %C(bold blue)<%an>%Creset');
    }

    const log = await git.log(options);
    spinner.stop();

    if (!log || log.total === 0) {
      console.log(chalk.yellow('No commits found.'));
      return;
    }

    console.log(chalk.bold(`\nRecent commits (${Math.min(count, log.total)} shown):\n`));

    // log.all contains all commits including latest
    if (log.all && log.all.length > 0) {
      for (const commit of log.all) {
        console.log(`  ${chalk.yellow(commit.hash.slice(0, 7))} ${sanitizeForTerminal(commit.message)}`);
      }
    }

    console.log('');
  } catch (err) {
    spinner.fail(chalk.red('Failed to fetch log'));
    handleNerdError(err);
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
// diff helpers
// ---------------------------------------------------------------------------
export async function showDiff(file: string | undefined, staged: boolean): Promise<void> {
  const spinnerText = staged ? 'Fetching staged changes' : 'Fetching unstaged changes';
  const spinner = ora(quipSpinnerText('diff', spinnerText)).start();

  try {
    const options: string[] = staged ? ['--staged'] : [];
    if (file) {
      options.push('--', file);
    }

    const diff = await git.diff(options);
    spinner.stop();

    if (!diff || diff.trim() === '') {
      if (staged) {
        console.log(chalk.yellow('No staged changes to show.'));
      } else if (file) {
        console.log(chalk.yellow(`No changes in ${sanitizeForTerminal(file)}.`));
      } else {
        console.log(chalk.yellow('No unstaged changes to show.'));
      }
      return;
    }

    console.log(chalk.bold(`\n${staged ? 'Staged' : 'Unstaged'} changes:\n`));

    // Simple syntax highlighting for diff output
    const lines = diff.split('\n');
    for (const line of lines) {
      if (line.startsWith('+')) {
        console.log(chalk.green(sanitizeForTerminal(line)));
      } else if (line.startsWith('-')) {
        console.log(chalk.red(sanitizeForTerminal(line)));
      } else if (line.startsWith('@@')) {
        console.log(chalk.cyan(sanitizeForTerminal(line)));
      } else if (line.startsWith('diff') || line.startsWith('index') || line.startsWith('---') || line.startsWith('+++')) {
        console.log(chalk.dim(sanitizeForTerminal(line)));
      } else {
        console.log(sanitizeForTerminal(line));
      }
    }
    console.log('');
  } catch (err) {
    spinner.fail(chalk.red('Failed to fetch diff'));
    handleNerdError(err);
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
// clone helpers
// ---------------------------------------------------------------------------
/** Sanitize directory name to prevent path traversal */
function sanitizeDirName(name: string): string {
  return name
    .replace(/[\\/]/g, '-')     // Replace path separators with dash
    .replace(/^[.]+/, '')        // Remove leading dots (prevent hidden dirs)
    .replace(/[<>:"|?*]/g, '-')  // Replace invalid Windows chars
    .substring(0, 100) || 'repo'; // Limit length, fallback to 'repo'
}

export async function cloneRepo(url: string, directory?: string): Promise<void> {
  const rawDir = directory || url.split('/').pop()?.replace('.git', '') || 'repo';
  const targetDir = sanitizeDirName(rawDir);
  const safeTargetDir = sanitizeForTerminal(targetDir);
  const spinner = ora(quipSpinnerText('clone', `Cloning into ${chalk.cyan(safeTargetDir)}`)).start();

  try {
    await git.clone(url, targetDir);
    spinner.succeed(chalk.green(`Cloned into '${safeTargetDir}'`));
    console.log(chalk.dim(`  cd ${safeTargetDir} && omg status`));
  } catch (err) {
    spinner.fail(chalk.red('Clone failed'));
    handleNerdError(err);
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------

export async function initRepo(directory: string, message?: string): Promise<void> {
  const safeDirectory = sanitizeForTerminal(directory);
  const spinner = ora(quipSpinnerText('init', `Initializing git repository in ${chalk.cyan(safeDirectory)}`)).start();

  try {
    const targetGit = directory === '.' ? git : simpleGit(directory);
    await targetGit.init();

    if (message) {
      spinner.text = quipSpinnerText('init_commit', 'Creating initial commit');
      await targetGit.add('.');
      await targetGit.commit(message);
      spinner.succeed(chalk.green(`Initialized and committed: ${sanitizeForTerminal(message)}`));
    } else {
      spinner.succeed(chalk.green(`Initialized empty git repository in ${safeDirectory}`));
    }
  } catch (err) {
    spinner.fail(chalk.red('Failed to initialize repository'));
    handleNerdError(err);
    process.exitCode = 1;
  }
}

export async function fetchChanges(remote?: string): Promise<void> {
  if (remote) validateNotFlag(remote, 'remote name');
  const spinnerText = remote ? `Fetching from ${chalk.cyan(remote)}` : 'Fetching from all remotes';
  const spinner = ora(quipSpinnerText('fetch', spinnerText)).start();

  try {
    if (remote) {
      await git.fetch(remote);
    } else {
      await git.fetch();
    }
    spinner.succeed(chalk.green('Fetch complete'));
  } catch (err) {
    spinner.fail(chalk.red('Fetch failed'));
    handleNerdError(err);
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
// reset helpers
// ---------------------------------------------------------------------------
export async function resetChanges(mode: 'soft' | 'mixed' | 'hard'): Promise<void> {
  const modeDescriptions = {
    soft: 'Keep changes staged',
    mixed: 'Unstage files',
    hard: 'Discard all changes',
  };
  const spinnerText = `Resetting (${modeDescriptions[mode]})`;
  const spinner = ora(quipSpinnerText('reset', spinnerText)).start();

  try {
    const options: string[] = [`--${mode}`];
    await git.reset(options);

    const messages = {
      soft: 'Reset to HEAD (changes staged)',
      mixed: 'Unstaged all changes',
      hard: 'Discarded all changes',
    };

    spinner.succeed(chalk.green(messages[mode]));

    if (mode === 'hard') {
      console.log(chalk.yellow('⚠ All uncommitted changes have been lost'));
    }
  } catch (err) {
    spinner.fail(chalk.red('Reset failed'));
    handleNerdError(err);
    process.exitCode = 1;
  }
}

export async function getConfig(key: string): Promise<void> {
  validateConfigKey(key);
  try {
    const value = await git.getConfig(key);
    if (value.value) {
      console.log(`${chalk.green(sanitizeForTerminal(key))} = ${chalk.cyan(sanitizeForTerminal(value.value))}`);
    } else {
      console.log(chalk.yellow(`No value set for '${sanitizeForTerminal(key)}'`));
    }
  } catch (err) {
    console.error(chalk.red(`Failed to get config '${key}'`));
    handleNerdError(err);
    process.exitCode = 1;
  }
}

export async function setConfig(key: string, value: string): Promise<void> {
  validateConfigKey(key);
  const safeKey = sanitizeForTerminal(key);
  const safeValue = sanitizeForTerminal(value);
  const spinner = ora(quipSpinnerText('config_set', `Setting ${chalk.cyan(safeKey)} = ${chalk.cyan(safeValue)}`)).start();

  try {
    await git.addConfig(key, value, false, 'local');
    spinner.succeed(chalk.green(`Set '${safeKey}' to '${safeValue}'`));
  } catch (err) {
    spinner.fail(chalk.red(`Failed to set config '${safeKey}'`));
    handleNerdError(err);
    process.exitCode = 1;
  }
}
