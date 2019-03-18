import * as sgMail from '@sendgrid/mail';
import { spawn } from 'child_process';
import { sortBy } from 'lodash';
import * as moment from 'moment';
import { Observable } from 'rxjs/Observable';
import { distinct, map, mergeMap, toArray } from 'rxjs/operators';

const debug = process.env.DEBUG || false;

const parseDate = (string: string) => {
  return string.trim().replace('Not After : ', '');
};

const generateMessage = report => {
  let html =
    '<table border="1" cellpadding="5" cellspacing="5"><tr><th>Expires *</th><th>Site</th><th>Proxy</th><th>Disk</th><th>CloudFlare</th></tr>';
  report.forEach(n => {
    html += `<tr><td>${n.timeAgo}</td><td>${n.host}</td><td>${
      n.expirationDate.proxy
    }</td><td>${n.expirationDate.disk}</td><td>${
      n.expirationDate.public
    }</td></tr>`;
  });
  html += '</table>';
  html +=
    '<p>* Expires is based on the Proxy date. Proxy is the date of the cert nginx-proxy is serving. If expired, this date would cause unpredictable errors. Disk is the date in the cert saved locally. If proxy differs from this date, you should restart nginx-proxy. CloudFlare is the date the public sees from their browsers.';
  return {
    subject: `The next certificate expires ${report[0].timeAgo}`,
    html
  };
};

// Emit each container
const containers = Observable.create(observer => {
  spawn('docker', ['ps', '-q']).stdout.on('data', function(data) {
    observer.next(
      data
        .toString()
        .split('\n')
        .filter(e => {
          return e;
        })
    );
    observer.complete();
  });
}).pipe(
  mergeMap((x: string) => {
    return x;
  })
);

// Get container host name
const getContainerHost = (container: string): Observable<any> => {
  return Observable.create(observer => {
    const command = spawn('sh', [
      '-c',
      `docker inspect -f '{{range $index, $value := .Config.Env}}{{println $value}}{{end}}' ${container} | grep VIRTUAL_HOST=`
    ]);
    command.stdout.on('data', function(data) {
      const hosts = data
        .toString()
        .replace('VIRTUAL_HOST=', '')
        .replace('\n', '')
        .split(',');

      hosts.forEach(host => {
        observer.next({
          container,
          host
        });
      });
      observer.complete();
    });
    command.on('exit', function(code) {
      // Also complete when exit code is 1
      // These are containers that don't have a VIRTUAL_HOST
      if (code === 1) {
        observer.complete();
      }
    });
  });
};
const getPublishedCertExpiration = (
  { host, container, expirationDate },
  localhost: boolean
): Observable<any> => {
  let endPoint = 'localhost';
  if (!localhost) endPoint = host;

  const command = spawn('sh', [
    '-c',
    `echo | openssl s_client -connect ${endPoint}:443 -servername ${host} 2>/dev/null | openssl x509 -noout -enddate`
  ]);

  return Observable.create(observer => {
    command.stdout.on('data', function(data: any) {
      // console.log(`Data: ${data}`);

      const date = data
        .toString()
        .replace('notAfter=', '')
        .replace('\n', '');

      expirationDate = { ...expirationDate, proxy: date };
      if (!localhost) {
        expirationDate = { ...expirationDate, public: date };
      }

      observer.next({
        host,
        container,
        expirationDate
      });
      observer.complete();
    });
    command.on('exit', function(code) {
      // Also complete when exit code is 1
      // These are domains that don't have a crt
      if (code === 1) {
        observer.complete();
      }
    });
  });
};

const getDiskCertExpiration = ({ host, container }): Observable<any> => {
  return Observable.create(observer => {
    if (debug && process.env.LOCAL_DEV_DATE) {
      observer.next({
        host,
        container,
        expirationDate: { disk: parseDate(process.env.LOCAL_DEV_DATE) }
      });
      observer.complete();
    }
    const command = spawn('sh', [
      '-c',
      `openssl x509 -in ${
        process.env.CERTS_PATH
      }${host}.crt -noout -text | grep Not\\ After`
    ]);
    command.stdout.on('data', function(data) {
      observer.next({
        host,
        container,
        expirationDate: { disk: parseDate(data.toString()) }
      });
      observer.complete();
    });
    command.on('exit', function(code) {
      // Also complete when exit code is 1
      // These are domains that don't have a crt
      if (code === 1) {
        observer.complete();
      }
    });
  });
};

containers
  .pipe(
    mergeMap((container: string) => {
      if (debug) {
        console.log(container);
      }
      return getContainerHost(container);
    }),
    distinct((x: any) => {
      return x.host;
    }),
    mergeMap((data: any) => {
      if (debug) {
        console.log(data);
      }
      return getDiskCertExpiration(data);
    }),
    mergeMap((data: any) => {
      if (debug) {
        console.log(data);
      }
      return getPublishedCertExpiration(data, false);
    }),
    mergeMap((data: any) => {
      if (debug) {
        console.log(data);
      }
      return getPublishedCertExpiration(data, true);
    }),
    map((data: any) => {
      const timeAgo = moment(new Date(data.expirationDate.proxy))
        .endOf('day')
        .fromNow();
      const daysLeft = moment(new Date(data.expirationDate.proxy)).diff(
        moment(),
        'days'
      );
      const unix = moment(new Date(data.expirationDate.proxy)).unix();

      const report = { ...data, timeAgo, daysLeft, unix };
      if (debug) {
        console.log(report);
      }
      return report;
    })
  )
  .pipe(toArray())
  .subscribe(report => {
    if (debug) {
      console.log(report);
    }

    if (process.env.SENDGRID_API_KEY && process.env.EMAIL_TO) {
      // Generate email message from report
      const { subject, html } = generateMessage(sortBy(report, ['unix']));

      sgMail.setApiKey(process.env.SENDGRID_API_KEY);
      const msg: any = {
        to: process.env.EMAIL_TO.split(','),
        from: process.env.EMAIL_FROM,
        subject,
        html
      };

      sgMail
        .send(msg)
        .then(() => {
          if (debug) {
            console.log('Email sent successfully');
          }
        })
        .catch(error => {
          if (debug) {
            //Log friendly error
            console.error(error.toString());

            //Extract error msg
            const { message, code, response } = error;

            //Extract response msg
            const { headers, body } = response;
          }
        });
    }
  });
