#!/bin/bash

# CD to the location of this file
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd $DIR

. $HOME/.nvm/nvm.sh
nvm install v8.11.1
$(which npm) install
$(which npm) run start