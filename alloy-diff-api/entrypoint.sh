#!/bin/bash

# Configuration
JAVA_CMD="java -Djava.library.path=lib/ -jar app.jar"
MEMORY_LIMIT_MB=30720   # Memory limit in MB (30720MB-30 GB)
CHECK_INTERVAL=5        # Interval to check memory usage (in seconds)

# Function to get memory usage of a process (in MB)
get_memory_usage_mb() {
  local pid=$1
  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
    ps -o rss= -p "$pid" 2>/dev/null | awk '{print int($1 / 1024)}'
  else
    echo 0
  fi
}

# Function to start the Java process
start_java_process() {
  $JAVA_CMD &
  JAVA_PID=$!
  echo "Java process started with PID $JAVA_PID"
}

# Function to kill the Java process
kill_java_process() {
  if kill -0 "$JAVA_PID" 2>/dev/null; then
    echo "WARNING: Killing Java process with PID $JAVA_PID..."
    kill "$JAVA_PID" 2>/dev/null
    sleep 2  # Give the process time to terminate gracefully
    if kill -0 "$JAVA_PID" 2>/dev/null; then
      echo "WARNING: Process did not terminate. Forcing termination."
      kill -9 "$JAVA_PID" 2>/dev/null
    fi
    wait "$JAVA_PID" 2>/dev/null
    echo "WARNING: Java process killed."
  fi
}

# Start the Java process initially
start_java_process

# Monitor loop
while true; do
  sleep "$CHECK_INTERVAL"

  # Check if the process is still running
  if ! kill -0 "$JAVA_PID" 2>/dev/null; then
    echo "WARNING: Java process has stopped. Restarting..."
    start_java_process
    continue
  fi

  # Get current memory usage
  MEM_USAGE_MB=$(get_memory_usage_mb "$JAVA_PID")

  # Debug output
  # echo "DEBUG: Java PID = $JAVA_PID, MEM_USAGE_MB = $MEM_USAGE_MB, MEMORY_LIMIT_MB = $MEMORY_LIMIT_MB"

  # Check if memory usage exceeds the limit
  if [ -n "$MEM_USAGE_MB" ] && [ "$MEM_USAGE_MB" -eq "$MEM_USAGE_MB" ] 2>/dev/null && [ "$MEM_USAGE_MB" -gt "$MEMORY_LIMIT_MB" ]; then
    echo "Memory usage ($MEM_USAGE_MB MB) exceeds limit ($MEMORY_LIMIT_MB MB). Restarting process..."
    kill_java_process
    start_java_process
  fi
done
