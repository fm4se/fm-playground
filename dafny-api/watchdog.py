import os
import time
import subprocess

TRACKING_FILE = "/tmp/dafny_last_active.txt"
CONTAINER_NAME = "dafny-worker"
IDLE_TIMEOUT_SECONDS = int(os.getenv("DAFNY_IDLE_TIMEOUT", 300))
MEMORY_THRESHOLD_PERCENT = float(os.getenv("DAFNY_MEMORY_THRESHOLD", 85.0))


def get_container_memory_usage() -> float:
    """Returns the memory percentage used by the container."""
    try:
        result = subprocess.run(
            [
                "docker",
                "stats",
                "--no-stream",
                "--format",
                "{{.MemPerc}}",
                CONTAINER_NAME,
            ],
            capture_output=True,
            text=True,
        )
        out = result.stdout.strip()
        if out and "%" in out:
            return float(out.replace("%", ""))
    except Exception:
        pass
    return 0.0


def kill_container(reason: str):
    """Destroys the container. The API script will rebuild a fresh one on the next request."""
    print(f"[{time.strftime('%X')}] Destroying {CONTAINER_NAME}: {reason}")
    subprocess.run(["docker", "rm", "-f", CONTAINER_NAME], capture_output=True)


def run_watchdog():
    print(f"Starting Watchdog for {CONTAINER_NAME}...")
    while True:
        # check every 15 seconds
        time.sleep(15)

        # Check if container is actually running
        check = subprocess.run(
            ["docker", "ps", "-q", "-f", f"name={CONTAINER_NAME}"],
            capture_output=True,
            text=True,
        )
        if not check.stdout.strip():
            continue  # Container is already dead, nothing to do

        # Check for Idle Timeout
        try:
            if os.path.exists(TRACKING_FILE):
                last_active = os.path.getmtime(TRACKING_FILE)
                if time.time() - last_active > IDLE_TIMEOUT_SECONDS:
                    kill_container(
                        f"Idle for over {IDLE_TIMEOUT_SECONDS // 60} minutes."
                    )
                    continue
        except Exception as e:
            print(f"Watchdog error checking file: {e}")

        # Check for Resource Bloat (Memory Leaks/Zombies)
        mem_usage = get_container_memory_usage()
        if mem_usage > MEMORY_THRESHOLD_PERCENT:
            kill_container(f"Memory usage critical ({mem_usage}%).")


if __name__ == "__main__":
    run_watchdog()
