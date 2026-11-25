import { Account, Client, TablesDB } from 'appwrite';

// Appwrite is configured as a secondary backend.
// Supabase remains the production source of truth until a feature is
// deliberately migrated, tested, and approved.
const endpoint =
  import.meta.env.VITE_APPWRITE_ENDPOINT || 'https://fra.cloud.appwrite.io/v1';
const projectId =
  import.meta.env.VITE_APPWRITE_PROJECT_ID || '6b06de46003dde834eb6';

export const appwriteConfigured = Boolean(endpoint && projectId);

export const appwriteClient = new Client()
  .setEndpoint(endpoint)
  .setProject(projectId);

export const appwriteAccount = new Account(appwriteClient);
export const appwriteTablesDB = new TablesDB(appwriteClient);

export const APPWRITE_PROJECT_ID = projectId;
export const APPWRITE_ENDPOINT = endpoint;
