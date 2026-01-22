---
title: 'Git Tips'
description: 'Useful git tips for everyday use'
pubDatetime: 2016-03-01T00:00:00Z
tags: [git, tools]
---

> Some useful git tips for everyday use.

## Set your git details

```bash
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
```

## Initialize a git repo

```bash
git init
```

## Clone a remote repo

```bash
git clone <url>
```

## Update your current branch with remote

```bash
git pull origin master
```

## Change origin URL

```bash
git remote set-url origin <url>
```

## Add remote URL

```bash
git remote add <remote-name> <url>
```

## View remote URLs

```bash
git remote -v
```

## Create a branch locally

```bash
git checkout -b <branch-name>
```

## Delete a branch locally

```bash
git branch -d <branch-name>
```

## Show current branch

```bash
git branch
```

## Switch to different branch

```bash
git checkout <branch-name>
```

## Create a branch remotely

```bash
git push -u origin <branch-name>
```

## Delete a branch remotely

```bash
git push origin :<branch-name>
```

## Create a git alias

```bash
git config --global alias.st status
git config --global alias.ci commit -m
git config --global alias.cob checkout -b
```

## Show unstaged changes

```bash
git diff
```

## Stash local changes

```bash
git stash
```

## Pop stashed changes

```bash
git stash pop
```

## List all stashes

```bash
git stash list
```

## Clear all stashes

```bash
git stash clear
```

## Add all files

```bash
git add .
```

## Undo all local changes

```bash
git reset --hard
```

## Commit changes

```bash
git commit -m "<message>"
```

## Amend last commit message

```bash
git commit --amend -m "<message>"
```

## Undo last local commit

```bash
git reset --soft HEAD^
git reset HEAD .
```

## Rebase to local master

```bash
git rebase master
```

## Push local branch

```bash
git push origin <branch-name>
```

## Squash multiple commits

```bash
git rebase -i master
```

## Compare branches

```bash
git diff <branch1> <branch2>
```

## Revert a commit

```bash
git revert <HASH>
git push origin master
```

## Show commit history

```bash
git log
git log -p          # with diffs
git log --oneline   # compact
```

## Delete all local branches except master

```bash
git branch | grep -v "master" | xargs git branch -D
```

## Show merged branches

```bash
git branch --merged master
git branch --merged        # merged to HEAD
git branch --no-merged     # not merged
```

## Want to be a Git ninja?

Check out: [Pro Git (2nd Edition)](https://git-scm.com/book/en/v2)
