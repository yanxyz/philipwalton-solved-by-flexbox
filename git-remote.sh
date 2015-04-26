#!/bin/bash

if ! git remote -v | grep -q 'upstream'; then
    # echo 'not found upstream'
    git remote add upstream https://github.com/philipwalton/solved-by-flexbox.git
fi

git fetch upstream master
git checkout master
git merge upstream/master
