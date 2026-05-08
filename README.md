# Oh My Git (`omg`)

A small, friendly TypeScript CLI wrapper around common git tasks. Built with
[commander](https://github.com/tj/commander.js),
[simple-git](https://github.com/steveukx/git-js),
[chalk](https://github.com/chalk/chalk), and
[ora](https://github.com/sindresorhus/ora).

## Install

Once published to npm, install globally with:

```bash
npm install -g omg
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

## Publishing

```bash
npm login
npm publish --access public
```

> Note: the package name `omg` may already be taken on the public npm
> registry. If it is, change `name` in `package.json` to a scoped name
> (e.g. `@your-org/omg`) and republish. The `bin` alias will still be `omg`.
