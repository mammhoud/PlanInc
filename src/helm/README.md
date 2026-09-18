# PlanInc Helm Chart

A Helm chart for deploying PlanInc, a note-taking application, on Kubernetes.

## Prerequisites

- Kubernetes 1.19+
- Helm 3.2.0+

## Installing the Chart

To install the chart with the release name `my-planinc`:

```bash
# No chart repositories are required — the datastore is embedded.
helm install my-planinc ./helm

# Or install from a packaged chart
helm package ./helm
helm install my-planinc planinc-0.1.0.tgz
```

## Uninstalling the Chart

To uninstall/delete the `my-planinc` deployment:

```bash
helm delete my-planinc
```

## Configuration

The following table lists the configurable parameters and their default values.

### Global Parameters

| Parameter | Description | Default |
|-----------|-------------|---------|
| `replicaCount` | Number of PlanInc replicas | `1` |
| `image.repository` | PlanInc image repository | `planinc` |
| `image.tag` | PlanInc image tag | `""` (uses appVersion) |
| `image.pullPolicy` | Image pull policy | `IfNotPresent` |
| `nameOverride` | Override the name of the chart | `""` |
| `fullnameOverride` | Override the full name of the chart | `""` |

### Service Parameters

| Parameter | Description | Default |
|-----------|-------------|---------|
| `service.type` | Kubernetes service type | `ClusterIP` |
| `service.port` | Service port | `1111` |
| `service.targetPort` | Target port | `1111` |

### Ingress Parameters

| Parameter | Description | Default |
|-----------|-------------|---------|
| `ingress.enabled` | Enable ingress | `false` |
| `ingress.className` | Ingress class name | `""` |
| `ingress.annotations` | Ingress annotations | `{}` |
| `ingress.hosts` | Ingress hosts configuration | `[{host: "planinc.local", paths: [{path: "/", pathType: "Prefix"}]}]` |
| `ingress.tls` | Ingress TLS configuration | `[]` |

### Application Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `config.baseUrl` | Base URL for the application | `"http://localhost:1111"` |
| `config.nextauth.url` | NextAuth URL | `"http://localhost:1111"` |
| `config.nextauth.secret` | NextAuth secret | `"my_ultra_secure_nextauth_secret"` |
| `config.nodeEnv` | Node environment | `"production"` |

### Database Configuration

The datastore is an **embedded SurrealDB (SurrealKV) file** inside the app
container — there is no database service, no SQL database and no external host
to point at.

| Parameter | Description | Default |
|-----------|-------------|---------|
| `db.path` | Database file path in the container | `"/app/data/planinc.db"` |
| `db.namespace` | SurrealDB namespace | `"planinc"` |
| `db.database` | SurrealDB database name | `"planinc"` |
| `volumeMounts` / `volumes` | Mount a volume at `/app/data` to persist the file | `[]` |

### Resource Management

| Parameter | Description | Default |
|-----------|-------------|---------|
| `resources` | CPU/Memory resource requests/limits | `{}` |
| `autoscaling.enabled` | Enable HPA | `false` |
| `autoscaling.minReplicas` | Minimum replicas | `1` |
| `autoscaling.maxReplicas` | Maximum replicas | `100` |
| `autoscaling.targetCPUUtilizationPercentage` | Target CPU utilization | `80` |

## Examples

### Installing with a persistent database volume

The database file must live on a volume or it is lost on pod restart:

```bash
kubectl create pvc planinc-data --size=8Gi

helm install my-planinc ./helm \
  --set volumeMounts[0].name=data \
  --set volumeMounts[0].mountPath=/app/data \
  --set volumes[0].name=data \
  --set volumes[0].persistentVolumeClaim.claimName=planinc-data
```

### Installing with Ingress

```bash
helm install my-planinc ./helm \
  --set ingress.enabled=true \
  --set ingress.hosts[0].host=planinc.example.com \
  --set ingress.hosts[0].paths[0].path="/" \
  --set ingress.hosts[0].paths[0].pathType="Prefix"
```

### Installing with Custom Configuration

```bash
helm install my-planinc ./helm \
  --set config.baseUrl="https://planinc.example.com" \
  --set config.nextauth.url="https://planinc.example.com" \
  --set config.nextauth.secret="your-super-secret-key" \
  --set resources.requests.memory="256Mi" \
  --set resources.requests.cpu="250m"
```

### Installing with a custom database file location

```bash
helm install my-planinc ./helm \
  --set db.path=/app/data/custom.db \
  --set db.namespace=planinc \
  --set db.database=planinc
```

## Upgrading

To upgrade the chart:

```bash
helm upgrade my-planinc ./helm
```

## Backup and Restore

### Backup the database file

```bash
# Copy the SurrealDB (SurrealKV) file out of the pod
kubectl exec -it deploy/my-planinc -- cat /app/data/planinc.db > planinc-backup.db
```

### Restore the database file

```bash
# Copy a backup back into the pod
kubectl cp planinc-backup.db deploy/my-planinc:/app/data/planinc.db
```

## Troubleshooting

### Check Pod Status

```bash
kubectl get pods -l app.kubernetes.io/name=planinc
```

### View Logs

```bash
kubectl logs -l app.kubernetes.io/name=planinc
```

### Check the datastore configuration

```bash
kubectl exec -it deployment/my-planinc -- env | grep PLANINC_DB
```

### Inspect the database file

There is no database server to connect to - the datastore is a single file:

```bash
kubectl exec -it deploy/my-planinc -- ls -lh /app/data
```

## Dependencies

This chart has **no** chart dependencies. The datastore is embedded.
