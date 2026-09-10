import { spawn } from 'node:child_process';
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(process.argv[2], process.argv.slice(3), { stdio: 'inherit', env, shell: true });
child.on('exit', (c) => process.exit(c ?? 0));
