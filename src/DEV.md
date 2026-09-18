### run docker config for docker
```
docker-compose -f docker-compose.prod.yml up -d
```

The datastore is an embedded SurrealDB (SurrealKV) **file** inside the
container at `/app/data/planinc.db` — there is no database container to start
and no `DATABASE_URL` to configure. Persist it by mounting that directory.

## build docker with dockerfile locally
```
docker build --build-arg USE_MIRROR=true -t planinc .
docker run --name planinc-website -d -p 1111:1111 -e "PLANINC_DB_FILE=/app/data/planinc.db" -v planinc-data:/app/data planinc
```

## build docker with dockerfile locally on arm64
```
docker buildx build --platform linux/arm64 -t planinc-arm .

docker run --name planinc-website --platform linux/arm64 -d -p 1111:1111 -e "PLANINC_DB_FILE=/app/data/planinc.db" -v planinc-data:/app/data planinc-arm

docker run -p 1111:1111 -e "PLANINC_DB_FILE=/app/data/planinc.db" -v planinc-data:/app/data planinc-arm
```

## build docker image & run with docker-compose locally
```
docker-compose -f docker-compose.yml up -d --build
```


## run test docker
```
docker run -d \
  --name planinc-website \
  --network planinc-network \
  -p 1111:1111 \
  -e NODE_ENV=production \
  -e PLANINC_DB_FILE=/app/data/planinc.db \
  -v /volume1/docker/planinc/data:/app/data \
  -e NEXTAUTH_SECRET=my_ultra_secure_nextauth_secret \
  --restart always \
  planinc-local:latest
```

# add @mastra/rag
```
pnpm add @mastra/rag --ignore-scripts
```


# act-cli
choco install act-cli

act -W .github/workflows/debug-changelog.yml

## runnung job
act -j debug-changelog -W .github/workflows/debug-changelog.yml


## RUN on QEMU
```
docker run --rm --privileged multiarch/qemu-user-static --reset -p yes

docker run -d \
  --name planinc-website \
  --network planinc-network \
  -p 1111:1111 \
  -e NODE_ENV=production \
  -e NEXTAUTH_URL=http://localhost:1111 \
  -e NEXT_PUBLIC_BASE_URL=http://localhost:1111 \
  -e NEXTAUTH_SECRET=my_ultra_secure_nextauth_secret \
  -e PLANINC_DB_FILE=/app/data/planinc.db \
  -v planinc-data:/app/data \
  --restart always \
  --platform linux/arm64 \
  planinc-local:latest
```
