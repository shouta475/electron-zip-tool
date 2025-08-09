export type ZipFileEntry = {
  path: string
  is_file: boolean
  is_encrypted: boolean
}
export type AlertData = {
  id: string
  severity: Severity
  message: string
}
export type Severity = 'error' | 'warning' | 'info' | 'success'