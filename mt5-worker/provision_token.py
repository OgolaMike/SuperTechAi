"""Store a worker bearer token in the Windows OS credential vault."""
import getpass
import os
import keyring

service = "SuperTechAI-MT5-Bridge"
worker_id = os.environ.get("STAI_WORKER_ID", "").strip()
if not worker_id:
    raise SystemExit("Set STAI_WORKER_ID before provisioning.")
token = getpass.getpass("Paste the one-time worker token (input hidden): ").strip()
if len(token) < 32:
    raise SystemExit("Token must be at least 32 characters.")
keyring.set_password(service, worker_id, token)
print("Worker token stored in the operating-system credential vault.")
