import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFileSync, readFileSync, rmSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { git } from '../git.js';
import { handleNerdError, formatError } from '../errors.js';
import { sanitizeForTerminal } from '../output.js';
import { quipSpinnerText } from '../quips.js';

const execAsync = promisify(exec);

interface PROptions {
  title?: string;
  body?: string;
  web?: boolean;
  base?: string;
}

/**
 * Detect the appropriate text editor command for the current platform.
 */
function getEditorCommand(): string {
  const platform = process.platform;
  
  if (platform === 'darwin') {
    // macOS: Use TextEdit (blocks until closed)
    return 'open -a TextEdit -W';
  } else if (platform === 'linux') {
    // Linux: Try environment variable, then VS Code, then nano
    const editor = process.env.EDITOR || process.env.VISUAL;
    if (editor) {
      // If editor is code, add --wait to block
      if (editor.includes('code')) {
        return `${editor} --wait`;
      }
      return editor;
    }
    // Fallback to VS Code if available, then nano
    return 'code --wait 2>/dev/null || nano';
  } else if (platform === 'win32') {
    // Windows: Use notepad
    return 'notepad';
  }
  
  // Fallback for other platforms
  return 'vi';
}

/**
 * Create a markdown template for the PR description.
 */
function createPRTemplate(branch: string, baseBranch: string): string {
  return `# PR Title (one line, descriptive)

## Description
What does this PR do? Why is it needed?

## Changes
- Bullet point 1
- Bullet point 2

## Testing
How did you test this?

## Checklist
- [ ] Tests pass
- [ ] Documentation updated
- [ ] No breaking changes

---
Branch: \`${branch}\` → \`${baseBranch}\`
`;
}

/**
 * Open a text editor with the given content and wait for the user to close it.
 * Returns the edited content.
 */
async function openEditorWithTemplate(template: string): Promise<string> {
  // Create temp directory and file
  const tempDir = mkdtempSync(join(tmpdir(), 'omg-pr-'));
  const tempFile = join(tempDir, 'PR.md');
  
  try {
    // Write template to file
    writeFileSync(tempFile, template, 'utf-8');
    
    // Open editor and wait for it to close
    const editorCmd = getEditorCommand();
    const spinner = ora(quipSpinnerText('pr_edit', 'Waiting for editor to close')).start();
    
    try {
      await execAsync(`${editorCmd} "${tempFile}"`);
      spinner.stop();
    } catch (editorErr) {
      spinner.fail(chalk.red('Failed to open editor'));
      handleNerdError(editorErr);
      throw editorErr;
    }
    
    // Read the edited content back
    const content = readFileSync(tempFile, 'utf-8');
    
    return content;
  } finally {
    // Clean up temp directory
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch (cleanupErr) {
      // Log but don't fail on cleanup errors
      console.warn(chalk.dim('Warning: Could not clean up temp directory'));
    }
  }
}

/**
 * Parse markdown content to extract title and body.
 * Title is the first line after removing the # prefix.
 * Body is everything after the first line.
 */
function parseMarkdown(content: string): { title: string; body: string } {
  const lines = content.split('\n');
  
  // Find the first non-empty line that looks like a heading
  let title = 'Untitled PR';
  let bodyStartIndex = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (line) {
      // Remove # prefix if present
      const cleanLine = line.replace(/^#+\s*/, '').trim();
      if (cleanLine) {
        title = cleanLine;
        bodyStartIndex = i + 1;
        break;
      }
    }
  }
  
  // Body is everything after the title line
  const body = lines.slice(bodyStartIndex).join('\n').trim();
  
  return { title, body };
}

/**
 * Get the GitHub repository URL from git remotes.
 */
async function getGitHubRemote(): Promise<string | null> {
  try {
    const remotes = await git.getRemotes(true);
    
    for (const remote of remotes) {
      const url = remote.refs.fetch || remote.refs.push;
      if (url && url.includes('github.com')) {
        // Convert git@github.com:owner/repo.git to https://github.com/owner/repo
        const httpsUrl = url
          .replace(/^git@github\.com:/, 'https://github.com/')
          .replace(/\.git$/, '');
        return httpsUrl;
      }
      if (url && url.includes('github.com')) {
        return url.replace(/\.git$/, '');
      }
    }
    
    return null;
  } catch (err) {
    return null;
  }
}

/**
 * Check if GitHub CLI (gh) is available.
 */
async function hasGitHubCLI(): Promise<boolean> {
  try {
    await execAsync('gh --version');
    return true;
  } catch {
    return false;
  }
}

/**
 * Create a pull request using GitHub CLI.
 */
async function createPRWithCLI(
  title: string,
  body: string,
  branch: string,
  baseBranch: string,
): Promise<void> {
  const spinner = ora(quipSpinnerText('pr_create', 'Creating pull request')).start();
  
  try {
    // Escape the body for shell
    const escapedBody = body.replace(/'/g, "'\\''");
    const escapedTitle = title.replace(/'/g, "'\\''");
    
    const command = `gh pr create --title '${escapedTitle}' --body '${escapedBody}' --base ${baseBranch}`;
    
    await execAsync(command);
    spinner.succeed(chalk.green('Pull request created successfully!'));
  } catch (err) {
    spinner.fail(chalk.red('Failed to create pull request with GitHub CLI'));
    handleNerdError(err);
    throw err;
  }
}

/**
 * Open the browser to create a PR manually.
 */
async function openBrowserForPR(
  title: string,
  body: string,
  branch: string,
  baseBranch: string,
): Promise<void> {
  const remote = await getGitHubRemote();
  
  if (!remote) {
    console.error(chalk.red('No GitHub remote found. Cannot open browser.'));
    console.error(chalk.yellow('Please add a GitHub remote or install GitHub CLI (gh).'));
    process.exitCode = 1;
    return;
  }
  
  const spinner = ora(quipSpinnerText('pr_browser', 'Opening browser')).start();
  
  try {
    // Construct the GitHub compare URL with pre-filled title and body
    const encodedTitle = encodeURIComponent(title);
    const encodedBody = encodeURIComponent(body);
    const url = `${remote}/compare/${baseBranch}...${branch}?expand=1&title=${encodedTitle}&body=${encodedBody}`;
    
    if (process.platform === 'darwin') {
      await execAsync(`open "${url}"`);
    } else if (process.platform === 'linux') {
      await execAsync(`xdg-open "${url}"`);
    } else if (process.platform === 'win32') {
      await execAsync(`start "" "${url}"`);
    } else {
      await execAsync(`open "${url}"`);
    }
    
    spinner.succeed(chalk.green('Opened browser to create PR'));
    console.log(chalk.dim(`\nURL: ${url}`));
  } catch (err) {
    spinner.fail(chalk.red('Failed to open browser'));
    handleNerdError(err);
    throw err;
  }
}

/**
 * Main function to create a pull request.
 */
export async function createPR(options: PROptions): Promise<void> {
  console.log(chalk.bold('\n🚀  Creating Pull Request\n'));
  
  // Get current branch
  const statusSpinner = ora(quipSpinnerText('pr_status', 'Checking repository status')).start();
  let status: Awaited<ReturnType<typeof git.status>>;
  
  try {
    status = await git.status();
    statusSpinner.stop();
  } catch (err) {
    statusSpinner.fail(chalk.red('Failed to get repository status'));
    handleNerdError(err);
    process.exitCode = 1;
    return;
  }
  
  const branch = status.current;
  
  if (!branch || branch === 'HEAD') {
    console.error(chalk.red('Error: Not on a branch. Cannot create PR from detached HEAD state.'));
    console.error(chalk.yellow('Switch to a branch first using: omg checkout <branch>'));
    process.exitCode = 1;
    return;
  }
  
  if (branch === 'main' || branch === 'master') {
    console.error(chalk.red('Error: Cannot create PR from main/master branch.'));
    console.error(chalk.yellow('Switch to a feature branch first.'));
    process.exitCode = 1;
    return;
  }
  
  // Determine base branch
  const baseBranch = options.base || 'main';
  
  // Check if branch has uncommitted changes
  if (status.files.length > 0) {
    console.warn(chalk.yellow('Warning: You have uncommitted changes.'));
    console.warn(chalk.yellow('Consider committing them first with: omg -c "message"'));
    console.log('');
  }
  
  let title = options.title;
  let body = options.body;
  
  // If title or body not provided, open editor
  if (!title || !body) {
    if (options.web) {
      console.error(chalk.red('Error: --web requires both --title and --body'));
      console.error(chalk.yellow('Or run without flags to open the editor'));
      process.exitCode = 1;
      return;
    }
    
    const template = createPRTemplate(branch, baseBranch);
    console.log(chalk.dim('Opening editor to write PR description...'));
    console.log(chalk.dim('(Save and close the editor when done)'));
    console.log('');
    
    try {
      const editedContent = await openEditorWithTemplate(template);
      const parsed = parseMarkdown(editedContent);
      title = title || parsed.title;
      body = body || parsed.body;
    } catch (err) {
      console.error(chalk.red('Failed to get PR description from editor'));
      handleNerdError(err);
      process.exitCode = 1;
      return;
    }
  }
  
  // Validate title
  if (!title || title.trim() === '' || title === 'PR Title (one line, descriptive)') {
    console.error(chalk.red('Error: PR title cannot be empty'));
    process.exitCode = 1;
    return;
  }
  
  console.log(chalk.bold('\n--- PR Preview ---\n'));
  console.log(chalk.cyan(`Title: ${sanitizeForTerminal(title)}`));
  console.log(chalk.dim(`Branch: ${branch} → ${baseBranch}`));
  if (body) {
    console.log(chalk.dim(`\nBody:\n${sanitizeForTerminal(body.substring(0, 200))}${body.length > 200 ? '...' : ''}`));
  }
  console.log('');
  
  // Try GitHub CLI first, unless --web flag is set
  if (!options.web && await hasGitHubCLI()) {
    try {
      await createPRWithCLI(title, body, branch, baseBranch);
      return;
    } catch (err) {
      console.warn(chalk.yellow('GitHub CLI failed, falling back to browser...'));
    }
  }
  
  // Fallback to browser
  await openBrowserForPR(title, body, branch, baseBranch);
}
