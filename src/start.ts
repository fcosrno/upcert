import { spawn } from 'child_process';
import { Observable } from 'rxjs/Observable';
import { map, mergeMap, toArray } from 'rxjs/operators';
import dotenv from 'dotenv';
import * as moment from 'moment';
import { sortBy } from 'lodash';
import * as sgMail from '@sendgrid/mail';

const debug = process.env.DEBUG || false;

const parseDate = (string: string) => {
  return string.trim().replace('Not After : ', '');
};

const generateMessage = report => {
  let html = '<table><tr><th>Expires</th><th>Site</th><th>Date</th></tr>';
  report.forEach(n => {
    html += `<tr><td>${n.timeAgo}</td><td>${n.host}</td><td>${
      n.expirationDate
    }</td></tr>`;
  });
  html += '</table>';
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
const getCertExpiration = ({ host, container }): Observable<any> => {
  return Observable.create(observer => {
    if (debug && process.env.LOCAL_DEV_DATE) {
      observer.next({
        host,
        container,
        expirationDate: parseDate(process.env.LOCAL_DEV_DATE)
      });
      observer.complete();
    }
    const command = spawn('sh', [
      '-c',
      `openssl x509 -in /etc/certs/${host}.crt -noout -text | grep Not\\ After`
    ]);
    command.stdout.on('data', function(data) {
      observer.next({
        host,
        container,
        expirationDate: parseDate(data.toString())
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
    mergeMap((data: any) => {
      if (debug) {
        console.log(data);
      }
      return getCertExpiration(data);
    }),
    map((data: any) => {
      const timeAgo = moment(new Date(data.expirationDate))
        .endOf('day')
        .fromNow();
      const daysLeft = moment(new Date(data.expirationDate)).diff(
        moment(),
        'days'
      );
      const unix = moment(new Date(data.expirationDate)).unix();

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
