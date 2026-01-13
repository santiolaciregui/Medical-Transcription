
export interface TranscriptionResult {
  rawText: string;
  structuredReport: StructuredReport;
}

export interface StructuredReport {
  patientInfo?: string;
  clinicalHistory?: string;
  findings?: string;
  diagnosis?: string;
  plan?: string;
  originalText: string;
}

export enum AppStatus {
  IDLE = 'IDLE',
  UPLOADING = 'UPLOADING',
  TRANSCRIBING = 'TRANSCRIBING',
  REFINING = 'REFINING',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR'
}
