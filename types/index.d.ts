export interface SmtpConfig {
  host?: string;
  port?: number;
  user?: string;
  pass?: string;
  password?: string;
  secure?: boolean;
  ignoreTLS?: boolean;
  rejectUnauthorized?: boolean;
}

export interface EmailTheCodeConfig {
  smtp?: SmtpConfig;
  sendmailPath?: string;
  transport?: (input: {
    message: string;
    payload: EmailPayload;
    id: string;
  }) => Promise<{ queueId?: string | null } | void> | { queueId?: string | null } | void;
}

export interface EmailPayload {
  from: string;
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
  reply_to?: string;
  headers?: Record<string, string>;
}

export interface EmailResult {
  id: string;
  messageId: string;
  queueId?: string | null;
  from: string;
  to: string | string[];
  status: 'queued' | string;
  created_at: string;
}

export interface Emails {
  send(payload: EmailPayload): Promise<EmailResult>;
}

export declare class EmailTheCode {
  constructor(config?: EmailTheCodeConfig);
  config: EmailTheCodeConfig;
  emails: Emails;
}

export { EmailTheCode as Resend };
export default EmailTheCode;
