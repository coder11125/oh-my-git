import chalk from 'chalk';

export function validateNotFlag(value: string, label: string): void {
  if (value.startsWith('-')) {
    console.error(chalk.red(`Error: ${label} must not start with a dash ('${value}')`));
    process.exitCode = 1;
    throw new Error(`invalid ${label}`);
  }
}

/** Validate a config key does not contain scope-escalation flags. */
export function validateConfigKey(key: string): void {
  validateNotFlag(key, 'config key');
  const lower = key.toLowerCase();
  const forbidden = ['--global', '--system', '--local', '--file', '--blob'];
  for (const flag of forbidden) {
    if (lower.includes(flag)) {
      console.error(chalk.red(`Error: config key must not contain '${flag}'`));
      process.exitCode = 1;
      throw new Error('invalid config key');
    }
  }
}

// ---------------------------------------------------------------------------
