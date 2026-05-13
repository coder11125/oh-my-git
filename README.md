# Oh My Git (`omg`)

<div style="text-align: center;">
  <img width="700" height="400" alt="Oh-My-Git" src="https://github.com/user-attachments/assets/ec43e95c-538f-4d78-996b-2d4424942f03" />
</div>

---
> *Because git is powerful... and power corrupts absolutely.*

`omg` is a friendly CLI wrapper that translates git's cryptic error messages into human speak. Built with [commander](https://github.com/tj/commander.js), [simple-git](https://github.com/steveukx/git-js), [chalk](https://github.com/chalk/chalk), and [ora](https://github.com/sindresorhus/ora)

## Why omg?

Let's be honest: git is a time machine with a interface designed by someone who hates you. 

- `fatal: not possible to fast-forward, aborting` → *What?!*
- `error: Your local changes would be overwritten by merge` → *But I just wanted to...*
- `CONFLICT (content): Merge conflict in src/index.js` → *Why does this always happen on Friday?!*

`omg` wraps all that angst into simple, friendly commands. It won't make git less confusing, but at least you'll have a friendlier error message to laugh at while you cry.

## Install

Install globally from npm:

```bash
npm install -g @coder11125/omg
```

That exposes the `omg` binary on your `PATH`.

## Usage

### Commit

Stage all changes and commit in one step. Git makes this two commands because... reasons:

```bash
omg -c "message"
```

> 💡 Pro tip: If you forget the `-m` flag with regular git, you get thrown into Vim. `omg` won't do that to you. You're welcome.

### Checkout

Switch to an existing branch. Regular git uses `git checkout` which also restores files, detaches HEADs, and probably makes toast if you ask nicely. `omg` just switches branches:

```bash
omg --visit <branch>
```

### Status

Show a friendly summary of the current repository state. Unlike `git status`, which looks like a novel by Stephen King:

```bash
omg status
```

> No more reading 47 lines to figure out if you're on main or master. We just tell you.

### Branch management

Git branches are like multiverse theory: cool in concept, terrifying when you have 47 of them and no idea where you are.

```bash
omg branch                     # list all local branches (* marks current)
omg branch -n <name>           # create a new branch (stay on current)
omg branch -n <name> -s      # create and switch to it
omg branch -d <name>           # delete a branch (must be fully merged)
```

### Remote management

```bash
omg remote                     # list all remotes
omg remote <url>               # add a new remote named "origin"
omg remote <url> <name>        # add a new remote with a custom name
```

### Push

Share your code with the world (or your team, or just your future self wondering what you were thinking).

```bash
omg push                       # push to upstream
omg push <remote>              # push to specific remote
omg push -f                    # force push with lease (safer)
```

> ⚠️ `-f` is `--force-with-lease`, not nuclear `--force`. We're trying to prevent "git push origin main --force" horror stories.

### Pull

Download changes from remote. The `-r` flag uses rebase, which keeps history linear because merge commits are like littering in your git log:

```bash
omg pull                       # pull from upstream
omg pull <remote>              # pull from specific remote
omg pull -r                    # pull with rebase (cleaner history)
```

### Merge

Combine branches. Squash merging is like stuffing all your messy commits into one neat package so nobody knows how many times you "fixed the fix":

```bash
omg merge <branch>             # merge branch into current
omg merge <branch> --squash    # squash merge (hide the evidence)
omg merge --abort              # abort ongoing merge (panic button)
```

### Rebase

Rebasing: for when you want to rewrite history like a politician. "I definitely wrote this feature in one perfect commit."

```bash
omg rebase <branch>            # rebase current onto branch
omg rebase --continue          # continue after resolving conflicts
omg rebase --abort             # abort rebase (we've all been there)
```

### Stash

Stash: git's "hide your mess in the closet" feature. Your stashes will eventually become a time capsule of code you forgot existed.

```bash
omg stash                      # stash current changes (sweep under rug)
omg stash pop                  # pop most recent stash (hope you remember what's in there)
omg stash list                 # list all stashes (your abandoned children)
omg stash drop 0               # drop stash at index 0 (let go of the past)
omg stash apply 0              # apply stash but keep it ( commitment issues)
```

### Log

View commit history with pretty formatting. Finally, a log you can actually read without your eyes bleeding:

```bash
omg log                      # show last 10 commits
omg log -n 20                # show last 20 commits (journey into the past)
omg log --oneline            # condensed format (for the lazy)
omg log -n 5 --oneline       # last 5, one-line (just the highlights)
```

### Diff

Review changes before committing. Because "I don't know what I changed" is not a valid excuse at standup:

```bash
omg diff                     # show unstaged changes (the "oops" detector)
omg diff --staged            # show staged changes (what you're about to regret)
omg diff src/index.ts        # show changes for specific file
```

### Blame

Find out who broke that line of code. Perfect for passive-aggressive code reviews:

```bash
omg blame <file>             # show line-by-line authorship
omg blame <file> -L 42       # show blame for specific line only
omg blame <file> --stats     # show author statistics with heatmap
```

> 💡 Pro tip: Use `--stats` to see who really owns the file. Spoiler: it's probably you from 3 years ago wondering "what was I thinking?"

### Clone

Make a local copy of someone else's beautiful disaster:

```bash
omg clone <url>              # clone to default directory
omg clone <url> my-project     # clone to custom directory
```

### Ship

🚢 **It. Just. Works.** 

One command to rule them all: stage → commit → fetch → rebase → push. For when you're tired of typing the same 5 commands in a row.

```bash
omg ship "fix: handle null pointer"     # commit and ship
omg ship                                # just sync and push (trust the process)
omg ship -n                             # dry run - see what would happen
omg ship --no-rebase                    # use merge instead of rebase
```

Ship automatically:
- Stages uncommitted changes (even that console.log you forgot)
- Commits with your message (or judges you if you don't provide one)
- Fetches from remote (so you know if someone broke main)
- Rebases if you're behind (because merge bubbles are gross)
- Pushes to origin (send it!)
- Shows PR URL hint for GitHub remotes (you're welcome)

### Oops

We all make mistakes. Git makes recovering from them feel like solving a Rubik's cube blindfolded. `omg oops` is your "undo" button for life:

```bash
omg oops                      # show recovery menu (the panic room)
omg oops uncommit             # undo last commit, keep changes (take-backsies)
omg oops discard              # undo last commit, discard changes (nuclear option)
omg oops unstage              # unstage all staged files (stage fright)
omg oops unadd src/index.ts   # unstage specific file (partial regret)
omg oops restore-branch       # recover deleted branches (Lazarus mode)
```

### Sync

The "I just want to get back to main, pull, and go back to my branch without typing 47 commands" command:

```bash
omg sync                      # sync with main (full journey: stash → checkout → pull → prune → return → pop)
omg sync -b develop           # sync with a different base branch
```

Sync does the hokey pokey:
- Stashes your mess (so it's safe)
- Switches to main (the promised land)
- Pulls latest (catch up on gossip)
- Prunes dead branches (spring cleaning)
- Returns to your feature branch (back to reality)
- Restores your stashed mess (welcome home)

### Doctor

Git checkups: because prevention is better than "why is my repo on fire?!"

```bash
omg doctor                    # run health checks
omg doctor --fix              # auto-fix issues where safe
```

Doctor checks for:
- Uncommitted changes (your "I'll finish this later" pile)
- Staged but uncommitted files (the forgotten middle child)
- Branch behind/ahead status (are you lost?)
- No remote configured (coding into the void)
- Merge/rebase in progress (unfinished business)
- Detached HEAD state (you've gone full zombie)
- Binary files in commits (why is your .zip file 100MB?)
- Accumulating stashes (digital hoarding is still hoarding)

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

Self-improvement for your CLI:

```bash
omg update       # check for updates (be better than yesterday)
```

### Init

Start a new git repository. The first step on a long journey of merge conflicts:

```bash
omg init                    # initialize in current directory
omg init my-project         # initialize in new directory
omg init -m "Initial commit" # initialize with first commit
```

### Tag

Mark important moments in history. Like "v1.0.0" (aka "it barely works but marketing wants a release"):

```bash
omg tag                     # list all tags (milestones)
omg tag v1.0.0              # create lightweight tag
omg tag v1.0.0 -m "Release"  # create annotated tag (fancy!)
```

### Fetch

Check what your coworkers broke while you were sleeping:

```bash
omg fetch                   # fetch from all remotes (the gossip gatherer)
omg fetch origin            # fetch from specific remote
```

### Reset

Time travel with varying degrees of danger:

```bash
omg reset                   # unstage files (the "oops" fix)
omg reset --soft            # keep changes staged (gentle)
omg reset --hard            # discard all changes (point of no return ⚠️)
```

> ⚠️ `--hard` is called that for a reason. There's no undo button for this one.

### Revert

Undo a commit the *right* way (by making a new commit that undoes it). Unlike `reset`, this won't get you fired:

```bash
omg revert <commit>         # revert a commit (professional take-backsies)
omg revert --continue       # continue after resolving conflicts
```

### Cherry-pick

Steal a commit from another branch. It's not really stealing if it's version control:

```bash
omg cherry-pick <commit>    # apply commit from another branch (borrowed code)
omg cherry-pick --continue  # continue after resolving conflicts
```

### Config

Get or set git configuration:

```bash
omg config user.name         # get current value
omg config user.name "John"  # set value
```

### Social

See who's contributing to your repository (and who's doing all the work):

```bash
omg social                   # show contributor statistics
```

Shows:
- All contributors with commit counts and percentages
- "Most helpful human" award for top contributor
- Humorous commentary about collaboration patterns

> 💡 Perfect for passive-aggressive code reviews or just satisfying your curiosity about who actually owns the codebase.

### Spinner quips

While `omg` waits on git, loading spinners pick a **random one-liner** from a category that matches what you are doing (push, stash, ship, doctor, and so on). The silly bit is followed by a dim **`·`** and the **real task** so you still know what is happening:

```bash
$ omg status
⠋ Taking emotional inventory · Analyzing repository status
```

Quips live in [`src/quips.ts`](src/quips.ts) if you want to add your own trauma.

### Verbose Mode (For the Curious)

By default, `omg` speaks human. When git throws a tantrum, we translate:

```bash
$ omg push
✖ Push failed
(OMG) 🤓 Nerd Error hidden: Run omg push -u origin main to solve it
```

But maybe you're a purist and want to see the raw git error. We support that too:

```bash
$ omg push --verbose
✖ Push failed
(OMG) 🤓 Nerd Error hidden: Run omg push -u origin main to solve it

Details:
fatal: The current branch main has no upstream branch.
To push the current branch and set the remote as upstream, use
    git push --set-upstream origin main

To have this happen automatically for branches without a tracking
upstream, see 'push.autoSetupRemote' in 'git help config'.
```

Use `--verbose` when you want to see git's full essay:

```bash
omg status --verbose        # show detailed error output
omg push --verbose          # show full git error messages
omg --verbose -c "message"  # combine with other commands
```

> 🤓 Fun fact: Git error messages were originally written to fit on punch cards. That's why they're so... concise.

## Development

```bash
npm install
npm run build            # compile TypeScript -> dist/
npm run typecheck        # type-check without emitting

# try the CLI locally without publishing
npm link
omg --help
```

### Source layout

The published binary still points at `dist/index.js`, but the source is split by responsibility so new commands do not have to live in one giant entrypoint:

```text
src/index.ts              # tiny executable entrypoint
src/cli.ts                # commander setup, options, and command registration
src/git.ts                # shared simple-git instance
src/version.ts            # package version loader
src/errors.ts             # friendly error mapping and verbose-mode handling
src/validation.ts         # shared argument/config validation
src/quips.ts              # spinner one-liners
src/commands/*.ts         # command implementations grouped by domain
```

Command modules are grouped by behavior:

```text
branch.ts       branch list/create/delete
remote.ts       remote list/add
worktree.ts     checkout, commit, status, log, diff, clone, init, fetch, reset, config
history.ts      merge, rebase, revert, cherry-pick, tag, blame
stash.ts        stash save/pop/list/drop/apply
automation.ts   update, ship, sync, doctor
recovery.ts     oops recovery helpers
social.ts       contributor stats
```

When adding a command, wire the commander definition in `src/cli.ts`, put the command body in the closest `src/commands/` module, and use NodeNext-style relative imports with `.js` extensions.

---

## Philosophy

> "Git is a tool that lets you confidently delete code on Monday, regret it on Tuesday, and find it again on Wednesday. `omg` just makes the emotional rollercoaster more bearable."

Remember: `omg` won't make you a better developer. But it might make you a happier one. And isn't that what really matters?

**Pro tip:** If you ever feel overwhelmed by git, just remember: Linus Torvalds created git in 2005 because existing tools weren't painful enough. You're not the problem. Git is the problem. `omg` is [...]
