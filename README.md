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

## Development

```bash
npm install
npm run build            # compile TypeScript -> dist/
npm run typecheck        # type-check without emitting

# try the CLI locally without publishing
npm link
omg --help
```