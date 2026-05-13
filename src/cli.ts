import { Command } from 'commander';
import chalk from 'chalk';
import { PACKAGE_VERSION } from './version.js';
import { setVerbose } from './errors.js';

interface CliOptions {
  visit?: string;
  commit?: string;
}

interface BranchOptions {
  new?: string;
  delete?: string;
  checkout?: boolean;
}

export function createProgram(): Command {
  const program = new Command();

  program
    .name('omg')
    .description('Oh My Git - a friendly CLI wrapper for common git tasks')
    .version(PACKAGE_VERSION, '-V, --version', 'output the current version')
    .option('--verbose', 'show detailed error output (show nerd errors)')
    .option('--visit <branch>', 'checkout the specified branch')
    .option('-c, --commit <message>', 'stage all changes and commit with a message')
    .action(async (opts: CliOptions & { verbose?: boolean }) => {
      const { checkoutBranch, stageAndCommit } = await import('./commands/worktree.js');
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
      const { createBranch, deleteBranch, listBranches } = await import('./commands/branch.js');
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
      const { addRemote, listRemotes } = await import('./commands/remote.js');
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
      const { showStatus } = await import('./commands/worktree.js');
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
      const { pushCommits } = await import('./commands/worktree.js');
      await pushCommits(remote, options?.force ?? false, options?.setUpstream);
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
      const { pullChanges } = await import('./commands/worktree.js');
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
      const { abortMerge, mergeBranch } = await import('./commands/history.js');
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
      const { abortRebase, continueRebase, rebaseBranch } = await import('./commands/history.js');
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
      const { showLog } = await import('./commands/worktree.js');
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
      const { showDiff } = await import('./commands/worktree.js');
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
      const { cloneRepo } = await import('./commands/worktree.js');
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
      const { handleStash } = await import('./commands/stash.js');
      await handleStash(subcommand, index);
    });

  // ---------------------------------------------------------------------------
  // update subcommand
  // ---------------------------------------------------------------------------
  program
    .command('update')
    .description('update omg to the latest version from npm')
    .action(async () => {
      const { updateOmg } = await import('./commands/automation.js');
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
      const { initRepo } = await import('./commands/worktree.js');
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
      const { createTag, listTags } = await import('./commands/history.js');
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
      const { fetchChanges } = await import('./commands/worktree.js');
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
      const { resetChanges } = await import('./commands/worktree.js');
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
      const { continueRevert, revertCommit } = await import('./commands/history.js');
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
      const { cherryPickCommit, continueCherryPick } = await import('./commands/history.js');
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
      const { getConfig, setConfig } = await import('./commands/worktree.js');
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
      const { showSocialStats } = await import('./commands/social.js');
      await showSocialStats();
    });

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
      const { shipChanges } = await import('./commands/automation.js');
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
      const { handleOops } = await import('./commands/recovery.js');
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
      const { syncWorkspace } = await import('./commands/automation.js');
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
      const { runDoctor } = await import('./commands/automation.js');
      await runDoctor(options.fix ?? false);
    });

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
      const { showBlame } = await import('./commands/history.js');
      await showBlame(file, options.line ? parseInt(options.line, 10) : undefined, options.stats ?? false);
    });

  return program;
}
