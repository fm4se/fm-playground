import concurrent.futures
import os
import platform
import re
import subprocess
import tempfile

system = platform.system().lower()


def get_executable_path() -> str:
    """Detect OS and return the correct Limboole executable path."""
    system = platform.system().lower()
    if "windows" in system:
        return "lib/limboole.exe"
    # elif "linux" in system:
    #     return "lib/limboole-linux-amd64.exe"
    else:
        return "lib/limbooleAPE.exe"


# Absolute: Windows cannot launch a relative path such as 'lib/limboole.exe'.
LIMBOOLE_EXE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), get_executable_path())


MAX_CONCURRENT_REQUESTS = 10
executor = concurrent.futures.ThreadPoolExecutor(max_workers=MAX_CONCURRENT_REQUESTS)


def run_limboole(code: str, check_sat: bool = True) -> str:
    tmp_file = tempfile.NamedTemporaryFile(mode="w", delete=False, suffix=".limboole")
    tmp_file.write(code)
    tmp_file.close()

    try:
        if check_sat:
            # APE has a special polyglot format.
            # Running from shell automatically handles it.
            if system == "darwin" or system == "mac" or system == "linux":
                command = ["sh", LIMBOOLE_EXE, "-s", tmp_file.name]
            else:
                command = [LIMBOOLE_EXE, "-s", tmp_file.name]
        else:
            if system == "darwin" or system == "mac" or system == "linux":
                command = ["sh", LIMBOOLE_EXE, tmp_file.name]
            else:
                command = [LIMBOOLE_EXE, tmp_file.name]
        result = subprocess.run(command, capture_output=True, text=True, timeout=5)
        os.remove(tmp_file.name)
        if result.returncode != 0:
            return prettify_error(result.stderr)
        return result.stdout
    except subprocess.TimeoutExpired:
        os.remove(tmp_file.name)
        return "Timeout expired"
    except Exception as e:
        # Ensure cleanup even on unexpected errors
        if os.path.exists(tmp_file.name):
            os.remove(tmp_file.name)
        raise e


def prettify_error(stderr: str) -> str:
    modified_stderr = re.sub(r"^.*\.limboole:", "<stdin>:", stderr)
    return modified_stderr


def process_commands(code: str, check_sat: bool = True) -> str:
    future = executor.submit(run_limboole, code, check_sat)
    return future.result()
