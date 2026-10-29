terraform {
  required_version = ">= 1.9.0"
  required_providers {
    google = {
      source = "hashicorp/google", version = ">= 6.0, < 8.0"
    }
  }
}
variable "project_id" {
  type = string
}
variable "region" {
  type    = string
  default = "europe-west1"
}
variable "enable_services" {
  type    = bool
  default = false
}
variable "image" {
  type    = string
  default = ""
}
variable "public_origin" {
  type    = string
  default = "https://pending.invalid"
}
variable "firebase_api_key" {
  type      = string
  default   = ""
  sensitive = true
}
variable "enable_hubspot" {
  type    = bool
  default = false
}
variable "enable_workspace" {
  type    = bool
  default = false
}
variable "high_availability" {
  type    = bool
  default = true
}
provider "google" {
  project = var.project_id
  region  = var.region
}
locals {
  apis    = toset(["run.googleapis.com", "sqladmin.googleapis.com", "secretmanager.googleapis.com", "cloudtasks.googleapis.com", "cloudscheduler.googleapis.com", "identitytoolkit.googleapis.com", "artifactregistry.googleapis.com", "iam.googleapis.com", "gmail.googleapis.com", "calendar-json.googleapis.com", "drive.googleapis.com", "docs.googleapis.com", "sheets.googleapis.com"])
  secrets = toset(["planb-database-url", "planb-team-encryption-key", "planb-hubspot-client-id", "planb-hubspot-client-secret", "planb-google-client-id", "planb-google-client-secret"])
}
resource "google_project_service" "apis" {
  for_each           = local.apis
  service            = each.key
  disable_on_destroy = false
}
resource "google_service_account" "api" {
  account_id   = "planb-team-api"
  display_name = "Plan B API"
}
resource "google_service_account" "worker" {
  account_id   = "planb-team-worker"
  display_name = "Plan B worker"
}
resource "google_service_account" "caller" {
  account_id   = "planb-task-caller"
  display_name = "Plan B task caller"
}
resource "google_artifact_registry_repository" "images" {
  location      = var.region
  repository_id = "planb"
  format        = "DOCKER"
  depends_on    = [google_project_service.apis]
}
resource "google_sql_database_instance" "database" {
  name                = "planb-team-db"
  region              = var.region
  database_version    = "POSTGRES_16"
  deletion_protection = true
  settings {
    tier                  = "db-custom-2-7680"
    edition               = "ENTERPRISE"
    availability_type     = var.high_availability ? "REGIONAL" : "ZONAL"
    disk_size             = 20
    disk_type             = "PD_SSD"
    disk_autoresize       = true
    disk_autoresize_limit = 100
    ip_configuration {
      ipv4_enabled = true
    }
    backup_configuration {
      enabled                        = true
      point_in_time_recovery_enabled = true
      transaction_log_retention_days = 7
      backup_retention_settings {
        retained_backups = 7
      }
    }
  }
  depends_on = [google_project_service.apis]
}
resource "google_sql_database" "planb" {
  name     = "planb"
  instance = google_sql_database_instance.database.name
}
resource "google_storage_bucket" "files" {
  name                        = "${var.project_id}-planb-files"
  location                    = "EU"
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  versioning {
    enabled = true
  }
}
resource "google_secret_manager_secret" "secrets" {
  for_each  = local.secrets
  secret_id = each.key
  replication {
    user_managed {
      replicas {
        location = var.region
      }
    }
  }
  depends_on = [google_project_service.apis]
}
resource "google_secret_manager_secret_iam_member" "api" {
  for_each  = local.secrets
  secret_id = google_secret_manager_secret.secrets[each.key].id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.api.email}"
}
resource "google_secret_manager_secret_iam_member" "worker" {
  for_each  = local.secrets
  secret_id = google_secret_manager_secret.secrets[each.key].id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.worker.email}"
}
resource "google_project_iam_member" "api_sql" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.api.email}"
}
resource "google_project_iam_member" "worker_sql" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.worker.email}"
}
resource "google_project_iam_member" "identity" {
  project = var.project_id
  role    = "roles/firebaseauth.viewer"
  member  = "serviceAccount:${google_service_account.api.email}"
}
resource "google_project_iam_member" "enqueue" {
  project = var.project_id
  role    = "roles/cloudtasks.enqueuer"
  member  = "serviceAccount:${google_service_account.api.email}"
}
resource "google_service_account_iam_member" "task_impersonation" {
  service_account_id = google_service_account.caller.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.api.email}"
}
resource "google_cloud_tasks_queue" "jobs" {
  name     = "planb-jobs"
  location = var.region
  rate_limits {
    max_concurrent_dispatches = 3
    max_dispatches_per_second = 2
  }
  retry_config {
    max_attempts = 5
    min_backoff  = "10s"
    max_backoff  = "300s"
  }
  depends_on = [google_project_service.apis]
}
resource "google_cloud_run_v2_service" "worker" {
  count               = var.enable_services ? 1 : 0
  name                = "planb-team-worker"
  location            = var.region
  deletion_protection = true
  template {
    service_account = google_service_account.worker.email
    timeout         = "120s"
    scaling {
      min_instance_count = 0
      max_instance_count = 3
    }
    volumes {
      name = "cloudsql"
      cloud_sql_instance {
        instances = [google_sql_database_instance.database.connection_name]
      }
    }
    containers {
      image = var.image
      resources {
        limits = {
          cpu = "1", memory = "1Gi"
        }
      }
      volume_mounts {
        name       = "cloudsql"
        mount_path = "/cloudsql"
      }
      env {
        name  = "GOOGLE_CLOUD_PROJECT"
        value = var.project_id
      }
      env {
        name  = "PLANB_TEAM_PUBLIC_ORIGIN"
        value = var.public_origin
      }
      env {
        name  = "PLANB_TEAM_WORKER_ACCOUNT"
        value = google_service_account.caller.email
      }
      env {
        name = "DATABASE_URL"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.secrets["planb-database-url"].secret_id
            version = "latest"
          }
        }
      }
      dynamic "env" {
        for_each = merge(var.enable_hubspot ? { PLANB_TEAM_ENCRYPTION_KEY = "planb-team-encryption-key", HUBSPOT_CLIENT_ID = "planb-hubspot-client-id", HUBSPOT_CLIENT_SECRET = "planb-hubspot-client-secret" } : {}, var.enable_workspace ? { PLANB_TEAM_ENCRYPTION_KEY = "planb-team-encryption-key", GOOGLE_WORKSPACE_CLIENT_ID = "planb-google-client-id", GOOGLE_WORKSPACE_CLIENT_SECRET = "planb-google-client-secret" } : {})
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.secrets[env.value].secret_id
              version = "latest"
            }
          }
        }
      }
    }
  }
  depends_on = [google_project_service.apis, google_project_iam_member.worker_sql, google_secret_manager_secret_iam_member.worker]
}
resource "google_cloud_run_v2_service" "api" {
  count               = var.enable_services ? 1 : 0
  name                = "planb-team-api"
  location            = var.region
  deletion_protection = true
  template {
    service_account = google_service_account.api.email
    timeout         = "120s"
    scaling {
      min_instance_count = 0
      max_instance_count = 3
    }
    volumes {
      name = "cloudsql"
      cloud_sql_instance {
        instances = [google_sql_database_instance.database.connection_name]
      }
    }
    containers {
      image = var.image
      resources {
        limits = {
          cpu = "1", memory = "512Mi"
        }
      }
      volume_mounts {
        name       = "cloudsql"
        mount_path = "/cloudsql"
      }
      env {
        name  = "GOOGLE_CLOUD_PROJECT"
        value = var.project_id
      }
      env {
        name  = "PLANB_TEAM_PUBLIC_ORIGIN"
        value = var.public_origin
      }
      env {
        name  = "PLANB_TEAM_WORKER_URL"
        value = google_cloud_run_v2_service.worker[0].uri
      }
      env {
        name  = "PLANB_TEAM_WORKER_ACCOUNT"
        value = google_service_account.caller.email
      }
      env {
        name  = "PLANB_TEAM_QUEUE"
        value = google_cloud_tasks_queue.jobs.name
      }
      env {
        name  = "FIREBASE_API_KEY"
        value = var.firebase_api_key
      }
      env {
        name  = "FIREBASE_AUTH_DOMAIN"
        value = "${var.project_id}.firebaseapp.com"
      }
      env {
        name = "DATABASE_URL"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.secrets["planb-database-url"].secret_id
            version = "latest"
          }
        }
      }
      dynamic "env" {
        for_each = merge(var.enable_hubspot ? { PLANB_TEAM_ENCRYPTION_KEY = "planb-team-encryption-key", HUBSPOT_CLIENT_ID = "planb-hubspot-client-id", HUBSPOT_CLIENT_SECRET = "planb-hubspot-client-secret" } : {}, var.enable_workspace ? { PLANB_TEAM_ENCRYPTION_KEY = "planb-team-encryption-key", GOOGLE_WORKSPACE_CLIENT_ID = "planb-google-client-id", GOOGLE_WORKSPACE_CLIENT_SECRET = "planb-google-client-secret" } : {})
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.secrets[env.value].secret_id
              version = "latest"
            }
          }
        }
      }
    }
  }
  depends_on = [google_project_service.apis, google_project_iam_member.api_sql, google_secret_manager_secret_iam_member.api]
}
resource "google_cloud_run_v2_service_iam_member" "public_api" {
  count    = var.enable_services ? 1 : 0
  location = var.region
  name     = google_cloud_run_v2_service.api[0].name
  role     = "roles/run.invoker"
  member   = "allUsers"
}
resource "google_cloud_run_v2_job" "migrate" {
  count               = var.enable_services ? 1 : 0
  name                = "planb-team-migrate"
  location            = var.region
  deletion_protection = true
  template {
    template {
      service_account = google_service_account.worker.email
      timeout         = "300s"
      max_retries     = 0
      volumes {
        name = "cloudsql"
        cloud_sql_instance {
          instances = [google_sql_database_instance.database.connection_name]
        }
      }
      containers {
        image = var.image
        volume_mounts {
          name       = "cloudsql"
          mount_path = "/cloudsql"
        }
        env {
          name  = "PLANB_TEAM_ROLE"
          value = "migrate"
        }
        env {
          name = "DATABASE_URL"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.secrets["planb-database-url"].secret_id
              version = "latest"
            }
          }
        }
      }
    }
  }
  depends_on = [google_project_iam_member.worker_sql, google_secret_manager_secret_iam_member.worker]
}
resource "google_cloud_run_v2_service_iam_member" "private_worker" {
  count    = var.enable_services ? 1 : 0
  location = var.region
  name     = google_cloud_run_v2_service.worker[0].name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.caller.email}"
}
resource "google_cloud_scheduler_job" "dispatch" {
  count     = var.enable_services ? 1 : 0
  name      = "planb-dispatch"
  region    = var.region
  schedule  = "* * * * *"
  time_zone = "Europe/Madrid"
  http_target {
    uri         = "${google_cloud_run_v2_service.api[0].uri}/internal/dispatch"
    http_method = "POST"
    oidc_token {
      service_account_email = google_service_account.caller.email
      audience              = google_cloud_run_v2_service.api[0].uri
    }
  }
}
resource "google_logging_project_exclusion" "oauth_callback" {
  name        = "planb-oauth-callback"
  description = "Exclude temporary OAuth codes from request logs"
  filter      = "resource.type=\"cloud_run_revision\" AND httpRequest.requestUrl:\"/team/oauth/\""
}
output "database_connection" {
  value = google_sql_database_instance.database.connection_name
}
output "image_repository" {
  value = "${var.region}-docker.pkg.dev/${var.project_id}/planb"
}
output "api_url" {
  value = try(google_cloud_run_v2_service.api[0].uri, null)
}
output "worker_url" {
  value = try(google_cloud_run_v2_service.worker[0].uri, null)
}
