import chalk from 'chalk';
import ora from 'ora';
import { git } from '../git.js';
import { handleNerdError } from '../errors.js';
import { sanitizeForTerminal } from '../output.js';
import { quipSpinnerText } from '../quips.js';

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
  const spinner = ora(quipSpinnerText('oops_uncommit', `${keepChanges ? 'Undoing' : 'Discarding'} last commit`)).start();
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
  const spinner = ora(quipSpinnerText('oops_unstage_all', 'Unstaging all files')).start();
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
  const safeFile = sanitizeForTerminal(file);
  const spinner = ora(quipSpinnerText('oops_unstage_file', `Unstaging ${chalk.cyan(safeFile)}`)).start();
  try {
    await git.reset(['--', file]);
    spinner.succeed(chalk.green(`Unstaged ${safeFile}`));
  } catch (err) {
    spinner.fail(chalk.red(`Failed to unstage '${safeFile}'`));
    handleNerdError(err);
    process.exitCode = 1;
  }
}

async function oopsRestoreBranch(): Promise<void> {
  const spinner = ora(quipSpinnerText('oops_restore_branch', 'Checking reflog for deleted branches')).start();
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
      console.log(`  ${chalk.cyan(`${i + 1}.`)} ${chalk.white(sanitizeForTerminal(b.branch).padEnd(20))} ${chalk.dim(b.sha.slice(0, 7))}`);
    });
    console.log(chalk.dim('\nTo restore: git checkout -b <branch-name> <sha>'));
  } catch (err) {
    spinner.fail(chalk.red('Failed to check reflog'));
    handleNerdError(err);
    process.exitCode = 1;
  }
}

export async function handleOops(action: string | undefined, file?: string): Promise<void> {
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
