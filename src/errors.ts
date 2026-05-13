import chalk from 'chalk';

interface NerdErrorMapping {
  pattern: RegExp;
  command: string;
  context?: string;
}

const ERROR_MAPPINGS: NerdErrorMapping[] = [
  { pattern: /not a git repository/i, command: 'omg init' },
  { pattern: /no upstream branch/i, command: 'omg push -u origin <branch>' },
  { pattern: /merge conflict/i, command: 'omg merge --abort', context: 'or resolve conflicts manually' },
  { pattern: /rebase conflict/i, command: 'omg rebase --abort', context: 'or use --continue after resolving' },
  { pattern: /not fully merged/i, command: 'omg branch -D <branch>', context: 'force delete unmerged branch' },
  { pattern: /no remote/i, command: 'omg remote <url>' },
  { pattern: /uncommitted changes/i, command: 'omg -c "message"', context: 'stage and commit first' },
  { pattern: /local changes/i, command: 'omg stash', context: 'stash changes first' },
  { pattern: /no stash entries/i, command: 'omg stash', context: 'create a stash first' },
  { pattern: /already exists/i, command: 'omg doctor', context: 'check for issues' },
  { pattern: /detached HEAD/i, command: 'omg oops restore-branch' },
  { pattern: /conflict/i, command: 'omg doctor', context: 'resolve conflicts' },
  { pattern: /permission denied/i, command: 'omg doctor' },
  { pattern: /could not resolve host/i, command: 'omg doctor', context: 'check network/remote' },
];

let verboseMode = false;

export function setVerbose(verbose: boolean): void {
  verboseMode = verbose;
}

export function handleNerdError(err: unknown, context?: string): void {
  const rawMessage = formatError(err);

  // Find matching error pattern
  for (const mapping of ERROR_MAPPINGS) {
    if (mapping.pattern.test(rawMessage)) {
      const cmd = context ? mapping.command.replace('<branch>', context) : mapping.command;
      let output = `${chalk.magenta('(OMG)')} 🤓 Nerd Error hidden: Run ${chalk.cyan(cmd)} to solve it`;

      if (mapping.context) {
        output += chalk.dim(` (${mapping.context})`);
      }

      console.error(output);

      if (verboseMode) {
        console.error(chalk.dim('\nDetails:'));
        console.error(chalk.dim(rawMessage));
      }
      return;
    }
  }

  // Fallback for unmapped errors
  console.error(`${chalk.magenta('(OMG)')} 🤓 Nerd Error hidden: Run ${chalk.cyan('omg doctor')} to diagnose`);

  if (verboseMode) {
    console.error(chalk.dim('\nDetails:'));
    console.error(chalk.dim(rawMessage));
  }
}

export function formatError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
