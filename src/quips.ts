import chalk from 'chalk';

/**
 * Spinner loading-line categories. Each maps to short one-liners (README tone).
 */
export type QuipCategory =
  | 'blame'
  | 'branch_create'
  | 'branch_delete'
  | 'branch_list'
  | 'cherry_pick'
  | 'cherry_pick_continue'
  | 'clone'
  | 'commit_stage'
  | 'commit_write'
  | 'config_set'
  | 'diff'
  | 'doctor_analyze'
  | 'doctor_fix'
  | 'fetch'
  | 'init'
  | 'init_commit'
  | 'log'
  | 'merge'
  | 'merge_abort'
  | 'oops_restore_branch'
  | 'oops_uncommit'
  | 'oops_unstage_all'
  | 'oops_unstage_file'
  | 'pull'
  | 'push'
  | 'rebase'
  | 'rebase_abort'
  | 'rebase_continue'
  | 'remote_add'
  | 'remote_list'
  | 'reset'
  | 'revert'
  | 'revert_continue'
  | 'ship_analyze'
  | 'ship_commit'
  | 'ship_fetch'
  | 'ship_merge'
  | 'ship_push'
  | 'ship_rebase'
  | 'ship_stage'
  | 'social'
  | 'whois'
  | 'stash'
  | 'stash_apply'
  | 'stash_drop'
  | 'stash_list'
  | 'stash_pop'
  | 'status'
  | 'sync_check'
  | 'sync_checkout_base'
  | 'sync_pop'
  | 'sync_prune'
  | 'sync_pull'
  | 'sync_return'
  | 'sync_stash'
  | 'tag_create'
  | 'tag_list'
  | 'update_check'
  | 'update_run'
  | 'visualize'
  | 'checkout'
  | 'pr_status'
  | 'pr_edit'
  | 'pr_create'
  | 'pr_browser';

const QUIPS: Record<QuipCategory, readonly string[]> = {
  checkout: [
    'Slipping into another timeline',
    'Convincing HEAD to travel',
    'Switching universes (same keyboard)',
    'Hot-swapping your branch soul',
    'Teaching checkout which branch matters',
  ],
  commit_stage: [
    'Sweeping files onto the stage',
    'Herding cats into the index',
    'Staging like it is opening night',
    'Adding everything before judgment day',
    'Convincing git this batch is intentional',
  ],
  commit_write: [
    'Carving your message in stone',
    'Writing history you might regret',
    'Freezing this moment in amber',
    'Committing while emotionally available',
    'Sealing the deal with SHA sauce',
  ],
  branch_list: [
    'Surveying your multiverse garage',
    'Counting parallel realities',
    'Naming every universe you spawned',
    'Taking attendance for branches',
    'Finding which timeline you are on',
  ],
  branch_create: [
    'Forking the timeline',
    'Spinning up a fresh universe',
    'Growing another parallel reality',
    'Minting a new branch badge',
    'Planting a branch flag',
  ],
  branch_delete: [
    'Pruning alternate timelines',
    'Closing a universe branch',
    'Snipping merged baggage',
    'Retiring a branch with dignity',
    'Making that branch somebody else problem',
  ],
  remote_list: [
    'Reading your gossip sources',
    'Listing pen pals for your repo',
    'Checking who you trusted with fetch',
    'Cataloging remote awkwardness',
    'Surveying the rumor mill',
  ],
  remote_add: [
    'Introducing your repo to someone new',
    'Making fetch socially acceptable',
    'Adding a pen pal for pushes',
    'Registering another gossip endpoint',
    'Expanding your remote friend circle',
  ],
  status: [
    'Reading the tea leaves',
    'Asking git how mad it is',
    'Checking your dirty laundry',
    'Surveying the wreckage',
    'Taking emotional inventory',
  ],
  push: [
    'Sending your hopes upstream',
    'Launching bits into the void',
    'Teaching the remote about today',
    'Air-dropping your commits',
    'Shipping dreams (and diffs)',
  ],
  pull: [
    'Downloading other peoples drama',
    'Syncing with collective chaos',
    'Pulling gossip from upstream',
    'Importing surprises',
    'Fetching reality latest patch',
  ],
  merge: [
    'Universe collision in progress',
    'Blending timelines carefully',
    'Merging like a polite blender',
    'Asking two histories to shake hands',
    'Combining parallel regrets',
  ],
  merge_abort: [
    'Aborting the blender mid-smoothie',
    'Noping out of merge theater',
    'Putting the timeline back in the box',
    'Emergency merge eject',
    'Undoing the universe mash-up',
  ],
  rebase: [
    'Rewriting history like a politician',
    'Stacking commits like pancakes',
    'Replaying your life choices',
    'Linearizing your spaghetti',
    'Making history prettier than it was',
  ],
  rebase_continue: [
    'Finishing the rewrite arc',
    'Continuing the rebase saga',
    'Un-pausing your history edit',
    'Marching onward after conflict therapy',
    'Closing the rebase chapter',
  ],
  rebase_abort: [
    'Throwing the rewrite draft away',
    'Aborting the history rewrite',
    'Restoring the timeline you tried to fix',
    'CTRL-Z for rebase dreams',
    'Retreating from rebase mountain',
  ],
  log: [
    'Spelunking the commit cave',
    'Reading ancient scrolls (commits)',
    'Auditing your past selves',
    'Paging through regret archives',
    'Visiting the museum of mistakes',
  ],
  diff: [
    'Microscope on your changes',
    'Diffing like it is personal',
    'Showing what you actually touched',
    'Exposing the truth of your edits',
    'Side-by-side with your chaos',
  ],
  clone: [
    'Cloning someones beautiful disaster',
    'Photocopying a whole universe',
    'Duplicating drama locally',
    'Making a local twin',
    'Importing the treasure heap',
  ],
  stash: [
    'Shoving mess under the rug',
    'Emergency drawer for code',
    'Stashing like a squirrel',
    'Pocket dimension for WIP',
    'Hide-and-seek champion mode',
  ],
  stash_pop: [
    'Releasing the kraken from stash',
    'Unpacking your past decisions',
    'Popping the stash piñata',
    'Welcome back forgotten chaos',
    'Retrieving your closet skeleton',
  ],
  stash_list: [
    'Reading your stash hoard',
    'Inventory of abandoned ideas',
    'Cataloging digital clutter',
    'Stack of unfinished business',
    'Archaeology of WIP layers',
  ],
  stash_drop: [
    'Yeeting a stash entry',
    'Letting go of that timeline',
    'Deleting a pocket universe',
    'Therapy for stash hoarders',
    'Banishing a stash ghost',
  ],
  stash_apply: [
    'Borrowing from past you',
    'Applying stash without commitment',
    'Trying on old clothes (commits)',
    'Ghost code visitation',
    'Previewing stored chaos',
  ],
  update_run: [
    'Upgrading your CLI buddy',
    'Teaching omg new tricks',
    'Downloading fresher opinions',
    'Self-improvement arc',
    'Patching the friendly wrapper',
  ],
  update_check: [
    'Peeking at npm for gossip',
    'Checking if you are behind the times',
    'Asking the registry for updates',
    'Version FOMO scan',
    'Seeing if a new omg dropped',
  ],
  init: [
    'Starting a new regret repository',
    'Planting a fresh .git seed',
    'Beginning your timeline here',
    'Initializing destiny folder',
    'Summoning version control',
  ],
  init_commit: [
    'First blood on the empty tree',
    'Breaking ground on main',
    'Seeding history with hope',
    'Opening commit number one',
    'Birth certificate for your repo',
  ],
  tag_create: [
    'Pinning a milestone ribbon',
    'Slapping a label on history',
    'Bookmarking this feeling',
    'Freezing a version for marketing',
    'Tag-youre-it on a commit',
  ],
  tag_list: [
    'Reading milestone stickers',
    'Cataloging release nostalgia',
    'Listing your victory lap labels',
    'Parade of past versions',
    'Sticker album of releases',
  ],
  fetch: [
    'Gathering remote gossip',
    'Downloading drama previews',
    'Syncing rumor mill',
    'Fetching without merging panic',
    'Window shopping upstream changes',
  ],
  reset: [
    'Spinning the time dial',
    'Rewinding with consequences',
    'Adjusting reality sliders',
    'Undo lever engaged',
    'Playing timeline roulette',
  ],
  revert: [
    'Professionally undoing a decision',
    'Making a new mistake to fix an old one',
    'Reverse gear with paperwork',
    'Undo button for grown-ups',
    'Politician-style rollback',
  ],
  revert_continue: [
    'Continuing the revert saga',
    'Finishing the polite undo',
    'Marching through revert conflicts',
    'Closing the revert ticket',
    'Almost done rewinding',
  ],
  cherry_pick: [
    'Stealing one cherry commit',
    'Borrowing glory from another branch',
    'Single-commit heist',
    'Plucking the juiciest SHA',
    'Surgical commit transplant',
  ],
  cherry_pick_continue: [
    'Continuing the cherry heist',
    'Finishing the pick operation',
    'After conflict cherry polish',
    'Completing the steal',
    'Landing the cherry safely',
  ],
  ship_analyze: [
    'Preflight before sending it',
    'Reading the shipping manifest',
    'Checking if main survived lunch',
    'Auditing before blast-off',
    'Scanning repo courage levels',
  ],
  ship_commit: [
    'Staging for the voyage',
    'Committing before launch',
    'Packaging cargo for upstream',
    'Sealing crates with messages',
    'Git add plus destiny',
  ],
  ship_stage: [
    'Staging without poetry',
    'Adding files for departure',
    'Gathering loose ends',
    'Herding files toward push',
    'Staging deck for shipping',
  ],
  ship_fetch: [
    'Fetching port authority updates',
    'Checking harbor gossip',
    'Downloading tide charts',
    'Seeing what dock changed',
    'Harbor radar sweep',
  ],
  ship_rebase: [
    'Straightening the shipping lane',
    'Rebasing before harbor merge',
    'Stacking crates neatly',
    'Linearizing your voyage',
    'Making history cruise-ready',
  ],
  ship_merge: [
    'Merging harbor traffic',
    'Combining shipping lanes',
    'Union of timelines at dock',
    'Blending cargo manifests',
    'Merge tide incoming',
  ],
  ship_push: [
    'Firing commits at origin',
    'Launching to remote shores',
    'Push day best day',
    'Sending it (safely)',
    'Upstream delivery service',
  ],
  oops_uncommit: [
    'Rewinding last conviction',
    'Softening recent history',
    'Take-backsies protocol',
    'Undoing the last seal',
    'Apologizing to HEAD',
  ],
  oops_unstage_all: [
    'Unstaging the whole pile',
    'Removing spotlight from files',
    'Stage fright cure',
    'Clearing the index runway',
    'All files step off stage',
  ],
  oops_unstage_file: [
    'Unstaging one shy file',
    'Letting a file leave the stage',
    'Spotlight off this path',
    'Single-file stage exit',
    'Partial stage retreat',
  ],
  oops_restore_branch: [
    'Raising branches from reflog',
    'Lazarus mode for branches',
    'Resurrecting deleted timelines',
    'Git necromancy (safe edition)',
    'Finding yesterday branches',
  ],
  sync_check: [
    'Scanning before the hokey pokey',
    'Sync reconnaissance',
    'Checking if reality matches dream',
    'Preflight for branch tourism',
    'Reading lay of the land',
  ],
  sync_stash: [
    'Stashing before vacation on main',
    'Pocketing WIP for safekeeping',
    'Tucking chaos in the stash',
    'Briefcase for your dirty work',
    'Hold my beer (stash)',
  ],
  sync_checkout_base: [
    'Visiting the promised branch',
    'Tourist mode on base branch',
    'Brief layover on main street',
    'Switching hats to pull',
    'Teleporter to civilization',
  ],
  sync_return: [
    'Returning to feature cave',
    'Back to your parallel universe',
    'Resuming your branch saga',
    'Teleport home',
    'Ending branch tourism',
  ],
  sync_pop: [
    'Unpacking after vacation',
    'Welcome home stash surprise',
    'Restoring your mess faithfully',
    'Pop goes the productivity',
    'Releasing held chaos',
  ],
  sync_pull: [
    'Downloading fresh civilization',
    'Syncing with reality upstream',
    'Pulling the good stuff',
    'Updating base camp',
    'Fetching progress others made',
  ],
  sync_prune: [
    'Spring cleaning remote branches',
    'Pruning dead remote twigs',
    'Deleting ghosts from tracking',
    'Repo Marie Kondo moment',
    'Removing stale rumor branches',
  ],
  doctor_analyze: [
    'Stethoscope on your repo',
    'Checking git pulse',
    'House call for your commits',
    'Reading repo vitals',
    'Triaging developer trauma',
  ],
  doctor_fix: [
    'Applying bedside manner patches',
    'Waving smaller rubber chicken',
    'Gentle autocorrect for repos',
    'Spraying WD-40 on git',
    'Hope-and-pray auto-fix pass',
  ],
  config_set: [
    'Twiddling git knobs',
    'Writing identity on disk',
    'Adjusting your git personality',
    'Setting switches responsibly',
    'Config wizard busywork',
  ],
  social: [
    'Ranking humans by commit count',
    'Spotlight on blame harvest',
    'Quantifying collaboration vibes',
    'Who carried the team',
    'Passive-aggressive leaderboard prep',
  ],
  whois: [
    'Digging up someone commit trail',
    'Stalking git history (professionally)',
    'Tracking down a digital footprint',
    'Who left all these commits lying around',
    'Investigating suspect SHA patterns',
  ],
  blame: [
    'Finding who to send flowers',
    'Archaeology of blame',
    'Heatmap of regret lines',
    'Who touched it last',
    'Assigning credit and blame',
  ],
  visualize: [
    'Painting the multiverse tree',
    'Rendering the spaghetti of time',
    'Drawing branch geometry',
    'Visualizing your parallel regrets',
    'Mapping the chaos graph',
  ],
  pr_status: [
    'Checking if you are PR-ready',
    'Reading your branch resume',
    'Scanning for merge-worthy material',
    'Evaluating your pull potential',
    'Checking PR prerequisites',
  ],
  pr_edit: [
    'Opening your canvas for greatness',
    'Launching the description studio',
    'Preparing your PR manifesto',
    'Opening editor for storytelling time',
    'Summoning the markdown muse',
  ],
  pr_create: [
    'Sending your work to the judges',
    'Launching your contribution',
    'Submitting for peer review',
    'Opening the merge request floodgates',
    'Pushing your code into the spotlight',
  ],
  pr_browser: [
    'Summoning the browser',
    'Opening the PR portal',
    'Launching the web interface',
    'Opening GitHub in a new tab',
    'Preparing for browser-based PR',
  ],
};

/** Uniform random line from the pool, or fallback when pool missing/empty. */
export function pickQuip(category: QuipCategory, fallback: string): string {
  const pool = QUIPS[category];
  if (!pool?.length) return fallback;
  return pool[Math.floor(Math.random() * pool.length)]!;
}

/** Random quip plus factual spinner detail (README-style combo). */
export function quipSpinnerText(category: QuipCategory, factualLine: string): string {
  const pool = QUIPS[category];
  if (!pool?.length) return factualLine;
  const quip = pool[Math.floor(Math.random() * pool.length)]!;
  return `${quip} ${chalk.dim('·')} ${factualLine}`;
}
