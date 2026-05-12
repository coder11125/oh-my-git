#!/usr/bin/env node
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { Command } from 'commander';
import { simpleGit, type SimpleGit } from 'simple-git';
import chalk from 'chalk';
import ora from 'ora';
import { exec } from 'child_process';
import { promisify } from 'util';

const PACKAGE_VERSION = (() => {
  const pkgPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version?: unknown };
  const v = pkg.version;
  if (typeof v !== 'string' || !v.trim()) {
    throw new Error(`omg: "${pkgPath}" must contain a non-empty string "version"`);
  }
  return v;
})();

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

/** Reject strings that look like git flags (start with `-`). */
function validateNotFlag(value: string, label: string): void {
  if (value.startsWith('-')) {
    console.error(chalk.red(`Error: ${label} must not start with a dash ('${value}')`));
    process.exitCode = 1;
    throw new Error(`invalid ${label}`);
  }
}

/** Validate a config key does not contain scope-escalation flags. */
function validateConfigKey(key: string): void {
  validateNotFlag(key, 'config key');
  const lower = key.toLowerCase();
  const forbidden = ['--global', '--system', '--local', '--file', '--blob'];
  for (const flag of forbidden) {
    if (lower.includes(flag)) {
      console.error(chalk.red(`Error: config key must not contain '${flag}'`));
      process.exitCode = 1;
      throw new Error('invalid config key');
    }
  }
}

// ---------------------------------------------------------------------------
// nerd error handling
// ---------------------------------------------------------------------------
interface NerdErrorMapping {
  pattern: RegExp;
  command: string;
  context?: string;
}

const ERROR_MAPPINGS: NerdErrorMapping[] = [
  { pattern: /not a git repository/i, command: 'omg init' },
  { pattern: /no upstream branch/i, command: 'omg push -u origin <branch>' },
  { pattern: /merge conflict/i, command: 'omg merge --abort', context: 'or resolve conflicts manually' },
  { pattern: /rebase conflict/i, command: 'omg rebase --abort', context: 'or use --continue after resolving' },
  { pattern: /not fully merged/i, command: 'omg branch -D <branch>', context: 'force delete unmerged branch' },
  { pattern: /no remote/i, command: 'omg remote <url>' },
  { pattern: /uncommitted changes/i, command: 'omg -c "message"', context: 'stage and commit first' },
  { pattern: /local changes/i, command: 'omg stash', context: 'stash changes first' },
  { pattern: /no stash entries/i, command: 'omg stash', context: 'create a stash first' },
  { pattern: /already exists/i, command: 'omg doctor', context: 'check for issues' },
  { pattern: /detached HEAD/i, command: 'omg oops restore-branch' },
  { pattern: /conflict/i, command: 'omg doctor', context: 'resolve conflicts' },
  { pattern: /permission denied/i, command: 'omg doctor' },
  { pattern: /could not resolve host/i, command: 'omg doctor', context: 'check network/remote' },
];

let verboseMode = false;

function setVerbose(verbose: boolean): void {
  verboseMode = verbose;
}

function handleNerdError(err: unknown, context?: string): void {
  const rawMessage = formatError(err);

  // Find matching error pattern
  for (const mapping of ERROR_MAPPINGS) {
    if (mapping.pattern.test(rawMessage)) {
      const cmd = context ? mapping.command.replace('<branch>', context) : mapping.command;
      let output = `${chalk.magenta('(OMG)')} 🤓 Nerd Error hidden: Run ${chalk.cyan(cmd)} to solve it`;

      if (mapping.context) {
        output += chalk.dim(` (${mapping.context})`);
      }

      console.error(output);

      if (verboseMode) {
        console.error(chalk.dim('\nDetails:'));
        console.error(chalk.dim(rawMessage));
      }
      return;
    }
  }

  // Fallback for unmapped errors
  console.error(`${chalk.magenta('(OMG)')} 🤓 Nerd Error hidden: Run ${chalk.cyan('omg doctor')} to diagnose`);

  if (verboseMode) {
    console.error(chalk.dim('\nDetails:'));
    console.error(chalk.dim(rawMessage));
  }
}

const program = new Command();

program
  .name('omg')
  .description('Oh My Git - a friendly CLI wrapper for common git tasks')
  .version(PACKAGE_VERSION, '-V, --version', 'output the current version')
  .option('--verbose', 'show detailed error output (show nerd errors)')
  .option('--visit <branch>', 'checkout the specified branch')
  .option('-c, --commit <message>', 'stage all changes and commit with a message')
  .action(async (opts: CliOptions & { verbose?: boolean }) => {
    // Set verbose mode globally
    setVerbose(opts.verbose ?? false);
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

// Hook to set verbose mode before any command runs
program.hook('preAction', (thisCommand) => {
  const opts = thisCommand.opts();
  if (opts.verbose !== undefined) {
    setVerbose(opts.verbose);
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
// revert subcommand
// ---------------------------------------------------------------------------
program
  .command('revert <commit>')
  .description(
    'revert an existing commit (creates a new commit that undoes changes)\n' +
    '  <commit>              commit hash to revert\n' +
    '  --continue            continue after resolving conflicts',
  )
  .option('--continue', 'continue after resolving conflicts')
  .action(async (commit: string, options?: { continue?: boolean }) => {
    if (options?.continue) {
      await continueRevert();
    } else {
      await revertCommit(commit);
    }
  });

// ---------------------------------------------------------------------------
// cherry-pick subcommand
// ---------------------------------------------------------------------------
program
  .command('cherry-pick <commit>')
  .description(
    'apply a commit from another branch\n' +
    '  <commit>              commit hash to cherry-pick\n' +
    '  --continue            continue after resolving conflicts',
  )
  .option('--continue', 'continue after resolving conflicts')
  .action(async (commit: string, options?: { continue?: boolean }) => {
    if (options?.continue) {
      await continueCherryPick();
    } else {
      await cherryPickCommit(commit);
    }
  });

// ---------------------------------------------------------------------------
// config subcommand
// ---------------------------------------------------------------------------
program
  .command('config <key> [value]')
  .description(
    'get or set git configuration\n' +
    '  <key>                 config key (e.g., user.name)\n' +
    '  [value]               set value (if omitted, shows current value)',
  )
  .action(async (key: string, value?: string) => {
    if (value !== undefined) {
      await setConfig(key, value);
    } else {
      await getConfig(key);
    }
  });

// ---------------------------------------------------------------------------
// social subcommand
// ---------------------------------------------------------------------------
program
  .command('social')
  .description('show repository collaborator statistics with humorous commentary')
  .action(async () => {
    await showSocialStats();
  });

// ---------------------------------------------------------------------------
// root-level action helpers
// ---------------------------------------------------------------------------
async function checkoutBranch(branch: string): Promise<void> {
  validateNotFlag(branch, 'branch name');
  const spinner = ora(`Checking out ${chalk.cyan(branch)}`).start();
  try {
    await git.checkout(branch);
    spinner.succeed(chalk.green(`Switched to branch '${branch}'`));
  } catch (err) {
    spinner.fail(chalk.red(`Failed to checkout '${branch}'`));
    handleNerdError(err);
    process.exitCode = 1;
  }
}

async function stageAndCommit(message: string): Promise<void> {
  const spinner = ora('Staging all changes').start();
  try {
    await git.add('.');
    spinner.text = `Committing with message: ${chalk.cyan(message)}`;
    const result = await git.commit(message, undefined, { '--': null });
    const sha = result.commit ? ` (${result.commit})` : '';
    spinner.succeed(chalk.green(`Committed${sha}`));
  } catch (err) {
    spinner.fail(chalk.red('Commit failed'));
    handleNerdError(err);
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
    handleNerdError(err);
    process.exitCode = 1;
  }
}

/** Create a branch, optionally switching to it immediately. */
async function createBranch(name: string, switchAfter: boolean): Promise<void> {
  validateNotFlag(name, 'branch name');
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
    handleNerdError(err);
    process.exitCode = 1;
  }
}

/** Delete a branch with a safety guard (must be fully merged). */
async function deleteBranch(name: string): Promise<void> {
  validateNotFlag(name, 'branch name');
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
      handleNerdError(err, name);
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
    handleNerdError(err);
    process.exitCode = 1;
  }
}

/** Add a new remote. */
async function addRemote(url: string, name: string): Promise<void> {
  validateNotFlag(name, 'remote name');
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
    handleNerdError(err);
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
    handleNerdError(err);
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
// push helpers
// ---------------------------------------------------------------------------
async function pushCommits(remote: string, force: boolean = false, setUpstream?: string): Promise<void> {
  validateNotFlag(remote, 'remote name');
  if (setUpstream) validateNotFlag(setUpstream, 'upstream branch');
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
async function pullChanges(remote?: string, rebase: boolean = false): Promise<void> {
  if (remote) validateNotFlag(remote, 'remote name');
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
    handleNerdError(err);
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
// merge helpers
// ---------------------------------------------------------------------------
async function mergeBranch(branch: string, squash: boolean = false): Promise<void> {
  validateNotFlag(branch, 'branch name');
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
    if (msg.includes('already up to date')) {
      console.log(chalk.yellow('Already up to date.'));
    } else {
      handleNerdError(err);
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
    handleNerdError(err);
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
// rebase helpers
// ---------------------------------------------------------------------------
async function rebaseBranch(branch: string): Promise<void> {
  validateNotFlag(branch, 'branch name');
  const spinner = ora(`Rebasing onto ${chalk.cyan(branch)}`).start();

  try {
    await git.rebase([branch]);
    spinner.succeed(chalk.green(`Rebased onto '${branch}'`));
  } catch (err) {
    spinner.fail(chalk.red('Rebase failed'));
    handleNerdError(err);
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
    handleNerdError(err);
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
    handleNerdError(err);
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
    handleNerdError(err);
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
    handleNerdError(err);
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
    handleNerdError(err);
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
    handleNerdError(err);
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
    handleNerdError(err);
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
    handleNerdError(err, index ?? '0');
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
    handleNerdError(err, index ?? '0');
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

    if (currentPart > latestPart) return 1;
    if (currentPart < latestPart) return -1;
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
    handleNerdError(err);
    process.exitCode = 1;
  }
}

async function updateOmg(): Promise<void> {
  const currentVersion = PACKAGE_VERSION;

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
    handleNerdError(err);
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
// tag helpers
// ---------------------------------------------------------------------------
async function createTag(name: string, message?: string): Promise<void> {
  validateNotFlag(name, 'tag name');
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
    handleNerdError(err, name);
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
    handleNerdError(err);
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
// fetch helpers
// ---------------------------------------------------------------------------
async function fetchChanges(remote?: string): Promise<void> {
  if (remote) validateNotFlag(remote, 'remote name');
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
    handleNerdError(err);
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
    handleNerdError(err);
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
// revert helpers
// ---------------------------------------------------------------------------
async function revertCommit(commit: string): Promise<void> {
  validateNotFlag(commit, 'commit hash');
  const spinner = ora(`Reverting commit ${chalk.cyan(commit)}`).start();

  try {
    await git.raw(['revert', '--no-edit', '--', commit]);
    spinner.succeed(chalk.green(`Reverted commit '${commit}'`));
  } catch (err) {
    spinner.fail(chalk.red(`Failed to revert '${commit}'`));
    handleNerdError(err, commit);
    process.exitCode = 1;
  }
}

async function continueRevert(): Promise<void> {
  const spinner = ora('Continuing revert').start();

  try {
    await git.raw(['revert', '--continue']);
    spinner.succeed(chalk.green('Revert completed'));
  } catch (err) {
    spinner.fail(chalk.red('Failed to continue revert'));
    handleNerdError(err);
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
// cherry-pick helpers
// ---------------------------------------------------------------------------
async function cherryPickCommit(commit: string): Promise<void> {
  validateNotFlag(commit, 'commit hash');
  const spinner = ora(`Cherry-picking ${chalk.cyan(commit)}`).start();

  try {
    await git.raw(['cherry-pick', '--', commit]);
    spinner.succeed(chalk.green(`Cherry-picked commit '${commit}'`));
  } catch (err) {
    spinner.fail(chalk.red(`Failed to cherry-pick '${commit}'`));
    handleNerdError(err, commit);
    process.exitCode = 1;
  }
}

async function continueCherryPick(): Promise<void> {
  const spinner = ora('Continuing cherry-pick').start();

  try {
    await git.raw(['cherry-pick', '--continue']);
    spinner.succeed(chalk.green('Cherry-pick completed'));
  } catch (err) {
    spinner.fail(chalk.red('Failed to continue cherry-pick'));
    handleNerdError(err);
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
// ship subcommand
// ---------------------------------------------------------------------------
program
  .command('ship [message]')
  .description(
    'smart ship: commit, sync, and push safely\n' +
    '  [message]          optional commit message (auto-stages if uncommitted)\n' +
    '  (no message)       just sync and push current state',
  )
  .option('--no-rebase', 'merge instead of rebase when behind')
  .option('-n, --dry-run', 'show what would happen without doing it')
  .action(async (message?: string, options?: { rebase?: boolean; dryRun?: boolean }) => {
    await shipChanges(message, options?.rebase ?? true, options?.dryRun ?? false);
  });

// ---------------------------------------------------------------------------
// oops subcommand
// ---------------------------------------------------------------------------
program
  .command('oops [action]')
  .description(
    'interactive recovery for common git mistakes\n' +
    '  (no args)          show interactive menu\n' +
    '  uncommit           undo last commit (keep changes)\n' +
    '  unstage            unstage all staged files\n' +
    '  unadd <file>       unstage specific file\n' +
    '  restore-branch     recover deleted branch from reflog',
  )
  .argument('[action]', 'recovery action')
  .argument('[file]', 'file for unadd action')
  .action(async (action?: string, file?: string) => {
    await handleOops(action, file);
  });

// ---------------------------------------------------------------------------
// sync subcommand
// ---------------------------------------------------------------------------
program
  .command('sync')
  .description(
    'refresh your workspace: stash → checkout main → pull → prune → return → pop',
  )
  .option('-b, --branch <name>', 'base branch to sync from (default: main)', 'main')
  .action(async (options: { branch: string }) => {
    await syncWorkspace(options.branch);
  });

// ---------------------------------------------------------------------------
// doctor subcommand
// ---------------------------------------------------------------------------
program
  .command('doctor')
  .description('check repository health and catch common issues')
  .option('--fix', 'attempt to auto-fix issues where safe')
  .action(async (options: { fix?: boolean }) => {
    await runDoctor(options.fix ?? false);
  });

// ---------------------------------------------------------------------------
// ship helpers
// ---------------------------------------------------------------------------
interface ShipStatus {
  hasUncommitted: boolean;
  hasStaged: boolean;
  branch: string;
  ahead: number;
  behind: number;
  tracking: string | null;
  remoteUrl: string | null;
}

async function getShipStatus(): Promise<ShipStatus> {
  const status = await git.status();
  const remotes = await git.getRemotes(true);
  const remoteUrl = remotes.length > 0 ? (remotes[0].refs.fetch || remotes[0].refs.push) : null;

  return {
    hasUncommitted: status.modified.length > 0 || status.deleted.length > 0 || status.not_added.length > 0,
    hasStaged: status.staged.length > 0,
    branch: status.current ?? 'HEAD',
    ahead: status.ahead,
    behind: status.behind,
    tracking: status.tracking,
    remoteUrl,
  };
}

async function shipChanges(message: string | undefined, useRebase: boolean, dryRun: boolean): Promise<void> {
  console.log(chalk.bold('\n🚢  Shipping changes...\n'));

  // Step 1: Check current status
  const spinner = ora('Analyzing repository state').start();
  let shipStatus: ShipStatus;
  try {
    shipStatus = await getShipStatus();
    spinner.succeed(`On branch ${chalk.cyan(shipStatus.branch)}`);
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
      const stepSpinner = ora(`${dryRun ? 'Would' : 'Staging and committing'}`).start();
      if (!dryRun) {
        try {
          await git.add('.');
          const result = await git.commit(message, undefined, { '--': null });
          stepSpinner.succeed(`Committed: ${chalk.cyan(message)}${result.commit ? ` (${result.commit.slice(0, 7)})` : ''}`);
        } catch (err) {
          stepSpinner.fail(chalk.red('Commit failed'));
          handleNerdError(err);
          process.exitCode = 1;
          return;
        }
      } else {
        stepSpinner.succeed(`Would commit: ${chalk.cyan(message)}`);
      }
    } else {
      // Just stage if there are unstaged changes
      if (shipStatus.hasUncommitted) {
        const stepSpinner = ora(`${dryRun ? 'Would' : 'Staging'} uncommitted changes`).start();
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
  const fetchSpinner = ora(`${dryRun ? 'Would fetch' : 'Fetching'} from remote`).start();
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
      const rebaseSpinner = ora(`${dryRun ? 'Would rebase' : 'Rebasing'} onto remote`).start();
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
      const mergeSpinner = ora(`${dryRun ? 'Would merge' : 'Merging'} remote changes`).start();
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
  const pushSpinner = ora(`${dryRun ? 'Would push' : 'Pushing'} to remote`).start();
  if (!dryRun) {
    try {
      const pushOptions: string[] = [];
      if (!shipStatus.tracking) {
        pushOptions.push('-u');
      }
      await git.push('origin', shipStatus.branch, pushOptions);
      pushSpinner.succeed(chalk.green(`Shipped to ${chalk.cyan('origin/' + shipStatus.branch)}`));
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

// ---------------------------------------------------------------------------
// oops helpers
// ---------------------------------------------------------------------------
async function showOopsMenu(): Promise<void> {
  console.log(chalk.bold('\n🆘  Oops! What would you like to recover?\n'));
  console.log(chalk.cyan('  1.') + ' Undo last commit (keep changes)');
  console.log(chalk.cyan('  2.') + ' Undo last commit (discard changes)');
  console.log(chalk.cyan('  3.') + ' Unstage all staged files');
  console.log(chalk.cyan('  4.') + ' Unstage a specific file');
  console.log(chalk.cyan('  5.') + ' Restore a deleted branch');
  console.log(chalk.cyan('  6.') + ' Undo last push (requires force)');
  console.log(chalk.cyan('  0.') + ' Cancel\n');
}

async function getInteractiveChoice(): Promise<string | null> {
  // For now, show the menu and instruct the user to run with specific commands
  // In a full implementation, this would use readline or a prompt library
  await showOopsMenu();
  console.log(chalk.yellow('Run `omg oops <action>` directly, or use:'));
  console.log(chalk.dim('  omg oops uncommit'));
  console.log(chalk.dim('  omg oops unstage'));
  console.log(chalk.dim('  omg oops unadd <file>'));
  console.log(chalk.dim('  omg oops restore-branch'));
  return null;
}

async function oopsUncommit(keepChanges: boolean): Promise<void> {
  const spinner = ora(`${keepChanges ? 'Undoing' : 'Discarding'} last commit`).start();
  try {
    const resetMode = keepChanges ? 'soft' : 'hard';
    await git.reset([`--${resetMode}`, 'HEAD~1']);
    if (keepChanges) {
      spinner.succeed(chalk.green('Last commit undone - changes are staged'));
      console.log(chalk.dim('  Your changes are preserved and staged. Amend with: omg -c "new message"'));
    } else {
      spinner.succeed(chalk.green('Last commit discarded'));
      console.log(chalk.yellow('⚠ All changes from that commit have been lost'));
    }
  } catch (err) {
    spinner.fail(chalk.red('Failed to undo commit'));
    handleNerdError(err);
    process.exitCode = 1;
  }
}

async function oopsUnstage(): Promise<void> {
  const spinner = ora('Unstaging all files').start();
  try {
    await git.reset(['--mixed']);
    spinner.succeed(chalk.green('All files unstaged'));
    console.log(chalk.dim('  Your changes are preserved but unstaged'));
  } catch (err) {
    spinner.fail(chalk.red('Failed to unstage'));
    handleNerdError(err);
    process.exitCode = 1;
  }
}

async function oopsUnadd(file: string): Promise<void> {
  const spinner = ora(`Unstaging ${chalk.cyan(file)}`).start();
  try {
    await git.reset(['--', file]);
    spinner.succeed(chalk.green(`Unstaged ${file}`));
  } catch (err) {
    spinner.fail(chalk.red(`Failed to unstage '${file}'`));
    handleNerdError(err);
    process.exitCode = 1;
  }
}

async function oopsRestoreBranch(): Promise<void> {
  const spinner = ora('Checking reflog for deleted branches').start();
  try {
    const reflog = await git.raw(['reflog']);
    // Parse reflog to find checkout lines that indicate branch switches
    const lines = reflog.split('\n');
    const deletedBranches: Array<{ sha: string; branch: string }> = [];

    for (const line of lines) {
      // Look for checkout operations that reference branch names
      const match = line.match(/checkout: moving from (\S+) to (\S+)/);
      if (match) {
        const [, fromBranch, toBranch] = match;
        // The 'from' branch might be deleted if we don't see it elsewhere
        if (fromBranch && !deletedBranches.some(b => b.branch === fromBranch)) {
          const shaMatch = line.match(/^([a-f0-9]+)/);
          if (shaMatch) {
            deletedBranches.push({ sha: shaMatch[1], branch: fromBranch });
          }
        }
      }
    }

    spinner.stop();

    if (deletedBranches.length === 0) {
      console.log(chalk.yellow('No recently deleted branches found in reflog'));
      return;
    }

    console.log(chalk.bold('\nRecently deleted branches:\n'));
    deletedBranches.slice(0, 10).forEach((b, i) => {
      console.log(`  ${chalk.cyan(`${i + 1}.`)} ${chalk.white(b.branch.padEnd(20))} ${chalk.dim(b.sha.slice(0, 7))}`);
    });
    console.log(chalk.dim('\nTo restore: git checkout -b <branch-name> <sha>'));
  } catch (err) {
    spinner.fail(chalk.red('Failed to check reflog'));
    handleNerdError(err);
    process.exitCode = 1;
  }
}

async function handleOops(action: string | undefined, file?: string): Promise<void> {
  if (!action) {
    await getInteractiveChoice();
    return;
  }

  switch (action.toLowerCase()) {
    case 'uncommit':
    case 'undo':
      await oopsUncommit(true);
      break;
    case 'discard':
    case 'drop':
      await oopsUncommit(false);
      break;
    case 'unstage':
      await oopsUnstage();
      break;
    case 'unadd':
      if (!file) {
        console.error(chalk.red('Error: file path required for unadd'));
        console.error(chalk.dim('Usage: omg oops unadd <file>'));
        process.exitCode = 1;
        return;
      }
      await oopsUnadd(file);
      break;
    case 'restore-branch':
    case 'restore':
      await oopsRestoreBranch();
      break;
    default:
      console.error(chalk.red(`Unknown action: ${action}`));
      console.log(chalk.dim('Available actions: uncommit, unstage, unadd <file>, restore-branch'));
      process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
// sync helpers
// ---------------------------------------------------------------------------
interface SyncState {
  originalBranch: string;
  hadStash: boolean;
  stashMessage: string;
}

async function syncWorkspace(baseBranch: string): Promise<void> {
  console.log(chalk.bold('\n🔄  Syncing workspace...\n'));

  const state: SyncState = {
    originalBranch: '',
    hadStash: false,
    stashMessage: `omg-sync-${Date.now()}`,
  };

  // Step 1: Get current branch and check status
  const checkSpinner = ora('Checking repository state').start();
  try {
    const status = await git.status();
    state.originalBranch = status.current ?? 'HEAD';

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

  // Step 2: Stash if needed (check again after initial status check)
  const currentStatus = await git.status();
  const hasChanges = currentStatus.modified.length > 0 || currentStatus.deleted.length > 0 ||
                     currentStatus.not_added.length > 0 || currentStatus.staged.length > 0;

  if (hasChanges) {
    const stashSpinner = ora('Stashing local changes').start();
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
  const checkoutSpinner = ora(`Switching to ${chalk.cyan(baseBranch)}`).start();
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
  const returnSpinner = ora(`Returning to ${chalk.cyan(state.originalBranch)}`).start();
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
    const popSpinner = ora('Restoring stashed changes').start();
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
  const pullSpinner = ora(`Pulling latest ${branch}`).start();
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
  const pruneSpinner = ora('Pruning stale remote branches').start();
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

async function runDoctor(autoFix: boolean): Promise<void> {
  console.log(chalk.bold('\n🏥  Running health checks...\n'));

  const issues: HealthIssue[] = [];
  const spinner = ora('Analyzing repository').start();

  try {
    // Check 1: Uncommitted changes
    const status = await git.status();
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
    const remotes = await git.getRemotes();
    if (remotes.length === 0) {
      issues.push({
        severity: 'error',
        message: 'No remote repository configured',
        fixable: false,
      });
    }

    // Check 6: Merge in progress
    try {
      const mergeHead = await git.raw(['rev-parse', '--quiet', '--verify', 'MERGE_HEAD']);
      if (mergeHead) {
        issues.push({
          severity: 'error',
          message: 'Merge in progress (unresolved conflicts?)',
          fixable: false,
        });
      }
    } catch {
      // No merge in progress, that's fine
    }

    // Check 7: Rebase in progress (simplified check using git status)
    if (status.conflicted.length > 0) {
      // Check if we're in a rebase by looking for .git/rebase-merge or .git/rebase-apply
      try {
        const { existsSync } = await import('fs');
        const { join, dirname } = await import('path');
        const gitDir = await git.raw(['rev-parse', '--git-dir']);
        const gitDirPath = gitDir.trim();
        if (existsSync(join(gitDirPath, 'rebase-merge')) || existsSync(join(gitDirPath, 'rebase-apply'))) {
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
    try {
      const recentFiles = await git.raw(['diff-tree', '-r', '--name-only', '--no-commit-id', 'HEAD']);
      if (recentFiles) {
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
    } catch {
      // Can't check, ignore
    }

    // Check 10: Old stashes
    try {
      const stashList = await git.stash(['list']);
      const stashCount = stashList.split('\n').filter(l => l.trim()).length;
      if (stashCount > 5) {
        issues.push({
          severity: 'warning',
          message: `${stashCount} stashes accumulating (consider cleaning up)`,
          fixable: false,
        });
      }
    } catch {
      // Can't check stashes
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
      const fixSpinner = ora('  Attempting auto-fix...').start();
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
      const fixSpinner = ora('  Attempting auto-fix...').start();
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

// ---------------------------------------------------------------------------
// config helpers
// ---------------------------------------------------------------------------
async function getConfig(key: string): Promise<void> {
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

async function setConfig(key: string, value: string): Promise<void> {
  validateConfigKey(key);
  const spinner = ora(`Setting ${chalk.cyan(key)} = ${chalk.cyan(value)}`).start();

  try {
    await git.addConfig(key, value, false, 'local');
    spinner.succeed(chalk.green(`Set '${key}' to '${value}'`));
  } catch (err) {
    spinner.fail(chalk.red(`Failed to set config '${key}'`));
    handleNerdError(err);
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
// social helpers
// ---------------------------------------------------------------------------
async function showSocialStats(): Promise<void> {
  const spinner = ora('Analyzing contributor data').start();

  try {
    // Fetch all commits
    const log = await git.log({ maxCount: 10000 });
    spinner.stop();

    if (!log || log.total === 0) {
      console.log(chalk.yellow('\nNo commits found. Time to be the first hero!\n'));
      return;
    }

    // Count commits per author
    const authorStats = new Map<string, number>();
    for (const commit of log.all) {
      const author = commit.author_name || 'Unknown';
      authorStats.set(author, (authorStats.get(author) || 0) + 1);
    }

    const totalCommits = log.total;
    const contributors = Array.from(authorStats.entries())
      .map(([author, count]) => ({
        author,
        count,
        percentage: ((count / totalCommits) * 100).toFixed(1),
      }))
      .sort((a, b) => b.count - a.count);

    console.log(chalk.bold('\n🎉 Social Scene\n'));
    console.log(chalk.dim(`Contributors: ${contributors.length} human${contributors.length !== 1 ? 's' : ''}\n`));

    // Display contributors with awards
    for (let i = 0; i < contributors.length; i++) {
      const stat = contributors[i];
      let icon = '  ';
      let suffix = '';

      if (i === 0) {
        icon = '👑';
        suffix = chalk.green(' - Most helpful human!');
      } else if (i === 1) {
        icon = '🥈';
      } else if (i === 2) {
        icon = '🥉';
      } else {
        icon = '📝';
      }

      const authorPadded = stat.author.padEnd(20);
      console.log(
        `  ${icon} ${chalk.white(authorPadded)} ` +
        `${chalk.yellow(stat.count.toString().padStart(4))} commits ` +
        `${chalk.dim(`(${stat.percentage}%)`)}${suffix}`
      );
    }

    console.log(chalk.dim(`\nTotal commits: ${totalCommits}\n`));

    // Add humorous commentary based on patterns
    if (contributors.length === 1) {
      console.log(chalk.dim('💬 Solo project - you\'re doing great (or going crazy)\n'));
    } else if (contributors.length > 1 && contributors[0].count > totalCommits * 0.7) {
      console.log(chalk.dim(`💬 This is a well-balanced team. Or ${contributors[0].author} is doing all the work.\n`));
    } else if (contributors.length > 10) {
      console.log(chalk.dim('💬 That\'s a lot of cooks in the kitchen. Hope the soup is good!\n'));
    } else {
      console.log(chalk.dim('💬 This is a well-balanced team. Collaboration at its finest!\n'));
    }
  } catch (err) {
    spinner.fail(chalk.red('Failed to analyze contributors'));
    handleNerdError(err);
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
// blame subcommand
// ---------------------------------------------------------------------------
program
  .command('blame <file>')
  .description(
    'show line-by-line authorship of a file\n' +
    '  <file>             file to blame\n' +
    '  -L <line>          show specific line\n' +
    '  -s, --stats        show author statistics',
  )
  .option('-L, --line <number>', 'show blame for specific line only')
  .option('-s, --stats', 'show author statistics instead of line-by-line')
  .action(async (file: string, options: { line?: string; stats?: boolean }) => {
    await showBlame(file, options.line ? parseInt(options.line, 10) : undefined, options.stats ?? false);
  });

// ---------------------------------------------------------------------------
// blame helpers
// ---------------------------------------------------------------------------
async function showBlame(file: string, lineNum?: number, showStats: boolean = false): Promise<void> {
  validateNotFlag(file, 'file path');
  const spinner = ora(`Analyzing ${chalk.cyan(file)}`).start();

  try {
    const blameData = await git.raw(['blame', file]);
    spinner.stop();

    if (showStats) {
      await showBlameStats(blameData, file);
    } else if (lineNum !== undefined) {
      showBlameLine(blameData, file, lineNum);
    } else {
      showBlameFull(blameData, file);
    }
  } catch (err) {
    spinner.fail(chalk.red(`Failed to blame '${file}'`));
    handleNerdError(err);
    process.exitCode = 1;
  }
}

function showBlameFull(blameData: string, file: string): void {
  const lines = blameData.split('\n').filter(line => line.trim());
  
  if (lines.length === 0) {
    console.log(chalk.yellow(`No blame data available for ${chalk.cyan(file)}`));
    return;
  }

  console.log(chalk.bold(`\n--- Blame: ${chalk.cyan(file)} ---\n`));

  // Parse blame output
  // Git blame format: hash (author date time timezone lineNum) content
  const entries: Array<{
    hash: string;
    author: string;
    date: string;
    lineNum: number;
    content: string;
  }> = [];

  for (const line of lines) {
    // Match pattern: hash (author date time timezone lineNum) content
    const match = line.match(/^([0-9a-f]+)\s+\(([^)]+)\)\s*(.*)$/);
    if (match) {
      const hash = match[1];
      const metaPart = match[2];
      const content = match[3];

      // Parse meta part: author date time timezone lineNum
      const metaParts = metaPart.split(/\s+/);
      if (metaParts.length >= 4) {
        const author = metaParts[0];
        const date = metaParts.slice(1, metaParts.length - 1).join(' ');
        const lineNum = parseInt(metaParts[metaParts.length - 1], 10);

        entries.push({
          hash,
          author,
          date,
          lineNum,
          content,
        });
      }
    }
  }

  // Display with formatting
  for (const entry of entries) {
    const shortHash = entry.hash.slice(0, 7);
    const lineNum = chalk.dim(`${entry.lineNum.toString().padStart(4)}:`);
    const hashStr = chalk.green(shortHash);
    const authorStr = chalk.cyan(entry.author.padEnd(15));
    const dateStr = chalk.dim(entry.date);
    
    console.log(`${lineNum} ${hashStr} ${authorStr} ${dateStr} ${entry.content}`);
  }

  console.log('');
}

function showBlameLine(blameData: string, file: string, lineNum: number): void {
  const lines = blameData.split('\n').filter(line => line.trim());
  
  if (lines.length === 0 || lineNum < 1 || lineNum > lines.length) {
    console.log(chalk.yellow(`Line ${lineNum} not found in ${chalk.cyan(file)}`));
    return;
  }

  const targetLine = lines[lineNum - 1];
  
  // Match pattern: hash (author date time timezone lineNum) content
  const match = targetLine.match(/^([0-9a-f]+)\s+\(([^)]+)\)\s*(.*)$/);
  if (match) {
    const hash = match[1];
    const metaPart = match[2];
    const content = match[3];

    // Parse meta part: author date time timezone lineNum
    const metaParts = metaPart.split(/\s+/);
    if (metaParts.length >= 4) {
      const author = metaParts[0];
      const date = metaParts.slice(1, metaParts.length - 1).join(' ');

      console.log(chalk.bold(`\n--- Blame: ${chalk.cyan(file)}:${chalk.yellow(lineNum.toString())} ---\n`));
      console.log(`${chalk.green('Commit:')} ${chalk.cyan(hash.slice(0, 7))} ${chalk.dim(`(${hash})`)}`);
      console.log(`${chalk.green('Author:')} ${chalk.cyan(author)}`);
      console.log(`${chalk.green('Date:')} ${chalk.dim(date)}`);
      console.log(`${chalk.green('Line:')} ${content}`);
      console.log('');
    }
  }
}

async function showBlameStats(blameData: string, file: string): Promise<void> {
  const lines = blameData.split('\n').filter(line => line.trim());
  
  if (lines.length === 0) {
    console.log(chalk.yellow(`No blame data available for ${chalk.cyan(file)}`));
    return;
  }

  // Parse and count by author
  const authorStats = new Map<string, number>();

  for (const line of lines) {
    // Match pattern: hash (author date time timezone lineNum) content
    const match = line.match(/^([0-9a-f]+)\s+\(([^)]+)\)\s*(.*)$/);
    if (match) {
      const metaPart = match[2];
      const metaParts = metaPart.split(/\s+/);
      if (metaParts.length >= 4) {
        const author = metaParts[0];
        authorStats.set(author, (authorStats.get(author) || 0) + 1);
      }
    }
  }

  const totalLines = Array.from(authorStats.values()).reduce((a, b) => a + b, 0);
  const sortedStats = Array.from(authorStats.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([author, count]) => ({
      author,
      count,
      percentage: ((count / totalLines) * 100).toFixed(1),
    }));

  console.log(chalk.bold(`\n--- Author Statistics: ${chalk.cyan(file)} ---\n`));
  console.log(`${chalk.dim('Total lines:')} ${totalLines}\n`);

  const maxCount = sortedStats[0]?.count || 1;
  const maxAuthorLength = Math.max(...sortedStats.map(s => s.author.length));

  for (const stat of sortedStats) {
    const barLength = Math.floor((stat.count / maxCount) * 30);
    const bar = '█'.repeat(barLength);
    const authorPadded = stat.author.padEnd(maxAuthorLength);
    
    console.log(
      `${chalk.cyan(authorPadded)} ` +
      `${chalk.yellow(stat.count.toString().padStart(4))} lines ` +
      `${chalk.dim(`(${stat.percentage}%)`)} ` +
      `${chalk.green(bar)}`
    );
  }

  console.log('');
}

// ---------------------------------------------------------------------------
// utilities
// ---------------------------------------------------------------------------
function formatError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

program.parseAsync(process.argv).catch((err: unknown) => {
  handleNerdError(err);
  process.exit(1);
});