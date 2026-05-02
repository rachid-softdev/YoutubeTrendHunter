#!/bin/bash
BRANCH_NAME="main"
git add -A
git commit -am "Initial Commit"
git checkout --orphan latest_branch
git add -A
git commit -am "Initial Commit"
git branch -D $BRANCH_NAME
git branch -m $BRANCH_NAME
git push -f origin $BRANCH_NAME
git gc --aggressive --prune=all
echo "Nettoyage de l'historique des commits terminé avec succès !"