#!/usr/bin/env node
import { Command } from 'commander';
import { simpleGit, type SimpleGit } from 'simple-git';
import chalk from 'chalk';
import ora from 'ora';

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
  .version('0.1.3', '-V, --version', 'output the current version')
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