import { spawn } from 'child_process';
const command = spawn('docker', ['ps']);

console.log('Hi there now!');

command.stdout.on('data', function(data) {
  console.log(data.toString());
});
command.stderr.on('data', function(data) {
  console.log(data.toString());
});
