FROM python:3.10-slim

RUN apt-get update && apt-get install -y \
    curl \
    wget \
    docker.io \
    unzip \
    git \
    libicu-dev \
    zip \
    && rm -rf /var/lib/apt/lists/*

# Install .NET 8.0 SDK (Required by Dafny 4.x)
RUN wget https://dot.net/v1/dotnet-install.sh -O dotnet-install.sh \
    && chmod +x ./dotnet-install.sh \
    && ./dotnet-install.sh --channel 8.0 --install-dir /usr/share/dotnet \
    && ln -s /usr/share/dotnet/dotnet /usr/bin/dotnet

# Install Dafny 4.11.0
ENV DAFNY_VERSION=4.11.0
RUN wget "https://github.com/dafny-lang/dafny/releases/download/v${DAFNY_VERSION}/dafny-${DAFNY_VERSION}-x64-ubuntu-22.04.zip" -O dafny.zip \
    && unzip dafny.zip -d /opt/ \
    && rm dafny.zip \
    && mv /opt/dafny* /opt/dafny-sdk \
    && chmod +x /opt/dafny-sdk/dafny

ENV PATH=$PATH:/opt/dafny-sdk

ENV POETRY_HOME="/opt/poetry"
ENV PATH="$POETRY_HOME/bin:$PATH"

RUN curl -sSL https://install.python-poetry.org | python3 -

WORKDIR /app

COPY pyproject.toml poetry.lock* ./
RUN poetry config virtualenvs.create false \
    && poetry install --no-root --no-interaction

COPY . .

EXPOSE 8080

COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

ENTRYPOINT ["/app/entrypoint.sh"]
