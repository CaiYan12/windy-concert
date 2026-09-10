import { up as init0001 } from './0001_init';

export interface Migration {
  up: string;
}

export const migrations: Migration[] = [{ up: init0001 }];
