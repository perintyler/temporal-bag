# Temporal (Barry bag)

Temporal workflow orchestration — lifecycle management, schedules, task queues, and cloud operations.

## Tools

- `temporal_status` — check temporal CLI installation, version, and cloud auth status
- `temporal_server_start_dev` — start a local Temporal development server
- `temporal_server_status` — check if a local Temporal dev server is running and healthy
- `temporal_task_queue_describe` — describe a task queue's pollers, workers, and backlog
- `temporal_namespace_list` — list all namespaces in the cluster
- `temporal_namespace_describe` — describe a namespace's config, retention, and replication
- `temporal_cluster_health` — check Temporal cluster health status
- `temporal_cluster_describe` — describe the cluster's version, ID, and persistence info
- `temporal_workflow_count` — count workflow executions matching a visibility query
- `temporal_env_list` — list configured temporal CLI environments
- `temporal_cloud_whoami` — display current authenticated Temporal Cloud identity
- `temporal_cloud_namespace_list` — list all Temporal Cloud namespaces
- `temporal_cloud_namespace_get` — get details about a specific Temporal Cloud namespace
- `temporal_cloud_account` — get Temporal Cloud account information

## Bundled upstream skills

Skills and their references ship directly in `skills/`, with licenses preserved. No sibling clones or absolute symlinks are required. `./setup.sh --status` verifies the local payload. `skills/upstream.json` records upstream repositories and pinned revisions. To update, deliberately change a revision there, run `./setup.sh --update`, review the resulting diff, and validate the bag. The updater replaces the listed skill directories; keep local customizations outside those directories.
