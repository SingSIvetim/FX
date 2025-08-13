declare module 'archiver' {
    import { Transform } from 'stream';
    
    interface ArchiverOptions {
        zlib?: {
            level?: number;
        };
    }
    
    interface Archiver extends Transform {
        pipe(dest: any): Archiver;
        append(source: Buffer | string, options?: { name: string }): Archiver;
        finalize(): Promise<void>;
        on(event: string, listener: Function): Archiver;
    }
    
    function archiver(format: string, options?: ArchiverOptions): Archiver;
    
    export = archiver;
}
