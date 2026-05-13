import chalk from 'chalk';
import ora from 'ora';
import { git } from '../git.js';
import { handleNerdError } from '../errors.js';
import { quipSpinnerText } from '../quips.js';

/** Parse `git shortlog -sn` lines: leading spaces, count, tab, author name. */
function parseShortlog(output: string): { author: string; count: number }[] {
  const result: { author: string; count: number }[] = [];
  for (const line of output.split('\n')) {
    if (!line.trim()) continue;
    const tab = line.indexOf('\t');
    if (tab === -1) continue;
    const count = parseInt(line.slice(0, tab).trim(), 10);
    const author = line.slice(tab + 1).trim();
    if (!author || Number.isNaN(count)) continue;
    result.push({ author, count });
  }
  return result;
}

export async function showSocialStats(): Promise<void> {
  const spinner = ora(quipSpinnerText('social', 'Analyzing contributor data')).start();

  try {
    const [shortlogOut, countOut] = await Promise.all([
      git.raw(['shortlog', '-sn', 'HEAD']),
      git.raw(['rev-list', '--count', 'HEAD']),
    ]);
    spinner.stop();

    const totalCommits = parseInt(String(countOut).trim(), 10);
    if (!Number.isFinite(totalCommits) || totalCommits <= 0) {
      console.log(chalk.yellow('\nNo commits found. Time to be the first hero!\n'));
      return;
    }

    const contributors = parseShortlog(shortlogOut).map((row) => ({
      author: row.author,
      count: row.count,
      percentage: ((row.count / totalCommits) * 100).toFixed(1),
    }));

    if (contributors.length === 0) {
      if (totalCommits > 0) {
        console.log(chalk.bold('\n🎉 Social Scene\n'));
        console.log(chalk.dim(`Total commits: ${totalCommits} (contributor breakdown unavailable)\n`));
        return;
      }
      console.log(chalk.yellow('\nNo commits found. Time to be the first hero!\n'));
      return;
    }

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
        `${chalk.dim(`(${stat.percentage}%)`)}${suffix}`,
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
