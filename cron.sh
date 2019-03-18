#!/bin/bash

# CD to the location of this file
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd $DIR

# Copy certs to host from docker volume. Local destination will 
# be /tmp/certs, which should match .env's CERTS_PATH value
$(which docker) run --rm -it -v /tmp:/host:rw --volumes-from nginx-proxy busybox cp -r /etc/nginx/certs/ /host

. $HOME/.nvm/nvm.sh
nvm install v8.11.1
$(which npm) install
$(which npm) run start