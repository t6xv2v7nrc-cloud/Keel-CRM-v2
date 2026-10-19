// The page Microsoft sends a sign-in back to (outlook-redirect.html): it hands the answer to Keel's own window and
// closes, or, after a full-page sign-in, takes you back into Keel.
import { broadcastResponseToMainFrame } from '@azure/msal-browser/redirect-bridge';

broadcastResponseToMainFrame().catch(() => {
  const msg = document.getElementById('msg');
  if (msg) msg.textContent = 'Could not finish signing in to Outlook. Close this window and try Connect Outlook again in Keel.';
});
