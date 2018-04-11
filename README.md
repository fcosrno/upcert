# Upcert

Email report of SSL certificate expiration dates in local containers running behind `letsencrypt-nginx-proxy-companion`. Expiration dates behind a proxy are not accesible publicly if you use CloudFlare's Full SSL (Strict).

# Description

The script traverses all local containers to get a list of domains, defined as `VIRTUAL_HOST` as per `letsencrypt-nginx-proxy-companion` convention. Then the script fetches the expiration date for each SSL. Finally, it prepares and sends an email to the `EMAIL_TO` recipients in the `.env` file.

# Requirements

A Sendgrid account with an api key for `SENDGRID_API_KEY` in the `.env` file.

# Setup

Create a `.env` file with two variables: `SENDGRID_API_KEY` and `EMAIL_TO`. You can add multiple emails to `EMAIL_TO` separated by a comma.

# Installation

`npm install`

# Usage

`npm run start`

## Manual equivalent

Manually you would run `docker ps -q` to get a list of containers. You'd then have to run the following command for each container to get the host name.

`docker inspect -f '{{range $index, $value := .Config.Env}}{{println $value}}{{end}}' ${CONTAINER_NAME} | grep VIRTUAL_HOST=`

Once you have the host name, you'd ask openssl to give you the expiration date.

`openssl x509 -in /etc/certs/${host}.crt -noout -text | grep Not\ After`
