import { google } from 'googleapis';

const GMAIL_SCOPES = ['https://www.googleapis.com/auth/gmail.send'];
const CALENDAR_SCOPES = ['https://www.googleapis.com/auth/calendar'];

function loadServiceAccount() {
  const clientEmail = process.env.GSA_CLIENT_EMAIL;
  const privateKeyRaw = process.env.GSA_PRIVATE_KEY;
  if (!clientEmail || !privateKeyRaw) {
    throw new Error('Service account credentials (GSA_CLIENT_EMAIL / GSA_PRIVATE_KEY) are not set.');
  }
  const privateKey = privateKeyRaw.replace(/\\n/g, '\n');
  return { clientEmail, privateKey };
}

function createAuth(scopes: string[]) {
  const { clientEmail, privateKey } = loadServiceAccount();
  return new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes,
    subject: process.env.GSA_IMPERSONATE ?? undefined,
  });
}

export async function getGmailClient() {
  const auth = createAuth(GMAIL_SCOPES);
  await auth.authorize();
  return google.gmail({ version: 'v1', auth });
}

export async function getCalendarClient() {
  const auth = createAuth(CALENDAR_SCOPES);
  await auth.authorize();
  return google.calendar({ version: 'v3', auth });
}
