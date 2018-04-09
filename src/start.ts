import { spawn } from 'child_process';
import { zip } from 'rxjs/observable/zip';
import { Observable } from 'rxjs/Observable';
import dotenv from 'dotenv';
import * as moment from 'moment';
import { sortBy } from 'lodash';
import * as sgMail from '@sendgrid/mail';

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
          expirationDate,
          daysLeft: moment(new Date(expirationDate)).diff(moment(), 'days'),
          unix: moment(new Date(expirationDate)).unix()
        });
      });
      command.stderr.on('data', function(data) {
        observer.next(`${site}: Error`);
      });
    })
  );
});

zip(...observables).subscribe(report => {
  // Generate email message from report
  const { subject, html } = generateMessage(sortBy(report, ['unix']));

  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
  const msg: any = {
    to: process.env.EMAIL_TO.split(','),
    from: 'upcert@adapter-dc.com',
    subject,
    html
  };

  sgMail.send(msg);
});

const generateMessage = report => {
  let html = '<table><tr><th>Expires</th><th>Site</th><th>Date</th></tr>';
  report.forEach(n => {
    html += `<tr><td>${n.timeAgo}</td><td>${n.site}</td><td>${
      n.expirationDate
    }</td></tr>`;
  });
  html += '</table>';
  return {
    subject: `The next certificate expires ${report[0].timeAgo}`,
    html
  };
};

// TODO Only email it the latest expires within the week or month?
