import chalk from 'chalk';
import ora from 'ora';
import { git } from '../git.js';
import { handleNerdError, formatError } from '../errors.js';
import { validateNotFlag } from '../validation.js';
import { quipSpinnerText } from '../quips.js';

export async function mergeBranch(branch: string, squash: boolean = false): Promise<void> {
  validateNotFlag(branch, 'branch name');
  const spinner = ora(quipSpinnerText('merge', `Merging ${chalk.cyan(branch)}`)).start();

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

export async function abortMerge(): Promise<void> {
  const spinner = ora(quipSpinnerText('merge_abort', 'Aborting merge')).start();

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
export async function rebaseBranch(branch: string): Promise<void> {
  validateNotFlag(branch, 'branch name');
  const spinner = ora(quipSpinnerText('rebase', `Rebasing onto ${chalk.cyan(branch)}`)).start();

  try {
    await git.rebase([branch]);
    spinner.succeed(chalk.green(`Rebased onto '${branch}'`));
  } catch (err) {
    spinner.fail(chalk.red('Rebase failed'));
    handleNerdError(err);
    process.exitCode = 1;
  }
}

export async function continueRebase(): Promise<void> {
  const spinner = ora(quipSpinnerText('rebase_continue', 'Continuing rebase')).start();

  try {
    await git.rebase(['--continue']);
    spinner.succeed(chalk.green('Rebase completed'));
  } catch (err) {
    spinner.fail(chalk.red('Failed to continue rebase'));
    handleNerdError(err);
    process.exitCode = 1;
  }
}

export async function abortRebase(): Promise<void> {
  const spinner = ora(quipSpinnerText('rebase_abort', 'Aborting rebase')).start();

  try {
    await git.rebase(['--abort']);
    spinner.succeed(chalk.green('Rebase aborted'));
  } catch (err) {
    spinner.fail(chalk.red('Failed to abort rebase'));
    handleNerdError(err);
    process.exitCode = 1;
  }
}

export async function createTag(name: string, message?: string): Promise<void> {
  validateNotFlag(name, 'tag name');
  const spinner = ora(quipSpinnerText('tag_create', `Creating tag ${chalk.cyan(name)}`)).start();

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

export async function listTags(): Promise<void> {
  const spinner = ora(quipSpinnerText('tag_list', 'Fetching tags')).start();

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

export async function revertCommit(commit: string): Promise<void> {
  validateNotFlag(commit, 'commit hash');
  const spinner = ora(quipSpinnerText('revert', `Reverting commit ${chalk.cyan(commit)}`)).start();

  try {
    await git.raw(['revert', '--no-edit', '--', commit]);
    spinner.succeed(chalk.green(`Reverted commit '${commit}'`));
  } catch (err) {
    spinner.fail(chalk.red(`Failed to revert '${commit}'`));
    handleNerdError(err, commit);
    process.exitCode = 1;
  }
}

export async function continueRevert(): Promise<void> {
  const spinner = ora(quipSpinnerText('revert_continue', 'Continuing revert')).start();

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
export async function cherryPickCommit(commit: string): Promise<void> {
  validateNotFlag(commit, 'commit hash');
  const spinner = ora(quipSpinnerText('cherry_pick', `Cherry-picking ${chalk.cyan(commit)}`)).start();

  try {
    await git.raw(['cherry-pick', '--', commit]);
    spinner.succeed(chalk.green(`Cherry-picked commit '${commit}'`));
  } catch (err) {
    spinner.fail(chalk.red(`Failed to cherry-pick '${commit}'`));
    handleNerdError(err, commit);
    process.exitCode = 1;
  }
}

export async function continueCherryPick(): Promise<void> {
  const spinner = ora(quipSpinnerText('cherry_pick_continue', 'Continuing cherry-pick')).start();

  try {
    await git.raw(['cherry-pick', '--continue']);
    spinner.succeed(chalk.green('Cherry-pick completed'));
  } catch (err) {
    spinner.fail(chalk.red('Failed to continue cherry-pick'));
    handleNerdError(err);
    process.exitCode = 1;
  }
}

export async function showBlame(file: string, lineNum?: number, showStats: boolean = false): Promise<void> {
  validateNotFlag(file, 'file path');
  const spinner = ora(quipSpinnerText('blame', `Analyzing ${chalk.cyan(file)}`)).start();

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
