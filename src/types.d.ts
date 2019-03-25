declare module 'backoff';

interface AndroidVersion {
    androidVersion: string;
    ['Android version']: string;
    ['Impacted sessions']: string;
    ['Crash-free sessions']: string;
    ['Number of sessions']: string;
    ['Bottom quartile']: string;
}

interface CrashCluster {
    ['Error description']: string;
    ['Error location']: string;
    Reports: string;
    ['Impacted users']: string;
    ['Last reported']: string;
}

type AppVersion = string;

interface KVS<T> {
    [key: string]: T;
}
