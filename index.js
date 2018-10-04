// transpile:main
import * as cp from 'child_process';
import * as spIndex from './lib/subprocess';
import * as execIndex from './lib/exec';


const { spawn } = cp;
const { SubProcess } = spIndex;
const { exec } = execIndex;

export { exec, spawn, SubProcess };
