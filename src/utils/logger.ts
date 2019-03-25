import * as logSymbols from 'log-symbols';

class Logger {
  public getTs() {
    return new Date().toLocaleTimeString();
  }

  public info(...args: any[]) {
    if (!!(process as any).verbose) {
      console.info(logSymbols.info, `[${this.getTs()}]`, ...args);
    }
  }

  public log(...args: any[]) {
    console.log(logSymbols.info, `[${this.getTs()}]`, ...args);
  }

  public warn(...args: any[]) {
    if (!!(process as any).verbose) {
      console.warn(logSymbols.warning, `[${this.getTs()}]`, ...args);
    }
  }

  public error(...args: any[]) {
    console.error(logSymbols.error, `[${this.getTs()}]`, ...args);
  }
}

// export default Logger;
export const logger = new Logger();
