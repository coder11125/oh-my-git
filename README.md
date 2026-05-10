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
omg -v <branch>
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

### Combine flags

Flags can be combined in a single invocation, e.g. commit then switch:

```bash
omg -c "wip: refactor" -v feature/new-thing
```

### Other

```bash
omg --help       # show help
omg --version    # show version (also -V)
```

### Update

Update omg to the latest version from npm:

```bash
omg update       # check for updates and install if newer version available
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