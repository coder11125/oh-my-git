import chalk from 'chalk';
import ora from 'ora';
import { git, simpleGit } from '../git.js';
import { handleNerdError, formatError } from '../errors.js';
import { validateConfigKey, validateNotFlag } from '../validation.js';
import { quipSpinnerText } from '../quips.js';

export async function checkoutBranch(branch: string): Promise<void> {
  validateNotFlag(branch, 'branch name');
  const spinner = ora(quipSpinnerText('checkout', `Checking out ${chalk.cyan(branch)}`)).start();
  try {
    await git.checkout(branch);
    spinner.succeed(chalk.green(`Switched to branch '${branch}'`));
  } catch (err) {
    spinner.fail(chalk.red(`Failed to checkout '${branch}'`));
    handleNerdError(err);
    process.exitCode = 1;
  }
}

export async function stageAndCommit(message: string): Promise<void> {
  const spinner = ora(quipSpinnerText('commit_stage', 'Staging all changes')).start();
  try {
    await git.add('.');
    spinner.text = quipSpinnerText('commit_write', `Committing with message: ${chalk.cyan(message)}`);
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
    console.log(`${chalk.bold('Branch:')} ${chalk.cyan(branch)}${syncInfo}\n`);

    // 2. Changes Breakdown
    const staged = status.staged;
    const modified = status.modified.filter(f => !staged.includes(f));
    const deleted = status.deleted.filter(f => !staged.includes(f));
    const untracked = status.not_added;

    if (staged.length > 0) {
      console.log(chalk.green.bold('Staged changes:'));
      staged.forEach(f => console.log(`  ${chalk.green('+')} ${f}`));
      console.log('');
    }

    if (modified.length > 0 || deleted.length > 0) {
      console.log(chalk.yellow.bold('Unstaged changes:'));
      modified.forEach(f => console.log(`  ${chalk.yellow('M')} ${f}`));
      deleted.forEach(f => console.log(`  ${chalk.red('D')} ${f}`));
      console.log('');
    }

    if (untracked.length > 0) {
      console.log(chalk.dim.bold('Untracked files:'));
      untracked.forEach(f => console.log(`  ${chalk.dim('?')} ${f}`));
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
export async function pushCommits(remote: string, force: boolean = false, setUpstream?: string): Promise<void> {
  validateNotFlag(remote, 'remote name');
  if (setUpstream) validateNotFlag(setUpstream, 'upstream branch');
  const target = setUpstream ?? remote;
  const spinnerText = target ? `Pushing to ${chalk.cyan(target)}` : 'Pushing to upstream';
  const spinner = ora(quipSpinnerText('push', spinnerText)).start();

  try {
    const options: string[] = [];
    if (force) options.push('--force-with-lease');

    if (setUpstream) {
      options.push('-u');
      await git.push(remote, 'HEAD', options);
      spinner.succeed(chalk.green(`Pushed and set upstream to '${remote}/${setUpstream}'`));
    } else {
      await git.push(remote, 'HEAD', options);
      spinner.succeed(chalk.green(`Pushed to ${remote}`));
    }
  } catch (err) {
    spinner.fail(chalk.red('Push failed'));
    const msg = formatError(err);
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
  const spinnerText = remote ? `Pulling from ${chalk.cyan(remote)}` : 'Pulling from upstream';
  const spinner = ora(quipSpinnerText('pull', spinnerText)).start();

  try {
    const options: string[] = [];
    if (rebase) options.push('--rebase');

    if (remote) {
      await git.pull(remote, 'HEAD', options);
      spinner.succeed(chalk.green(`Pulled from ${remote}${rebase ? ' (rebase)' : ''}`));
    } else {
      await git.pull(options);
      spinner.succeed(chalk.green(`Pulled from upstream${rebase ? ' (rebase)' : ''}`));
    }
  } catch (err) {
    spinner.fail(chalk.red('Pull failed'));
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
        console.log(`  ${chalk.yellow(commit.hash.slice(0, 7))} ${commit.message}`);
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
        console.log(chalk.yellow(`No changes in ${file}.`));
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
        console.log(chalk.green(line));
      } else if (line.startsWith('-')) {
        console.log(chalk.red(line));
      } else if (line.startsWith('@@')) {
        console.log(chalk.cyan(line));
      } else if (line.startsWith('diff') || line.startsWith('index') || line.startsWith('---') || line.startsWith('+++')) {
        console.log(chalk.dim(line));
      } else {
        console.log(line);
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
  const spinner = ora(quipSpinnerText('clone', `Cloning into ${chalk.cyan(targetDir)}`)).start();

  try {
    await git.clone(url, targetDir);
    spinner.succeed(chalk.green(`Cloned into '${targetDir}'`));
    console.log(chalk.dim(`  cd ${targetDir} && omg status`));
  } catch (err) {
    spinner.fail(chalk.red('Clone failed'));
    handleNerdError(err);
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------

export async function initRepo(directory: string, message?: string): Promise<void> {
  const spinner = ora(quipSpinnerText('init', `Initializing git repository in ${chalk.cyan(directory)}`)).start();

  try {
    const targetGit = directory === '.' ? git : simpleGit(directory);
    await targetGit.init();

    if (message) {
      spinner.text = quipSpinnerText('init_commit', 'Creating initial commit');
      await targetGit.add('.');
      await targetGit.commit(message);
      spinner.succeed(chalk.green(`Initialized and committed: ${message}`));
    } else {
      spinner.succeed(chalk.green(`Initialized empty git repository in ${directory}`));
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
      console.log(`${chalk.green(key)} = ${chalk.cyan(value.value)}`);
    } else {
      console.log(chalk.yellow(`No value set for '${key}'`));
    }
  } catch (err) {
    console.error(chalk.red(`Failed to get config '${key}'`));
    handleNerdError(err);
    process.exitCode = 1;
  }
}

export async function setConfig(key: string, value: string): Promise<void> {
  validateConfigKey(key);
  const spinner = ora(quipSpinnerText('config_set', `Setting ${chalk.cyan(key)} = ${chalk.cyan(value)}`)).start();

  try {
    await git.addConfig(key, value, false, 'local');
    spinner.succeed(chalk.green(`Set '${key}' to '${value}'`));
  } catch (err) {
    spinner.fail(chalk.red(`Failed to set config '${key}'`));
    handleNerdError(err);
    process.exitCode = 1;
  }
}
