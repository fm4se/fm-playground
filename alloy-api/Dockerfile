FROM ubuntu:24.04

WORKDIR /app
COPY . /app

RUN apt-get update && apt-get install -y bash openjdk-21-jdk curl socat jq && \
	mkdir -p lib && \
	curl -sL https://api.github.com/repos/se-buw/alloy-diff/releases/latest | jq -r '.assets[] | select(.name | endswith(".jar")) | .browser_download_url' | xargs curl -L -o lib/diff.jar && \
	sed -i -e 's/\r$//' gradlew entrypoint.sh && \
	chmod +x gradlew entrypoint.sh && \
	./gradlew clean build -x test && \
	mv build/libs/fmp.alloy.api-0.0.1.jar app.jar

EXPOSE 8080

ENTRYPOINT ["/app/entrypoint.sh"]
