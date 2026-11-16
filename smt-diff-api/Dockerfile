FROM python:3.13-slim

RUN apt-get update \
	&& apt-get install -y --no-install-recommends curl \
	&& rm -rf /var/lib/apt/lists/*

# Install Poetry
ENV POETRY_VERSION=2.2.1 POETRY_HOME=/opt/poetry POETRY_VIRTUALENVS_CREATE=false
RUN curl -sSL https://install.python-poetry.org | python - --version "$POETRY_VERSION" \
	&& ln -s /opt/poetry/bin/poetry /usr/local/bin/poetry
WORKDIR /app
# Install the dependencies first (cached layer), then the project itself, which
# includes the vendored smt_diff package from smt_diff/vendor.
COPY pyproject.toml poetry.lock* ./
RUN poetry install --only main --no-root
COPY . .
RUN poetry install --only main
EXPOSE 8080
# Witness streams live in process memory: keep a single worker process.
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "1"]
