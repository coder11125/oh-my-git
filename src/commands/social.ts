import chalk from 'chalk';
import ora from 'ora';
import { git } from '../git.js';
import { handleNerdError } from '../errors.js';
import { quipSpinnerText } from '../quips.js';

export async function showSocialStats(): Promise<void> {
  const spinner = ora(quipSpinnerText('social', 'Analyzing contributor data')).start();

  try {
    // Fetch all commits
    const log = await git.log({ maxCount: 10000 });
    spinner.stop();

    if (!log || log.total === 0) {
      console.log(chalk.yellow('\nNo commits found. Time to be the first hero!\n'));
      return;
    }

    // Count commits per author
    const authorStats = new Map<string, number>();
    for (const commit of log.all) {
      const author = commit.author_name || 'Unknown';
      authorStats.set(author, (authorStats.get(author) || 0) + 1);
    }

    const totalCommits = log.total;
    const contributors = Array.from(authorStats.entries())
      .map(([author, count]) => ({
        author,
        count,
        percentage: ((count / totalCommits) * 100).toFixed(1),
      }))
      .sort((a, b) => b.count - a.count);

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
        `${chalk.dim(`(${stat.percentage}%)`)}${suffix}`
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
