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

```bash
omg -v <branch>        # git checkout <branch>
omg -c "message"       # git add . && git commit -m "message"
omg --help             # show help
omg --version          # show version (also -V)
```

You can combine flags in a single invocation, e.g. commit then switch branches:

```bash
omg -c "wip: refactor" -v feature/new-thing
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

The package is published as the scoped name `@coder11125/omg`. `publishConfig.access`
is set to `public` in `package.json` so scoped packages publish without `--access public`.
