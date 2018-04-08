import { spawn } from 'child_process';
import { zip } from 'rxjs/observable/zip';
import { Observable } from 'rxjs/Observable';
import dotenv from 'dotenv';
import * as moment from 'moment';
import { sortBy } from 'lodash';

const observables: Array<Observable<any>> = [];

process.env.SITES.split(',').forEach(site => {
  const command = spawn('sh', [
    '-c',
    `echo | openssl s_client -connect ${site}:443 -servername ${site} 2>/dev/null | openssl x509 -noout -enddate`
  ]);

  observables.push(
    Observable.create(function(observer) {
      command.stdout.on('data', function(data) {
        const expirationDate = data
          .toString()
          .replace('notAfter=', '')
          .replace('\n', '');

        const timeAgo = moment(new Date(expirationDate))
          .endOf('day')
          .fromNow();

        observer.next({
          site,
          timeAgo,
          daysLeft: moment(new Date(expirationDate)).diff(moment(), 'days'),
          unix: moment(new Date(expirationDate)).unix(),
          message: `${site} expires ${timeAgo} on ${expirationDate}`
        });
      });
      command.stderr.on('data', function(data) {
        observer.next(`${site}: Error`);
      });
    })
  );
});

zip(...observables).subscribe(report => {
  console.log(sortBy(report, ['unix']));
});

// TODO MVP: Email a report of expiration dates
// TODO If expires date is within the week, email
