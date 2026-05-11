# Oh My Git (`omg`)

A small, friendly TypeScript CLI wrapper around common git tasks. Built with
[commander](https://github.com/tj/commander.js),
[simple-git](https://github.com/steveukx/git-js),
[chalk](https://github.com/chalk/chalk), and
[ora](https://github.com/sindresorhus/ora).

## Install

Install globally from npm:

```bash
npm install -g @coder11125/omg
```

That exposes the `omg` binary on your `PATH`.

## Usage

### Commit

Stage all changes and commit in one step:

```bash
omg -c "message"
```

### Checkout

Switch to an existing branch:

```bash
omg --visit <branch>
```

### Status

Show a friendly summary of the current repository state:

```bash
omg status
```

### Branch management

```bash
omg branch                     # list all local branches (* marks current)
omg branch -n <name>           # create a new branch (stay on current)
omg branch -n <name> -s        # create a new branch and switch to it
omg branch -d <name>           # delete a branch (must be fully merged)
```

### Remote management

```bash
omg remote                     # list all remotes
omg remote <url>               # add a new remote named "origin"
omg remote <url> <name>        # add a new remote with a custom name
```

### Push

```bash
omg push                       # push to upstream
omg push <remote>              # push to specific remote
omg push -f                    # force push with lease (safer)
```

### Pull

```bash
omg pull                       # pull from upstream
omg pull <remote>              # pull from specific remote
omg pull -r                    # pull with rebase
```

### Merge

```bash
omg merge <branch>             # merge branch into current
omg merge <branch> --squash    # squash merge
omg merge --abort              # abort ongoing merge
```

### Rebase

```bash
omg rebase <branch>            # rebase current onto branch
omg rebase --continue          # continue after resolving conflicts
omg rebase --abort             # abort rebase
```

### Stash

```bash
omg stash                      # stash current changes
omg stash pop                  # pop most recent stash
omg stash list                 # list all stashes
omg stash drop 0               # drop stash at index 0
omg stash apply 0              # apply stash at index 0 (keep in stash)
```

### Log

View commit history with pretty formatting:

```bash
omg log                      # show last 10 commits
omg log -n 20                # show last 20 commits
omg log --oneline            # condensed one-line format
omg log -n 5 --oneline       # combined: last 5, one-line
```

### Diff

Review changes before committing:

```bash
omg diff                     # show unstaged changes
omg diff --staged            # show staged changes
omg diff src/index.ts        # show changes for specific file
```

### Clone

Clone a repository:

```bash
omg clone <url>              # clone to default directory
omg clone <url> my-project     # clone to custom directory
```

### Ship

Smart workflow: stage, commit, sync, and push safely in one command:

```bash
omg ship "fix: handle null pointer"     # commit and ship
omg ship                                # just sync and push
omg ship -n                             # dry run - preview what would happen
omg ship --no-rebase                    # use merge instead of rebase
```

Ship automatically:
- Stages uncommitted changes
- Commits with your message (if provided)
- Fetches from remote to check sync status
- Rebases if you're behind (no merge commits!)
- Pushes to origin
- Shows PR URL hint for GitHub remotes

### Oops

Interactive recovery for common git mistakes:

```bash
omg oops                      # show recovery menu
omg oops uncommit             # undo last commit, keep changes
omg oops discard              # undo last commit, discard changes
omg oops unstage              # unstage all staged files
omg oops unadd src/index.ts   # unstage specific file
omg oops restore-branch       # list deleted branches to recover
```

### Sync

Refresh your workspace in one command:

```bash
omg sync                      # sync with main (stash → checkout main → pull → prune → return → pop)
omg sync -b develop           # sync with a different base branch
```

Sync automatically:
- Stashes any uncommitted changes
- Switches to main (or your base branch)
- Pulls latest with rebase
- Prunes stale remote branches
- Returns to your feature branch
- Restores your stashed changes

### Doctor

Check repository health and catch issues early:

```bash
omg doctor                    # run health checks
omg doctor --fix              # auto-fix issues where safe
```

Doctor checks for:
- Uncommitted changes
- Staged but uncommitted files
- Branch behind/ahead status
- No remote configured
- Merge/rebase in progress
- Detached HEAD state
- Binary files in commits
- Accumulating stashes

### Combine flags

Flags can be combined in a single invocation, e.g. commit then switch:

```bash
omg -c "wip: refactor" --visit feature/new-thing
```

### Other

```bash
omg --help        # show help
omg --version     # show version (also -V)
omg --verbose     # show detailed error output (show nerd errors)
```

### Update

Update omg to the latest version from npm:

```bash
omg update       # check for updates and install if newer version available
```

### Init

Initialize a new git repository:

```bash
omg init                    # initialize in current directory
omg init my-project         # initialize in new directory
omg init -m "Initial commit" # initialize with first commit
```

### Tag

Create and list tags:

```bash
omg tag                     # list all tags
omg tag v1.0.0              # create lightweight tag
omg tag v1.0.0 -m "Release"  # create annotated tag
```

### Fetch

Download objects and refs from remote:

```bash
omg fetch                   # fetch from all remotes
omg fetch origin            # fetch from specific remote
```

### Reset

Reset current HEAD to specified state:

```bash
omg reset                   # unstage files (mixed)
omg reset --soft            # keep changes staged
omg reset --hard            # discard all changes (dangerous!)
```

### Revert

Safely undo a commit by creating a new commit that reverses the changes:

```bash
omg revert <commit>         # revert a commit (creates new undo commit)
omg revert --continue       # continue after resolving conflicts
```

### Cherry-pick

Apply a commit from another branch:

```bash
omg cherry-pick <commit>    # apply commit from another branch
omg cherry-pick --continue  # continue after resolving conflicts
```

### Config

Get or set git configuration:

```bash
omg config user.name         # get current value
omg config user.name "John"  # set value
```

### Verbose Mode

By default, `omg` hides technical git errors and shows friendly "Nerd Error" messages with suggestions on how to fix the issue:

```bash
omg push                    # if error: "(OMG) 🤓 Nerd Error hidden: Run omg push -u origin main to solve it"
```

Use `--verbose` to see the full technical error details:

```bash
omg status --verbose        # show detailed error output
omg push --verbose          # show full git error messages
omg --verbose -c "message"  # combine with other commands
```

## Development

```bash
npm install
npm run build            # compile TypeScript -> dist/
npm run typecheck        # type-check without emitting

# try the CLI locally without publishing
npm link
omg --help
```