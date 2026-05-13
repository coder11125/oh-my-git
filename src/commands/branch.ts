import chalk from 'chalk';
import ora from 'ora';
import { git } from '../git.js';
import { handleNerdError, formatError } from '../errors.js';
import { validateNotFlag } from '../validation.js';
import { quipSpinnerText } from '../quips.js';

export async function listBranches(): Promise<void> {
  const spinner = ora(quipSpinnerText('branch_list', 'Fetching branches')).start();
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
export async function createBranch(name: string, switchAfter: boolean): Promise<void> {
  validateNotFlag(name, 'branch name');
  const spinner = ora(quipSpinnerText('branch_create', `Creating branch ${chalk.cyan(name)}`)).start();
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
export async function deleteBranch(name: string): Promise<void> {
  validateNotFlag(name, 'branch name');
  const spinner = ora(quipSpinnerText('branch_delete', `Deleting branch ${chalk.cyan(name)}`)).start();
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
