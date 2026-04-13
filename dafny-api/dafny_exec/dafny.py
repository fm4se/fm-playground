import os
import subprocess
import tempfile
import shutil
import zipfile
import uuid


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

        # Prepare the dafny command - copy to /tmp for writable access
        dafny_cmd = f"cp /input/program.dfy /tmp/ && cd /tmp && dafny run program.dfy"

        # DEBUG:
        # Check if gVisor runtime is available
        # runtime_check = subprocess.run(
        #     ["docker", "info"],
        #     capture_output=True,
        #     text=True
        # )
        # use_gvisor = "runsc" in runtime_check.stdout

        docker_args = [
            "docker",
            "run",
            "--rm",
            "--runtime=runsc",  # gVisor runtime for sandboxing
            "--memory=2g",  # Increased memory for C# compilation
            "--memory-swap=2g",  # Prevent swap usage
            "--cpus=0",  # Limit to single CPU
            "--pids-limit=200",  # Increased process limit for compilation
            "-v",
            f"{tmpdir}:/input:ro",  # Mount code as read-only
            "--tmpfs",
            "/tmp:rw,exec,size=500m",  # Larger tmpfs for compilation artifacts
        ]

        # Allow configuring the image via environment variable so remote images
        image_name = os.getenv("DAFNY_GVISOR_IMAGE", "dafny-gvisor:latest")

        docker_args.extend([image_name, "sh", "-c", dafny_cmd])  # Image name

        # Generate a unique container name so we can kill it on timeout
        container_name = f"dafny-exec-{uuid.uuid4().hex[:8]}"
        docker_args.insert(3, "--name")
        docker_args.insert(4, container_name)

        try:
            result = subprocess.run(
                docker_args, capture_output=True, text=True, timeout=60  # Increased timeout for gVisor overhead
            )
            return result.stdout + result.stderr
        except subprocess.TimeoutExpired:
            # Kill the container that's still running
            try:
                subprocess.run(["docker", "kill", container_name], capture_output=True, timeout=5)
                subprocess.run(["docker", "rm", "-f", container_name], capture_output=True, timeout=5)
            except Exception:
                pass
            return "Execution timeout (container killed)"
        except Exception as e:
            # Ensure container cleanup on any error
            try:
                subprocess.run(["docker", "rm", "-f", container_name], capture_output=True, timeout=5)
            except Exception:
                pass
            return f"Error: {str(e)}"
    finally:
        try:
            shutil.rmtree(tmpdir)
        except Exception:
            pass


def run_dafny(code: str) -> str:
    # FIXME: Temporarily disable gVisor execution until we can optimize and reduce overhead.
    # use_gvisor = os.getenv("USE_GVISOR", "false").lower() == "true"

    # if use_gvisor:
    #     return run_in_gvisor(code)

    # Fallback to direct execution
    tmp_file = tempfile.NamedTemporaryFile(mode="w", delete=False, suffix=".dfy")
    tmp_file.write(code)
    tmp_file.close()
    try:
        command = ["dafny", "run", tmp_file.name]
        result = subprocess.run(command, capture_output=True, text=True, timeout=30)
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
    try:
        command = ["dafny", "verify", tmp_file.name]
        result = subprocess.run(command, capture_output=True, text=True, timeout=30)
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

    try:
        # Write Dafny code to temporary file
        with open(dfy_path, "w", encoding="utf-8") as f:
            f.write(code)

        # Run Dafny translate command
        command = ["dafny", "translate", target_language, dfy_path]
        result = subprocess.run(command, capture_output=True, text=True, timeout=30)

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
                    for root, dirs, files in os.walk(output_dir):
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
