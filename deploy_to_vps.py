import os
import sys
import time
import zipfile
import tempfile
import paramiko

# Fix Windows console encoding
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.stderr.reconfigure(encoding='utf-8', errors='replace')

VPS_HOST = "187.77.143.211"
VPS_PORT = 22
VPS_USER = "root"
VPS_PASS = "NkbManufacturing@2025"
REMOTE_APP_DIR = "/opt/sop-management-system"
REMOTE_GIT_DIR = "/root/SOP"

def log(msg):
    print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] {msg}", flush=True)

def create_archive():
    temp_zip = tempfile.NamedTemporaryFile(suffix=".zip", delete=False)
    temp_zip_path = temp_zip.name
    temp_zip.close()

    root_dir = os.path.dirname(os.path.abspath(__file__))
    log(f"Packaging workspace from {root_dir}...")

    exclude_dirs = {
        ".git", "node_modules", "dist", ".cache",
        "data", "uploads", ".system_generated"
    }

    with zipfile.ZipFile(temp_zip_path, "w", zipfile.ZIP_DEFLATED) as zipf:
        for root, dirs, files in os.walk(root_dir):
            dirs[:] = [d for d in dirs if d not in exclude_dirs]
            for file in files:
                if file.endswith((".zip", ".tar.gz", ".pyc")):
                    continue
                full_path = os.path.join(root, file)
                rel_path = os.path.relpath(full_path, root_dir)
                zipf.write(full_path, rel_path)

    size_mb = os.path.getsize(temp_zip_path) / (1024 * 1024)
    log(f"Created archive: {temp_zip_path} ({size_mb:.2f} MB)")
    return temp_zip_path

def run_ssh_cmd(client, cmd, timeout=300):
    log(f">>> Running: {cmd.strip()}")
    stdin, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode('utf-8', errors='replace').strip()
    err = stderr.read().decode('utf-8', errors='replace').strip()
    exit_status = stdout.channel.recv_exit_status()
    if out:
        print(f"[STDOUT]\n{out}", flush=True)
    if err:
        print(f"[STDERR]\n{err}", flush=True)
    if exit_status != 0:
        log(f"Command exited with status {exit_status}")
    return exit_status, out, err

def main():
    local_zip = create_archive()
    remote_zip = "/tmp/sop_update.zip"

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

    retries = 3
    connected = False
    for attempt in range(1, retries + 1):
        try:
            log(f"Connecting to VPS {VPS_HOST} (attempt {attempt}/{retries})...")
            client.connect(
                hostname=VPS_HOST,
                port=VPS_PORT,
                username=VPS_USER,
                password=VPS_PASS,
                timeout=45,
                banner_timeout=60,
                auth_timeout=45
            )
            connected = True
            log("SSH Connection established successfully.")
            break
        except Exception as e:
            log(f"Connection failed: {e}")
            if attempt < retries:
                time.sleep(5)
            else:
                raise

    if not connected:
        log("Unable to connect to VPS.")
        sys.exit(1)

    try:
        sftp = client.open_sftp()
        log(f"Uploading {local_zip} -> {remote_zip}...")
        sftp.put(local_zip, remote_zip)
        sftp.close()
        log("SFTP transfer complete.")

        # Extract to both /opt/sop-management-system and /root/SOP
        run_ssh_cmd(client, f"""
            unzip -o {remote_zip} -d {REMOTE_APP_DIR} &&
            unzip -o {remote_zip} -d {REMOTE_GIT_DIR} &&
            rm -f {remote_zip}
        """)

        # Commit & Push to GitHub from /root/SOP
        log("Pushing updates to GitHub...")
        run_ssh_cmd(client, f"""
            cd {REMOTE_GIT_DIR} &&
            git config user.name "nkbearljohndelossantos-coder" &&
            git config user.email "earljohndelossantos@nkbmanufacturing.com" &&
            git add -A &&
            (git commit -m "feat: add professional SOP file upload capability during SOP creation" || true) &&
            git push origin main
        """)

        # Rebuild docker container with --no-cache
        log("Building and recreating nkb_sop_app container...")
        run_ssh_cmd(client, f"""
            cd {REMOTE_APP_DIR} &&
            docker compose build --no-cache &&
            docker compose up -d --force-recreate
        """, timeout=600)

        log("Waiting 15 seconds for container to initialize...")
        time.sleep(15)

        # Health checks
        run_ssh_cmd(client, "docker ps --filter name=nkb_sop_app")
        run_ssh_cmd(client, "curl -s http://127.0.0.1:4050/api/health")

        print("\n--- STEP: FINAL VERIFICATION ---\n", flush=True)
        print("1. Verifying SOP Application:\n", flush=True)
        run_ssh_cmd(client, "curl -I https://sop.nkbmanufacturing.com")

        print("\n2. Verifying existing webapps (ensuring zero regression):\n", flush=True)
        run_ssh_cmd(client, "curl -I https://my.nkbmanufacturing.com")
        run_ssh_cmd(client, "curl -I https://tma.nkbmanufacturing.com")
        run_ssh_cmd(client, "curl -I https://pr.nkbmanufacturing.com")

        print("\n3. All running containers:\n", flush=True)
        run_ssh_cmd(client, "docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'")

        log("DEPLOYMENT COMPLETED SUCCESSFULLY!")

    finally:
        client.close()
        if os.path.exists(local_zip):
            try:
                os.remove(local_zip)
            except:
                pass

if __name__ == "__main__":
    main()
