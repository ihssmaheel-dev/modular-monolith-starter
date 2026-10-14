# Disposable compatibility fixture only. The archived public images/downloads
# are unavailable; build the same official source release reproducibly instead.
FROM golang:1.25.3-alpine@sha256:aee43c3ccbf24fdffb7295693b6e33b21e01baec1b2a55acc351fde345e9ec34 AS build
RUN apk add --no-cache git ca-certificates
WORKDIR /src
RUN git init . && \
    git remote add origin https://github.com/minio/minio.git && \
    git fetch --depth=1 origin 07c3a429bfed433e49018cb0f78a52145d4bedeb && \
    git checkout --detach FETCH_HEAD
ENV CGO_ENABLED=0 GOTOOLCHAIN=local
RUN go build -p 2 -trimpath -ldflags="-s -w" -o /out/minio .

FROM alpine:3.22
RUN apk add --no-cache ca-certificates curl && \
    addgroup -S fixture && adduser -S fixture -G fixture && \
    mkdir /data && chown fixture:fixture /data
COPY --from=build /out/minio /usr/local/bin/minio
COPY --from=build /src/LICENSE /usr/share/licenses/minio/LICENSE
USER fixture
EXPOSE 9000
ENTRYPOINT ["minio"]
CMD ["server", "/data"]
