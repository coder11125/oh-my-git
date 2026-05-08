#!/usr/bin/env node
import { Command } from 'commander';
import { simpleGit, type SimpleGit } from 'simple-git';
import chalk from 'chalk';
import ora from 'ora';

interface CliOptions {
  visit?: string;
  commit?: string;
}

const git: SimpleGit = simpleGit();

const program = new Command();

program
  .name('omg')
  .description('Oh My Git - a friendly CLI wrapper for common git tasks')
  .version('0.1.0', '-V, --version', 'output the current version')
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

function formatError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(chalk.red(formatError(err)));
  process.exit(1);
});
