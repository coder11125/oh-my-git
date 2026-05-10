#!/usr/bin/env node
import { Command } from 'commander';
import { simpleGit, type SimpleGit } from 'simple-git';
import chalk from 'chalk';
import ora from 'ora';
import { exec } from 'child_process';
import { promisify } from 'util';

interface CliOptions {
  visit?: string;
  commit?: string;
}

interface BranchOptions {
  new?: string;
  delete?: string;
  checkout?: boolean;
}

const git: SimpleGit = simpleGit();

const program = new Command();

program
  .name('omg')
  .description('Oh My Git - a friendly CLI wrapper for common git tasks')
  .version('0.2.0', '-V, --version', 'output the current version')
  .option('-v, --visit <branch>', 'checkout the specified branch')
  .option('-c, --commit <message>', 'stage all changes and commit with a message')
  .action(async (opts: CliOptions) => {
    let didSomething = false;

    if (opts.visit) {
      didSomething = true;
      await checkoutBranch(opts.visit);
    }

    if (opts.commit) {
      didSomething = true;
      await stageAndCommit(opts.commit);
    }

    if (!didSomething) {
      program.help();
    }
  });

// ---------------------------------------------------------------------------
// branch subcommand
// ---------------------------------------------------------------------------
program
  .command('branch')
  .description(
    'list, create, or delete branches\n' +
    '  (no flags)       list all local branches\n' +
    '  -n <name>        create a new branch\n' +
    '  -n <name> -s     create and immediately switch to it\n' +
    '  -d <name>        delete a branch (must be fully merged)',
  )
  .option('-n, --new <name>', 'create a new branch')
  .option('-s, --switch', 'switch to the newly created branch (use with -n)')
  .option('-d, --delete <name>', 'delete a branch')
  .action(async (opts: BranchOptions & { switch?: boolean }) => {
    if (opts.new) {
      await createBranch(opts.new, opts.switch ?? false);
    } else if (opts.delete) {
      await deleteBranch(opts.delete);
    } else {
      await listBranches();
    }
  });

// ---------------------------------------------------------------------------
// remote subcommand
// ---------------------------------------------------------------------------
program
  .command('remote [url] [name]')
  .description(
    'list or add remote connections\n' +
    '  (no args)        list all remotes\n' +
    '  <url> [name]     add a new remote (name defaults to "origin")',
  )
  .action(async (url?: string, name?: string) => {
    if (url) {
      await addRemote(url, name ?? 'origin');
    } else {
      await listRemotes();
    }
  });

// ---------------------------------------------------------------------------
// status subcommand
// ---------------------------------------------------------------------------
program
  .command('status')
  .description('show a friendly summary of the current repository state')
  .action(async () => {
    await showStatus();
  });

// ---------------------------------------------------------------------------
// push subcommand
// ---------------------------------------------------------------------------
program
  .command('push [remote]')
  .description(
    'push commits to a remote\n' +
    '  (no args)           push to upstream remote\n' +
    '  <remote>            push to specific remote\n' +
    '  -f, --force         force push with lease',
  )
  .option('-f, --force', 'force push with lease')
  .option('-u, --set-upstream <branch>', 'set upstream and push')
  .action(async (remote?: string, options?: { force?: boolean; setUpstream?: string }) => {
    await pushCommits(remote ?? 'origin', options?.force ?? false, options?.setUpstream);
  });

// ---------------------------------------------------------------------------
// pull subcommand
// ---------------------------------------------------------------------------
program
  .command('pull [remote]')
  .description(
    'fetch and integrate changes from remote\n' +
    '  (no args)           pull from upstream\n' +
    '  <remote>            pull from specific remote\n' +
    '  -r, --rebase        rebase instead of merge',
  )
  .option('-r, --rebase', 'rebase instead of merge')
  .action(async (remote?: string, options?: { rebase?: boolean }) => {
    await pullChanges(remote, options?.rebase ?? false);
  });

// ---------------------------------------------------------------------------
// merge subcommand
// ---------------------------------------------------------------------------
program
  .command('merge [branch]')
  .description(
    'merge changes from another branch\n' +
    '  <branch>            merge branch into current\n' +
    '  --squash            squash merge\n' +
    '  --abort             abort ongoing merge',
  )
  .option('--squash', 'squash merge')
  .option('--abort', 'abort ongoing merge')
  .action(async (branch?: string, options?: { squash?: boolean; abort?: boolean }) => {
    if (options?.abort) {
      await abortMerge();
    } else if (branch) {
      await mergeBranch(branch, options?.squash ?? false);
    } else {
      console.error(chalk.red('Error: branch name required (unless using --abort)'));
      process.exitCode = 1;
    }
  });

// ---------------------------------------------------------------------------
// rebase subcommand
// ---------------------------------------------------------------------------
program
  .command('rebase [branch]')
  .description(
    'reapply commits on top of another base\n' +
    '  <branch>            rebase current onto branch\n' +
    '  --continue          continue after resolving conflicts\n' +
    '  --abort             abort rebase',
  )
  .option('--continue', 'continue after resolving conflicts')
  .option('--abort', 'abort rebase')
  .action(async (branch?: string, options?: { continue?: boolean; abort?: boolean }) => {
    if (options?.continue) {
      await continueRebase();
    } else if (options?.abort) {
      await abortRebase();
    } else if (branch) {
      await rebaseBranch(branch);
    } else {
      console.error(chalk.red('Error: branch name required (unless using --continue or --abort)'));
      process.exitCode = 1;
    }
  });

// ---------------------------------------------------------------------------
// log subcommand
// ---------------------------------------------------------------------------
program
  .command('log')
  .description(
    'show commit history\n' +
    '  (no flags)         show recent commits\n' +
    '  -n <number>        limit to N commits\n' +
    '  --oneline          condensed one-line format',
  )
  .option('-n, --number <count>', 'limit number of commits', '10')
  .option('--oneline', 'show condensed one-line format')
  .action(async (options: { number: string; oneline?: boolean }) => {
    await showLog(parseInt(options.number, 10), options.oneline ?? false);
  });

// ---------------------------------------------------------------------------
// diff subcommand
// ---------------------------------------------------------------------------
program
  .command('diff [file]')
  .description(
    'show changes between commits or working tree\n' +
    '  (no args)          show unstaged changes\n' +
    '  --staged           show staged changes\n' +
    '  <file>             show changes for specific file',
  )
  .option('--staged', 'show staged changes')
  .action(async (file?: string, options?: { staged?: boolean }) => {
    await showDiff(file, options?.staged ?? false);
  });

// ---------------------------------------------------------------------------
// clone subcommand
// ---------------------------------------------------------------------------
program
  .command('clone <url> [directory]')
  .description(
    'clone a repository into a new directory\n' +
    '  <url>              repository URL to clone\n' +
    '  [directory]        optional directory name (defaults to repo name)',
  )
  .action(async (url: string, directory?: string) => {
    await cloneRepo(url, directory);
  });

// ---------------------------------------------------------------------------
// stash subcommand
// ---------------------------------------------------------------------------
program
  .command('stash')
  .description(
    'stash and restore changes\n' +
    '  (no subcommand)     stash current changes\n' +
    '  pop                 pop most recent stash\n' +
    '  list                list all stashes\n' +
    '  drop <index>        drop specific stash\n' +
    '  apply <index>       apply stash without removing',
  )
  .argument('[subcommand]', 'subcommand: pop, list, drop, apply')
  .argument('[index]', 'stash index for drop/apply (e.g., 0)')
  .action(async (subcommand?: string, index?: string) => {
    await handleStash(subcommand, index);
  });

// ---------------------------------------------------------------------------
// update subcommand
// ---------------------------------------------------------------------------
program
  .command('update')
  .description('update omg to the latest version from npm')
  .action(async () => {
    await updateOmg();
  });

// ---------------------------------------------------------------------------
// init subcommand
// ---------------------------------------------------------------------------
program
  .command('init [directory]')
  .description(
    'initialize a new git repository\n' +
    '  [directory]        optional directory (defaults to current)',
  )
  .option('-m, --message <msg>', 'create initial commit with message')
  .action(async (directory?: string, options?: { message?: string }) => {
    await initRepo(directory ?? '.', options?.message);
  });

// ---------------------------------------------------------------------------
// tag subcommand
// ---------------------------------------------------------------------------
program
  .command('tag [name]')
  .description(
    'create or list tags\n' +
    '  (no args)          list all tags\n' +
    '  <name>             create lightweight tag\n' +
    '  <name> -m <msg>    create annotated tag',
  )
  .option('-m, --message <msg>', 'annotated tag message')
  .action(async (name?: string, options?: { message?: string }) => {
    if (name) {
      await createTag(name, options?.message);
    } else {
      await listTags();
    }
  });

// ---------------------------------------------------------------------------
// fetch subcommand
// ---------------------------------------------------------------------------
program
  .command('fetch [remote]')
  .description(
    'download objects and refs from remote\n' +
    '  (no args)          fetch from all remotes\n' +
    '  <remote>           fetch from specific remote',
  )
  .action(async (remote?: string) => {
    await fetchChanges(remote);
  });

// ---------------------------------------------------------------------------
// reset subcommand
// ---------------------------------------------------------------------------
program
  .command('reset [mode]')
  .description(
    'reset current HEAD to specified state\n' +
    '  (no mode)          unstage files (mixed)\n' +
    '  --soft             keep changes staged\n' +
    '  --hard             discard all changes (dangerous)',
  )
  .option('--soft', 'keep changes staged')
  .option('--hard', 'discard all changes')
  .action(async (mode?: string, options?: { soft?: boolean; hard?: boolean }) => {
    let resetMode: 'soft' | 'mixed' | 'hard' = 'mixed';
    if (options?.soft) resetMode = 'soft';
    if (options?.hard) resetMode = 'hard';
    await resetChanges(resetMode);
  });

// ---------------------------------------------------------------------------
// root-level action helpers
// ---------------------------------------------------------------------------
async function checkoutBranch(branch: string): Promise<void> {
  const spinner = ora(`Checking out ${chalk.cyan(branch)}`).start();
  try {
    await git.checkout(branch);
    spinner.succeed(chalk.green(`Switched to branch '${branch}'`));
  } catch (err) {
    spinner.fail(chalk.red(`Failed to checkout '${branch}'`));
    console.error(chalk.red(formatError(err)));
    process.exitCode = 1;
  }
}

async function stageAndCommit(message: string): Promise<void> {
  const spinner = ora('Staging all changes').start();
  try {
    await git.add('.');
    spinner.text = `Committing with message: ${chalk.cyan(message)}`;
    const result = await git.commit(message);
    const sha = result.commit ? ` (${result.commit})` : '';
    spinner.succeed(chalk.green(`Committed${sha}`));
  } catch (err) {
    spinner.fail(chalk.red('Commit failed'));
    console.error(chalk.red(formatError(err)));
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
// branch helpers
// ---------------------------------------------------------------------------

/** Pretty-print all local branches, highlighting the current one. */
async function listBranches(): Promise<void> {
  const spinner = ora('Fetching branches').start();
  try {
    const summary = await git.branchLocal();
    spinner.stop();

    if (summary.all.length === 0) {
      console.log(chalk.yellow('No local branches found.'));
      return;
    }

    console.log(chalk.bold('\nLocal branches:\n'));
    for (const name of summary.all) {
      const isCurrent = name === summary.current;
      if (isCurrent) {
        console.log(`  ${chalk.green('*')} ${chalk.green.bold(name)}  ${chalk.dim('← current')}`);
      } else {
        console.log(`    ${chalk.white(name)}`);
      }
    }
    console.log('');
  } catch (err) {
    spinner.fail(chalk.red('Could not list branches'));
    console.error(chalk.red(formatError(err)));
    process.exitCode = 1;
  }
}

/** Create a branch, optionally switching to it immediately. */
async function createBranch(name: string, switchAfter: boolean): Promise<void> {
  const spinner = ora(`Creating branch ${chalk.cyan(name)}`).start();
  try {
    // Refuse to create if the name already exists
    const existing = await git.branchLocal();
    if (existing.all.includes(name)) {
      spinner.fail(chalk.red(`Branch '${name}' already exists`));
      process.exitCode = 1;
      return;
    }

    await git.checkoutLocalBranch(name);          // creates + checks out

    if (switchAfter) {
      spinner.succeed(chalk.green(`Created and switched to branch '${name}'`));
    } else {
      // Branch was created via checkoutLocalBranch (which also switches).
      // If the caller did NOT want to switch, go back to the previous branch.
      const prev = existing.current;
      await git.checkout(prev);
      spinner.succeed(
        chalk.green(`Created branch '${name}'`) +
        chalk.dim(` (still on '${prev}')`),
      );
    }
  } catch (err) {
    spinner.fail(chalk.red(`Failed to create branch '${name}'`));
    console.error(chalk.red(formatError(err)));
    process.exitCode = 1;
  }
}

/** Delete a branch with a safety guard (must be fully merged). */
async function deleteBranch(name: string): Promise<void> {
  const spinner = ora(`Deleting branch ${chalk.cyan(name)}`).start();
  try {
    const summary = await git.branchLocal();

    // Prevent deleting the currently active branch
    if (name === summary.current) {
      spinner.fail(chalk.red(`Cannot delete '${name}': it is the current branch`));
      process.exitCode = 1;
      return;
    }

    // -d is safe delete (only merged branches); throws if unmerged
    await git.deleteLocalBranch(name, false);
    spinner.succeed(chalk.green(`Deleted branch '${name}'`));
  } catch (err) {
    const msg = formatError(err);
    if (msg.includes('not fully merged')) {
      spinner.fail(
        chalk.red(`Branch '${name}' is not fully merged.`) +
        chalk.yellow('\n  Use `git branch -D` to force-delete.'),
      );
    } else {
      spinner.fail(chalk.red(`Failed to delete '${name}'`));
      console.error(chalk.red(msg));
    }
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
// remote helpers
// ---------------------------------------------------------------------------

/** List all remotes and their fetch URLs. */
async function listRemotes(): Promise<void> {
  const spinner = ora('Fetching remotes').start();
  try {
    const remotes = await git.getRemotes(true);
    spinner.stop();

    if (remotes.length === 0) {
      console.log(chalk.yellow('No remotes found.'));
      return;
    }

    console.log(chalk.bold('\nRemotes:\n'));
    for (const r of remotes) {
      const urlStr = r.refs.fetch || r.refs.push || 'no url';
      console.log(`  ${chalk.green(r.name.padEnd(12))} ${chalk.dim(urlStr)}`);
    }
    console.log('');
  } catch (err) {
    spinner.fail(chalk.red('Could not list remotes'));
    console.error(chalk.red(formatError(err)));
    process.exitCode = 1;
  }
}

/** Add a new remote. */
async function addRemote(url: string, name: string): Promise<void> {
  const spinner = ora(`Adding remote ${chalk.cyan(name)} (${chalk.dim(url)})`).start();
  try {
    // Check if remote already exists
    const remotes = await git.getRemotes();
    if (remotes.some(r => r.name === name)) {
      spinner.fail(chalk.red(`Remote '${name}' already exists`));
      process.exitCode = 1;
      return;
    }

    await git.addRemote(name, url);
    spinner.succeed(chalk.green(`Added remote '${name}'`));
  } catch (err) {
    spinner.fail(chalk.red(`Failed to add remote '${name}'`));
    console.error(chalk.red(formatError(err)));
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
// status helpers
// ---------------------------------------------------------------------------

/** Display a pretty summary of the current git status. */
async function showStatus(): Promise<void> {
  const spinner = ora('Analyzing repository status').start();
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
    console.error(chalk.red(formatError(err)));
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
// push helpers
// ---------------------------------------------------------------------------
async function pushCommits(remote: string, force: boolean = false, setUpstream?: string): Promise<void> {
  const target = setUpstream ?? remote;
  const spinnerText = target ? `Pushing to ${chalk.cyan(target)}` : 'Pushing to upstream';
  const spinner = ora(spinnerText).start();

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
    } else {
      console.error(chalk.red(msg));
    }
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
// pull helpers
// ---------------------------------------------------------------------------
async function pullChanges(remote?: string, rebase: boolean = false): Promise<void> {
  const spinnerText = remote ? `Pulling from ${chalk.cyan(remote)}` : 'Pulling from upstream';
  const spinner = ora(spinnerText).start();

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
    const msg = formatError(err);
    if (msg.includes('merge conflicts')) {
      console.error(chalk.red('Merge conflicts detected. Resolve conflicts and commit.'));
    } else if (msg.includes('local changes')) {
      console.error(chalk.red('You have uncommitted changes. Stash or commit them first.'));
    } else {
      console.error(chalk.red(msg));
    }
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
// merge helpers
// ---------------------------------------------------------------------------
async function mergeBranch(branch: string, squash: boolean = false): Promise<void> {
  const spinner = ora(`Merging ${chalk.cyan(branch)}`).start();

  try {
    const options: string[] = [];
    if (squash) options.push('--squash');

    await git.merge([branch, ...options]);

    if (squash) {
      spinner.succeed(chalk.green(`Squashed ${branch} into current branch`));
      console.log(chalk.yellow('Commit the squashed changes with: omg -c "message"'));
    } else {
      spinner.succeed(chalk.green(`Merged '${branch}' into current branch`));
    }
  } catch (err) {
    spinner.fail(chalk.red('Merge failed'));
    const msg = formatError(err);
    if (msg.includes('conflicts')) {
      console.error(chalk.red('Merge conflicts detected. Resolve conflicts and commit, or use --abort to cancel.'));
    } else if (msg.includes('already up to date')) {
      console.log(chalk.yellow('Already up to date.'));
    } else {
      console.error(chalk.red(msg));
    }
    process.exitCode = 1;
  }
}

async function abortMerge(): Promise<void> {
  const spinner = ora('Aborting merge').start();

  try {
    await git.raw(['merge', '--abort']);
    spinner.succeed(chalk.green('Merge aborted'));
  } catch (err) {
    spinner.fail(chalk.red('Failed to abort merge'));
    const msg = formatError(err);
    if (msg.includes('no merge')) {
      console.error(chalk.red('No merge in progress'));
    } else {
      console.error(chalk.red(msg));
    }
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
// rebase helpers
// ---------------------------------------------------------------------------
async function rebaseBranch(branch: string): Promise<void> {
  const spinner = ora(`Rebasing onto ${chalk.cyan(branch)}`).start();

  try {
    await git.rebase([branch]);
    spinner.succeed(chalk.green(`Rebased onto '${branch}'`));
  } catch (err) {
    spinner.fail(chalk.red('Rebase failed'));
    const msg = formatError(err);
    if (msg.includes('conflicts')) {
      console.error(chalk.red('Rebase conflicts detected. Resolve conflicts, then use --continue or --abort.'));
    } else {
      console.error(chalk.red(msg));
    }
    process.exitCode = 1;
  }
}

async function continueRebase(): Promise<void> {
  const spinner = ora('Continuing rebase').start();

  try {
    await git.rebase(['--continue']);
    spinner.succeed(chalk.green('Rebase completed'));
  } catch (err) {
    spinner.fail(chalk.red('Failed to continue rebase'));
    const msg = formatError(err);
    if (msg.includes('no rebase')) {
      console.error(chalk.red('No rebase in progress'));
    } else if (msg.includes('conflicts')) {
      console.error(chalk.red('Unresolved conflicts remain. Resolve them first.'));
    } else {
      console.error(chalk.red(msg));
    }
    process.exitCode = 1;
  }
}

async function abortRebase(): Promise<void> {
  const spinner = ora('Aborting rebase').start();

  try {
    await git.rebase(['--abort']);
    spinner.succeed(chalk.green('Rebase aborted'));
  } catch (err) {
    spinner.fail(chalk.red('Failed to abort rebase'));
    const msg = formatError(err);
    if (msg.includes('no rebase')) {
      console.error(chalk.red('No rebase in progress'));
    } else {
      console.error(chalk.red(msg));
    }
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
// log helpers
// ---------------------------------------------------------------------------
async function showLog(count: number, oneline: boolean): Promise<void> {
  const spinner = ora('Fetching commit history').start();

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
    console.error(chalk.red(formatError(err)));
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
// diff helpers
// ---------------------------------------------------------------------------
async function showDiff(file: string | undefined, staged: boolean): Promise<void> {
  const spinnerText = staged ? 'Fetching staged changes' : 'Fetching unstaged changes';
  const spinner = ora(spinnerText).start();

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
    console.error(chalk.red(formatError(err)));
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

async function cloneRepo(url: string, directory?: string): Promise<void> {
  const rawDir = directory || url.split('/').pop()?.replace('.git', '') || 'repo';
  const targetDir = sanitizeDirName(rawDir);
  const spinner = ora(`Cloning into ${chalk.cyan(targetDir)}`).start();

  try {
    await git.clone(url, targetDir);
    spinner.succeed(chalk.green(`Cloned into '${targetDir}'`));
    console.log(chalk.dim(`  cd ${targetDir} && omg status`));
  } catch (err) {
    spinner.fail(chalk.red('Clone failed'));
    const msg = formatError(err);
    if (msg.includes('already exists')) {
      console.error(chalk.red(`Directory '${targetDir}' already exists.`));
    } else if (msg.includes('not found') || msg.includes('does not exist')) {
      console.error(chalk.red('Repository not found. Check the URL.'));
    } else {
      console.error(chalk.red(msg));
    }
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
// stash helpers
// ---------------------------------------------------------------------------
async function handleStash(action?: string, index?: string): Promise<void> {
  switch (action) {
    case 'pop':
      await stashPop();
      break;
    case 'list':
      await stashList();
      break;
    case 'drop':
      await stashDrop(index);
      break;
    case 'apply':
      await stashApply(index);
      break;
    case undefined:
    case '':
      await stashSave();
      break;
    default:
      console.error(chalk.red(`Unknown stash action: ${action}`));
      console.error(chalk.dim('Valid actions: pop, list, drop <index>, apply <index>'));
      process.exitCode = 1;
  }
}

async function stashSave(): Promise<void> {
  const spinner = ora('Stashing changes').start();

  try {
    const result = await git.stash(['save']);
    if (result && result.includes('No local changes')) {
      spinner.warn(chalk.yellow('No local changes to stash'));
    } else {
      spinner.succeed(chalk.green('Changes stashed'));
    }
  } catch (err) {
    spinner.fail(chalk.red('Failed to stash changes'));
    console.error(chalk.red(formatError(err)));
    process.exitCode = 1;
  }
}

async function stashPop(): Promise<void> {
  const spinner = ora('Popping stash').start();

  try {
    await git.stash(['pop']);
    spinner.succeed(chalk.green('Stash popped'));
  } catch (err) {
    spinner.fail(chalk.red('Failed to pop stash'));
    const msg = formatError(err);
    if (msg.includes('No stash entries')) {
      console.error(chalk.red('No stash entries found'));
    } else if (msg.includes('conflicts')) {
      console.error(chalk.red('Conflicts when applying stash. Resolve conflicts manually.'));
    } else {
      console.error(chalk.red(msg));
    }
    process.exitCode = 1;
  }
}

async function stashList(): Promise<void> {
  const spinner = ora('Fetching stash list').start();

  try {
    const list = await git.stash(['list']);
    spinner.stop();

    if (!list || list.trim() === '') {
      console.log(chalk.yellow('No stashes found.'));
      return;
    }

    console.log(chalk.bold('\nStashes:\n'));
    const lines = list.split('\n').filter(line => line.trim() !== '');
    for (const line of lines) {
      console.log(`  ${chalk.cyan(line)}`);
    }
    console.log('');
  } catch (err) {
    spinner.fail(chalk.red('Failed to list stashes'));
    console.error(chalk.red(formatError(err)));
    process.exitCode = 1;
  }
}

async function stashDrop(index?: string): Promise<void> {
  // Validate index is numeric
  if (index && !/^\d+$/.test(index)) {
    console.error(chalk.red(`Invalid stash index: '${index}' (must be a number)`));
    process.exitCode = 1;
    return;
  }
  const stashRef = index ? `stash@{${index}}` : 'stash@{0}';
  const spinner = ora(`Dropping ${chalk.cyan(stashRef)}`).start();

  try {
    await git.stash(['drop', stashRef]);
    spinner.succeed(chalk.green(`Dropped ${stashRef}`));
  } catch (err) {
    spinner.fail(chalk.red(`Failed to drop ${stashRef}`));
    const msg = formatError(err);
    if (msg.includes('Invalid reflog')) {
      console.error(chalk.red(`Invalid stash index: ${index ?? 0}`));
    } else {
      console.error(chalk.red(msg));
    }
    process.exitCode = 1;
  }
}

async function stashApply(index?: string): Promise<void> {
  // Validate index is numeric
  if (index && !/^\d+$/.test(index)) {
    console.error(chalk.red(`Invalid stash index: '${index}' (must be a number)`));
    process.exitCode = 1;
    return;
  }
  const stashRef = index ? `stash@{${index}}` : 'stash@{0}';
  const spinner = ora(`Applying ${chalk.cyan(stashRef)}`).start();

  try {
    await git.stash(['apply', stashRef]);
    spinner.succeed(chalk.green(`Applied ${stashRef}`));
  } catch (err) {
    spinner.fail(chalk.red(`Failed to apply ${stashRef}`));
    const msg = formatError(err);
    if (msg.includes('Invalid reflog')) {
      console.error(chalk.red(`Invalid stash index: ${index ?? 0}`));
    } else if (msg.includes('conflicts')) {
      console.error(chalk.red('Conflicts when applying stash. Resolve conflicts manually.'));
    } else {
      console.error(chalk.red(msg));
    }
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
// update helpers
// ---------------------------------------------------------------------------
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

    if (latestPart > currentPart) return 1;
    if (latestPart < currentPart) return -1;
  }

  return 0;
}

async function performUpdate(version: string): Promise<void> {
  const spinner = ora(`Updating omg to ${chalk.cyan(version)}`).start();

  try {
    await execAsync('npm install -g @coder11125/omg');
    spinner.succeed(chalk.green(`Updated to version ${version}`));
  } catch (err) {
    spinner.fail(chalk.red('Update failed'));
    const msg = formatError(err);
    if (msg.includes('EACCES') || msg.includes('permission')) {
      console.error(chalk.red('Permission denied. Try running with sudo:'));
      console.error(chalk.yellow('  sudo omg update'));
    } else if (msg.includes('npm')) {
      console.error(chalk.red('npm command failed. Is npm installed?'));
    } else {
      console.error(chalk.red(msg));
    }
    process.exitCode = 1;
  }
}

async function updateOmg(): Promise<void> {
  const currentVersion = '0.2.3'; // Hardcoded from package.json

  const spinner = ora('Checking for updates').start();
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

// ---------------------------------------------------------------------------
// init helpers
// ---------------------------------------------------------------------------
async function initRepo(directory: string, message?: string): Promise<void> {
  const spinner = ora(`Initializing git repository in ${chalk.cyan(directory)}`).start();

  try {
    const targetGit = directory === '.' ? git : simpleGit(directory);
    await targetGit.init();

    if (message) {
      spinner.text = 'Creating initial commit';
      await targetGit.add('.');
      await targetGit.commit(message);
      spinner.succeed(chalk.green(`Initialized and committed: ${message}`));
    } else {
      spinner.succeed(chalk.green(`Initialized empty git repository in ${directory}`));
    }
  } catch (err) {
    spinner.fail(chalk.red('Failed to initialize repository'));
    console.error(chalk.red(formatError(err)));
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
// tag helpers
// ---------------------------------------------------------------------------
async function createTag(name: string, message?: string): Promise<void> {
  const spinner = ora(`Creating tag ${chalk.cyan(name)}`).start();

  try {
    if (message) {
      await git.addAnnotatedTag(name, message);
      spinner.succeed(chalk.green(`Created annotated tag '${name}'`));
    } else {
      await git.addTag(name);
      spinner.succeed(chalk.green(`Created lightweight tag '${name}'`));
    }
  } catch (err) {
    spinner.fail(chalk.red(`Failed to create tag '${name}'`));
    const msg = formatError(err);
    if (msg.includes('already exists')) {
      console.error(chalk.red(`Tag '${name}' already exists`));
    } else {
      console.error(chalk.red(msg));
    }
    process.exitCode = 1;
  }
}

async function listTags(): Promise<void> {
  const spinner = ora('Fetching tags').start();

  try {
    const tags = await git.tags();
    spinner.stop();

    if (!tags || tags.all.length === 0) {
      console.log(chalk.yellow('No tags found.'));
      return;
    }

    console.log(chalk.bold('\nTags:\n'));
    for (const tag of tags.all) {
      console.log(`  ${chalk.cyan(tag)}`);
    }
    console.log('');
  } catch (err) {
    spinner.fail(chalk.red('Failed to list tags'));
    console.error(chalk.red(formatError(err)));
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
// fetch helpers
// ---------------------------------------------------------------------------
async function fetchChanges(remote?: string): Promise<void> {
  const spinnerText = remote ? `Fetching from ${chalk.cyan(remote)}` : 'Fetching from all remotes';
  const spinner = ora(spinnerText).start();

  try {
    if (remote) {
      await git.fetch(remote);
    } else {
      await git.fetch();
    }
    spinner.succeed(chalk.green('Fetch complete'));
  } catch (err) {
    spinner.fail(chalk.red('Fetch failed'));
    const msg = formatError(err);
    if (msg.includes('not a git repository')) {
      console.error(chalk.red('Not a git repository'));
    } else if (msg.includes('no remote')) {
      console.error(chalk.red('No remote configured. Add one with: omg remote <url>'));
    } else {
      console.error(chalk.red(msg));
    }
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
// reset helpers
// ---------------------------------------------------------------------------
async function resetChanges(mode: 'soft' | 'mixed' | 'hard'): Promise<void> {
  const modeDescriptions = {
    soft: 'Keep changes staged',
    mixed: 'Unstage files',
    hard: 'Discard all changes',
  };
  const spinnerText = `Resetting (${modeDescriptions[mode]})`;
  const spinner = ora(spinnerText).start();

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
    console.error(chalk.red(formatError(err)));
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
// utilities
// ---------------------------------------------------------------------------
function formatError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(chalk.red(formatError(err)));
  process.exit(1);
});