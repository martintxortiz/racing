"""Delete every account (users + Convex Auth tables) from the dev deployment."""

import subprocess

subprocess.run(
    "npx convex run admin:clearAllAccounts --push",
    shell=True,
    check=True,
)
print("All accounts removed.")
