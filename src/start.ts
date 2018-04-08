import { spawn } from 'child_process';
import { zip } from 'rxjs/observable/zip';
import { Observable } from 'rxjs/Observable';
import dotenv from 'dotenv';

const observables: Array<Observable<any>> = [];

process.env.SITES.split(',').forEach(n => {
  const command = spawn('sh', [
    '-c',
    `echo | openssl s_client -connect ${n}:443 -servername ${n} 2>/dev/null | openssl x509 -noout -enddate`
  ]);
  observables.push(
    Observable.create(function(observer) {
      command.stdout.on('data', function(data) {
        const expirationDate = data
          .toString()
          .replace('notAfter=', '')
          .replace('\n', '');
        observer.next(`${n}: ${expirationDate}`);
      });
      command.stderr.on('data', function(data) {
        observer.next(`${n}: Error`);
      });
    })
  );
});

zip(...observables).subscribe(val => {
  console.log(val);
});

// TODO MVP: Email a report of expiration dates
// TODO If expires date is within the week, email
