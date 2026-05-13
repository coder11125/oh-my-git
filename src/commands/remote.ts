import chalk from 'chalk';
import ora from 'ora';
import { git } from '../git.js';
import { handleNerdError } from '../errors.js';
import { validateNotFlag } from '../validation.js';
import { quipSpinnerText } from '../quips.js';

export async function listRemotes(): Promise<void> {
  const spinner = ora(quipSpinnerText('remote_list', 'Fetching remotes')).start();
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
export async function addRemote(url: string, name: string): Promise<void> {
  validateNotFlag(name, 'remote name');
  const spinner = ora(quipSpinnerText('remote_add', `Adding remote ${chalk.cyan(name)} (${chalk.dim(url)})`)).start();
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
