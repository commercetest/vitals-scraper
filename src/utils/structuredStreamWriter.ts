import { WriteStream, createWriteStream } from 'fs';

export enum StructuredFormat {
  JSON = 'json',
  CSV = 'csv',
}

export class StructuredStreamWriter {
  private entries = 0;
  private columns: string[];
  private format: StructuredFormat;
  private filePath: string;
  private fileStream: WriteStream;

  constructor(format: StructuredFormat, filePath: string, columns?: string[]) {
    this.format = format;
    this.filePath = filePath;
    this.fileStream = createWriteStream(filePath);
    this.columns = columns;

    this.writeHeader();
  }

  public done() {
    this.writeFooter();
    this.fileStream.close();
  }

  public writeItem(item: { [key: string]: any }) {
    return new Promise((resolve, reject) => {
      if (this.format === StructuredFormat.JSON) {
        // TODO: add option for pretty/compact JSON
        const shouldAddPrefixComma = this.entries !== 0;

        const itemString = `${shouldAddPrefixComma ? ',\n' : ''}${JSON.stringify(
          item,
          null,
          '\t'
        )}`;
        this.fileStream.write(itemString, (err) => err ? reject(err) : resolve());
      } else if (this.format === StructuredFormat.CSV) {
        if (this.columns) {
          const itemString = this.columns.map(key => item[key]).join(',') + '\n';
          this.fileStream.write(itemString, (err) => err ? reject(err) : resolve());
        } else {
          throw new Error(`Writing a CSV file, but don't have columns`);
        }
      }

      this.entries += 1;
    });
  }

  private writeHeader() {
    let headerString;
    if (this.format === StructuredFormat.JSON) {
      headerString = `[\n`;
    } else if (this.format === StructuredFormat.CSV) {
      if (this.columns) {
        headerString = this.columns.join(',') + '\n';
      } else {
        throw new Error(`Writing a CSV file, but don't have columns`);
      }
    }

    this.fileStream.write(headerString);
  }

  private writeFooter() {
    let footerString = '';
    if (this.format === StructuredFormat.JSON) {
      footerString = '\n]';
    }

    this.fileStream.write(footerString);
  }
}
