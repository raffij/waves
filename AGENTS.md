# Repository notes

## Open PRs ready for review, not as drafts

Create pull requests in this repo ready for review, not as drafts. This
overrides the default draft-PR behavior for this project specifically.

## Check PR merge status before pushing more commits to a branch

Before pushing additional commits to a branch that already has an open PR,
check whether that PR has merged. A merged PR is finished: commits pushed
to its branch afterward don't land in anything and won't get reviewed —
easy to miss mid-session when new follow-up requests keep arriving for
what feels like the same piece of work.

If the PR has merged:

1. Fetch the latest default branch.
2. If the branch carries commits that never merged (pushed after the
   merge), preserve them by rebasing onto the new base instead of
   discarding them:
   `git rebase --onto origin/main <last-merged-commit> <branch>`
3. Force-push (safe here — it only rewrites the already-merged prefix of
   the branch, the unmerged commits are replayed on top of it, not
   discarded).
4. Open a **new** PR for the follow-up work. The old, merged PR cannot be
   reused or reopened for this.

Keep the same branch name throughout unless asked otherwise.
