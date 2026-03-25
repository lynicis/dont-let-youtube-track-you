/** Type declarations for wa-sqlite VFS modules not included in the package types. */

declare module 'wa-sqlite/src/examples/AccessHandlePoolVFS.js' {
  import * as VFS from 'wa-sqlite/src/VFS.js';
  export class AccessHandlePoolVFS extends VFS.Base {
    constructor(directoryPath: string);
    isReady: Promise<void>;
    get name(): string;
    getCapacity(): number;
    getSize(): number;
    addCapacity(count: number): Promise<number>;
    removeCapacity(count: number): Promise<number>;
    reset(): Promise<void>;
    close(): Promise<void>;
  }
}

declare module 'wa-sqlite/src/examples/IDBBatchAtomicVFS.js' {
  import * as VFS from 'wa-sqlite/src/VFS.js';
  export class IDBBatchAtomicVFS extends VFS.Base {
    constructor(idbDatabaseName?: string, options?: {
      durability?: 'default' | 'strict' | 'relaxed';
      purge?: 'deferred' | 'manual';
      purgeAtLeast?: number;
    });
    name: string;
    close(): Promise<void>;
  }
}
