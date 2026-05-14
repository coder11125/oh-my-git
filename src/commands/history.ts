import chalk from 'chalk';
import ora from 'ora';
import { git } from '../git.js';
import { handleNerdError, formatError } from '../errors.js';
import { sanitizeForTerminal } from '../output.js';
import { validateNotFlag } from '../validation.js';
import { quipSpinnerText } from '../quips.js';

interface BlameEntry {
  hash: string;
  author: string;
  authorTime: number;
  summary: string;
  lineNum: number;
  content: string;
}

export async function mergeBranch(branch: string, squash: boolean = false): Promise<void> {
  validateNotFlag(branch, 'branch name');
  const safeBranch = sanitizeForTerminal(branch);
  const spinner = ora(quipSpinnerText('merge', `Merging ${chalk.cyan(safeBranch)}`)).start();

  try {
    const options: string[] = [];
    if (squash) options.push('--squash');

    await git.merge([branch, ...options]);

    if (squash) {
      spinner.succeed(chalk.green(`Squashed ${safeBranch} into current branch`));
      console.log(chalk.yellow('Commit the squashed changes with: omg -c "message"'));
    } else {
      spinner.succeed(chalk.green(`Merged '${safeBranch}' into current branch`));
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
  const safeBranch = sanitizeForTerminal(branch);
  const spinner = ora(quipSpinnerText('rebase', `Rebasing onto ${chalk.cyan(safeBranch)}`)).start();

  try {
    await git.rebase([branch]);
    spinner.succeed(chalk.green(`Rebased onto '${safeBranch}'`));
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
  const safeName = sanitizeForTerminal(name);
  const spinner = ora(quipSpinnerText('tag_create', `Creating tag ${chalk.cyan(safeName)}`)).start();

  try {
    if (message) {
      await git.addAnnotatedTag(name, message);
      spinner.succeed(chalk.green(`Created annotated tag '${safeName}'`));
    } else {
      await git.addTag(name);
      spinner.succeed(chalk.green(`Created lightweight tag '${safeName}'`));
    }
  } catch (err) {
    spinner.fail(chalk.red(`Failed to create tag '${safeName}'`));
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
      console.log(`  ${chalk.cyan(sanitizeForTerminal(tag))}`);
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
  const safeCommit = sanitizeForTerminal(commit);
  const spinner = ora(quipSpinnerText('revert', `Reverting commit ${chalk.cyan(safeCommit)}`)).start();

  try {
    await git.raw(['revert', '--no-edit', commit]);
    spinner.succeed(chalk.green(`Reverted commit '${safeCommit}'`));
  } catch (err) {
    spinner.fail(chalk.red(`Failed to revert '${safeCommit}'`));
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
  const safeCommit = sanitizeForTerminal(commit);
  const spinner = ora(quipSpinnerText('cherry_pick', `Cherry-picking ${chalk.cyan(safeCommit)}`)).start();

  try {
    await git.raw(['cherry-pick', commit]);
    spinner.succeed(chalk.green(`Cherry-picked commit '${safeCommit}'`));
  } catch (err) {
    spinner.fail(chalk.red(`Failed to cherry-pick '${safeCommit}'`));
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
  const safeFile = sanitizeForTerminal(file);
  const spinner = ora(quipSpinnerText('blame', `Analyzing ${chalk.cyan(safeFile)}`)).start();

  try {
    const blameData = await git.raw(['blame', '--line-porcelain', '--', file]);
    const entries = parseBlamePorcelain(blameData);
    spinner.stop();

    if (showStats) {
      showBlameStats(entries, file);
    } else if (lineNum !== undefined) {
      showBlameLine(entries, file, lineNum);
    } else {
      showBlameFull(entries, file);
    }
  } catch (err) {
    spinner.fail(chalk.red(`Failed to blame '${safeFile}'`));
    handleNerdError(err);
    process.exitCode = 1;
  }
}

function parseBlamePorcelain(blameData: string): BlameEntry[] {
  const lines = blameData.split('\n');
  const entries: BlameEntry[] = [];

  for (let i = 0; i < lines.length; i++) {
    const header = lines[i];
    if (!header.trim()) continue;

    const headerMatch = header.match(/^([0-9a-f]{7,40})\s+\d+\s+(\d+)\s+\d+$/);
    if (!headerMatch) continue;

    const hash = headerMatch[1];
    const lineNum = parseInt(headerMatch[2], 10);
    let author = 'Unknown';
    let authorTime = 0;
    let summary = '';
    let content = '';

    i += 1;
    for (; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith('\t')) {
        content = line.slice(1);
        break;
      }
      if (line.startsWith('author ')) {
        author = line.slice('author '.length);
      } else if (line.startsWith('author-time ')) {
        authorTime = parseInt(line.slice('author-time '.length), 10) || 0;
      } else if (line.startsWith('summary ')) {
        summary = line.slice('summary '.length);
      }
    }

    entries.push({ hash, author, authorTime, summary, lineNum, content });
  }

  return entries;
}

function formatBlameDate(timestamp: number): string {
  if (!timestamp) return 'Unknown date';
  return new Date(timestamp * 1000).toISOString().slice(0, 10);
}

function showBlameFull(entries: BlameEntry[], file: string): void {
  if (entries.length === 0) {
    console.log(chalk.yellow(`No blame data available for ${chalk.cyan(sanitizeForTerminal(file))}`));
    return;
  }

  console.log(chalk.bold(`\n--- Blame: ${chalk.cyan(sanitizeForTerminal(file))} ---\n`));

  for (const entry of entries) {
    const shortHash = entry.hash.slice(0, 7);
    const lineNum = chalk.dim(`${entry.lineNum.toString().padStart(4)}:`);
    const hashStr = chalk.green(shortHash);
    const authorStr = chalk.cyan(sanitizeForTerminal(entry.author).padEnd(15));
    const dateStr = chalk.dim(formatBlameDate(entry.authorTime));
    const content = sanitizeForTerminal(entry.content);

    console.log(`${lineNum} ${hashStr} ${authorStr} ${dateStr} ${content}`);
  }

  console.log('');
}

function showBlameLine(entries: BlameEntry[], file: string, lineNum: number): void {
  const entry = entries.find(item => item.lineNum === lineNum);

  if (!entry) {
    console.log(chalk.yellow(`Line ${lineNum} not found in ${chalk.cyan(sanitizeForTerminal(file))}`));
    return;
  }

  console.log(chalk.bold(`\n--- Blame: ${chalk.cyan(sanitizeForTerminal(file))}:${chalk.yellow(lineNum.toString())} ---\n`));
  console.log(`${chalk.green('Commit:')} ${chalk.cyan(entry.hash.slice(0, 7))} ${chalk.dim(`(${entry.hash})`)}`);
  console.log(`${chalk.green('Author:')} ${chalk.cyan(sanitizeForTerminal(entry.author))}`);
  console.log(`${chalk.green('Date:')} ${chalk.dim(formatBlameDate(entry.authorTime))}`);
  if (entry.summary) {
    console.log(`${chalk.green('Summary:')} ${sanitizeForTerminal(entry.summary)}`);
  }
  console.log(`${chalk.green('Line:')} ${sanitizeForTerminal(entry.content)}`);
  console.log('');
}

function showBlameStats(entries: BlameEntry[], file: string): void {
  if (entries.length === 0) {
    console.log(chalk.yellow(`No blame data available for ${chalk.cyan(sanitizeForTerminal(file))}`));
    return;
  }

  const authorStats = new Map<string, number>();
  for (const entry of entries) {
    authorStats.set(entry.author, (authorStats.get(entry.author) || 0) + 1);
  }

  const totalLines = Array.from(authorStats.values()).reduce((a, b) => a + b, 0);
  const sortedStats = Array.from(authorStats.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([author, count]) => ({
      author,
      count,
      percentage: ((count / totalLines) * 100).toFixed(1),
    }));

  console.log(chalk.bold(`\n--- Author Statistics: ${chalk.cyan(sanitizeForTerminal(file))} ---\n`));
  console.log(`${chalk.dim('Total lines:')} ${totalLines}\n`);

  const maxCount = sortedStats[0]?.count || 1;
  const maxAuthorLength = Math.max(...sortedStats.map(s => s.author.length));

  for (const stat of sortedStats) {
    const barLength = Math.floor((stat.count / maxCount) * 30);
    const bar = '█'.repeat(barLength);
    const authorPadded = sanitizeForTerminal(stat.author).padEnd(maxAuthorLength);
    
    console.log(
      `${chalk.cyan(authorPadded)} ` +
      `${chalk.yellow(stat.count.toString().padStart(4))} lines ` +
      `${chalk.dim(`(${stat.percentage}%)`)} ` +
      `${chalk.green(bar)}`
    );
  }

  console.log('');
}

export async function showVisualHistory(): Promise<void> {
  const spinner = ora(quipSpinnerText('visualize', 'Mapping the multiverse graph')).start();

  try {
    // We use a custom format with a unique delimiter so we can stylize 
    // the graph without corrupting branch names or commit messages.
    // Using %d gives us the parentheses around decorations.
    const SEP = '||OMG_SEP||';
    const output = await git.raw([
      'log',
      '--graph',
      '--all',
      `--format=${SEP}%h %s %d`,
      '--color=always',
      '-n',
      '30',
    ]);
    spinner.stop();

    console.log(chalk.bold('\n--- Repository Multiverse ---\n'));
    
    if (!output || output.trim() === '') {
      console.log(chalk.yellow('No history found.'));
    } else {
      const lines = output.split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;

        if (line.includes(SEP)) {
          const [graph, content] = line.split(SEP);
          
          // 1. Stylize ONLY the graph part
          const stylizedGraph = graph
            .replace(/\*/g, '●')
            .replace(/\|/g, '│')
            .replace(/\//g, '╱')
            .replace(/\\/g, '╲')
            .replace(/_/g, '─');

          // 2. Sanitize content while preserving ANSI colors
          // We manually escape control characters EXCEPT the escape char (0x1b)
          // to keep the colors provided by git --color=always.
          const safeContent = (content || '').replace(/[\u0000-\u001a\u001c-\u001f\u007f-\u009f]/g, (char) => {
            const code = char.charCodeAt(0);
            return `\\x${code.toString(16).padStart(2, '0')}`;
          });
          
          console.log(`${stylizedGraph}${safeContent}`);
        } else {
          // Lines without the separator are pure graph lines (branch connections)
          const stylizedGraph = line
            .replace(/\|/g, '│')
            .replace(/\//g, '╱')
            .replace(/\\/g, '╲')
            .replace(/_/g, '─');
          console.log(stylizedGraph);
        }
      }
    }
    console.log('');
  } catch (err) {
    spinner.fail(chalk.red('Failed to visualize history'));
    handleNerdError(err);
    process.exitCode = 1;
  }
}
