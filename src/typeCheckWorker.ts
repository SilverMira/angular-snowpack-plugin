import worker from 'worker_threads';
import * as ng from '@angular/compiler-cli';
import { runTypeCheck } from './typeCheck';

export type TypeCheckWorkerAction = 'run_check';
export type TypeCheckWorker = worker.Worker;

export interface TypeCheckArgs {
  data: {
    rootNames: string[];
    options: ng.CompilerOptions;
  };
  action: TypeCheckWorkerAction;
}

export const createTypeCheckWorker = () => {
  const typeCheckWorker = new worker.Worker(__filename);
  return typeCheckWorker;
};

const runWorker = () => {
  worker.parentPort!.on('message', ({ action, data }: TypeCheckArgs) => {
    switch (action) {
      case 'run_check':
        worker.parentPort!.postMessage(
          runTypeCheck(data.rootNames, data.options)
        );
        break;
    }
  });
};

if (!worker.isMainThread) runWorker();
