// NIST 800-53 types
export interface NistControl {
  id: string;
  title: string;
  statement: string;
  guidance: string;
  related_controls: string[];
  enhancements: NistControl[];
}

export interface NistFamily {
  id: string;
  name: string;
  controls: NistControl[];
}

export interface NistData {
  standard: string;
  version: string;
  last_modified: string;
  families: NistFamily[];
}
