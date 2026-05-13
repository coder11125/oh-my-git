import chalk from 'chalk';
import ora from 'ora';
import { git } from '../git.js';
import { handleNerdError } from '../errors.js';
import { sanitizeForTerminal } from '../output.js';
import { quipSpinnerText } from '../quips.js';

export async function handleStash(action?: string, index?: string): Promise<void> {
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
  const spinner = ora(quipSpinnerText('stash', 'Stashing changes')).start();

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
  const spinner = ora(quipSpinnerText('stash_pop', 'Popping stash')).start();

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
  const spinner = ora(quipSpinnerText('stash_list', 'Fetching stash list')).start();

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
      console.log(`  ${chalk.cyan(sanitizeForTerminal(line))}`);
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
  const spinner = ora(quipSpinnerText('stash_drop', `Dropping ${chalk.cyan(stashRef)}`)).start();

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
  const spinner = ora(quipSpinnerText('stash_apply', `Applying ${chalk.cyan(stashRef)}`)).start();

  try {
    await git.stash(['apply', stashRef]);
    spinner.succeed(chalk.green(`Applied ${stashRef}`));
  } catch (err) {
    spinner.fail(chalk.red(`Failed to apply ${stashRef}`));
    handleNerdError(err, index ?? '0');
    process.exitCode = 1;
  }
}
