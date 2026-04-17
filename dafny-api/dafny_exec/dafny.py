import os
import subprocess
import tempfile
import shutil
import zipfile
import uuid

TRACKING_FILE = "/tmp/dafny_last_active.txt"


def ensure_worker_running():
    """Starts the container if it was killed by the Watchdog or hasn't started yet."""
    check = subprocess.run(
        ["docker", "ps", "-q", "-f", "name=dafny-worker"],
        capture_output=True,
        text=True,
    )

    if not check.stdout.strip():
        # Remove any dead/stopped container with the same name
        subprocess.run(["docker", "rm", "-f", "dafny-worker"], capture_output=True)
        memory = os.getenv("DAFNY_DOCKER_MEMORY", "4g")
        memory_swap = os.getenv("DAFNY_DOCKER_MEMORY_SWAP", "4g")
        cpus = os.getenv("DAFNY_DOCKER_CPUS", "2")
        pids_limit = os.getenv("DAFNY_DOCKER_PIDS_LIMIT", "1000")
        tmpfs_opts = os.getenv("DAFNY_DOCKER_TMPFS_OPTS", "2g")
        worker_image = os.getenv("DAFNY_WORKER_IMAGE", "dafny-py:latest")

        try:
            subprocess.run(
                [
                    "docker",
                    "run",
                    "-d",
                    "--rm",
                    "--name",
                    "dafny-worker",
                    "--network=none",
                    "--read-only",
                    "--tmpfs",
                    f"/tmp:rw,exec,size={tmpfs_opts}",
                    f"--memory={memory}",
                    f"--memory-swap={memory_swap}",
                    f"--pids-limit={pids_limit}",
                    f"--cpus={cpus}",
                    worker_image,
                    "tail",
                    "-f",
                    "/dev/null",
                ],
                check=True,
            )
            # Initialize the idle tracking file so the watchdog timer starts immediately
            with open(TRACKING_FILE, "w") as f:
                f.write("")
        except subprocess.CalledProcessError:
            # Another concurrent request may have already started it — verify it's running
            check2 = subprocess.run(
                ["docker", "ps", "-q", "-f", "name=dafny-worker"],
                capture_output=True,
                text=True,
            )
            if not check2.stdout.strip():
                raise


def run_in_docker_exec(code: str) -> str:
    ensure_worker_running()

    # "Touch" the tracking file to reset the idle timer
    with open(TRACKING_FILE, "w") as f:
        f.write("")

    run_id = uuid.uuid4().hex[:8]
    work_dir = f"/tmp/dafny_{run_id}"
    code_file = f"{work_dir}/program.dfy"
    dafny_timeout = os.getenv("DAFNY_EXECUTION_TIMEOUT", "25")
    try:
        setup_cmd = f"mkdir -p {work_dir} && cat > {code_file}"
        subprocess.run(
            ["docker", "exec", "-i", "dafny-worker", "sh", "-c", setup_cmd],
            input=code,
            text=True,
            check=True,
        )

        exec_args = [
            "docker",
            "exec",
            "-e",
            "DOTNET_CLI_HOME=/tmp",
            "-e",
            "HOME=/tmp",
            "-w",
            work_dir,
            "dafny-worker",
            "timeout",
            str(int(dafny_timeout) - 5),
            "dafny",
            "run",
            "--target=py",
            "program.dfy",
        ]

        result = subprocess.run(
            exec_args, capture_output=True, text=True, timeout=int(dafny_timeout)
        )

        output = result.stdout + result.stderr

        if result.returncode == 124:
            return "Execution timeout (Code took too long to run)"
        elif result.returncode != 0:
            output += f"\n\n--- EXECUTION FAILED ---\nExit Code: {result.returncode}"

        return output

    except subprocess.TimeoutExpired:
        return "Host execution timeout"
    except Exception as e:
        return f"Error executing in warm container: {str(e)}"
    finally:
        try:
            subprocess.run(
                ["docker", "exec", "dafny-worker", "rm", "-rf", work_dir],
                capture_output=True,
                timeout=5,
            )
        except Exception:
            pass


def run_in_gvisor(code: str) -> str:
    """Run Dafny code in a sandboxed Docker container (with gVisor if available)"""

    # Create a temporary directory for this execution
    # Use shared directory that's mounted from host
    shared_tmp = "/tmp/dafny-exec"
    os.makedirs(shared_tmp, exist_ok=True)
    tmpdir = tempfile.mkdtemp(prefix="dafny_", dir=shared_tmp)
    try:
        # Write the code to a file
        code_file = os.path.join(tmpdir, "program.dfy")
        with open(code_file, "w") as f:
            f.write(code)

        os.chmod(code_file, 0o644)
        os.chmod(tmpdir, 0o755)

        dafny_cmd = f"cp /input/program.dfy /tmp/ && cd /tmp && dafny run program.dfy"

        runtime = os.getenv("DAFNY_DOCKER_RUNTIME", "runsc")
        memory = os.getenv("DAFNY_DOCKER_MEMORY", "4g")
        memory_swap = os.getenv("DAFNY_DOCKER_MEMORY_SWAP", "4g")
        cpus = os.getenv("DAFNY_DOCKER_CPUS", "2")
        pids_limit = os.getenv("DAFNY_DOCKER_PIDS_LIMIT", "1000")
        tmpfs_opts = os.getenv("DAFNY_DOCKER_TMPFS_OPTS", "2g")

        docker_args = [
            "docker",
            "run",
            "--rm",
            f"--runtime={runtime}",
            f"--memory={memory}",
            f"--memory-swap={memory_swap}",
            f"--cpus={cpus}",
            f"--pids-limit={pids_limit}",
            "-v",
            f"{tmpdir}:/input:ro",
            "--tmpfs",
            f"/tmp:rw,exec,size={tmpfs_opts}",
            # DEBUG: diagnostic environment variables for gVisor and .NET runtime
            # "-e", "DOTNET_CLI_HOME=/tmp",
            # "-e", "HOME=/tmp",
            # "-e", "COREHOST_TRACE=1",
            # "-e", "DOTNET_EnableCrashReport=1",
        ]

        # Allow configuring the image via environment variable so remote images
        image_name = os.getenv("DAFNY_WORKER_IMAGE", "dafny-gvisor:latest")

        docker_args.extend([image_name, "sh", "-c", dafny_cmd])  # Image name

        # Generate a unique container name so we can kill it on timeout
        container_name = f"dafny-exec-{uuid.uuid4().hex[:8]}"
        docker_args.insert(3, "--name")
        docker_args.insert(4, container_name)

        try:
            result = subprocess.run(
                docker_args,
                capture_output=True,
                text=True,
                timeout=60,  # Increased timeout for gVisor overhead
            )
            output = result.stdout + result.stderr

            # If the container crashed or was killed, append the reason
            if result.returncode != 0:
                output += f"\n\n--- EXECUTION FAILED ---\nContainer Exit Code: {result.returncode}"

            return output
        except subprocess.TimeoutExpired:
            # Kill the container that's still running
            try:
                subprocess.run(
                    ["docker", "kill", container_name], capture_output=True, timeout=5
                )
                subprocess.run(
                    ["docker", "rm", "-f", container_name],
                    capture_output=True,
                    timeout=5,
                )
            except Exception:
                pass
            return "Execution timeout (container killed)"
        except Exception as e:
            # Ensure container cleanup on any error
            try:
                subprocess.run(
                    ["docker", "rm", "-f", container_name],
                    capture_output=True,
                    timeout=5,
                )
            except Exception:
                pass
            return f"Error: {str(e)}"
    finally:
        try:
            shutil.rmtree(tmpdir)
        except Exception:
            pass


def run_dafny(code: str) -> str:
    if os.getenv("USE_DOCKER_EXEC", "false").lower() == "true":
        return run_in_docker_exec(code)

    if os.getenv("USE_GVISOR", "false").lower() == "true":
        return run_in_gvisor(code)

    # Fallback to direct execution
    tmp_file = tempfile.NamedTemporaryFile(mode="w", delete=False, suffix=".dfy")
    tmp_file.write(code)
    tmp_file.close()
    dafny_timeout = os.getenv("DAFNY_EXECUTION_TIMEOUT", "30")
    try:
        command = ["dafny", "run", tmp_file.name]
        result = subprocess.run(
            command, capture_output=True, text=True, timeout=int(dafny_timeout)
        )
        out = (result.stdout or "") + (result.stderr or "")
        os.remove(tmp_file.name)
        return out
    except subprocess.TimeoutExpired:
        os.remove(tmp_file.name)
        return "Timeout expired"


def verify_dafny(code: str) -> str:
    tmp_file = tempfile.NamedTemporaryFile(mode="w", delete=False, suffix=".dfy")
    tmp_file.write(code)
    tmp_file.close()
    dafny_timeout = os.getenv("DAFNY_EXECUTION_TIMEOUT", "30")
    try:
        command = ["dafny", "verify", tmp_file.name]
        result = subprocess.run(
            command, capture_output=True, text=True, timeout=int(dafny_timeout)
        )
        out = (result.stdout or "") + (result.stderr or "")
        os.remove(tmp_file.name)
        return out
    except subprocess.TimeoutExpired:
        os.remove(tmp_file.name)
        return "Timeout expired"


def translate_dafny(code: str, permalink: str, target_language: str) -> str:
    """
    Translate Dafny code to target language and return path to zip file.
    """
    tmp_dir = tempfile.gettempdir()
    dfy_path = os.path.join(tmp_dir, permalink + ".dfy")
    dafny_timeout = os.getenv("DAFNY_EXECUTION_TIMEOUT", "30")
    try:
        # Write Dafny code to temporary file
        with open(dfy_path, "w", encoding="utf-8") as f:
            f.write(code)

        # Run Dafny translate command
        command = ["dafny", "translate", target_language, dfy_path]
        result = subprocess.run(
            command, capture_output=True, text=True, timeout=int(dafny_timeout)
        )

        if result.returncode != 0:
            # Include both stdout and stderr so the frontend can display detailed errors
            out = (result.stdout or "") + (result.stderr or "")
            raise Exception(out)

        # Determine what files/directories were created
        zip_path = os.path.join(tmp_dir, f"{permalink}-{target_language}.zip")

        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zipf:
            if target_language in ["py", "java", "go"]:
                # These create directories
                output_dir = os.path.join(tmp_dir, f"{permalink}-{target_language}")
                if os.path.exists(output_dir):
                    for root, _, files in os.walk(output_dir):
                        for file in files:
                            file_path = os.path.join(root, file)
                            arcname = os.path.relpath(file_path, tmp_dir)
                            zipf.write(file_path, arcname)
                else:
                    raise Exception(
                        f"Expected output directory not found: {output_dir}"
                    )

            elif target_language in ["cs", "js"]:
                # These create individual files
                base_file = os.path.join(tmp_dir, f"{permalink}.{target_language}")
                dtr_file = os.path.join(tmp_dir, f"{permalink}-{target_language}.dtr")

                if os.path.exists(base_file):
                    zipf.write(base_file, os.path.basename(base_file))
                else:
                    raise Exception(f"Expected output file not found: {base_file}")

                if os.path.exists(dtr_file):
                    zipf.write(dtr_file, os.path.basename(dtr_file))
            else:
                raise Exception(f"Unsupported target language: {target_language}")

        return zip_path

    except subprocess.TimeoutExpired:
        raise Exception("Timeout expired during translation")
    except Exception as e:
        # Clean up on error
        if os.path.exists(dfy_path):
            os.remove(dfy_path)
        raise Exception(f"Error during translation: {str(e)}")
